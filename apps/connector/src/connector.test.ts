import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type ConnectorEventEnvelope,
  connectorAckFrameSchema,
  connectorHelloFrameSchema,
  connectorLocalEventsSuccessSchema,
  connectorLocalHealthSchema,
  connectorLocalMailboxErrorSchema,
  connectorLocalSharedMemeSyncSchema,
  connectorLocalStatusSchema,
  connectorReadyFrameSchema,
  connectorResyncRequestFrameSchema,
  connectorWelcomeMessage,
  mailboxDetailSuccessSchema,
  mailboxListSuccessSchema,
  sharedMemeVersionHintEventType,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { ConnectorClient } from "./connector-client.js";
import { ConnectorStateDatabase } from "./connector-state.js";
import { buildConnectorLocalApi, listenOnLoopback } from "./local-api.js";
import { SharedMemeSynchronizer } from "./shared-meme-sync.js";

const CREDENTIAL = `dbc_${"C".repeat(43)}`;

function createSharedMemeRelease(directory: string, version: number, term: string) {
  const path = join(directory, `shared-memes-v${version}-${randomUUID()}.sqlite`);
  const database = new Database(path);
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE memes (
      id INTEGER PRIMARY KEY,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      primary_category TEXT NOT NULL,
      primary_type TEXT NOT NULL,
      meaning TEXT NOT NULL,
      usage TEXT NOT NULL,
      origin TEXT NOT NULL,
      notes TEXT NOT NULL
    );
  `);
  database.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run("schema_version", "1");
  database
    .prepare("INSERT INTO metadata (key, value) VALUES (?, ?)")
    .run("library_version", String(version));
  database.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run("entry_count", "1");
  database
    .prepare("INSERT INTO metadata (key, value) VALUES (?, ?)")
    .run("published_at", new Date(Date.UTC(2026, 7, 14, 0, version)).toISOString());
  database
    .prepare(
      `INSERT INTO memes (
         id, term, normalized_term, primary_category, primary_type, meaning, usage, origin, notes
       ) VALUES (1, ?, ?, '', '', '', '', '', '')`,
    )
    .run(term, term.toLowerCase());
  database.close();
  const snapshot = readFileSync(path);
  rmSync(path, { force: true });
  return {
    snapshot,
    metadata: {
      library_version: version,
      snapshot_schema_version: 1 as const,
      entry_count: 1,
      published_at: new Date(Date.UTC(2026, 7, 14, 0, version)).toISOString(),
      checksum_sha256: createHash("sha256").update(snapshot).digest("hex"),
      size_bytes: snapshot.length,
    },
  };
}

interface FrameInbox {
  frames: unknown[];
  waiters: Array<(frame: unknown) => void>;
}

interface FakeConnection {
  socket: WebSocket;
  inbox: FrameInbox;
}

function createFrameInbox(socket: WebSocket): FrameInbox {
  const inbox: FrameInbox = { frames: [], waiters: [] };
  socket.on("message", (data: RawData) => {
    const frame = JSON.parse(data.toString()) as unknown;
    const waiter = inbox.waiters.shift();
    if (waiter) {
      waiter(frame);
    } else {
      inbox.frames.push(frame);
    }
  });
  return inbox;
}

function nextFrame(inbox: FrameInbox): Promise<unknown> {
  const frame = inbox.frames.shift();
  return frame === undefined
    ? new Promise((resolve) => inbox.waiters.push(resolve))
    : Promise.resolve(frame);
}

function event(cursor: number, eventId = randomUUID()): ConnectorEventEnvelope {
  return {
    event_id: eventId,
    cursor,
    event_type: "foundation.fact",
    created_at: new Date(Date.UTC(2026, 7, 12, 16, cursor)).toISOString(),
    payload: { cursor },
  };
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("official Connector persists before ACK, deduplicates, requests resync, and restores after restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-official-connector-"));
  const databasePath = join(directory, "connector.sqlite");
  const httpServer = createServer();
  const webSocketServer = new WebSocketServer({ server: httpServer, path: "/api/connector/ws" });
  const connections: FakeConnection[] = [];
  const connectionWaiters: Array<(connection: FakeConnection) => void> = [];
  webSocketServer.on("connection", (socket) => {
    const connection = { socket, inbox: createFrameInbox(socket) };
    const waiter = connectionWaiters.shift();
    if (waiter) {
      waiter(connection);
    } else {
      connections.push(connection);
    }
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  assert(address && typeof address === "object");
  const wsUrl = `ws://127.0.0.1:${address.port}/api/connector/ws`;

  const nextConnection = () => {
    const connection = connections.shift();
    return connection
      ? Promise.resolve(connection)
      : new Promise<FakeConnection>((resolve) => connectionWaiters.push(resolve));
  };

  const mailboxLetterId = "00000000-0000-4000-8000-000000000001";
  const mailboxRequests: Array<{ url: string; method: string; authorization: string | null }> = [];
  const sharedMemeRequests: Array<{ url: string; authorization: string | null }> = [];
  let sharedMemeRelease = createSharedMemeRelease(directory, 1, "第一版梗");
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/connector/shared-memes/version") {
      sharedMemeRequests.push({
        url: url.toString(),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return Response.json(sharedMemeRelease.metadata);
    }
    if (url.pathname === "/api/connector/shared-memes/snapshot") {
      sharedMemeRequests.push({
        url: url.toString(),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return new Response(sharedMemeRelease.snapshot, {
        headers: { "content-type": "application/vnd.sqlite3" },
      });
    }
    mailboxRequests.push({
      url: url.toString(),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
    });
    const body = url.pathname.includes(`/mailbox/${mailboxLetterId}`)
      ? {
          letter: {
            letter_id: mailboxLetterId,
            title: "系统信",
            category: "system",
            created_at: "2026-08-13T08:00:00.000Z",
            is_new: false,
            attachment: url.pathname.endsWith("/claim")
              ? { attachment_type: "farm_reward", status: "claimed" }
              : null,
            body: "同一份信件正文。",
          },
        }
      : {
          letters: [
            {
              letter_id: mailboxLetterId,
              title: "系统信",
              category: "system",
              created_at: "2026-08-13T08:00:00.000Z",
              is_new: true,
              attachment: null,
            },
          ],
          pagination: { page: 1, page_size: 8, total_items: 1, total_pages: 1 },
        };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  let state = new ConnectorStateDatabase(databasePath);
  const sharedMemeSnapshotPath = join(directory, "shared-memes.sqlite");
  let sharedMemeSync = new SharedMemeSynchronizer({
    serverWebSocketUrl: wsUrl,
    credential: CREDENTIAL,
    state,
    snapshotPath: sharedMemeSnapshotPath,
    fetchImplementation: fakeFetch,
  });
  const client = new ConnectorClient({
    serverWebSocketUrl: wsUrl,
    credential: CREDENTIAL,
    state,
    reconnect: false,
    fetchImplementation: fakeFetch,
    sharedMemeSync,
  });
  const localApi = buildConnectorLocalApi(client);
  const localAddress = await listenOnLoopback(localApi, 0);
  let secondClient: ConnectorClient | undefined;
  try {
    assert.deepEqual(client.getStatus(), {
      connection_state: "stopped",
      protocol_version: "1.0",
      last_persisted_cursor: 0,
      last_connected_at: null,
      last_error_code: null,
      welcome_message: null,
    });

    client.start();
    const { socket: firstSocket, inbox: firstInbox } = await nextConnection();
    const hello = connectorHelloFrameSchema.parse(await nextFrame(firstInbox));
    assert.equal(hello.credential, CREDENTIAL);
    assert.equal(hello.last_persisted_cursor, 0);
    firstSocket.send(
      JSON.stringify(
        connectorReadyFrameSchema.parse({
          type: "ready",
          protocol_version: "1.0",
          capabilities: ["event_stream_v1", "resync_v1"],
          connection_id: randomUUID(),
          resident_id: "resident-1",
          resume_after_cursor: 0,
          welcome: connectorWelcomeMessage,
        }),
      ),
    );
    await waitFor(
      () => client.getStatus().connection_state === "online",
      "Connector did not connect",
    );
    assert.equal(client.getStatus().welcome_message, connectorWelcomeMessage);
    await waitFor(
      () => client.getSharedMemeSyncStatus().applied_version === 1,
      "Connector did not synchronize the baseline shared meme snapshot",
    );
    assert.equal(sharedMemeRequests.length, 2);
    assert.ok(
      sharedMemeRequests.every(
        (request) =>
          request.authorization === `Bearer ${CREDENTIAL}` && !request.url.includes(CREDENTIAL),
      ),
    );

    const firstEvent = event(1);
    firstSocket.send(JSON.stringify({ type: "event", event: firstEvent }));
    const firstAck = connectorAckFrameSchema.parse(await nextFrame(firstInbox));
    assert.deepEqual(firstAck, { type: "ack", event_id: firstEvent.event_id, cursor: 1 });
    assert.equal(state.getLastPersistedCursor(), 1);

    firstSocket.send(JSON.stringify({ type: "event", event: firstEvent }));
    assert.equal(connectorAckFrameSchema.parse(await nextFrame(firstInbox)).cursor, 1);
    assert.equal(state.listEventsAfter(0).length, 1);

    const thirdEvent = event(3);
    firstSocket.send(JSON.stringify({ type: "event", event: thirdEvent }));
    assert.deepEqual(connectorResyncRequestFrameSchema.parse(await nextFrame(firstInbox)), {
      type: "resync_request",
      after_cursor: 1,
      reason: "cursor_gap",
    });
    assert.equal(state.getLastPersistedCursor(), 1);

    const secondEvent = event(2);
    firstSocket.send(
      JSON.stringify({ type: "resync_required", after_cursor: 1, reason: "ack_gap" }),
    );
    firstSocket.send(JSON.stringify({ type: "event", event: secondEvent }));
    assert.equal(connectorAckFrameSchema.parse(await nextFrame(firstInbox)).cursor, 2);
    firstSocket.send(JSON.stringify({ type: "event", event: thirdEvent }));
    assert.equal(connectorAckFrameSchema.parse(await nextFrame(firstInbox)).cursor, 3);
    sharedMemeRelease = createSharedMemeRelease(directory, 2, "第二版梗");
    const sharedMemeHint = {
      ...event(4),
      event_type: sharedMemeVersionHintEventType,
      payload: { library_version: 2 },
    };
    firstSocket.send(JSON.stringify({ type: "event", event: sharedMemeHint }));
    assert.equal(connectorAckFrameSchema.parse(await nextFrame(firstInbox)).cursor, 4);
    await waitFor(
      () => client.getSharedMemeSyncStatus().applied_version === 2,
      "Connector did not synchronize after the version hint",
    );
    const requestsAfterVersionTwo = sharedMemeRequests.length;
    firstSocket.send(JSON.stringify({ type: "event", event: sharedMemeHint }));
    assert.equal(connectorAckFrameSchema.parse(await nextFrame(firstInbox)).cursor, 4);
    assert.equal(sharedMemeRequests.length, requestsAfterVersionTwo);
    assert.deepEqual(
      state.listEventsAfter(0).map((stored) => stored.cursor),
      [1, 2, 3, 4],
    );

    const healthResponse = await fetch(`${localAddress}/v1/health`);
    assert.deepEqual(connectorLocalHealthSchema.parse(await healthResponse.json()), {
      service: "doorbell-connector",
      api_version: "v1",
      status: "ok",
    });
    const statusResponse = await fetch(`${localAddress}/v1/status`);
    const statusBody = connectorLocalStatusSchema.parse(await statusResponse.json());
    assert.equal(statusBody.connection_state, "online");
    assert.doesNotMatch(JSON.stringify(statusBody), new RegExp(CREDENTIAL));
    const sharedMemeStatusResponse = await fetch(`${localAddress}/v1/shared-memes/status`);
    assert.deepEqual(
      connectorLocalSharedMemeSyncSchema.parse(await sharedMemeStatusResponse.json()),
      client.getSharedMemeSyncStatus(),
    );
    const eventsResponse = await fetch(`${localAddress}/v1/events?after_cursor=1`);
    assert.deepEqual(
      connectorLocalEventsSuccessSchema
        .parse(await eventsResponse.json())
        .events.map((stored) => stored.cursor),
      [2, 3, 4],
    );

    const mailboxResponse = await fetch(`${localAddress}/v1/mailbox?category=system`);
    assert.equal(mailboxResponse.status, 200);
    const mailbox = mailboxListSuccessSchema.parse(await mailboxResponse.json());
    assert.equal(mailbox.letters[0]?.letter_id, mailboxLetterId);
    assert.equal("body" in (mailbox.letters[0] ?? {}), false);

    const mailDetailResponse = await fetch(`${localAddress}/v1/mailbox/${mailboxLetterId}`);
    assert.equal(mailDetailResponse.status, 200);
    assert.equal(
      mailboxDetailSuccessSchema.parse(await mailDetailResponse.json()).letter.body,
      "同一份信件正文。",
    );
    assert.equal(mailboxRequests.length, 2);
    assert.ok(mailboxRequests.every((request) => request.authorization === `Bearer ${CREDENTIAL}`));
    assert.ok(mailboxRequests.every((request) => !request.url.includes(CREDENTIAL)));

    const rejectedClaimTarget = await fetch(`${localAddress}/v1/mailbox/${mailboxLetterId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ farm_doorplate: "DEF567" }),
    });
    assert.equal(rejectedClaimTarget.status, 400);
    assert.equal(mailboxRequests.length, 2);

    const claimResponse = await fetch(`${localAddress}/v1/mailbox/${mailboxLetterId}/claim`, {
      method: "POST",
    });
    assert.equal(claimResponse.status, 200);
    assert.equal(
      mailboxDetailSuccessSchema.parse(await claimResponse.json()).letter.attachment?.status,
      "claimed",
    );
    assert.equal(mailboxRequests.length, 3);
    assert.equal(mailboxRequests[2]?.method, "POST");
    assert.equal(mailboxRequests[2]?.authorization, `Bearer ${CREDENTIAL}`);
    assert.ok(mailboxRequests.every((request) => !request.url.includes(CREDENTIAL)));

    const rejectedTarget = await fetch(`${localAddress}/v1/mailbox?home_id=another-home`);
    assert.equal(rejectedTarget.status, 400);
    assert.equal(
      connectorLocalMailboxErrorSchema.parse(await rejectedTarget.json()).error.code,
      "invalid_request",
    );
    assert.equal(mailboxRequests.length, 3);
    assert.equal(readFileSync(databasePath).includes(Buffer.from(CREDENTIAL)), false);

    const streamController = new AbortController();
    const streamResponse = await fetch(`${localAddress}/v1/events/stream?after_cursor=2`, {
      signal: streamController.signal,
    });
    const streamChunk = await streamResponse.body?.getReader().read();
    streamController.abort();
    assert.match(new TextDecoder().decode(streamChunk?.value), /"cursor":3/);

    client.stop();
    await once(firstSocket, "close");
    state.close();

    state = new ConnectorStateDatabase(databasePath);
    sharedMemeSync = new SharedMemeSynchronizer({
      serverWebSocketUrl: wsUrl,
      credential: CREDENTIAL,
      state,
      snapshotPath: sharedMemeSnapshotPath,
      fetchImplementation: fakeFetch,
    });
    secondClient = new ConnectorClient({
      serverWebSocketUrl: wsUrl,
      credential: CREDENTIAL,
      state,
      reconnect: false,
      sharedMemeSync,
    });
    secondClient.start();
    const { socket: restartedSocket, inbox: restartedInbox } = await nextConnection();
    const restartedHello = connectorHelloFrameSchema.parse(await nextFrame(restartedInbox));
    assert.equal(restartedHello.last_persisted_cursor, 4);
    assert.equal(state.getStatus("connecting").welcome_message, connectorWelcomeMessage);
    const requestsBeforeRestartReady = sharedMemeRequests.length;
    restartedSocket.send(
      JSON.stringify(
        connectorReadyFrameSchema.parse({
          type: "ready",
          protocol_version: "1.0",
          capabilities: ["event_stream_v1", "resync_v1"],
          connection_id: randomUUID(),
          resident_id: "resident-1",
          resume_after_cursor: 4,
          welcome: connectorWelcomeMessage,
        }),
      ),
    );
    await waitFor(
      () => sharedMemeRequests.length > requestsBeforeRestartReady,
      "Restarted Connector did not compare the shared meme version",
    );
    assert.equal(sharedMemeRequests.length, requestsBeforeRestartReady + 1);
    assert.equal(secondClient.getSharedMemeSyncStatus().applied_version, 2);
  } finally {
    secondClient?.stop();
    client.stop();
    await localApi.close();
    state.close();
    await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shared meme sync keeps the last valid snapshot across corrupt, stale, and atomic-replace failures", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-shared-meme-sync-test-"));
  const databasePath = join(directory, "connector.sqlite");
  const snapshotPath = join(directory, "shared-memes.sqlite");
  const state = new ConnectorStateDatabase(databasePath);
  const release1 = createSharedMemeRelease(directory, 1, "第一版梗");
  const release2 = createSharedMemeRelease(directory, 2, "第二版梗");
  const release3 = createSharedMemeRelease(directory, 3, "第三版梗");
  let remote = release1;
  let snapshotBody = remote.snapshot;
  let snapshotRequests = 0;
  const fakeFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/version")) {
      return Response.json(remote.metadata);
    }
    snapshotRequests += 1;
    return new Response(snapshotBody, {
      headers: { "content-type": "application/vnd.sqlite3" },
    });
  };
  const sync = new SharedMemeSynchronizer({
    serverWebSocketUrl: "ws://127.0.0.1:3000/api/connector/ws",
    credential: CREDENTIAL,
    state,
    snapshotPath,
    fetchImplementation: fakeFetch,
  });

  try {
    assert.equal(await sync.syncLatest(), true);
    assert.equal(sync.getStatus().applied_version, 1);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);
    assert.equal(snapshotRequests, 1);

    assert.equal(await sync.syncLatest(), false);
    assert.equal(snapshotRequests, 1);

    remote = release2;
    snapshotBody = release1.snapshot;
    assert.equal(await sync.syncLatest(), false);
    assert.equal(sync.getStatus().last_error_code, "checksum_mismatch");
    assert.equal(sync.getStatus().applied_version, 1);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    const invalidSqlite = Buffer.from("not-a-sqlite-database");
    remote = {
      snapshot: invalidSqlite,
      metadata: {
        ...release2.metadata,
        checksum_sha256: createHash("sha256").update(invalidSqlite).digest("hex"),
        size_bytes: invalidSqlite.length,
      },
    };
    snapshotBody = invalidSqlite;
    assert.equal(await sync.syncLatest(), false);
    assert.equal(sync.getStatus().last_error_code, "invalid_sqlite");
    assert.equal(sync.getStatus().applied_version, 1);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    remote = release2;
    snapshotBody = release2.snapshot;
    assert.equal(await sync.syncLatest(), true);
    assert.equal(sync.getStatus().applied_version, 2);
    assert.deepEqual(readFileSync(snapshotPath), release2.snapshot);

    remote = release1;
    snapshotBody = release1.snapshot;
    assert.equal(await sync.syncLatest(), false);
    assert.equal(sync.getStatus().last_error_code, "stale_version");
    assert.equal(sync.getStatus().applied_version, 2);
    assert.deepEqual(readFileSync(snapshotPath), release2.snapshot);

    remote = release3;
    snapshotBody = release3.snapshot;
    const failingReplace = new SharedMemeSynchronizer({
      serverWebSocketUrl: "ws://127.0.0.1:3000/api/connector/ws",
      credential: CREDENTIAL,
      state,
      snapshotPath,
      fetchImplementation: fakeFetch,
      replaceFile: () => {
        throw new Error("simulated atomic replace failure");
      },
    });
    assert.equal(await failingReplace.syncLatest(), false);
    assert.equal(failingReplace.getStatus().last_error_code, "atomic_replace_failed");
    assert.equal(failingReplace.getStatus().applied_version, 2);
    assert.deepEqual(readFileSync(snapshotPath), release2.snapshot);
    assert.doesNotMatch(JSON.stringify(failingReplace.getStatus()), new RegExp(CREDENTIAL));
  } finally {
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

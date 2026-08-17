import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type ConnectorEventEnvelope,
  connectorAckFrameSchema,
  connectorGenerationResetAckFrameSchema,
  connectorHelloFrameSchema,
  connectorLocalEventsErrorSchema,
  connectorLocalEventsSuccessSchema,
  connectorLocalGenerationChangedEventSchema,
  connectorLocalHealthSchema,
  connectorLocalMailboxErrorSchema,
  connectorLocalSharedMemeDetailSuccessSchema,
  connectorLocalSharedMemeErrorSchema,
  connectorLocalSharedMemeListSuccessSchema,
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
import { ConnectorClient, ConnectorMailboxRequestError } from "./connector-client.js";
import { ConnectorStateDatabase } from "./connector-state.js";
import { buildConnectorLocalApi, listenOnLoopback } from "./local-api.js";
import { SharedMemeLibrary } from "./shared-meme-library.js";
import { SharedMemeSynchronizer } from "./shared-meme-sync.js";

const CREDENTIAL = `dbc_${"C".repeat(43)}`;
const GENERATION_ONE = "00000000-0000-4000-8000-000000000101";
const GENERATION_TWO = "00000000-0000-4000-8000-000000000102";

function normalizeSharedMemeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.,?()'。“”~!:]/gu, "")
    .replace(/x{3,}/g, "xx");
}

function createSharedMemeRelease(directory: string, version: number, term: string) {
  const alias = `${term} 别名。`;
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
    CREATE TABLE meme_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL UNIQUE
    );
    CREATE TABLE meme_categories (
      meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      PRIMARY KEY (meme_id, category)
    );
    CREATE TABLE meme_types (
      meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      PRIMARY KEY (meme_id, type)
    );
    CREATE TABLE meme_examples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      example TEXT NOT NULL
    );
    CREATE TABLE meme_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      normalized_keyword TEXT NOT NULL
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
       ) VALUES (1, ?, ?, '社区', '用语', '批准释义', '批准用法', '铃野', '批准备注')`,
    )
    .run(term, normalizeSharedMemeText(term));
  database
    .prepare("INSERT INTO meme_aliases (meme_id, alias, normalized_alias) VALUES (1, ?, ?)")
    .run(alias, normalizeSharedMemeText(alias));
  database.prepare("INSERT INTO meme_categories (meme_id, category) VALUES (1, '社区')").run();
  database.prepare("INSERT INTO meme_types (meme_id, type) VALUES (1, '用语')").run();
  database.prepare("INSERT INTO meme_examples (meme_id, example) VALUES (1, '批准示例')").run();
  database
    .prepare(
      "INSERT INTO meme_keywords (meme_id, keyword, normalized_keyword) VALUES (1, '铃野', '铃野')",
    )
    .run();
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

test("local shared meme API reads the installed snapshot and follows atomic replacement", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-shared-meme-local-read-"));
  const snapshotPath = join(directory, "shared-memes.sqlite");
  const library = new SharedMemeLibrary(snapshotPath);
  const localApi = buildConnectorLocalApi({} as ConnectorClient, library);
  const localAddress = await listenOnLoopback(localApi, 0);
  try {
    const unavailableResponse = await fetch(`${localAddress}/v2/shared-memes`);
    assert.equal(unavailableResponse.status, 503);
    assert.equal(
      connectorLocalSharedMemeErrorSchema.parse(await unavailableResponse.json()).error.code,
      "shared_meme_unavailable",
    );

    const release1 = createSharedMemeRelease(directory, 1, "第一版梗");
    writeFileSync(snapshotPath, release1.snapshot);

    const listResponse = await fetch(`${localAddress}/v2/shared-memes`);
    assert.equal(listResponse.status, 200);
    const list = connectorLocalSharedMemeListSuccessSchema.parse(await listResponse.json());
    assert.equal(list.library_version, 1);
    assert.deepEqual(list.memes, [
      {
        meme_id: 1,
        term: "第一版梗",
        normalized_term: "第一版梗",
        category: "社区",
        type: "用语",
        meaning: "批准释义",
        usage: "批准用法",
        origin: "铃野",
        notes: "批准备注",
        categories: ["社区"],
        types: ["用语"],
        aliases: ["第一版梗 别名。"],
        examples: ["批准示例"],
        keywords: ["铃野"],
      },
    ]);

    for (const term of ["第一版梗", " 第一版梗 别名。 "]) {
      const resolveResponse = await fetch(
        `${localAddress}/v2/shared-memes?term=${encodeURIComponent(term)}`,
      );
      assert.equal(resolveResponse.status, 200);
      assert.equal(
        connectorLocalSharedMemeDetailSuccessSchema.parse(await resolveResponse.json()).meme
          .meme_id,
        1,
      );
    }

    const detailResponse = await fetch(`${localAddress}/v2/shared-memes/1`);
    assert.equal(detailResponse.status, 200);
    assert.equal(
      connectorLocalSharedMemeDetailSuccessSchema.parse(await detailResponse.json()).meme.term,
      "第一版梗",
    );

    const missingResponse = await fetch(`${localAddress}/v2/shared-memes/999`);
    assert.equal(missingResponse.status, 404);
    assert.equal(
      connectorLocalSharedMemeErrorSchema.parse(await missingResponse.json()).error.code,
      "shared_meme_not_found",
    );

    const invalidResponse = await fetch(`${localAddress}/v2/shared-memes?extra=1`);
    assert.equal(invalidResponse.status, 400);
    assert.equal(
      connectorLocalSharedMemeErrorSchema.parse(await invalidResponse.json()).error.code,
      "invalid_request",
    );

    const release2 = createSharedMemeRelease(directory, 2, "第二版梗");
    const replacementPath = join(directory, "shared-memes-replacement.sqlite");
    writeFileSync(replacementPath, release2.snapshot);
    renameSync(replacementPath, snapshotPath);
    const replacedResponse = await fetch(`${localAddress}/v2/shared-memes`);
    const replaced = connectorLocalSharedMemeListSuccessSchema.parse(await replacedResponse.json());
    assert.equal(replaced.library_version, 2);
    assert.equal(replaced.memes[0]?.term, "第二版梗");
  } finally {
    await localApi.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

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

function event(
  cursor: number,
  eventId = randomUUID(),
  generation = GENERATION_ONE,
): ConnectorEventEnvelope {
  return {
    generation,
    event_id: eventId,
    cursor,
    event_type: "foundation.fact",
    created_at: new Date(Date.UTC(2026, 7, 12, 16, cursor)).toISOString(),
    payload: { cursor },
  };
}

test("Connector state migrates v1 delivery data to an unset v2 generation and resets idempotently", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-connector-v2-migration-"));
  const databasePath = join(directory, "connector.sqlite");
  const legacy = new Database(databasePath);
  legacy.exec(`
    CREATE TABLE connector_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      last_persisted_cursor INTEGER NOT NULL CHECK (last_persisted_cursor >= 0),
      last_connected_at INTEGER,
      last_error_code TEXT,
      welcome_received INTEGER NOT NULL CHECK (welcome_received IN (0, 1))
    );
    CREATE TABLE connector_events (
      cursor INTEGER PRIMARY KEY CHECK (cursor > 0),
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      received_at INTEGER NOT NULL
    );
    INSERT INTO connector_state VALUES (1, 1, NULL, NULL, 0);
    INSERT INTO connector_events VALUES (
      1,
      '00000000-0000-4000-8000-000000000201',
      'foundation.fact',
      '2026-08-14T00:00:00.000Z',
      '{}',
      1
    );
  `);
  legacy.close();

  let state = new ConnectorStateDatabase(databasePath);
  try {
    assert.deepEqual(state.getDeliveryCheckpoint(), {
      generation: null,
      lastPersistedCursor: 0,
    });
    const migrated = new Database(databasePath, { readonly: true });
    try {
      assert.equal(migrated.pragma("user_version", { simple: true }), 2);
      assert.equal(
        (
          migrated.prepare("SELECT count(*) AS count FROM connector_events").get() as {
            count: number;
          }
        ).count,
        0,
      );
    } finally {
      migrated.close();
    }
    assert.deepEqual(state.resetDeliveryGeneration(GENERATION_ONE), {
      changed: true,
      generation: GENERATION_ONE,
      lastPersistedCursor: 0,
    });
    assert.equal(state.persistEvent(event(1), Date.now()).status, "persisted");
    state.close();

    state = new ConnectorStateDatabase(databasePath);
    assert.deepEqual(state.getDeliveryCheckpoint(), {
      generation: GENERATION_ONE,
      lastPersistedCursor: 1,
    });
    assert.deepEqual(state.resetDeliveryGeneration(GENERATION_ONE), {
      changed: false,
      generation: GENERATION_ONE,
      lastPersistedCursor: 1,
    });
    assert.deepEqual(
      state.listEventsAfter(GENERATION_ONE, 0).map((stored) => stored.cursor),
      [1],
    );
    assert.equal(
      state.persistEvent(event(2, randomUUID(), GENERATION_TWO), Date.now()).status,
      "generation_mismatch",
    );
    assert.equal(state.getLastPersistedCursor(), 1);
    assert.deepEqual(state.resetDeliveryGeneration(GENERATION_TWO), {
      changed: true,
      generation: GENERATION_TWO,
      lastPersistedCursor: 0,
    });
    assert.deepEqual(state.listEventsAfter(GENERATION_TWO, 0), []);
  } finally {
    state.close();
    const inspection = new Database(databasePath, { readonly: true });
    try {
      assert.equal(inspection.pragma("user_version", { simple: true }), 2);
      assert.equal(
        (
          inspection.prepare("SELECT count(*) AS count FROM connector_events").get() as {
            count: number;
          }
        ).count,
        0,
      );
    } finally {
      inspection.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

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

async function readSseUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: RegExp,
  timeoutMs = 250,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  while (!marker.test(text) && Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const result = await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), remaining)),
    ]);
    if (result === "timeout" || result.done) {
      break;
    }
    text += decoder.decode(result.value, { stream: true });
  }
  return text;
}

test("local SSE includes an event persisted during backlog bootstrap exactly once", async () => {
  const backlogEvent = event(1);
  const racedEvent = event(2);
  const eventSubscribers = new Set<(value: ConnectorEventEnvelope) => void>();
  const generationSubscribers = new Set<(value: string) => void>();
  let emittedRace = false;
  const fakeClient = {
    getStatus: () => ({ delivery_generation: GENERATION_ONE }),
    listEventsAfter: () => {
      const backlog = [backlogEvent];
      if (!emittedRace) {
        emittedRace = true;
        for (const subscriber of eventSubscribers) {
          subscriber(racedEvent);
        }
      }
      return backlog;
    },
    subscribe: (listener: (value: ConnectorEventEnvelope) => void) => {
      eventSubscribers.add(listener);
      return () => eventSubscribers.delete(listener);
    },
    subscribeGenerationChanges: (listener: (value: string) => void) => {
      generationSubscribers.add(listener);
      return () => generationSubscribers.delete(listener);
    },
  } as unknown as ConnectorClient;
  const localApi = buildConnectorLocalApi(
    fakeClient,
    new SharedMemeLibrary(join(tmpdir(), `doorbell-unused-${randomUUID()}.sqlite`)),
  );
  const localAddress = await listenOnLoopback(localApi, 0);
  const controller = new AbortController();
  try {
    const response = await fetch(
      `${localAddress}/v2/events/stream?delivery_generation=${GENERATION_ONE}&after_cursor=0`,
      { signal: controller.signal },
    );
    const reader = response.body?.getReader();
    assert(reader);
    const text = await readSseUntil(reader, /"cursor":2/);
    assert.match(text, /"cursor":1/);
    assert.match(text, /"cursor":2/);
    assert.equal(text.match(new RegExp(`id: ${GENERATION_ONE}:2`, "g"))?.length, 1);
    assert.ok(text.indexOf('"cursor":1') < text.indexOf('"cursor":2'));
  } finally {
    controller.abort();
    await localApi.close();
  }
});

test("local SSE fences a generation reset during backlog bootstrap", async () => {
  const oldGenerationEvent = event(1);
  const newGenerationEvent = event(1, randomUUID(), GENERATION_TWO);
  const eventSubscribers = new Set<(value: ConnectorEventEnvelope) => void>();
  const generationSubscribers = new Set<(value: string) => void>();
  let currentGeneration = GENERATION_ONE;
  let emittedReset = false;
  const fakeClient = {
    getStatus: () => ({ delivery_generation: currentGeneration }),
    listEventsAfter: () => {
      const backlog = [oldGenerationEvent];
      if (!emittedReset) {
        emittedReset = true;
        currentGeneration = GENERATION_TWO;
        for (const subscriber of generationSubscribers) {
          subscriber(GENERATION_TWO);
        }
        for (const subscriber of eventSubscribers) {
          subscriber(newGenerationEvent);
        }
      }
      return backlog;
    },
    subscribe: (listener: (value: ConnectorEventEnvelope) => void) => {
      eventSubscribers.add(listener);
      return () => eventSubscribers.delete(listener);
    },
    subscribeGenerationChanges: (listener: (value: string) => void) => {
      generationSubscribers.add(listener);
      return () => generationSubscribers.delete(listener);
    },
  } as unknown as ConnectorClient;
  const localApi = buildConnectorLocalApi(
    fakeClient,
    new SharedMemeLibrary(join(tmpdir(), `doorbell-unused-${randomUUID()}.sqlite`)),
  );
  const localAddress = await listenOnLoopback(localApi, 0);
  const controller = new AbortController();
  try {
    const response = await fetch(
      `${localAddress}/v2/events/stream?delivery_generation=${GENERATION_ONE}&after_cursor=0`,
      { signal: controller.signal },
    );
    const reader = response.body?.getReader();
    assert(reader);
    const text = await readSseUntil(reader, /event: generation_changed/);
    assert.match(text, /event: generation_changed/);
    assert.match(text, new RegExp(GENERATION_TWO));
    assert.doesNotMatch(text, new RegExp(newGenerationEvent.event_id));
    assert.equal((await reader.read()).done, true);
  } finally {
    controller.abort();
    await localApi.close();
  }
});

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
    httpRequestTimeoutMs: 300_000,
    state,
    snapshotPath: sharedMemeSnapshotPath,
    fetchImplementation: fakeFetch,
  });
  const client = new ConnectorClient({
    serverWebSocketUrl: wsUrl,
    credential: CREDENTIAL,
    httpRequestTimeoutMs: 300_000,
    state,
    reconnect: false,
    fetchImplementation: fakeFetch,
    sharedMemeSync,
  });
  const localApi = buildConnectorLocalApi(client, new SharedMemeLibrary(sharedMemeSnapshotPath));
  const localAddress = await listenOnLoopback(localApi, 0);
  let secondClient: ConnectorClient | undefined;
  try {
    assert.deepEqual(client.getStatus(), {
      connection_state: "stopped",
      protocol_version: "2.0",
      delivery_generation: null,
      last_persisted_cursor: 0,
      last_connected_at: null,
      last_error_code: null,
      welcome_message: null,
    });

    client.start();
    const { socket: firstSocket, inbox: firstInbox } = await nextConnection();
    const hello = connectorHelloFrameSchema.parse(await nextFrame(firstInbox));
    assert.equal(hello.credential, CREDENTIAL);
    assert.equal(hello.protocol_version, "2.0");
    assert.equal(hello.generation, null);
    assert.equal(hello.last_persisted_cursor, 0);
    firstSocket.send(
      JSON.stringify({
        type: "generation_reset_required",
        generation: GENERATION_ONE,
        reason: "initial_sync",
      }),
    );
    assert.deepEqual(connectorGenerationResetAckFrameSchema.parse(await nextFrame(firstInbox)), {
      type: "generation_reset_ack",
      generation: GENERATION_ONE,
    });
    firstSocket.send(
      JSON.stringify(
        connectorReadyFrameSchema.parse({
          type: "ready",
          protocol_version: "2.0",
          capabilities: ["event_stream_v2", "resync_v2"],
          connection_id: randomUUID(),
          resident_id: "resident-1",
          generation: GENERATION_ONE,
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
    assert.deepEqual(firstAck, {
      type: "ack",
      generation: GENERATION_ONE,
      event_id: firstEvent.event_id,
      cursor: 1,
    });
    assert.equal(state.getLastPersistedCursor(), 1);

    firstSocket.send(JSON.stringify({ type: "event", event: firstEvent }));
    assert.equal(connectorAckFrameSchema.parse(await nextFrame(firstInbox)).cursor, 1);
    assert.equal(state.listEventsAfter(GENERATION_ONE, 0).length, 1);

    const thirdEvent = event(3);
    firstSocket.send(JSON.stringify({ type: "event", event: thirdEvent }));
    assert.deepEqual(connectorResyncRequestFrameSchema.parse(await nextFrame(firstInbox)), {
      type: "resync_request",
      generation: GENERATION_ONE,
      after_cursor: 1,
      reason: "cursor_gap",
    });
    assert.equal(state.getLastPersistedCursor(), 1);

    const secondEvent = event(2);
    firstSocket.send(
      JSON.stringify({
        type: "resync_required",
        generation: GENERATION_ONE,
        after_cursor: 1,
        reason: "ack_gap",
      }),
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
      state.listEventsAfter(GENERATION_ONE, 0).map((stored) => stored.cursor),
      [1, 2, 3, 4],
    );

    const healthResponse = await fetch(`${localAddress}/v2/health`);
    assert.deepEqual(connectorLocalHealthSchema.parse(await healthResponse.json()), {
      service: "doorbell-connector",
      api_version: "v2",
      status: "ok",
    });
    const statusResponse = await fetch(`${localAddress}/v2/status`);
    const statusBody = connectorLocalStatusSchema.parse(await statusResponse.json());
    assert.equal(statusBody.connection_state, "online");
    assert.doesNotMatch(JSON.stringify(statusBody), new RegExp(CREDENTIAL));
    const sharedMemeStatusResponse = await fetch(`${localAddress}/v2/shared-memes/status`);
    assert.deepEqual(
      connectorLocalSharedMemeSyncSchema.parse(await sharedMemeStatusResponse.json()),
      client.getSharedMemeSyncStatus(),
    );
    const eventsResponse = await fetch(
      `${localAddress}/v2/events?delivery_generation=${GENERATION_ONE}&after_cursor=1`,
    );
    assert.deepEqual(
      connectorLocalEventsSuccessSchema
        .parse(await eventsResponse.json())
        .events.map((stored) => stored.cursor),
      [2, 3, 4],
    );

    const staleEventsResponse = await fetch(
      `${localAddress}/v2/events?delivery_generation=${GENERATION_TWO}&after_cursor=0`,
    );
    assert.equal(staleEventsResponse.status, 409);
    assert.deepEqual(connectorLocalEventsErrorSchema.parse(await staleEventsResponse.json()), {
      error: {
        code: "delivery_generation_changed",
        message: "The requested delivery generation is no longer current",
        requested_generation: GENERATION_TWO,
        current_generation: GENERATION_ONE,
      },
    });
    const staleStreamResponse = await fetch(
      `${localAddress}/v2/events/stream?delivery_generation=${GENERATION_TWO}&after_cursor=0`,
    );
    assert.equal(staleStreamResponse.status, 409);
    assert.deepEqual(connectorLocalEventsErrorSchema.parse(await staleStreamResponse.json()), {
      error: {
        code: "delivery_generation_changed",
        message: "The requested delivery generation is no longer current",
        requested_generation: GENERATION_TWO,
        current_generation: GENERATION_ONE,
      },
    });

    const mailboxResponse = await fetch(`${localAddress}/v2/mailbox?category=system`);
    assert.equal(mailboxResponse.status, 200);
    const mailbox = mailboxListSuccessSchema.parse(await mailboxResponse.json());
    assert.equal(mailbox.letters[0]?.letter_id, mailboxLetterId);
    assert.equal("body" in (mailbox.letters[0] ?? {}), false);

    const mailDetailResponse = await fetch(`${localAddress}/v2/mailbox/${mailboxLetterId}`);
    assert.equal(mailDetailResponse.status, 200);
    assert.equal(
      mailboxDetailSuccessSchema.parse(await mailDetailResponse.json()).letter.body,
      "同一份信件正文。",
    );
    assert.equal(mailboxRequests.length, 2);
    assert.ok(mailboxRequests.every((request) => request.authorization === `Bearer ${CREDENTIAL}`));
    assert.ok(mailboxRequests.every((request) => !request.url.includes(CREDENTIAL)));

    const rejectedClaimTarget = await fetch(`${localAddress}/v2/mailbox/${mailboxLetterId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ farm_doorplate: "DEF567" }),
    });
    assert.equal(rejectedClaimTarget.status, 400);
    assert.equal(mailboxRequests.length, 2);

    const claimResponse = await fetch(`${localAddress}/v2/mailbox/${mailboxLetterId}/claim`, {
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

    const rejectedTarget = await fetch(`${localAddress}/v2/mailbox?home_id=another-home`);
    assert.equal(rejectedTarget.status, 400);
    assert.equal(
      connectorLocalMailboxErrorSchema.parse(await rejectedTarget.json()).error.code,
      "invalid_request",
    );
    assert.equal(mailboxRequests.length, 3);
    assert.equal(readFileSync(databasePath).includes(Buffer.from(CREDENTIAL)), false);

    const streamController = new AbortController();
    const streamResponse = await fetch(
      `${localAddress}/v2/events/stream?delivery_generation=${GENERATION_ONE}&after_cursor=2`,
      {
        signal: streamController.signal,
      },
    );
    const streamChunk = await streamResponse.body?.getReader().read();
    streamController.abort();
    const replayText = new TextDecoder().decode(streamChunk?.value);
    assert.match(replayText, /"cursor":3/);
    assert.match(replayText, new RegExp(`id: ${GENERATION_ONE}:3`));

    const generationStreamResponse = await fetch(
      `${localAddress}/v2/events/stream?delivery_generation=${GENERATION_ONE}&after_cursor=4`,
    );
    const generationStreamReader = generationStreamResponse.body?.getReader();
    assert(generationStreamReader);
    await generationStreamReader.read();
    const liveEvent = event(5);
    firstSocket.send(JSON.stringify({ type: "event", event: liveEvent }));
    assert.deepEqual(connectorAckFrameSchema.parse(await nextFrame(firstInbox)), {
      type: "ack",
      generation: GENERATION_ONE,
      event_id: liveEvent.event_id,
      cursor: 5,
    });
    const liveChunk = await generationStreamReader.read();
    const liveText = new TextDecoder().decode(liveChunk.value);
    assert.match(liveText, new RegExp(`id: ${GENERATION_ONE}:5`));
    const requestsBeforeGenerationChange = sharedMemeRequests.length;
    firstSocket.send(
      JSON.stringify({
        type: "generation_reset_required",
        generation: GENERATION_TWO,
        reason: "generation_changed",
      }),
    );
    assert.deepEqual(connectorGenerationResetAckFrameSchema.parse(await nextFrame(firstInbox)), {
      type: "generation_reset_ack",
      generation: GENERATION_TWO,
    });
    const changedChunk = await generationStreamReader.read();
    const changedText = new TextDecoder().decode(changedChunk.value);
    assert.match(changedText, /event: generation_changed/);
    const changedPayload = changedText
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    assert(changedPayload);
    assert.deepEqual(connectorLocalGenerationChangedEventSchema.parse(JSON.parse(changedPayload)), {
      delivery_generation: GENERATION_TWO,
    });
    assert.equal((await generationStreamReader.read()).done, true);
    assert.deepEqual(state.getDeliveryCheckpoint(), {
      generation: GENERATION_TWO,
      lastPersistedCursor: 0,
    });
    await waitFor(
      () => sharedMemeRequests.length > requestsBeforeGenerationChange,
      "Generation reset did not re-check the authoritative shared meme snapshot",
    );

    const newGenerationEvent = event(1, randomUUID(), GENERATION_TWO);
    firstSocket.send(JSON.stringify({ type: "event", event: newGenerationEvent }));
    assert.deepEqual(connectorAckFrameSchema.parse(await nextFrame(firstInbox)), {
      type: "ack",
      generation: GENERATION_TWO,
      event_id: newGenerationEvent.event_id,
      cursor: 1,
    });
    firstSocket.send(
      JSON.stringify({
        type: "generation_reset_required",
        generation: GENERATION_TWO,
        reason: "generation_changed",
      }),
    );
    assert.deepEqual(connectorGenerationResetAckFrameSchema.parse(await nextFrame(firstInbox)), {
      type: "generation_reset_ack",
      generation: GENERATION_TWO,
    });
    assert.equal(state.getLastPersistedCursor(), 1);

    firstSocket.send(
      JSON.stringify({
        type: "event",
        event: event(2, randomUUID(), GENERATION_ONE),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(firstInbox.frames.length, 0);
    assert.equal(state.getLastPersistedCursor(), 1);

    client.stop();
    await once(firstSocket, "close");
    state.close();

    state = new ConnectorStateDatabase(databasePath);
    sharedMemeSync = new SharedMemeSynchronizer({
      serverWebSocketUrl: wsUrl,
      credential: CREDENTIAL,
      httpRequestTimeoutMs: 300_000,
      state,
      snapshotPath: sharedMemeSnapshotPath,
      fetchImplementation: fakeFetch,
    });
    secondClient = new ConnectorClient({
      serverWebSocketUrl: wsUrl,
      credential: CREDENTIAL,
      httpRequestTimeoutMs: 300_000,
      state,
      reconnect: true,
      sharedMemeSync,
    });
    secondClient.start();
    const { socket: restartedSocket, inbox: restartedInbox } = await nextConnection();
    const restartedHello = connectorHelloFrameSchema.parse(await nextFrame(restartedInbox));
    assert.equal(restartedHello.generation, GENERATION_TWO);
    assert.equal(restartedHello.last_persisted_cursor, 1);
    assert.equal(state.getStatus("connecting").welcome_message, connectorWelcomeMessage);
    const requestsBeforeRestartReady = sharedMemeRequests.length;
    restartedSocket.send(
      JSON.stringify(
        connectorReadyFrameSchema.parse({
          type: "ready",
          protocol_version: "2.0",
          capabilities: ["event_stream_v2", "resync_v2"],
          connection_id: randomUUID(),
          resident_id: "resident-1",
          generation: GENERATION_TWO,
          resume_after_cursor: 1,
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

    const cursorAheadClose = once(restartedSocket, "close");
    restartedSocket.send(
      JSON.stringify({
        type: "resync_required",
        generation: GENERATION_TWO,
        after_cursor: 1,
        reason: "cursor_ahead",
      }),
    );
    await waitFor(
      () => secondClient?.getStatus().connection_state === "offline",
      "Connector stayed permanently in resyncing after cursor_ahead",
    );
    const [cursorAheadCode, cursorAheadReason] = await cursorAheadClose;
    assert.equal(cursorAheadCode, 4000);
    assert.equal(String(cursorAheadReason), "cursor_ahead");
    assert.equal(secondClient.getStatus().last_error_code, "cursor_ahead");

    const { socket: recoveredSocket, inbox: recoveredInbox } = await nextConnection();
    const recoveredHello = connectorHelloFrameSchema.parse(await nextFrame(recoveredInbox));
    assert.equal(recoveredHello.generation, GENERATION_TWO);
    assert.equal(recoveredHello.last_persisted_cursor, 1);
    recoveredSocket.send(
      JSON.stringify(
        connectorReadyFrameSchema.parse({
          type: "ready",
          protocol_version: "2.0",
          capabilities: ["event_stream_v2", "resync_v2"],
          connection_id: randomUUID(),
          resident_id: "resident-1",
          generation: GENERATION_TWO,
          resume_after_cursor: 1,
          welcome: connectorWelcomeMessage,
        }),
      ),
    );
    await waitFor(
      () => secondClient?.getStatus().connection_state === "online",
      "Connector did not recover online after cursor_ahead reconnect",
    );
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
    httpRequestTimeoutMs: 300_000,
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
      httpRequestTimeoutMs: 300_000,
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

test("Connector rejects remote plaintext WebSocket URLs", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-connector-url-test-"));
  const state = new ConnectorStateDatabase(join(directory, "connector.sqlite"));
  try {
    assert.throws(
      () =>
        new ConnectorClient({
          serverWebSocketUrl: "ws://doorbell.example/api/connector/ws",
          credential: CREDENTIAL,
          httpRequestTimeoutMs: 300_000,
          state,
          reconnect: false,
        }),
      /wss|loopback/,
    );
  } finally {
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Connector mailbox HTTP aborts a stalled request as unavailable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-connector-mailbox-timeout-"));
  const state = new ConnectorStateDatabase(join(directory, "connector.sqlite"));
  const observed: { signal: AbortSignal | undefined } = { signal: undefined };
  const client = new ConnectorClient({
    serverWebSocketUrl: "ws://127.0.0.1:3000/api/connector/ws",
    credential: CREDENTIAL,
    httpRequestTimeoutMs: 20,
    state,
    reconnect: false,
    fetchImplementation: async (_input, init) => {
      const signal = init?.signal ?? null;
      observed.signal = signal ?? undefined;
      if (!signal) {
        throw new Error("missing abort signal");
      }
      return await new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  });
  try {
    await assert.rejects(
      client.listMailbox(1),
      (error: unknown) =>
        error instanceof ConnectorMailboxRequestError && error.code === "connector_unavailable",
    );
    assert.equal(observed.signal?.aborted, true);
  } finally {
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shared meme HTTP timeouts clear the active sync and permit a later retry", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-shared-meme-timeout-"));
  const state = new ConnectorStateDatabase(join(directory, "connector.sqlite"));
  const snapshotPath = join(directory, "shared-memes.sqlite");
  const release1 = createSharedMemeRelease(directory, 1, "超时前旧梗");
  const release2 = createSharedMemeRelease(directory, 2, "超时后新梗");
  let remote = release1;
  let mode: "metadata-timeout" | "snapshot-timeout" | "valid" = "valid";
  const observed: {
    metadata: AbortSignal | undefined;
    snapshot: AbortSignal | undefined;
  } = { metadata: undefined, snapshot: undefined };
  const waitForAbort = async (signal: AbortSignal | null): Promise<Response> => {
    if (!signal) {
      throw new Error("missing abort signal");
    }
    return await new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
  const sync = new SharedMemeSynchronizer({
    serverWebSocketUrl: "ws://127.0.0.1:3000/api/connector/ws",
    credential: CREDENTIAL,
    httpRequestTimeoutMs: 20,
    state,
    snapshotPath,
    fetchImplementation: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname.endsWith("/version")) {
        observed.metadata = init?.signal ?? undefined;
        return mode === "metadata-timeout"
          ? waitForAbort(init?.signal ?? null)
          : Response.json(remote.metadata);
      }
      observed.snapshot = init?.signal ?? undefined;
      if (mode === "snapshot-timeout") {
        return waitForAbort(init?.signal ?? null);
      }
      return new Response(remote.snapshot, {
        headers: { "content-type": "application/vnd.sqlite3" },
      });
    },
  });

  try {
    assert.equal(await sync.syncLatest(), true);
    assert.equal(sync.getStatus().applied_version, 1);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    remote = release2;
    mode = "metadata-timeout";
    assert.equal(await sync.syncLatest(), false);
    assert.equal(sync.getStatus().last_error_code, "metadata_unavailable");
    assert.equal(observed.metadata?.aborted, true);
    assert.equal(sync.getStatus().applied_version, 1);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    mode = "snapshot-timeout";
    assert.equal(await sync.syncLatest(), false);
    assert.equal(sync.getStatus().last_error_code, "snapshot_unavailable");
    assert.equal(observed.snapshot?.aborted, true);
    assert.equal(sync.getStatus().applied_version, 1);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    mode = "valid";
    assert.equal(await sync.syncLatest(), true);
    assert.equal(sync.getStatus().applied_version, 2);
    assert.deepEqual(readFileSync(snapshotPath), release2.snapshot);
  } finally {
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shared meme snapshot enforces a streaming size ceiling and retries after broken streams", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-shared-meme-stream-limit-"));
  const state = new ConnectorStateDatabase(join(directory, "connector.sqlite"));
  const snapshotPath = join(directory, "shared-memes.sqlite");
  const release1 = createSharedMemeRelease(directory, 1, "旧梗");
  const release2 = createSharedMemeRelease(directory, 2, "新梗");
  let remote = release1;
  let mode: "valid" | "oversized" | "broken" = "valid";
  let arrayBufferCalled = false;
  const sync = new SharedMemeSynchronizer({
    serverWebSocketUrl: "ws://127.0.0.1:3000/api/connector/ws",
    credential: CREDENTIAL,
    httpRequestTimeoutMs: 300_000,
    state,
    snapshotPath,
    fetchImplementation: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname.endsWith("/version")) {
        return Response.json(remote.metadata);
      }
      let response: Response;
      if (mode === "broken") {
        response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error("broken snapshot stream"));
            },
          }),
          { headers: { "content-type": "application/vnd.sqlite3" } },
        );
      } else {
        const body =
          mode === "oversized"
            ? Buffer.concat([remote.snapshot, Buffer.from([0])])
            : remote.snapshot;
        response = new Response(body, {
          headers: { "content-type": "application/vnd.sqlite3" },
        });
      }
      const readAll = response.arrayBuffer.bind(response);
      Object.defineProperty(response, "arrayBuffer", {
        value: async () => {
          arrayBufferCalled = true;
          return readAll();
        },
      });
      return response;
    },
  });

  try {
    assert.equal(await sync.syncLatest(), true);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    remote = release2;
    mode = "oversized";
    arrayBufferCalled = false;
    assert.equal(await sync.syncLatest(), false);
    assert.equal(sync.getStatus().last_error_code, "size_mismatch");
    assert.equal(arrayBufferCalled, false);
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    mode = "broken";
    assert.equal(await sync.syncLatest(), false);
    assert.equal(sync.getStatus().last_error_code, "snapshot_unavailable");
    assert.deepEqual(readFileSync(snapshotPath), release1.snapshot);

    mode = "valid";
    assert.equal(await sync.syncLatest(), true);
    assert.equal(sync.getStatus().applied_version, 2);
    assert.deepEqual(readFileSync(snapshotPath), release2.snapshot);
  } finally {
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

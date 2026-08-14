import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  connectorCredentialIssueSuccessSchema,
  connectorReadyFrameSchema,
  connectorServerErrorFrameSchema,
  connectorSettingsStatusSchema,
  connectorWelcomeMessage,
  humanSettingsSuccessSchema,
  mailboxDetailSuccessSchema,
  mailboxErrorSchema,
  mailboxListSuccessSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import WebSocket, { type RawData } from "ws";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import { ConnectorService } from "./connector-service.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import type {
  FarmWelcomeRewardGranter,
  FarmWelcomeRewardGrantInput,
} from "./farm-reward-client.js";
import { MailboxService } from "./mailbox-service.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const NOW = Date.UTC(2026, 7, 12, 15, 0, 0);
const HUMAN_SESSION_TOKEN = `dbc_${"S".repeat(43)}`;
const FIRST_CONNECTOR_CREDENTIAL = `dbc_${"A".repeat(43)}`;
const SECOND_CONNECTOR_CREDENTIAL = `dbc_${"B".repeat(43)}`;

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();
  unavailable = false;

  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    if (this.unavailable) {
      throw new OneBotUnavailableError("fake OneBot unavailable");
    }
    return this.members.has(qqNumber);
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(): Promise<FarmDirectoryEntry> {
    throw new Error("Connector tests must not query the farm");
  }
  async lookupFarmByHumanKey(): Promise<FarmDirectoryEntry> {
    throw new Error("Connector tests must not query the farm");
  }
  async readFarmOverview(): Promise<BoundFarmOverview> {
    throw new Error("Connector tests must not query the farm");
  }
  async readFarmHumanPage(): Promise<FarmHumanPage> {
    throw new Error("Connector tests must not query the farm");
  }
  async submitFarmHumanAction(): Promise<FarmHumanActionRedirect> {
    throw new Error("Connector tests must not query the farm");
  }
}

interface ConnectorHarness {
  app: ReturnType<typeof buildApp>;
  database: CommunityDatabase;
  membership: FakeGroupMembership;
  connectorService: ConnectorService;
  mailboxService: MailboxService;
  rewardCalls: FarmWelcomeRewardGrantInput[];
  wsUrl: string;
  close(): Promise<void>;
}

async function openHarness(
  databasePath: string,
  credentials: string[],
  options: { heartbeatIntervalMs?: number; heartbeatTimeoutMs?: number } = {},
): Promise<ConnectorHarness> {
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => HUMAN_SESSION_TOKEN,
  });
  const membership = new FakeGroupMembership();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => NOW,
  });
  const rewardCalls: FarmWelcomeRewardGrantInput[] = [];
  const farmRewardGranter: FarmWelcomeRewardGranter = {
    async grantWelcomeReward(input) {
      rewardCalls.push(input);
    },
  };
  const mailboxService = new MailboxService({
    database,
    farmRewardGranter,
    now: () => NOW,
  });
  const connectorService = new ConnectorService({
    database,
    registrationAuth,
    mailboxService,
    generateCredential: () => credentials.shift() ?? `dbc_${"Z".repeat(43)}`,
    ...(options.heartbeatIntervalMs === undefined
      ? {}
      : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
    ...(options.heartbeatTimeoutMs === undefined
      ? {}
      : { heartbeatTimeoutMs: options.heartbeatTimeoutMs }),
  });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    connectorService,
    mailboxService,
    secureCookies: false,
    logger: false,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const wsUrl = `${address.replace(/^http/, "ws")}/api/connector/ws`;
  return {
    app,
    database,
    membership,
    connectorService,
    mailboxService,
    rewardCalls,
    wsUrl,
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

function createCommunity(harness: ConnectorHarness) {
  const created = harness.database.createHumanSession("10001", NOW, {
    residentName: "小一",
    homeName: "门铃小屋",
    farmDoorplate: "ABC234",
    farmHumanKey: "unused-connector-farm-key",
  });
  harness.membership.members.add("10001");
  return created;
}

function sessionCookie(): string {
  return `doorbell_session=${HUMAN_SESSION_TOKEN}`;
}

interface SocketInbox {
  frames: unknown[];
  waiters: Array<{ resolve(value: unknown): void; reject(error: Error): void }>;
}

const socketInboxes = new WeakMap<WebSocket, SocketInbox>();

function nextJson(socket: WebSocket): Promise<unknown> {
  let inbox = socketInboxes.get(socket);
  if (!inbox) {
    inbox = { frames: [], waiters: [] };
    socketInboxes.set(socket, inbox);
    socket.on("message", (data: RawData) => {
      let frame: unknown;
      try {
        frame = JSON.parse(data.toString());
      } catch (error) {
        const waiter = inbox?.waiters.shift();
        waiter?.reject(error instanceof Error ? error : new Error("Invalid JSON frame"));
        return;
      }
      const waiter = inbox?.waiters.shift();
      if (waiter) {
        waiter.resolve(frame);
      } else {
        inbox?.frames.push(frame);
      }
    });
    socket.on("close", () => {
      for (const waiter of inbox?.waiters.splice(0) ?? []) {
        waiter.reject(new Error("WebSocket closed before a frame arrived"));
      }
    });
  }
  const frame = inbox.frames.shift();
  if (frame !== undefined) {
    return Promise.resolve(frame);
  }
  return new Promise((resolve, reject) => inbox?.waiters.push({ resolve, reject }));
}

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await once(socket, "open");
  return socket;
}

function hello(credential: string, lastPersistedCursor = 0) {
  return {
    type: "hello",
    protocol_version: "1.0",
    capabilities: ["event_stream_v1", "resync_v1"],
    credential,
    last_persisted_cursor: lastPersistedCursor,
  };
}

async function issueCredential(harness: ConnectorHarness) {
  const response = await harness.app.inject({
    method: "POST",
    url: "/api/connector/credential",
    headers: { cookie: sessionCookie() },
    payload: {},
  });
  assert.equal(response.statusCode, 200);
  return connectorCredentialIssueSuccessSchema.parse(response.json());
}

test("Connector credential control separates the human Cookie and stores only a digest", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-connector-control-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const harness = await openHarness(databasePath, [
    FIRST_CONNECTOR_CREDENTIAL,
    SECOND_CONNECTOR_CREDENTIAL,
  ]);
  try {
    createCommunity(harness);
    const unauthenticated = await harness.app.inject({
      method: "POST",
      url: "/api/connector/credential",
      payload: {},
    });
    assert.equal(unauthenticated.statusCode, 401);

    const issued = await issueCredential(harness);
    assert.equal(issued.connector_credential, FIRST_CONNECTOR_CREDENTIAL);
    assert.equal(issued.replaced_previous, false);

    const sqlite = new Database(databasePath, { readonly: true });
    const stored = sqlite.prepare("SELECT credential_token_hash FROM connector_bindings").get() as {
      credential_token_hash: string;
    };
    sqlite.close();
    assert.equal(stored.credential_token_hash.length, 64);
    assert.notEqual(stored.credential_token_hash, FIRST_CONNECTOR_CREDENTIAL);

    const settings = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie() },
    });
    const connectorStatus = humanSettingsSuccessSchema.parse(settings.json()).connection_status
      .connector;
    assert.deepEqual(connectorStatus, { status: "offline", last_online_at: null });
    assert.doesNotMatch(settings.body, /dbc_[A-Z]/);

    const browserCredentialSocket = await openSocket(harness.wsUrl);
    const browserCredentialError = nextJson(browserCredentialSocket);
    browserCredentialSocket.send(JSON.stringify(hello(HUMAN_SESSION_TOKEN)));
    assert.equal(
      connectorServerErrorFrameSchema.parse(await browserCredentialError).code,
      "authentication_rejected",
    );

    const rotated = await issueCredential(harness);
    assert.equal(rotated.connector_credential, SECOND_CONNECTOR_CREDENTIAL);
    assert.equal(rotated.replaced_previous, true);

    const oldCredentialSocket = await openSocket(harness.wsUrl);
    const oldCredentialError = nextJson(oldCredentialSocket);
    oldCredentialSocket.send(JSON.stringify(hello(FIRST_CONNECTOR_CREDENTIAL)));
    assert.equal(
      connectorServerErrorFrameSchema.parse(await oldCredentialError).code,
      "authentication_rejected",
    );

    const activeSocket = await openSocket(harness.wsUrl);
    const activeReady = nextJson(activeSocket);
    activeSocket.send(JSON.stringify(hello(SECOND_CONNECTOR_CREDENTIAL)));
    connectorReadyFrameSchema.parse(await activeReady);
    const revokedClose = once(activeSocket, "close");

    const revoke = await harness.app.inject({
      method: "DELETE",
      url: "/api/connector/credential",
      headers: { cookie: sessionCookie() },
      payload: {},
    });
    assert.equal(revoke.statusCode, 200);
    const [revokedCode, revokedReason] = await revokedClose;
    assert.equal(revokedCode, 4003);
    assert.equal(String(revokedReason), "credential_revoked");
    const afterRevoke = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie() },
    });
    const revokedStatus = humanSettingsSuccessSchema.parse(afterRevoke.json()).connection_status
      .connector;
    assert.equal(revokedStatus.status, "not_configured");
    assert.notEqual(revokedStatus.last_online_at, null);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Connector negotiates version, replaces the resident connection, and times out without heartbeat ACK", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-connector-live-"));
  const harness = await openHarness(
    join(directory, "doorbell.sqlite"),
    [FIRST_CONNECTOR_CREDENTIAL],
    { heartbeatIntervalMs: 10, heartbeatTimeoutMs: 30 },
  );
  try {
    createCommunity(harness);
    await issueCredential(harness);

    const incompatible = await openSocket(harness.wsUrl);
    const incompatibleFrame = nextJson(incompatible);
    incompatible.send(
      JSON.stringify({ ...hello(FIRST_CONNECTOR_CREDENTIAL), protocol_version: "2" }),
    );
    assert.equal(
      connectorServerErrorFrameSchema.parse(await incompatibleFrame).code,
      "unsupported_protocol_version",
    );

    const missingCapability = await openSocket(harness.wsUrl);
    const missingCapabilityFrame = nextJson(missingCapability);
    missingCapability.send(
      JSON.stringify({
        ...hello(FIRST_CONNECTOR_CREDENTIAL),
        capabilities: ["event_stream_v1"],
      }),
    );
    assert.equal(
      connectorServerErrorFrameSchema.parse(await missingCapabilityFrame).code,
      "missing_required_capability",
    );

    harness.membership.unavailable = true;
    const unavailable = await openSocket(harness.wsUrl);
    const unavailableFrame = nextJson(unavailable);
    unavailable.send(JSON.stringify(hello(FIRST_CONNECTOR_CREDENTIAL)));
    assert.equal(
      connectorServerErrorFrameSchema.parse(await unavailableFrame).code,
      "membership_verification_unavailable",
    );
    harness.membership.unavailable = false;

    const first = await openSocket(harness.wsUrl);
    const firstReadyFrame = nextJson(first);
    first.send(JSON.stringify(hello(FIRST_CONNECTOR_CREDENTIAL)));
    const firstReady = connectorReadyFrameSchema.parse(await firstReadyFrame);
    assert.equal(firstReady.welcome, connectorWelcomeMessage);

    const online = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie() },
    });
    assert.equal(
      connectorSettingsStatusSchema.parse(
        humanSettingsSuccessSchema.parse(online.json()).connection_status.connector,
      ).status,
      "online",
    );

    const firstClosed = once(first, "close");
    const second = await openSocket(harness.wsUrl);
    const secondReadyFrame = nextJson(second);
    second.send(JSON.stringify(hello(FIRST_CONNECTOR_CREDENTIAL)));
    assert.equal(
      connectorReadyFrameSchema.parse(await secondReadyFrame).welcome,
      connectorWelcomeMessage,
    );
    const [replacementCode, replacementReason] = await firstClosed;
    assert.equal(replacementCode, 4001);
    assert.equal(String(replacementReason), "connection_replaced");

    const secondClosed = once(second, "close");
    const [timeoutCode, timeoutReason] = await secondClosed;
    assert.equal(timeoutCode, 4000);
    assert.equal(String(timeoutReason), "heartbeat_timeout");

    await new Promise((resolve) => setTimeout(resolve, 0));

    const offline = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie() },
    });
    const offlineStatus = humanSettingsSuccessSchema.parse(offline.json()).connection_status
      .connector;
    assert.equal(offlineStatus.status, "offline");
    assert.notEqual(offlineStatus.last_online_at, null);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Connector credential reads only its resident mailbox and marks only resident read state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-connector-mailbox-"));
  const harness = await openHarness(join(directory, "doorbell.sqlite"), [
    FIRST_CONNECTOR_CREDENTIAL,
  ]);
  try {
    const created = createCommunity(harness);
    const letter = harness.mailboxService.deliver({
      homeId: created.community.home.homeId,
      idempotencyKey: "system:connector-mailbox-test",
      category: "system",
      title: "同一封信",
      body: "人类和居民小机读取同一份正文。",
      attachment: { attachmentType: "farm_reward", status: "available" },
      sensitiveValues: [created.community.farmBinding.farmHumanKey ?? ""],
    });
    await issueCredential(harness);

    const browserCookieAsCredential = await harness.app.inject({
      method: "GET",
      url: "/api/connector/mailbox",
      headers: { authorization: `Bearer ${HUMAN_SESSION_TOKEN}` },
    });
    assert.equal(browserCookieAsCredential.statusCode, 401);

    const attemptedTargetSwitch = await harness.app.inject({
      method: "GET",
      url: "/api/connector/mailbox?home_id=another-home",
      headers: { authorization: `Bearer ${FIRST_CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(attemptedTargetSwitch.statusCode, 400);

    const listed = await harness.app.inject({
      method: "GET",
      url: "/api/connector/mailbox",
      headers: { authorization: `Bearer ${FIRST_CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(listed.statusCode, 200);
    const list = mailboxListSuccessSchema.parse(listed.json());
    assert.equal(list.letters[0]?.letter_id, letter.letterId);
    assert.equal(list.letters[0]?.is_new, true);
    assert.equal("body" in (list.letters[0] ?? {}), false);

    const opened = await harness.app.inject({
      method: "GET",
      url: `/api/connector/mailbox/${letter.letterId}`,
      headers: { authorization: `Bearer ${FIRST_CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(opened.statusCode, 200);
    const detail = mailboxDetailSuccessSchema.parse(opened.json()).letter;
    assert.equal(detail.body, "人类和居民小机读取同一份正文。");
    assert.equal(detail.is_new, false);
    assert.equal(
      harness.mailboxService.listForAudience(created.community.home.homeId, "human", 1).letters[0]
        ?.isNew,
      true,
    );
    assert.equal(
      harness.mailboxService.listForAudience(created.community.home.homeId, "resident", 1)
        .letters[0]?.isNew,
      false,
    );
    assert.doesNotMatch(opened.body, /unused-connector-farm-key|dbc_[ABS]/u);

    const rejectedClaimTarget = await harness.app.inject({
      method: "POST",
      url: `/api/connector/mailbox/${letter.letterId}/claim`,
      headers: { authorization: `Bearer ${FIRST_CONNECTOR_CREDENTIAL}` },
      payload: { farm_doorplate: "DEF567" },
    });
    assert.equal(rejectedClaimTarget.statusCode, 400);
    assert.equal(harness.rewardCalls.length, 0);

    const claimed = await harness.app.inject({
      method: "POST",
      url: `/api/connector/mailbox/${letter.letterId}/claim`,
      headers: { authorization: `Bearer ${FIRST_CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(claimed.statusCode, 200);
    assert.equal(
      mailboxDetailSuccessSchema.parse(claimed.json()).letter.attachment?.status,
      "claimed",
    );
    assert.deepEqual(harness.rewardCalls, [
      {
        grantId: `doorbell-mailbox:${letter.letterId}`,
        farmDoorplate: "ABC234",
        farmHumanKey: "unused-connector-farm-key",
      },
    ]);
    assert.doesNotMatch(claimed.body, /unused-connector-farm-key|dbc_[ABS]/u);

    harness.membership.unavailable = true;
    const unavailable = await harness.app.inject({
      method: "GET",
      url: "/api/connector/mailbox",
      headers: { authorization: `Bearer ${FIRST_CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(mailboxErrorSchema.parse(unavailable.json()).error.code, "onebot_unavailable");
    harness.membership.unavailable = false;

    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/connector/mailbox",
      headers: { authorization: `Bearer ${FIRST_CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(mailboxErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Connector events keep resident order, reject ACK gaps, replay, and survive server restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-connector-events-"));
  const databasePath = join(directory, "doorbell.sqlite");
  let harness = await openHarness(databasePath, [FIRST_CONNECTOR_CREDENTIAL]);
  let socket: WebSocket | undefined;
  try {
    const created = createCommunity(harness);
    await issueCredential(harness);
    const firstEvent = harness.connectorService.emitEvent(
      created.community.resident.residentId,
      "foundation.fact",
      { value: 1 },
    );
    const secondEvent = harness.connectorService.emitEvent(
      created.community.resident.residentId,
      "foundation.fact",
      { value: 2 },
    );
    assert.equal(firstEvent.cursor, 1);
    assert.equal(secondEvent.cursor, 2);

    socket = await openSocket(harness.wsUrl);
    const readyFrame = nextJson(socket);
    socket.send(JSON.stringify(hello(FIRST_CONNECTOR_CREDENTIAL)));
    connectorReadyFrameSchema.parse(await readyFrame);
    const deliveredFirst = (await nextJson(socket)) as {
      event: { event_id: string; cursor: number };
    };
    const deliveredSecond = (await nextJson(socket)) as {
      event: { event_id: string; cursor: number };
    };
    assert.equal(deliveredFirst.event.cursor, 1);
    assert.equal(deliveredSecond.event.cursor, 2);

    const resyncFrame = nextJson(socket);
    socket.send(
      JSON.stringify({
        type: "ack",
        event_id: deliveredSecond.event.event_id,
        cursor: 2,
      }),
    );
    assert.deepEqual(await resyncFrame, {
      type: "resync_required",
      after_cursor: 0,
      reason: "ack_gap",
    });
    const replayedFirst = (await nextJson(socket)) as {
      event: { event_id: string; cursor: number };
    };
    const replayedSecond = (await nextJson(socket)) as {
      event: { event_id: string; cursor: number };
    };
    assert.equal(replayedFirst.event.cursor, 1);
    assert.equal(replayedSecond.event.cursor, 2);
    socket.send(JSON.stringify({ type: "ack", event_id: firstEvent.eventId, cursor: 1 }));
    socket.send(JSON.stringify({ type: "ack", event_id: secondEvent.eventId, cursor: 2 }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(
      harness.database.getConnectorLastAckedCursor(created.community.resident.residentId),
      2,
    );
    socket.close(1000, "restart_test");
    await once(socket, "close");
    socket = undefined;
    await harness.close();

    harness = await openHarness(databasePath, []);
    harness.membership.members.add("10001");
    socket = await openSocket(harness.wsUrl);
    const restartedReadyFrame = nextJson(socket);
    socket.send(JSON.stringify(hello(FIRST_CONNECTOR_CREDENTIAL, 2)));
    assert.equal(connectorReadyFrameSchema.parse(await restartedReadyFrame).resume_after_cursor, 2);
    const eventAfterRestart = harness.connectorService.emitEvent(
      created.community.resident.residentId,
      "foundation.fact",
      { value: 3 },
    );
    assert.equal(eventAfterRestart.cursor, 3);
    const deliveredAfterRestart = (await nextJson(socket)) as { event: { cursor: number } };
    assert.equal(deliveredAfterRestart.event.cursor, 3);
  } finally {
    socket?.close();
    await harness.close().catch(() => undefined);
    rmSync(directory, { recursive: true, force: true });
  }
});

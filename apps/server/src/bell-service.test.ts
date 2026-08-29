import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { BellService, type BellStreamSink } from "./bell-service.js";
import { CommunityDatabase, FARM_PURCHASE_REQUEST_TTL_MS } from "./community-database.js";
import { FarmPurchaseRequestService } from "./farm-purchase-request-service.js";
import { MailboxService } from "./mailbox-service.js";

const TOKEN = "dbb_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TOKEN_HASH = "643e8661aa252b51405263db0c778704de8ef7455bcbb1bc0db365486a8870e6";

function registeredDatabase(path = ":memory:"): {
  database: CommunityDatabase;
  homeId: string;
  residentId: string;
} {
  const database = new CommunityDatabase(path, {
    generateAccountId: () => "account-1",
    generateHomeId: () => "home-1",
    generateResidentId: () => "resident-1",
    generateSessionToken: () => "session-1",
  });
  const created = database.createHumanSession("10001", 1_000, {
    farmDoorplate: "FARM-1",
    farmHumanKey: "human-key-1",
    homeName: "小屋",
    residentName: "小机",
  });
  database.replaceFirstActiveBellCredential("bell-credential-1", TOKEN_HASH, 1_100);
  return {
    database,
    homeId: created.community.home.homeId,
    residentId: created.community.resident.residentId,
  };
}

function collectingSink(): {
  events: Array<{ event: string; data?: unknown }>;
  sink: BellStreamSink;
} {
  const events: Array<{ event: string; data?: unknown }> = [];
  return {
    events,
    sink: {
      close: () => undefined,
      heartbeat: () => events.push({ event: "heartbeat" }),
      send: (event, data) => events.push({ event, data }),
    },
  };
}

test("human mailbox delivery and opening never produce a Bell wake", async () => {
  const { database, homeId, residentId } = registeredDatabase();
  let nextLetter = 0;
  const mailbox = new MailboxService({
    database,
    generateLetterId: () => `letter-${++nextLetter}`,
    now: () => 2_000,
  });
  mailbox.deliver({
    body: "this body must never enter a Bell event",
    category: "system",
    homeId,
    idempotencyKey: "system:test",
    sensitiveValues: [],
    title: "private title",
  });

  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-1",
    heartbeatIntervalMs: 30_000,
    now: () => 3_000,
    registrationAuth: {
      confirmCurrentResidentMembership: async (candidate: string) => {
        assert.equal(candidate, residentId);
      },
    },
    replayIntervalMs: 60_000,
  });
  const collected = collectingSink();
  const connection = await service.connect(TOKEN, collected.sink);

  assert.deepEqual(collected.events, [
    { event: "connected", data: { version: 1, connection_epoch: "epoch-1" } },
  ]);
  assert.equal(database.listPendingBellWakes(residentId).length, 0);
  assert.equal(mailbox.listForAudience(homeId, "resident", 1).letters[0]?.isNew, true);
  mailbox.openForAudience(homeId, "resident", "letter-1");
  service.refreshResident(residentId);
  assert.equal(collected.events.filter((event) => event.event === "wake").length, 0);

  mailbox.deliver({
    body: "a later body must also stay private",
    category: "system",
    homeId,
    idempotencyKey: "system:later",
    sensitiveValues: [],
    title: "later private title",
  });
  service.refreshHome(homeId);
  assert.equal(collected.events.filter((event) => event.event === "wake").length, 0);
  assert.doesNotMatch(JSON.stringify(collected.events), /later private title|later body/u);

  connection.close();
  service.close();
  database.close();
});

test("confirmed membership revocation closes the resident Bell stream immediately", async () => {
  const { database, residentId } = registeredDatabase();
  let closed = false;
  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-membership-revoked",
    heartbeatIntervalMs: 30_000,
    now: () => 3_000,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  await service.connect(TOKEN, {
    close: () => {
      closed = true;
    },
    heartbeat: () => undefined,
    send: () => undefined,
  });
  assert.equal(service.getSettingsStatus(residentId).status, "online");

  service.disconnectResident(residentId);

  assert.equal(closed, true);
  assert.equal(service.getSettingsStatus(residentId).status, "offline");
  service.close();
  database.close();
});

test("a legacy pending mailbox wake is cancelled while terminal history is preserved", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-bell-mailbox-removal-"));
  const databasePath = join(directory, "community.sqlite");
  const registered = registeredDatabase(databasePath);
  const { homeId, residentId } = registered;
  const mailbox = new MailboxService({ database: registered.database, now: () => 2_000 });
  mailbox.deliver({
    body: "legacy unread",
    category: "system",
    homeId,
    idempotencyKey: "system:legacy",
    sensitiveValues: [],
    title: "legacy unread",
  });
  registered.database.close();

  const seed = new Database(databasePath);
  seed
    .prepare(
      `INSERT INTO bell_wakes (
         wake_id, resident_id, reason, status, created_at,
         ended_at, block_reason, error_code
       ) VALUES (?, ?, 'mailbox_unread', ?, ?, ?, NULL, NULL)`,
    )
    .run("wake-pending", residentId, "pending", 2_100, null);
  seed
    .prepare(
      `INSERT INTO bell_wakes (
         wake_id, resident_id, reason, status, created_at,
         ended_at, block_reason, error_code
       ) VALUES (?, ?, 'mailbox_unread', ?, ?, ?, NULL, NULL)`,
    )
    .run("wake-acked", residentId, "acked", 1_500, 1_600);
  seed.close();

  const database = new CommunityDatabase(databasePath);
  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-cancel",
    heartbeatIntervalMs: 30_000,
    now: () => 3_000,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const collected = collectingSink();
  const connection = await service.connect(TOKEN, collected.sink);
  assert.deepEqual(collected.events, [
    { event: "connected", data: { version: 1, connection_epoch: "epoch-cancel" } },
    {
      event: "cancel",
      data: {
        version: 1,
        connection_epoch: "epoch-cancel",
        wake_id: "wake-pending",
      },
    },
  ]);
  assert.equal(database.listPendingBellWakes(residentId).length, 0);

  connection.close();
  service.close();
  database.close();
  const inspection = new Database(databasePath, { readonly: true });
  try {
    assert.deepEqual(
      inspection.prepare("SELECT wake_id, status FROM bell_wakes ORDER BY wake_id").all(),
      [
        { wake_id: "wake-acked", status: "acked" },
        { wake_id: "wake-pending", status: "cancelled" },
      ],
    );
  } finally {
    inspection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("purchase wakes replay by stable wake ID, stay once per connection, and ACK changes no request data", async () => {
  const { database, residentId, homeId } = registeredDatabase();
  let nextRequestId = 0;
  let nextWakeId = 0;
  const purchaseService = new FarmPurchaseRequestService({
    database,
    now: () => 4_000,
    generateRequestId: () => `request-${++nextRequestId}`,
    generateWakeId: () => `purchase-wake-${++nextWakeId}`,
  });
  purchaseService.create({
    residentId,
    homeId,
    humanName: "辛玥",
    shop: "field",
    shopRevision: "field-v1",
    idempotencyKey: "00000000-0000-4000-8000-000000000010",
    items: [{ kind: "seed", itemId: "ordinary_seed", qty: 2, displayName: "普通种子" }],
  });

  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-purchase-1",
    heartbeatIntervalMs: 30_000,
    now: () => 5_000,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const first = collectingSink();
  const connection = await service.connect(TOKEN, first.sink);
  service.refreshResident(residentId);
  const fixture = JSON.parse(
    readFileSync(new URL("../test-fixtures/doorbell-wake-v1.json", import.meta.url), "utf8"),
  ) as { event: string; data: Record<string, unknown> };
  assert.deepEqual(first.events, [
    { event: "connected", data: { version: 1, connection_epoch: "epoch-purchase-1" } },
    fixture,
  ]);
  const ack = await service.acknowledge(TOKEN, {
    connectionEpoch: "epoch-purchase-1",
    wakeId: "purchase-wake-1",
  });
  assert.deepEqual(ack, { version: 1, wake_id: "purchase-wake-1", status: "acked" });
  assert.equal(purchaseService.get(residentId, "request-1", 5_000)?.status, "requested");
  connection.close();
  service.close();
  database.close();
});

test("a new queued purchase wake reaches an online resident and reconnect replays pending wakes", async () => {
  const { database, residentId, homeId } = registeredDatabase();
  let nextRequestId = 0;
  let nextWakeId = 0;
  const service = new BellService({
    database,
    generateConnectionEpoch: () => `epoch-purchase-${nextRequestId + 1}`,
    heartbeatIntervalMs: 30_000,
    now: () => 5_000,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const purchaseService = new FarmPurchaseRequestService({
    database,
    now: () => 4_000,
    generateRequestId: () => `request-${++nextRequestId}`,
    generateWakeId: () => `purchase-wake-${++nextWakeId}`,
    bellNotifier: service,
  });
  const first = collectingSink();
  const firstConnection = await service.connect(TOKEN, first.sink);
  purchaseService.create({
    residentId,
    homeId,
    humanName: "辛玥",
    shop: "field",
    shopRevision: "field-v1",
    idempotencyKey: "00000000-0000-4000-8000-000000000011",
    items: [{ kind: "seed", itemId: "ordinary_seed", qty: 1, displayName: "普通种子" }],
  });
  purchaseService.create({
    residentId,
    homeId,
    humanName: "辛玥",
    shop: "ranch",
    shopRevision: "ranch-v1",
    idempotencyKey: "00000000-0000-4000-8000-000000000012",
    items: [{ kind: "animal", itemId: "duck", qty: 1, displayName: "鸭子" }],
  });
  assert.deepEqual(
    first.events
      .filter((event) => event.event === "wake")
      .map((event) => (event.data as { wake_id: string }).wake_id),
    ["purchase-wake-1", "purchase-wake-2"],
  );
  firstConnection.close();
  const second = collectingSink();
  const secondConnection = await service.connect(TOKEN, second.sink);
  assert.deepEqual(
    second.events
      .filter((event) => event.event === "wake")
      .map((event) => (event.data as { wake_id: string }).wake_id),
    ["purchase-wake-1", "purchase-wake-2"],
  );
  secondConnection.close();
  service.close();
  database.close();
});

test("an offline purchase request expires before reconnect and only emits cancellation", async () => {
  const { database, residentId, homeId } = registeredDatabase();
  const createdAt = 4_000;
  const purchaseService = new FarmPurchaseRequestService({
    database,
    now: () => createdAt,
    generateRequestId: () => "request-expired-offline",
    generateWakeId: () => "wake-expired-offline",
  });
  const idempotencyKey = "00000000-0000-4000-8000-000000000014";
  purchaseService.create({
    residentId,
    homeId,
    humanName: "辛玥",
    shop: "field",
    shopRevision: "field-v1",
    idempotencyKey,
    items: [{ kind: "seed", itemId: "ordinary_seed", qty: 1, displayName: "普通种子" }],
  });
  assert.equal(
    database.getFarmPurchaseRequestByIdempotencyKey(residentId, idempotencyKey)?.status,
    "requested",
  );

  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-expired-offline",
    heartbeatIntervalMs: 30_000,
    now: () => createdAt + FARM_PURCHASE_REQUEST_TTL_MS + 1,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const collected = collectingSink();
  const connection = await service.connect(TOKEN, collected.sink);

  assert.deepEqual(
    collected.events.filter((event) => event.event),
    [
      { event: "connected", data: { version: 1, connection_epoch: "epoch-expired-offline" } },
      {
        event: "cancel",
        data: {
          version: 1,
          connection_epoch: "epoch-expired-offline",
          wake_id: "wake-expired-offline",
        },
      },
    ],
  );
  assert.equal(collected.events.filter((event) => event.event === "wake").length, 0);
  assert.equal(
    database.getFarmPurchaseRequestByIdempotencyKey(residentId, idempotencyKey)?.status,
    "expired",
  );
  assert.equal(database.getBellWake(residentId, "wake-expired-offline")?.status, "cancelled");

  connection.close();
  service.close();
  database.close();
});

test("an online expired purchase request emits one cancellation across refreshes", async () => {
  const { database, residentId, homeId } = registeredDatabase();
  const createdAt = 4_000;
  let now = 5_000;
  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-expired-online",
    heartbeatIntervalMs: 30_000,
    now: () => now,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const purchaseService = new FarmPurchaseRequestService({
    database,
    now: () => createdAt,
    generateRequestId: () => "request-expired-online",
    generateWakeId: () => "wake-expired-online",
    bellNotifier: service,
  });
  const collected = collectingSink();
  const connection = await service.connect(TOKEN, collected.sink);
  const idempotencyKey = "00000000-0000-4000-8000-000000000015";
  purchaseService.create({
    residentId,
    homeId,
    humanName: "辛玥",
    shop: "ranch",
    shopRevision: "ranch-v1",
    idempotencyKey,
    items: [{ kind: "animal", itemId: "duck", qty: 1, displayName: "鸭子" }],
  });
  now = createdAt + FARM_PURCHASE_REQUEST_TTL_MS + 1;
  service.refreshResident(residentId);
  service.refreshResident(residentId);

  assert.equal(collected.events.filter((event) => event.event === "wake").length, 1);
  assert.equal(collected.events.filter((event) => event.event === "cancel").length, 1);
  assert.equal(
    database.getFarmPurchaseRequestByIdempotencyKey(residentId, idempotencyKey)?.status,
    "expired",
  );
  assert.equal(database.getBellWake(residentId, "wake-expired-online")?.status, "cancelled");

  connection.close();
  service.close();
  database.close();
});

test("a blocked farm purchase wake marks the notification request failed", async () => {
  const { database, residentId, homeId } = registeredDatabase();
  const purchaseService = new FarmPurchaseRequestService({
    database,
    now: () => 4_000,
    generateRequestId: () => "request-blocked",
    generateWakeId: () => "wake-blocked",
  });
  purchaseService.create({
    residentId,
    homeId,
    humanName: "辛玥",
    shop: "ranch",
    shopRevision: "ranch-v1",
    idempotencyKey: "00000000-0000-4000-8000-000000000013",
    items: [{ kind: "animal", itemId: "duck", qty: 1, displayName: "鸭子" }],
  });
  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-blocked",
    heartbeatIntervalMs: 30_000,
    now: () => 5_000,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const sink = collectingSink();
  const connection = await service.connect(TOKEN, sink.sink);
  const result = await service.reportBlocked(TOKEN, {
    wakeId: "wake-blocked",
    connectionEpoch: "epoch-blocked",
    blockReason: "permanent_error",
    errorCode: "not_available",
  });
  assert.deepEqual(result, { version: 1, wake_id: "wake-blocked", status: "blocked" });
  assert.equal(purchaseService.get(residentId, "request-blocked", 5_000)?.status, "failed");
  connection.close();
  service.close();
  database.close();
});

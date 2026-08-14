import assert from "node:assert/strict";
import { test } from "node:test";
import { BellService, type BellStreamSink } from "./bell-service.js";
import { CommunityDatabase } from "./community-database.js";
import { MailboxService } from "./mailbox-service.js";

const TOKEN = "dbb_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TOKEN_HASH = "643e8661aa252b51405263db0c778704de8ef7455bcbb1bc0db365486a8870e6";

function registeredDatabase(): {
  database: CommunityDatabase;
  homeId: string;
  residentId: string;
} {
  const database = new CommunityDatabase(":memory:", {
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

test("one unread mailbox fact produces one content-free wake and exact ACK confirmation", async () => {
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

  let nextWake = 0;
  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-1",
    generateWakeId: () => `wake-${++nextWake}`,
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

  assert.deepEqual(collected.events.slice(0, 2), [
    { event: "connected", data: { version: 1, connection_epoch: "epoch-1" } },
    {
      event: "wake",
      data: {
        version: 1,
        connection_epoch: "epoch-1",
        wake_id: "wake-1",
        reason: "mailbox_unread",
        message: "📬 新消息：\nDoorbell Commons 信箱里有一封新信。",
        created_at: new Date(3_000).toISOString(),
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(collected.events), /private title|this body/u);

  assert.deepEqual(
    await service.acknowledge(TOKEN, {
      connectionEpoch: connection.connectionEpoch,
      wakeId: "wake-1",
    }),
    { version: 1, wake_id: "wake-1", status: "acked" },
  );
  service.refreshResident(residentId);
  assert.equal(collected.events.filter((event) => event.event === "wake").length, 1);

  mailbox.deliver({
    body: "a later body must also stay private",
    category: "system",
    homeId,
    idempotencyKey: "system:later",
    sensitiveValues: [],
    title: "later private title",
  });
  service.refreshResident(residentId);
  assert.equal(collected.events.filter((event) => event.event === "wake").length, 2);
  assert.doesNotMatch(JSON.stringify(collected.events), /later private title|later body/u);
  assert.deepEqual(
    await service.acknowledge(TOKEN, {
      connectionEpoch: connection.connectionEpoch,
      wakeId: "wake-1",
    }),
    { version: 1, wake_id: "wake-1", status: "acked" },
  );

  connection.close();
  service.close();
  database.close();
});

test("multiple unread letters merge into one pending wake and reconnect replays the same wake", async () => {
  const { database, homeId, residentId } = registeredDatabase();
  const mailbox = new MailboxService({ database, now: () => 2_000 });
  mailbox.deliver({
    body: "first",
    category: "system",
    homeId,
    idempotencyKey: "system:first",
    sensitiveValues: [],
    title: "first",
  });
  mailbox.deliver({
    body: "second",
    category: "farm",
    homeId,
    idempotencyKey: "farm:second",
    sensitiveValues: [],
    title: "second",
  });

  let nextEpoch = 0;
  const service = new BellService({
    database,
    generateConnectionEpoch: () => `epoch-${++nextEpoch}`,
    generateWakeId: () => "wake-stable",
    heartbeatIntervalMs: 30_000,
    now: () => 3_000,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const first = collectingSink();
  const firstConnection = await service.connect(TOKEN, first.sink);
  assert.equal(first.events.filter((event) => event.event === "wake").length, 1);
  firstConnection.close();

  const second = collectingSink();
  const secondConnection = await service.connect(TOKEN, second.sink);
  assert.equal(second.events.filter((event) => event.event === "wake").length, 1);
  const replayedWake = second.events.find((event) => event.event === "wake");
  assert.ok(replayedWake);
  assert.equal((replayedWake.data as { wake_id: string }).wake_id, "wake-stable");
  assert.equal(database.listPendingBellWakes(residentId).length, 1);

  secondConnection.close();
  service.close();
  database.close();
});

test("pause settings cancel a queued mailbox wake without marking the letter read", async () => {
  const { database, homeId } = registeredDatabase();
  const mailbox = new MailboxService({ database, now: () => 2_000 });
  mailbox.deliver({
    body: "kept unread",
    category: "system",
    homeId,
    idempotencyKey: "system:pause",
    sensitiveValues: [],
    title: "kept unread",
  });
  const service = new BellService({
    database,
    generateConnectionEpoch: () => "epoch-pause",
    generateWakeId: () => "wake-pause",
    heartbeatIntervalMs: 30_000,
    now: () => 3_000,
    registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
    replayIntervalMs: 60_000,
  });
  const collected = collectingSink();
  const connection = await service.connect(TOKEN, collected.sink);
  database.updateHumanSettings(homeId, 4_000, { pauseAllWakeups: true });
  service.refreshHome(homeId);

  assert.deepEqual(collected.events.at(-1), {
    event: "cancel",
    data: {
      version: 1,
      connection_epoch: "epoch-pause",
      wake_id: "wake-pause",
    },
  });
  assert.equal(mailbox.listForAudience(homeId, "resident", 1).letters[0]?.isNew, true);

  connection.close();
  service.close();
  database.close();
});

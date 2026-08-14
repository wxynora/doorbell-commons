import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { BellService, type BellStreamSink } from "./bell-service.js";
import { CommunityDatabase } from "./community-database.js";
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

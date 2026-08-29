import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const directory = mkdtempSync(join(tmpdir(), "aifarm-maintenance-compensation-"));
process.env.AIFARM_DATA_DIR = directory;

const { makeFarm } = await import("../dist/game.js");
const { NPC_ID } = await import("../dist/config.js");
const grants = JSON.parse(readFileSync(new URL("../content/maintenance-grants.json", import.meta.url)));
const compensationId = "compensation-20260830-bug-recovery";
const {
  allFarms,
  applyMaintenanceSilverGrant,
  restoreWorldSnapshotInMemory,
  save,
  setWorldCommitCoordinator,
  snapshotWorldForRollback,
  withWorldCommitContext,
} = await import("../dist/store.js");
const {
  createLingyeFarmBalanceCoordinator,
  createLingyeWorldBackend,
  openLingyeWorldDatabase,
} = await import("../dist/lingye-world-database.js");

function farm(id, gold, silver) {
  const value = makeFarm(id);
  value.id = id;
  value.coins = gold;
  value.silver = silver;
  return value;
}

test("one compensation campaign credits every player farm and the migrated ledger exactly once", () => {
  const ordinary = farm("ABC234", 2_000, 20);
  const migrated = farm("DEF567", 3_000, 30);
  const npc = farm(NPC_ID, 9_000, 90);
  const migrationId = "10000000-0000-4000-8000-000000000001";
  const residentId = "20000000-0000-4000-8000-000000000001";
  migrated.doorbellMcpMigration = {
    migrationId,
    residentId,
    legacyGold: migrated.coins,
    legacySilver: migrated.silver,
    confirmationId: migrationId,
    revokedAt: "2026-08-30T00:00:00.000Z",
    legacyMcpRevoked: true,
  };
  const previousIds = grants.map((entry) => entry.id).filter((id) => id !== compensationId);
  const initial = {
    format: "aifarm-world",
    version: 1,
    maintenanceGrantIds: previousIds,
    doorbellWelcomeRewardGrants: [],
    doorbellFarmCreations: [],
    farms: [ordinary, migrated, npc],
    ugc: [],
  };
  restoreWorldSnapshotInMemory(initial);
  save();
  const durableBefore = readFileSync(join(directory, "world.json"), "utf8");
  const rollback = snapshotWorldForRollback();

  setWorldCommitCoordinator(() => {
    throw new Error("simulated compensation commit failure");
  });
  const failed = applyMaintenanceSilverGrant();
  assert.equal(failed.applied, true);
  assert.throws(() => save(), /simulated compensation commit failure/u);
  assert.equal(readFileSync(join(directory, "world.json"), "utf8"), durableBefore);
  restoreWorldSnapshotInMemory(rollback);

  const database = openLingyeWorldDatabase(join(directory, "lingye-world.sqlite"));
  const backend = createLingyeWorldBackend(database, {
    economyRules: {
      minimumSystemLoanCreditDays: 7,
      restrictedDailyGoldLimit: 200_000,
      restrictedDailySilverLimit: 400,
    },
    now: () => Date.parse("2026-08-30T12:00:00+08:00"),
  });
  setWorldCommitCoordinator(createLingyeFarmBalanceCoordinator(database, backend));
  try {
    const applied = applyMaintenanceSilverGrant();
    assert.deepEqual(applied.campaigns, [
      { id: compensationId, gold: 100_000, silver: 1_000, amount: 1_000, count: 2 },
    ]);
    withWorldCommitContext({ balanceAuthority: "farm", actor: "system" }, () => save());

    const values = Object.fromEntries(allFarms().map((entry) => [entry.id, entry]));
    assert.deepEqual(
      { gold: values.ABC234.coins, silver: values.ABC234.silver },
      { gold: 102_000, silver: 1_020 },
    );
    assert.deepEqual(
      { gold: values.DEF567.coins, silver: values.DEF567.silver },
      { gold: 103_000, silver: 1_030 },
    );
    assert.deepEqual(
      { gold: values[NPC_ID].coins, silver: values[NPC_ID].silver },
      { gold: 9_000, silver: 90 },
    );
    assert.deepEqual(backend.trustedQueries.getAccount(residentId), {
      residentId,
      availableGold: 103_000,
      availableSilver: 1_030,
      frozenGold: 0,
      frozenSilver: 0,
      demandGold: 0,
      termGold: 0,
      silverAgentLock: 0,
      agentSpendableSilver: 1_030,
      creditPoints: 0,
      highSpendRestricted: false,
    });

    const replay = applyMaintenanceSilverGrant();
    assert.deepEqual(replay, { applied: false, campaigns: [] });
    withWorldCommitContext({ balanceAuthority: "farm", actor: "system" }, () => save());
    assert.equal(backend.trustedQueries.getAccount(residentId).availableGold, 103_000);
    assert.equal(backend.trustedQueries.getAccount(residentId).availableSilver, 1_030);
    const persisted = JSON.parse(readFileSync(join(directory, "world.json"), "utf8"));
    assert.equal(persisted.maintenanceGrantIds.filter((id) => id === compensationId).length, 1);
  } finally {
    setWorldCommitCoordinator(null);
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

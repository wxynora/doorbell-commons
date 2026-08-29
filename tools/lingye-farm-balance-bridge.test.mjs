import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const directory = mkdtempSync(join(tmpdir(), "lingye-farm-balance-bridge-"));
process.env.AIFARM_DATA_DIR = directory;

const { makeFarm } = await import("../dist/game.js");
const {
  allFarms,
  getFarm,
  insertFarm,
  restoreWorldSnapshotInMemory,
  save,
  setWorldCommitCoordinator,
  snapshotWorldForRollback,
  withWorldCommitContext,
} = await import("../dist/store.js");
const { marketActionRevision } = await import("../dist/server/market-revision.js");
const { handleHumanCrossFarmMarketAction } = await import("../dist/server/market-cross-farm-action.js");
const {
  createLingyeFarmBalanceCoordinator,
  createLingyeWorldBackend,
  openLingyeWorldDatabase,
  runLingyeWorldTransaction,
} = await import("../dist/lingye-world-database.js");

const RULES = {
  minimumSystemLoanCreditDays: 7,
  restrictedDailyGoldLimit: 200_000,
  restrictedDailySilverLimit: 400,
};
const MIGRATION_A = "10000000-0000-4000-8000-000000000001";
const MIGRATION_B = "10000000-0000-4000-8000-000000000002";
const RESIDENT_A = "20000000-0000-4000-8000-000000000001";
const RESIDENT_B = "20000000-0000-4000-8000-000000000002";

function migratedFarm(id, migrationId, residentId, gold, silver) {
  const farm = makeFarm(id);
  farm.id = id;
  farm.coins = gold;
  farm.silver = silver;
  farm.agentKey = undefined;
  farm.doorbellMcpMigration = {
    migrationId,
    residentId,
    legacyGold: gold,
    legacySilver: silver,
    confirmationId: migrationId,
    revokedAt: "2026-08-29T00:00:00.000Z",
    legacyMcpRevoked: true,
  };
  insertFarm(farm);
  return farm;
}

test("migrated farms import once and every later farm balance commit uses the unified ledger", () => {
  const farmA = migratedFarm("ABC234", MIGRATION_A, RESIDENT_A, 2_000, 100);
  const farmB = migratedFarm("DEF567", MIGRATION_B, RESIDENT_B, 1_000, 20);
  const database = openLingyeWorldDatabase(join(directory, "lingye-world.sqlite"));
  let operationSequence = 0;
  const backend = createLingyeWorldBackend(database, {
    economyRules: RULES,
    now: () => Date.parse("2026-08-29T08:00:00+08:00"),
    generateId: () => `bridge-journal-${++operationSequence}`,
  });
  const coordinator = createLingyeFarmBalanceCoordinator(database, backend, {
    generateOperationId: () => `operation-${++operationSequence}`,
  });
  setWorldCommitCoordinator(coordinator);
  try {
    save();
    assert.deepEqual(backend.trustedQueries.getAccount(RESIDENT_A), {
      residentId: RESIDENT_A,
      availableGold: 2_000,
      availableSilver: 100,
      frozenGold: 0,
      frozenSilver: 0,
      demandGold: 0,
      termGold: 0,
      silverAgentLock: 0,
      agentSpendableSilver: 100,
      creditPoints: 0,
      highSpendRestricted: false,
    });

    farmA.silver = 80;
    farmB.silver = 38;
    withWorldCommitContext({ balanceAuthority: "farm", actor: "agent" }, () => save());
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_A).availableSilver, 80);
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_B).availableSilver, 38);
    assert.deepEqual(database.prepare(`
      SELECT resident_id, delta FROM economy_ledger_entries
      WHERE journal_id = (SELECT journal_id FROM economy_commands WHERE command_type = 'farm.balance.apply')
        AND currency = 'silver' AND resident_id IS NOT NULL
      ORDER BY resident_id
    `).all().map((row) => ({ ...row })), [
      { resident_id: RESIDENT_A, delta: -20 },
      { resident_id: RESIDENT_B, delta: 18 },
    ]);
    assert.equal(database.prepare(`
      SELECT delta FROM economy_ledger_entries
      WHERE journal_id = (SELECT journal_id FROM economy_commands WHERE command_type = 'farm.balance.apply')
        AND currency = 'silver' AND system_account = 'legacy_farm_bridge'
    `).get().delta, 2);

    backend.trustedSystemCommands.setSilverAgentLock({
      residentId: RESIDENT_A,
      amount: 70,
      actor: "human",
      idempotencyKey: "lock-resident-a",
    });
    const durableBeforeRejectedSpend = readFileSync(join(directory, "world.json"), "utf8");
    const rollback = snapshotWorldForRollback();
    farmA.silver = 60;
    assert.throws(
      () => withWorldCommitContext({ balanceAuthority: "farm", actor: "agent" }, () => save()),
      (error) => error?.code === "SILVER_LOCKED",
    );
    restoreWorldSnapshotInMemory(rollback);
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_A).availableSilver, 80);
    assert.equal(readFileSync(join(directory, "world.json"), "utf8"), durableBeforeRejectedSpend);

    const liveFarmA = allFarms().find((farm) => farm.id === farmA.id);
    assert.throws(() => runLingyeWorldTransaction(database, () =>
      withWorldCommitContext({ balanceAuthority: "ledger", actor: "human", operationId: "rolled-back-ledger" }, () => {
        backend.trustedSystemCommands.creditFromSystem({
          residentId: RESIDENT_A,
          currency: "gold",
          amount: 25,
          businessType: "rolled_back_test_credit",
          businessRef: "rolled-back-test-credit:resident-a",
          idempotencyKey: "rolled-back-test-credit:resident-a",
        });
        save();
        throw new Error("simulate sqlite commit loss after world rename");
      })), /simulate sqlite commit loss/u);
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_A).availableGold, 2_000);
    assert.equal(liveFarmA.coins, 2_025);
    save();
    assert.equal(liveFarmA.coins, 2_000);
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_A).availableGold, 2_000);

    runLingyeWorldTransaction(database, () =>
      withWorldCommitContext({ balanceAuthority: "ledger", actor: "human" }, () => {
        backend.trustedSystemCommands.creditFromSystem({
          residentId: RESIDENT_A,
          currency: "gold",
          amount: 25,
          businessType: "test_credit",
          businessRef: "test-credit:resident-a",
          idempotencyKey: "test-credit:resident-a",
        });
        save();
      }));
    assert.equal(liveFarmA.coins, 2_025);
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_A).availableGold, 2_025);

    const seller = getFarm(farmA.id);
    const buyer = getFarm(farmB.id);
    seller.materials.ordinary_stone = 1;
    seller.market = [{ kind: "material", id: "ordinary_stone", qty: 1, price: 10 }];
    save();
    const purchase = handleHumanCrossFarmMarketAction(buyer, seller, {
      farm_human_key: buyer.humanKey,
      expected_farm_doorplate: buyer.id,
      idempotency_key: "30000000-0000-4000-8000-000000000001",
      expected_revision: marketActionRevision(buyer, Date.parse("2026-08-29T08:00:00+08:00")),
      action: "buy",
      seller_doorplate: seller.id,
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    }, Date.parse("2026-08-29T08:00:00+08:00"));
    assert.equal(purchase.status, 200);
    assert.equal(getFarm(seller.id).silver, 89);
    assert.equal(getFarm(buyer.id).silver, 28);
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_A).availableSilver, 89);
    assert.equal(backend.trustedQueries.getAccount(RESIDENT_B).availableSilver, 28);
  }
  finally {
    setWorldCommitCoordinator(null);
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

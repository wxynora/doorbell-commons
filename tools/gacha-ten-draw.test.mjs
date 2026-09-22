import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  GACHA_TEN_DRAW_PRICE_GOLD,
  GACHA_TEN_DRAW_SIZE,
  createGachaService,
} from "../dist/server/doorbell/gacha-service.js";
import { FARM_DECORATION_CATALOG } from "../dist/domain/farm-decoration/catalog.js";

const candidateRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = 1_789_000_000_000;
const CATALOG = {
  materials: [{ id: "mat-n", name: "测试素材", rarity: "N" }],
  crops: [],
  decorations: FARM_DECORATION_CATALOG.filter((item) => item.layer === "furniture"),
  cooking: {},
  cookingIngredients: [{ id: "ing-a", name: "测试食材", price: 10 }],
  cookingRecipes: [{ id: "dish-a", name: "测试料理", rarity: "N", ingredients: ["ing-a"] }],
};

function createHarness({ gold = 20_000, startCount = 0, pityMisses = 0 } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE farm_states (
      farm_id TEXT PRIMARY KEY,
      position INTEGER NOT NULL UNIQUE,
      state_json TEXT NOT NULL CHECK (json_valid(state_json))
    );
    CREATE TABLE farm_action_receipts (
      farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE RESTRICT,
      scope TEXT NOT NULL,
      receipt_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      result_json TEXT NOT NULL CHECK (json_valid(result_json)),
      PRIMARY KEY (farm_id, scope, receipt_key)
    ) WITHOUT ROWID;
  `);
  const liveFarm = {
    id: "A2689A",
    humanKey: "human-one",
    doorbellMcpMigration: { residentId: "resident-a" },
    doorbellGachaDaily: { day: Math.floor((NOW + 8 * 3600_000) / 86_400_000), count: startCount },
    doorbellGachaPity: { misses: pityMisses },
    ranch: { decor: [], decorStore: [] },
    farmDecorations: { version: 2, owned: {}, layout: { house: { x: 0, z: 0, rotation: 0 }, roof: "mint", canopy: "plain", stall: { x: 0, z: 0, rotation: 0 }, decorations: [] } },
  };
  database
    .prepare("INSERT INTO farm_states (farm_id, position, state_json) VALUES (?, ?, ?)")
    .run("A2689A", 0, JSON.stringify(liveFarm));
  const charges = [];
  const credits = [];
  let goldBalance = gold;
  const backend = {
    trustedSystemCommands: {
      chargeToSystem(input) {
        charges.push(input);
        if (input.amount > goldBalance) {
          const error = new Error("insufficient");
          error.code = "BALANCE_INSUFFICIENT";
          throw error;
        }
        goldBalance -= input.amount;
        return { availableGold: goldBalance, availableSilver: 0 };
      },
      creditFromSystem(input) {
        credits.push(input);
        if (input.currency === "gold") goldBalance += input.amount;
        return { availableGold: goldBalance, availableSilver: input.currency === "silver" ? input.amount : 0 };
      },
    },
    trustedQueries: {
      getAccount() {
        return { availableGold: goldBalance, availableSilver: 0 };
      },
    },
  };
  const draws = [];
  const service = createGachaService({
    database,
    backend,
    catalog: CATALOG,
    now: () => NOW,
    random: () => 0.5,
    farmStore: {
      findByHumanKey(humanKey) {
        draws.push(humanKey);
        const row = database.prepare("SELECT state_json FROM farm_states WHERE farm_id = 'A2689A'").get();
        return { farmId: "A2689A", farm: JSON.parse(row.state_json), expectedStateJson: row.state_json };
      },
      save({ farm, expectedStateJson }) {
        const result = database
          .prepare("UPDATE farm_states SET state_json = ? WHERE farm_id = 'A2689A' AND state_json = ?")
          .run(JSON.stringify(farm), expectedStateJson);
        assert.equal(result.changes, 1);
      },
    },
    receiptStore: {
      get(farmId, key) {
        const row = database
          .prepare("SELECT payload_hash, result_json FROM farm_action_receipts WHERE farm_id = ? AND receipt_key = ?")
          .get(farmId, key);
        return row ? { payloadHash: row.payload_hash, result: JSON.parse(row.result_json) } : null;
      },
      put({ farmId, receiptKey, payloadHash, result }) {
        database
          .prepare("INSERT INTO farm_action_receipts (farm_id, scope, receipt_key, payload_hash, result_json) VALUES (?, ?, ?, ?, ?)")
          .run(farmId, "/doorbellGachaReceipts", receiptKey, payloadHash, JSON.stringify(result));
      },
    },
    runAtomic: (operation) => {
      database.exec("BEGIN IMMEDIATE");
      try {
        const value = operation();
        database.exec("COMMIT");
        return value;
      } catch (error) {
        if (database.isTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },
  });
  return { service, database, charges, credits, draws, liveFarm };
}

const baseInput = {
  farmHumanKey: "human-one",
  expectedFarmDoorplate: "A2689A",
  idempotencyKey: "019c8d3a-7b1f-7e1a-9c2d-3f4a5b6c7d8e",
};

test("ten draw charges 5000 once and awards exactly ten rewards in one transaction", () => {
  assert.equal(GACHA_TEN_DRAW_SIZE, 10);
  assert.equal(GACHA_TEN_DRAW_PRICE_GOLD, 5000);
  const harness = createHarness();
  const result = harness.service.drawTen(baseInput);
  assert.equal(harness.charges.length, 1);
  assert.equal(harness.charges[0].amount, 5000);
  assert.equal(result.rewards.length, 10);
  assert.equal(result.draw_count, 10);
  assert.equal(result.count, 10);
  assert.equal(result.price_gold, 5000);
  const stored = JSON.parse(
    harness.database.prepare("SELECT state_json FROM farm_states WHERE farm_id = 'A2689A'").get().state_json,
  );
  assert.equal(stored.doorbellGachaDaily.count, 10);
});

test("ten draw replays the identical receipt for the same idempotency key", () => {
  const harness = createHarness();
  const first = harness.service.drawTen(baseInput);
  const second = harness.service.drawTen(baseInput);
  assert.deepEqual(second, first);
  assert.equal(harness.charges.length, 1);
});

test("ten draw with a different key reuses the same key for a distinct batch", () => {
  const harness = createHarness();
  harness.service.drawTen(baseInput);
  const second = harness.service.drawTen({ ...baseInput, idempotencyKey: "019c8d3a-7b1f-7e1a-9c2d-3f4a5b6c7d8f" });
  assert.notEqual(second.request_id, baseInput.idempotencyKey);
  assert.equal(harness.charges.length, 2);
});

test("ten draw rejects when fewer than ten draws remain for today", () => {
  const harness = createHarness({ startCount: 95 });
  assert.throws(() => harness.service.drawTen(baseInput), (error) => error.code === "GACHA_QUOTA_EXCEEDED");
  assert.equal(harness.charges.length, 0);
});

test("ten draw rejects insufficient gold before any reward is granted", () => {
  const harness = createHarness({ gold: 4_999 });
  assert.throws(() => harness.service.drawTen(baseInput), (error) => error.code === "GACHA_INSUFFICIENT_GOLD");
  assert.equal(harness.credits.length, 0);
});

test("ten draw preserves cross-draw pity progression inside the batch", () => {
  const harness = createHarness({ pityMisses: 94 });
  const result = harness.service.drawTen(baseInput);
  const rareIndexes = result.rewards
    .map((reward, index) => (["decor", "sp_material", "sp_seed", "ssr_seed"].includes(reward.category) ? index : -1))
    .filter((index) => index >= 0);
  assert.equal(rareIndexes.length, 1);
  assert.equal(result.pity.misses, 4);
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-chef-doorbell-cook-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-28T08:00:00.000Z");
const {
  createLingyeWorldBackend,
  openLingyeWorldDatabase,
  registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { farmDoorbellKitchenCareerBenefits } = await import("../dist/career/farm-benefits.js");
const { ensureKitchen } = await import("../dist/engine.js");
const { makeFarm } = await import("../dist/game.js");
const { allFarms, getFarm, insertFarm } = await import("../dist/store.js");
const { resolveChefOriginalCookingReceipt } = await import("../dist/domain/kitchen/original.js");
const {
  handleHumanKitchenCookAction,
  kitchenCookRevision,
} = await import("../dist/server/kitchen-cook-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const RULES = Object.freeze({
  minimumSystemLoanCreditDays: null,
  restrictedDailyGoldLimit: null,
  restrictedDailySilverLimit: null,
});

function register(database, residentId, bindingReference) {
  registerLingyeResidentReference(database, { residentId, bindingReference, registeredAt: NOW });
}

function importBalance(backend, residentId) {
  backend.trustedSystemCommands.importLegacyBalances({
    residentId,
    gold: 100_000,
    silver: 0,
    migrationId: `chef-doorbell-balance:${residentId}`,
    idempotencyKey: `chef-doorbell-balance:${residentId}`,
  });
}

test("Doorbell Human cooking derives the resident, discovers one original recipe, and settles its author once", () => {
  const database = openLingyeWorldDatabase(":memory:");
  try {
    register(database, "chef-doorbell-author", "chef-doorbell-author-binding");
    register(database, "chef-doorbell-cook", "chef-doorbell-cook-binding");
    database.prepare(`
      INSERT INTO career_chef_original_recipes (
        recipe_id, identity_key, resident_id, recipe_name, ingredients_json,
        method_id, recipe_version, quality_version, base_score, pair_score,
        method_score, structure_score, quality_score, total_score, rarity, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "chef-doorbell-original",
      "beef:1|butter:1|pan-fry",
      "chef-doorbell-author",
      "门铃黄油牛肉",
      JSON.stringify([{ id: "beef", quantity: 1 }, { id: "butter", quantity: 1 }]),
      "pan-fry",
      "chef-quality-v1",
      1, 100, 100, 100, 100, 100, "SR", NOW,
    );

    const farm = makeFarm("门铃原创料理农场", 123456, {
      humanKey: "chef-doorbell-human-key",
      humanName: "测试伴侣",
    });
    farm.id = "CDEF23";
    farm.doorbellMcpMigration = { migrationId: "chef-doorbell-cook-binding" };
    const kitchen = ensureKitchen(farm);
    kitchen.products = [{ id: "chef-doorbell-beef", itemId: "beef", value: 50, createdAt: NOW }];
    kitchen.ingredients = { butter: 1 };
    kitchen.dishes = [];
    insertFarm(farm);

    const resolveCookingReceipt = (receiptId) => {
      const matches = allFarms()
        .map((candidate) => resolveChefOriginalCookingReceipt(candidate, receiptId))
        .filter(Boolean);
      return matches.length === 1 ? matches[0] : null;
    };
    const backend = createLingyeWorldBackend(database, {
      economyRules: RULES,
      now: () => NOW,
      chefAuthority: { resolveCookingReceipt },
    });
    importBalance(backend, "chef-doorbell-author");
    importBalance(backend, "chef-doorbell-cook");

    const current = getFarm(farm.id);
    const benefits = farmDoorbellKitchenCareerBenefits(database, backend, current);
    assert.equal(benefits.cookResidentId, "chef-doorbell-cook");
    assert.deepEqual(benefits.accessibleOriginalRecipeIds, []);
    assert.equal(benefits.originalRecipes.length, 1);
    assert.equal(Object.hasOwn(benefits, "farmHumanKey"), false);

    const key = "019ffb01-49cd-7020-84af-3d04fb1ed04e";
    const body = {
      farm_human_key: current.humanKey,
      expected_farm_doorplate: current.id,
      idempotency_key: key,
      expected_kitchen_inventory_revision: kitchenCookRevision(current, NOW, benefits),
      method_id: "pan-fry",
      items: ["chef-doorbell-beef", "butter"],
    };
    const first = handleHumanKitchenCookAction(current, body, NOW, benefits);
    assert.equal(first.status, 200);
    assert.equal(first.json.data.result.outcome.recipe_id, "chef-doorbell-original");
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count FROM chef_recipe_entitlements
      WHERE resident_id = 'chef-doorbell-cook' AND recipe_id = 'chef-doorbell-original'
        AND source_kind = 'discovery' AND revoked_at IS NULL
    `).get().count, 1);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count FROM chef_recipe_production_commissions
      WHERE cooking_receipt_id = ?
    `).get(key).count, 1);
    assert.equal(backend.forResident("chef-doorbell-author").getOwnAccount().availableGold, 100_800);

    const replay = handleHumanKitchenCookAction(getFarm(farm.id), body, NOW + 1, benefits);
    assert.equal(replay.status, 200);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count FROM chef_recipe_production_commissions
      WHERE cooking_receipt_id = ?
    `).get(key).count, 1);
    assert.equal(getFarm(farm.id).ranch.kitchen.dishes.length, 1);
    assert.equal(backend.forResident("chef-doorbell-author").getOwnAccount().availableGold, 100_800);
  }
  finally {
    database.close();
  }
});

test("an unbound farm never receives server-only original recipe authority", () => {
  const database = openLingyeWorldDatabase(":memory:");
  try {
    const farm = makeFarm("未绑定农场", 987654, { humanKey: "unbound-human" });
    const benefits = farmDoorbellKitchenCareerBenefits(database, null, farm);
    assert.equal(Object.hasOwn(benefits, "originalRecipes"), false);
    assert.equal(Object.hasOwn(benefits, "cookResidentId"), false);
    assert.equal(Object.hasOwn(benefits, "onOriginalCookingReceipt"), false);
  }
  finally {
    database.close();
  }
});

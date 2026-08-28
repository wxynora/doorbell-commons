import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-chef-original-cooking-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-28T04:00:00.000Z");
const { ensureKitchen } = await import("../dist/engine.js");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const {
  kitchenCook,
  kitchenCookKnownRecipe,
  resolveChefOriginalCookingReceipt,
} = await import("../dist/domain/kitchen/index.js");
const { handleHumanKitchenCookAction, kitchenCookRevision } = await import("../dist/server/kitchen-cook-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const ORIGINAL_RECIPE = Object.freeze({
  recipeId: "chef-original-beef-butter",
  name: "黄油牛肉试作",
  authorResidentId: "chef-author",
  rarity: "SR",
  methodId: "pan-fry",
  ingredients: [
    { id: "beef", quantity: 1 },
    { id: "butter", quantity: 1 },
  ],
});

function freshFarm() {
  const farm = makeFarm("原创食谱测试农场", 123456, {
    humanKey: "original-cooking-human-key",
    humanName: "测试伴侣",
  });
  const kitchen = ensureKitchen(farm);
  kitchen.products = [{ id: "beef-instance-1", itemId: "beef", value: 50, createdAt: NOW }];
  kitchen.ingredients = { butter: 1 };
  kitchen.dishes = [];
  kitchen.knownRecipes = [];
  return farm;
}

function serverOptions(overrides = {}) {
  return {
    originalRecipes: [ORIGINAL_RECIPE],
    accessibleOriginalRecipeIds: [],
    cookResidentId: "chef-cook",
    ...overrides,
  };
}

test("exact ingredients can discover and cook a server-supplied original recipe", () => {
  const farm = freshFarm();
  const result = kitchenCook(farm, ["beef-instance-1", "butter"], NOW, {
    ...serverOptions(),
    cookingReceiptId: "cook-receipt-discovery",
    cookingRequestFingerprint: "request-fingerprint-a",
  });

  assert.equal(result.ok, true);
  assert.equal(result.recipe.recipeId, ORIGINAL_RECIPE.recipeId);
  assert.equal(result.originalRecipe.recipeId, ORIGINAL_RECIPE.recipeId);
  assert.equal(result.discovered, true);
  assert.equal(result.odd, false);
  assert.equal(result.cookingReceipt.receiptId, "cook-receipt-discovery");
  assert.equal(result.cookingReceipt.recipeId, ORIGINAL_RECIPE.recipeId);
  assert.equal(result.cookingReceipt.authorResidentId, "chef-author");
  assert.equal(result.cookingReceipt.rarity, "SR");
  assert.equal(result.cookingReceipt.cookResidentId, "chef-cook");
  assert.equal(farm.ranch.kitchen.products.length, 0);
  assert.equal(farm.ranch.kitchen.ingredients.butter, undefined);
  assert.equal(farm.ranch.kitchen.knownRecipes.length, 0);
  assert.deepEqual(resolveChefOriginalCookingReceipt(farm, "cook-receipt-discovery"), result.cookingReceipt);
});

test("direct original recipe cooking requires the server entitlement boundary", () => {
  const unauthorizedFarm = freshFarm();
  const before = structuredClone(unauthorizedFarm);
  const unauthorized = kitchenCookKnownRecipe(
    unauthorizedFarm,
    ORIGINAL_RECIPE.recipeId,
    NOW,
    serverOptions({ cookResidentId: "another-resident" }),
  );
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.code, "chef_original_recipe_not_unlocked");
  assert.deepEqual(unauthorizedFarm, before);

  const entitledFarm = freshFarm();
  const entitled = kitchenCookKnownRecipe(
    entitledFarm,
    ORIGINAL_RECIPE.recipeId,
    NOW,
    serverOptions({ accessibleOriginalRecipeIds: [ORIGINAL_RECIPE.recipeId], cookingReceiptId: "cook-receipt-entitled" }),
  );
  assert.equal(entitled.ok, true);
  assert.equal(entitled.recipe.recipeId, ORIGINAL_RECIPE.recipeId);
  assert.equal(entitled.discovered, false);
  assert.equal(entitled.cookingReceipt.cookResidentId, "chef-cook");
});

test("an original cook without a server resident identity fails before mutating the farm", () => {
  const farm = freshFarm();
  const before = structuredClone(farm);
  const result = kitchenCook(farm, ["beef-instance-1", "butter"], NOW, {
    ...serverOptions({ cookResidentId: undefined }),
    cookingReceiptId: "cook-receipt-no-resident",
    cookingRequestFingerprint: "request-fingerprint-no-resident",
  });

  assert.deepEqual(result, { ok: false, code: "original_cooking_receipt_unavailable" });
  assert.deepEqual(farm, before);
  assert.equal(resolveChefOriginalCookingReceipt(farm, "cook-receipt-no-resident"), null);
});

test("the farm receipt makes an original cook replayable without consuming again", () => {
  const farm = freshFarm();
  const options = {
    ...serverOptions(),
    cookingReceiptId: "cook-receipt-replay",
    cookingRequestFingerprint: "request-fingerprint-replay",
  };
  const first = kitchenCook(farm, ["beef-instance-1", "butter"], NOW, options);
  assert.equal(first.ok, true);
  const saved = structuredClone(farm);
  const replay = kitchenCook(farm, ["beef-instance-1", "butter"], NOW + 1, options);
  assert.equal(replay.ok, true);
  assert.equal(replay.alreadyCooked, true);
  assert.deepEqual(replay.cookingReceipt, first.cookingReceipt);
  assert.deepEqual(farm, saved);

  const conflict = kitchenCook(farm, ["beef-instance-1", "butter"], NOW + 2, {
    ...options,
    cookingRequestFingerprint: "different-request",
  });
  assert.deepEqual(conflict, { ok: false, code: "cooking_receipt_conflict" });
  assert.deepEqual(farm, saved);
});

function humanBody(farm, key, revision) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_kitchen_inventory_revision: revision,
    method_id: "pan-fry",
    items: ["beef-instance-1", "butter"],
  };
}

test("a saved action retries SQLite reconciliation without repeating farm cooking", () => {
  const farm = freshFarm();
  farm.id = "ABCD23";
  insertFarm(farm);
  const current = getFarm(farm.id);
  const key = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
  const options = serverOptions();
  const revision = kitchenCookRevision(current, NOW, options);
  const request = humanBody(current, key, revision);
  let calls = 0;
  let failOnce = true;
  const callbackOptions = {
    ...options,
    onOriginalCookingReceipt: (receipt) => {
      calls += 1;
      if (failOnce) {
        failOnce = false;
        throw new Error("simulated SQLite outage after farm save");
      }
      return { ok: true, receiptId: receipt.receiptId };
    },
  };

  const first = handleHumanKitchenCookAction(current, request, NOW, callbackOptions);
  assert.equal(first.status, 503);
  assert.equal(calls, 1);
  const saved = getFarm(farm.id);
  assert.equal(saved.ranch.kitchen.dishes.length, 1);
  assert.equal(saved.ranch.kitchen.products.length, 0);
  assert.ok(resolveChefOriginalCookingReceipt(saved, key));

  const replay = handleHumanKitchenCookAction(saved, request, NOW + 1, callbackOptions);
  assert.equal(replay.status, 200);
  assert.equal(calls, 2);
  const afterReplay = getFarm(farm.id);
  assert.equal(afterReplay.ranch.kitchen.dishes.length, 1);
  assert.equal(afterReplay.ranch.kitchen.products.length, 0);
  assert.equal(afterReplay.ranch.kitchen.ingredients.butter, undefined);
});

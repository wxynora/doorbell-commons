import assert from "node:assert/strict";
import test from "node:test";

const NOW = Date.parse("2026-09-01T04:00:00.000Z");

const { cookingRecipes } = await import("../dist/content.js");
const { Rng } = await import("../dist/rng.js");
const { makeFarm } = await import("../dist/game.js");
const { ensureKitchen } = await import("../dist/domain/ranch/state.js");
const {
  CHEF_LEVEL_RULES,
  KITCHEN_METHODS,
  applyChefMaterialRefund,
  chefLevelRule,
  chefMaterialRefundChance,
  chefProcessingFeeAfterDiscount,
  chefProcessingFeeDiscount,
  kitchenCook,
  kitchenCookKnownRecipe,
  kitchenMethodDefinition,
  kitchenMethodToolStatus,
  kitchenRecipeMethodId,
  kitchenRecipeToolId,
} = await import("../dist/domain/kitchen/index.js");

function freshKitchenFarm() {
  const farm = makeFarm("料理师域测试农场", 123456);
  const kitchen = ensureKitchen(farm);
  kitchen.products = [];
  kitchen.ingredients = {};
  kitchen.dishes = [];
  kitchen.knownRecipes = [];
  kitchen.shop = { day: 0, ingredientIds: [], recipeIds: [], bought: {} };
  return farm;
}

function seedForChance(chance) {
  for (let seed = 1; seed < 100_000; seed += 1) {
    const rng = new Rng(seed);
    if (rng.next() < chance) return seed;
  }
  throw new Error("could not find deterministic test seed");
}

test("all 90 authoritative recipes carry one supported method and tool binding", () => {
  assert.equal(cookingRecipes.length, 90);
  assert.equal(Object.keys(KITCHEN_METHODS).length, 8);
  for (const recipe of cookingRecipes) {
    const methodId = kitchenRecipeMethodId(recipe);
    assert.ok(kitchenMethodDefinition(methodId), recipe.id);
    assert.equal(kitchenRecipeToolId(recipe), recipe.tool_id === null ? null : recipe.tool_id);
  }
});

test("free exploration can opt into strict explicit method validation", () => {
  const farm = freshKitchenFarm();
  farm.ranch.kitchen.ingredients = { salt: 1, flour: 1 };
  const before = structuredClone(farm);
  const result = kitchenCook(farm, ["salt", "flour"], NOW, { requireMethodId: true });
  assert.deepEqual(result, { ok: false, code: "method_required" });
  assert.deepEqual(farm, before);
});

test("explicit method selects the bound recipe and rejects a different method without consuming ingredients", () => {
  const farm = freshKitchenFarm();
  farm.ranch.kitchen.ingredients = { flour: 1, butter: 1, sugar: 1 };
  const result = kitchenCook(farm, ["sugar", "flour", "butter"], NOW, { methodId: "dessert" });
  assert.equal(result.ok, true);
  assert.equal(result.recipe.id, "butter_cookie");
  assert.equal(result.dish.recipeId, "butter_cookie");

  const rejectedFarm = freshKitchenFarm();
  rejectedFarm.ranch.kitchen.ingredients = { flour: 1, butter: 1, sugar: 1 };
  const before = structuredClone(rejectedFarm);
  const rejected = kitchenCook(rejectedFarm, ["flour", "butter", "sugar"], NOW, { methodId: "stew" });
  assert.deepEqual(rejected, { ok: false, code: "recipe_method_mismatch", methodId: "stew" });
  assert.deepEqual(rejectedFarm, before);
});

test("a known recipe derives its method automatically, while a paid method requires its owned tool", () => {
  const knownFarm = freshKitchenFarm();
  knownFarm.ranch.kitchen.products = [{ id: "egg-1", itemId: "chicken_egg", value: 30 }];
  knownFarm.ranch.kitchen.ingredients = { salt: 1 };
  knownFarm.ranch.kitchen.knownRecipes = ["fried_egg"];
  const direct = kitchenCookKnownRecipe(knownFarm, "fried_egg", NOW);
  assert.equal(direct.ok, true);
  assert.equal(direct.recipe.method_id, "pan-fry");

  const toolFarm = freshKitchenFarm();
  const noTool = kitchenMethodToolStatus(toolFarm.ranch.kitchen, "steam");
  assert.deepEqual(noTool, { ok: false, code: "tool_required", methodId: "steam", toolId: "steamer" });
  toolFarm.ranch.kitchen.ownedTools = ["steam"];
  assert.deepEqual(kitchenMethodToolStatus(toolFarm.ranch.kitchen, "steam"), {
    ok: true,
    methodId: "steam",
    toolId: "steamer",
  });
});

test("active chef refund uses the level chance, returns at most one ordinary ingredient, and never refunds excluded inputs", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(CHEF_LEVEL_RULES).map(([level, rule]) => [
    level,
    [rule.materialRefundChance, rule.processingFeeDiscount],
  ])), {
    0: [0, 0],
    1: [0.05, 0],
    2: [0.10, 0.05],
    3: [0.15, 0.10],
    4: [0.20, 0.15],
  });
  assert.equal(chefLevelRule(99), CHEF_LEVEL_RULES[0]);
  assert.equal(chefMaterialRefundChance(4), 0.20);

  const farm = freshKitchenFarm();
  farm.rngState = seedForChance(0.20);
  farm.ranch.kitchen.ingredients = { salt: 2 };
  const cooked = kitchenCook(farm, ["salt", "salt"], NOW, {
    methodId: "pan-fry",
    chefQualificationLevel: 4,
  });
  assert.equal(cooked.ok, true);
  assert.deepEqual(cooked.materialRefund, { applied: true, chance: 0.20, itemId: "salt" });
  assert.equal(farm.ranch.kitchen.ingredients.salt, 1);

  const excludedFarm = freshKitchenFarm();
  excludedFarm.rngState = seedForChance(0.20);
  const excludedState = excludedFarm.rngState;
  assert.deepEqual(applyChefMaterialRefund(excludedFarm, [{
    source: "ingredient",
    id: "salt",
    activity: true,
  }], 4), { applied: false, chance: 0.20, itemId: null });
  assert.equal(excludedFarm.rngState, excludedState);
});

test("processing fee reduction is pure, level-gated, and floors the discounted system fee", () => {
  assert.equal(chefProcessingFeeDiscount(1), 0);
  assert.equal(chefProcessingFeeDiscount(2), 0.05);
  assert.equal(chefProcessingFeeDiscount(3), 0.10);
  assert.equal(chefProcessingFeeDiscount(4), 0.15);
  assert.equal(chefProcessingFeeAfterDiscount(101, 1), 101);
  assert.equal(chefProcessingFeeAfterDiscount(101, 2), 95);
  assert.equal(chefProcessingFeeAfterDiscount(101, 3), 90);
  assert.equal(chefProcessingFeeAfterDiscount(101, 4), 85);
  assert.equal(chefProcessingFeeAfterDiscount(-1, 4), null);
  assert.equal(chefProcessingFeeAfterDiscount(1.5, 4), null);
});

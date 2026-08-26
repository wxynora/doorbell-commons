import assert from "node:assert/strict";
import test from "node:test";

import { currentDayIndex } from "../dist/time.js";
import { projectHumanKitchen } from "../dist/server/kitchen-structured.js";

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const FARM_ID = "ABC234";

function kitchenFarm() {
  const day = currentDayIndex(NOW);
  return {
    id: FARM_ID,
    name: "渡的小农场",
    silver: 321,
    ranch: {
      coins: 654,
      kitchen: {
        products: [
          {
            id: "product-egg-1",
            itemId: "chicken_egg",
            value: 42,
            createdAt: NOW - 60_000,
          },
          {
            id: "product-unknown-1",
            itemId: "not-a-product",
            value: 9,
            createdAt: NOW - 30_000,
          },
        ],
        ingredients: { salt: 2, tea: 1, not_an_ingredient: 4 },
        dishes: [
          {
            id: "dish-honey-tea-1",
            recipeId: "honey_tea",
            rarity: "R",
            value: 180,
            createdAt: NOW - 20_000,
          },
          {
            id: "dish-unknown-1",
            recipeId: "not-a-recipe",
            rarity: "SSR",
            value: 900,
            createdAt: NOW - 10_000,
          },
        ],
        knownRecipes: ["honey_tea", "not-a-recipe"],
        shop: {
          day,
          ingredientIds: ["tea", "not-an-ingredient"],
          recipeIds: ["honey_tea", "not-a-recipe"],
          bought: { "ingredient:tea": 1 },
        },
      },
    },
    fishing: {
      catchInventory: [
        {
          id: "fish-carp-1",
          fishId: "mud_carp",
          size: 18,
          rawValue: 24,
          sellSilver: 3,
        },
        {
          id: "fish-unknown-1",
          fishId: "not-a-fish",
          size: 20,
          rawValue: 25,
          sellSilver: 3,
        },
      ],
      items: { coral_pearl: 2, ancient_key: 1, not_a_treasure: 3 },
    },
  };
}

test("structured kitchen projection is pure, strict in its source boundary, and maps unknown IDs to unavailable", () => {
  const farm = kitchenFarm();
  const world = { marker: "world-is-not-touched", nested: { count: 1 } };
  const farmBefore = structuredClone(farm);
  const worldBefore = structuredClone(world);

  const result = projectHumanKitchen(farm, NOW);

  assert.deepEqual(farm, farmBefore);
  assert.deepEqual(world, worldBefore);
  assert.equal(result.data.farm.farm_doorplate, FARM_ID);
  assert.match(result.kitchen_inventory_revision, /^kitchen-inventory-v1:[0-9a-f]{64}$/);
  assert.match(result.shop_revision, /^kitchen-v1:[0-9a-f]{64}$/);
  assert.deepEqual(result.data.balance.silver, { status: "available", value: 321, reason: null });
  assert.deepEqual(result.data.balance.ranch_coins, {
    status: "available",
    value: 654,
    reason: null,
  });
  assert.equal(result.data.tools.status, "available");
  assert.equal(result.data.tools.reason, null);
  assert.deepEqual(result.data.tools.items, [
    {
      status: "available",
      tool_id: "roast",
      name: "烤炉",
      price_silver: 800,
      owned: false,
      reason: null,
    },
    {
      status: "available",
      tool_id: "steam",
      name: "蒸笼",
      price_silver: 1200,
      owned: false,
      reason: null,
    },
    {
      status: "available",
      tool_id: "deep-fry",
      name: "炸锅",
      price_silver: 1600,
      owned: false,
      reason: null,
    },
  ]);

  const ingredients = result.data.stacked_ingredients.items;
  assert.equal(ingredients.find((item) => item.ingredient_id === "salt")?.name, "盐");
  assert.deepEqual(ingredients.find((item) => item.ingredient_id === "not_an_ingredient"), {
    status: "unavailable",
    ingredient_id: "not_an_ingredient",
    name: null,
    quantity: null,
    reason: "unknown_id",
  });

  const products = result.data.product_instances.items;
  assert.equal(products.find((item) => item.product_instance_id === "product-egg-1")?.name, "鸡蛋");
  assert.equal(
    products.find((item) => item.product_instance_id === "product-unknown-1")?.reason,
    "unknown_id",
  );

  const fish = result.data.fish_instances.items;
  assert.equal(fish.find((item) => item.catch_instance_id === "fish-carp-1")?.name, "泥鲤");
  assert.equal(fish.find((item) => item.catch_instance_id === "fish-unknown-1")?.reason, "unknown_id");

  const treasure = result.data.treasure_items.items;
  assert.equal(treasure.find((item) => item.item_id === "coral_pearl")?.name, "珊瑚珍珠");
  assert.equal(treasure.find((item) => item.item_id === "ancient_key")?.sellable, false);
  assert.equal(treasure.find((item) => item.item_id === "not_a_treasure")?.reason, "unknown_id");

  const dish = result.data.dish_instances.items.find(
    (item) => item.dish_instance_id === "dish-honey-tea-1",
  );
  assert.equal(dish?.name, "蜂蜜茶");
  assert.deepEqual(dish?.ingredients, [
    { status: "available", ingredient_id: "honey", name: "蜂蜜", quantity: 1, reason: null },
    { status: "available", ingredient_id: "tea", name: "茶叶", quantity: 1, reason: null },
  ]);
  const unknownDish = result.data.dish_instances.items.find(
    (item) => item.dish_instance_id === "dish-unknown-1",
  );
  assert.equal(unknownDish?.reason, "unknown_id");
  assert.equal(unknownDish?.method.id, null);
  assert.equal(unknownDish?.tool.id, null);

  const knownRecipe = result.data.known_recipes.items.find((item) => item.recipe_id === "honey_tea");
  assert.equal(knownRecipe?.name, "蜂蜜茶");
  assert.deepEqual(knownRecipe?.method, {
    status: "available",
    id: "drink",
    name: "饮品",
    reason: null,
  });
  assert.deepEqual(knownRecipe?.tool, {
    status: "available",
    id: null,
    name: null,
    reason: null,
  });
  assert.equal(
    result.data.known_recipes.items.find((item) => item.recipe_id === "not-a-recipe")?.reason,
    "unknown_id",
  );

  assert.equal(result.data.daily_shop.status, "available");
  assert.equal(result.data.daily_shop.is_current_day, true);
  assert.equal(
    result.data.daily_shop.ingredients.find((item) => item.ingredient_id === "tea")?.name,
    "茶叶",
  );
  assert.equal(
    result.data.daily_shop.ingredients.find((item) => item.ingredient_id === "not-an-ingredient")
      ?.reason,
    "unknown_id",
  );
  assert.equal(
    result.data.daily_shop.recipes.find((item) => item.recipe_id === "honey_tea")?.name,
    "蜂蜜茶",
  );
});

test("uninitialized and stale lazy kitchen state stays unavailable without a write", () => {
  const uninitialized = {
    id: FARM_ID,
    name: "未初始化农场",
    silver: 0,
  };
  const before = structuredClone(uninitialized);
  const emptyResult = projectHumanKitchen(uninitialized, NOW);
  assert.deepEqual(uninitialized, before);
  assert.equal(emptyResult.data.balance.silver.status, "available");
  assert.equal(emptyResult.data.balance.ranch_coins.status, "unavailable");
  assert.equal(emptyResult.data.tools.status, "available");
  assert.deepEqual(emptyResult.data.tools.items.map((tool) => tool.owned), [false, false, false]);
  assert.equal(emptyResult.data.stacked_ingredients.reason, "not_initialized");
  assert.equal(emptyResult.data.daily_shop.reason, "not_initialized");

  const stale = kitchenFarm();
  stale.ranch.kitchen.shop.day -= 1;
  const staleBefore = structuredClone(stale);
  const staleResult = projectHumanKitchen(stale, NOW);
  assert.deepEqual(stale, staleBefore);
  assert.equal(staleResult.data.daily_shop.status, "unavailable");
  assert.equal(staleResult.data.daily_shop.reason, "stale_shop");
  assert.deepEqual(staleResult.data.daily_shop.ingredients, []);
  assert.deepEqual(staleResult.data.daily_shop.recipes, []);
});

test("persisted kitchen tool ownership is projected without normalizing the save", () => {
  const farm = kitchenFarm();
  farm.ranch.kitchen.ownedTools = ["steam", "not-a-paid-tool"];
  const before = structuredClone(farm);

  const result = projectHumanKitchen(farm, NOW);

  assert.deepEqual(farm, before);
  assert.deepEqual(
    result.data.tools.items.map((tool) => [tool.tool_id, tool.owned]),
    [
      ["roast", false],
      ["steam", true],
      ["deep-fry", false],
    ],
  );
});

test("recipe method and paid-tool requirements come from the 90-recipe authority", () => {
  const farm = kitchenFarm();
  farm.ranch.kitchen.knownRecipes = ["tomato_egg", "corn_custard", "onion_roast_duck"];

  const result = projectHumanKitchen(farm, NOW);
  const recipe = (id) => result.data.known_recipes.items.find((item) => item.recipe_id === id);
  assert.deepEqual(recipe("tomato_egg")?.method, {
    status: "available",
    id: "stir-fry",
    name: "炒",
    reason: null,
  });
  assert.deepEqual(recipe("tomato_egg")?.tool, {
    status: "available",
    id: null,
    name: null,
    reason: null,
  });
  assert.deepEqual(recipe("corn_custard")?.method, {
    status: "available",
    id: "steam",
    name: "蒸",
    reason: null,
  });
  assert.deepEqual(recipe("corn_custard")?.tool, {
    status: "available",
    id: "steamer",
    name: "蒸笼",
    reason: null,
  });
  assert.deepEqual(recipe("onion_roast_duck")?.method, {
    status: "available",
    id: "roast",
    name: "烤",
    reason: null,
  });
  assert.deepEqual(recipe("onion_roast_duck")?.tool, {
    status: "available",
    id: "oven",
    name: "烤炉",
    reason: null,
  });
});

test("purchase revision is stable for the same state and changes with purchase-relevant state", () => {
  const farm = kitchenFarm();
  const first = projectHumanKitchen(farm, NOW);
  const later = projectHumanKitchen(farm, NOW + 1_000);
  assert.equal(later.shop_revision, first.shop_revision);
  assert.notEqual(later.server_time, first.server_time);

  farm.silver += 1;
  const changed = projectHumanKitchen(farm, NOW);
  assert.notEqual(changed.shop_revision, first.shop_revision);

  farm.ranch.kitchen.ownedTools = ["roast"];
  const changedByToolOwnership = projectHumanKitchen(farm, NOW);
  assert.notEqual(changedByToolOwnership.shop_revision, changed.shop_revision);
});

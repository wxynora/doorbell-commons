/// <reference types="node" />

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServer, type ViteDevServer } from "vite";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import type { BoundKitchenRead } from "../../auth/kitchen-client";
import type { BoundRanchRead } from "../../auth/ranch-client";

let viteServer: ViteDevServer;
let panel: typeof import("./shop-panel");

before(async () => {
  viteServer = await createServer({
    appType: "custom",
    logLevel: "silent",
    root: process.cwd(),
    server: { middlewareMode: true },
  });
  panel = (await viteServer.ssrLoadModule(
    "/apps/web/src/farm/panels/shop-panel.tsx",
  )) as typeof import("./shop-panel");
});

after(async () => {
  await viteServer.close();
});

function farmCatalog(shop: unknown): BoundFarmCatalogRead {
  return { data: { shop } } as unknown as BoundFarmCatalogRead;
}

function ranch(
  animals: unknown,
  pets: unknown = { status: "available", items: [] },
  skins: unknown = { status: "available", items: [] },
): BoundRanchRead {
  return {
    data: { shop: { animals, pets, skins } },
  } as unknown as BoundRanchRead;
}

function kitchen(
  dailyShop: unknown,
  tools: unknown = { status: "unavailable", items: [], reason: "not_persisted" },
): BoundKitchenRead {
  return { data: { daily_shop: dailyShop, tools } } as unknown as BoundKitchenRead;
}

test("live shop uses authoritative names and prices for cart definitions", () => {
  const catalog = farmCatalog({
    status: "available",
    items: [
      {
        kind: "seed",
        item_id: "common",
        identity_state: "known",
        name: "真实普通种子",
        price: 17,
        currency: "gold",
        available_quantity: null,
        condition: null,
        source: "permanent",
      },
      {
        kind: "seed",
        item_id: "demo-only",
        identity_state: "unavailable",
        name: null,
        price: null,
        currency: null,
        available_quantity: null,
        condition: null,
        source: "persisted",
      },
    ],
  });

  const items = panel.getLiveFarmShopItems(catalog);
  assert.deepEqual(
    items.map((item) => [item.id, item.name, item.price]),
    [["common", "真实普通种子", 17]],
  );
  assert.equal(
    items.some((item) => item.name === "普通种子"),
    false,
  );

  const cartItem = panel.getShopCartItemDefinition("field", "farm:common", {
    farmCatalog: catalog,
  });
  assert.deepEqual(
    cartItem && { name: cartItem.name, price: cartItem.price, currency: cartItem.currency },
    { name: "真实普通种子", price: 17, currency: "gold" },
  );
});

test("live ranch and kitchen shops omit unavailable or unknown identities", () => {
  const ranchItems = panel.getLiveRanchShopItems(
    ranch({
      status: "available",
      items: [
        {
          status: "known",
          kind_id: "chicken",
          name: "真实鸡",
          price: 222,
          owned: false,
          available_quantity: 1,
        },
        {
          status: "unavailable",
          kind_id: "mystery-animal",
          name: null,
          price: null,
          owned: null,
          available_quantity: null,
        },
      ],
    }),
  );
  assert.deepEqual(
    ranchItems.map((item) => [item.id, item.name, item.price]),
    [["chicken", "真实鸡", 222]],
  );
  assert.equal(
    panel.getShopCartItemDefinition("ranch", "ranch:mystery-animal", {
      ranch: ranch({ status: "available", items: [] }),
    }),
    null,
  );

  const kitchenData = kitchen({
    status: "available",
    is_current_day: true,
    refresh_at: "2026-08-25T00:00:00.000Z",
    ingredients: [
      {
        status: "available",
        ingredient_id: "flour",
        name: "真实面粉",
        price_silver: 19,
        daily_buy_limit: 10,
        bought_quantity: 2,
      },
      {
        status: "unavailable",
        ingredient_id: "mystery-ingredient",
        name: null,
        price_silver: null,
        daily_buy_limit: null,
        bought_quantity: null,
      },
    ],
    recipes: [
      {
        status: "available",
        recipe_id: "fried_egg",
        name: "真实煎蛋",
        rarity: "N",
        price_silver: 77,
        ingredients: [],
      },
    ],
  });
  assert.deepEqual(
    panel.getLiveCookingIngredients(kitchenData).map((item) => item.id),
    ["flour"],
  );
  assert.deepEqual(
    panel.getLiveCookingRecipes(kitchenData).map((item) => [item.id, item.price]),
    [["fried_egg", 77]],
  );
  assert.equal(
    panel.getShopCartItemDefinition("cooking", "ingredient:mystery-ingredient", {
      kitchen: kitchenData,
    }),
    null,
  );
});

test("live ranch shop exposes limited skins as ordinary item purchases", () => {
  const ranchData = ranch(
    { status: "available", items: [] },
    { status: "available", items: [] },
    {
      status: "available",
      items: [
        {
          status: "known",
          skin_id: "pompompurin",
          name: "布丁狗",
          target_type: "pet",
          target_kind_id: "dog",
          price: 100_000,
          owned: false,
          available_quantity: 1,
        },
      ],
    },
  );
  const item = panel.getLiveRanchShopItems(ranchData)[0];
  assert.equal(item?.skin?.id, "pompompurin");
  assert.equal(item?.section, "pets");
  assert.deepEqual(
    panel.getShopCartItemDefinition("ranch", "ranch:pompompurin", { ranch: ranchData }),
    {
      cartKey: "ranch:pompompurin",
      name: "布丁狗",
      price: 100_000,
      currency: "gold",
      maxQuantity: 1,
      visual: {
        kind: "ranch",
        animalId: "pompompurin",
        catalogKind: "item",
        skinId: "pompompurin",
      },
    },
  );
});

test("live cooking tools expose prices and only unowned tools enter the cart", () => {
  const kitchenData = kitchen(
    {
      status: "available",
      is_current_day: true,
      refresh_at: "2026-08-25T00:00:00.000Z",
      ingredients: [],
      recipes: [],
    },
    {
      status: "available",
      items: [
        {
          status: "available",
          tool_id: "steam",
          name: "蒸笼",
          price_silver: 1_200,
          owned: false,
          reason: null,
        },
        {
          status: "available",
          tool_id: "roast",
          name: "烤炉",
          price_silver: 800,
          owned: true,
          reason: null,
        },
        {
          status: "available",
          tool_id: "deep-fry",
          name: "炸锅",
          price_silver: 1_600,
          owned: null,
          reason: null,
        },
      ],
      reason: null,
    },
  );

  const unowned = panel.getShopCartItemDefinition("cooking", "tool:steam", {
    kitchen: kitchenData,
  });
  assert.deepEqual(
    unowned && {
      name: unowned.name,
      price: unowned.price,
      maxQuantity: unowned.maxQuantity,
      visual: unowned.visual,
    },
    {
      name: "蒸笼",
      price: 1_200,
      maxQuantity: 1,
      visual: { kind: "cooking", entityId: "steam", catalogKind: "tool" },
    },
  );
  assert.equal(
    panel.getShopCartItemDefinition("cooking", "tool:roast", { kitchen: kitchenData }),
    null,
  );
  assert.equal(
    panel.getShopCartItemDefinition("cooking", "tool:deep-fry", { kitchen: kitchenData }),
    null,
  );
});

test("live ranch shop never treats unknown ownership or availability as purchasable", () => {
  const ranchData = ranch({
    status: "available",
    items: [
      {
        status: "known",
        kind_id: "duck",
        name: "鸭子",
        price: 300,
        owned: null,
        available_quantity: 1,
      },
      {
        status: "known",
        kind_id: "rabbit",
        name: "兔子",
        price: 700,
        owned: false,
        available_quantity: null,
      },
    ],
  });

  assert.deepEqual(
    panel
      .getLiveRanchShopItems(ranchData)
      .map((item) => [item.id, item.owned, item.availableQuantity]),
    [
      ["duck", null, 1],
      ["rabbit", false, null],
    ],
  );
  assert.equal(panel.getShopCartItemDefinition("ranch", "ranch:duck", { ranch: ranchData }), null);
  assert.equal(
    panel.getShopCartItemDefinition("ranch", "ranch:rabbit", { ranch: ranchData }),
    null,
  );
});

test("live cooking shop rejects a stale daily shelf", () => {
  const staleKitchen = kitchen({
    status: "available",
    is_current_day: false,
    refresh_at: "2026-08-25T00:00:00.000Z",
    ingredients: [
      {
        status: "available",
        ingredient_id: "flour",
        name: "过期面粉",
        price_silver: 1,
        daily_buy_limit: null,
        bought_quantity: null,
      },
    ],
    recipes: [
      {
        status: "available",
        recipe_id: "fried_egg",
        name: "过期煎蛋",
        rarity: "N",
        price_silver: 1,
        ingredients: [],
      },
    ],
  });

  assert.deepEqual(panel.getLiveCookingIngredients(staleKitchen), []);
  assert.deepEqual(panel.getLiveCookingRecipes(staleKitchen), []);
  assert.equal(
    panel.getShopCartItemDefinition("cooking", "ingredient:flour", {
      kitchen: staleKitchen,
    }),
    null,
  );
});

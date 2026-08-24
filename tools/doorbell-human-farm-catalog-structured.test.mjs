import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectHumanFarmCatalog } from "../dist/server/farm-catalog-structured.js";
import { allUgc } from "../dist/ugc.js";

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const FARM_DOORPLATE = "3ET3FE";

function fixtureFarm() {
  return {
    id: FARM_DOORPLATE,
    name: "渡的小农场",
    aiName: "笨笨",
    humanName: "渡",
    humanKey: "do-not-return-this-key",
    token: "do-not-return-this-token",
    coins: 1234,
    silver: 88,
    shop: {
      refreshAt: NOW - 60 * 60 * 1_000,
      recipe: "mystery-recipe",
      potionSet: { qty: 6, price: 120, buyers: [] },
      npcSeed: { id: "mystery-seed", price: 240 },
    },
    potionBuy: { day: 20_629, n: 2 },
    seeds: { wheat: 3, mystery_seed: 2 },
    materials: { ordinary_stone: 4, mystery_material: 7 },
    items: { speed_potion: 2, mystery_item: 5 },
    codex: {
      wheat: { count: 2, bestQuality: 3, firstAt: "2026-08-23T04:00:00.000Z" },
      mystery_crop: { count: 1, bestQuality: 1, firstAt: "not-a-date" },
    },
    starred: ["wheat", "mystery_crop"],
    titles: ["mystery-title"],
    titleEquipped: "mystery-title",
    social: { visit: true, steal: false, water: true, message: false },
    welcome: "欢迎来我的小农场。",
    expedition: {
      mapId: "mystery-map",
      status: "active",
      step: 2,
      hp: 4,
      pending: {
        type: "choice",
        eventId: "mystery-event",
      },
      bag: [{ t: "decor", id: "mystery-decor" }],
      log: [{ eventId: "mystery-event", text: "未知遭遇", at: NOW }],
    },
    expDaily: { day: 20_629, n: 1 },
    expCodex: ["mystery-event"],
    expJourneys: [{ mapId: "mystery-map", at: NOW, summary: "走过一段路", log: [] }],
    knownRecipes: ["mystery-recipe"],
    messages: [
      { id: "message-1", by: FARM_DOORPLATE, name: "渡", text: "来看看吧", at: NOW },
    ],
    ranch: { notices: [{ at: NOW, text: "有一条旧播报", section: "ranch" }] },
    market: [
      { kind: "seed", id: "wheat", qty: 2, price: 5 },
      { kind: "material", id: "mystery_material", qty: 1, price: 8 },
    ],
  };
}

function ownKeys(value) {
  return Object.keys(value).sort();
}

test("the legacy shop page is write-coupled, while structured catalog is a read", async () => {
  const legacyGame = await readFile(new URL("../dist/game.js", import.meta.url), "utf8");
  assert.match(legacyGame, /export function viewShop\(f, now\)\s*\{[\s\S]*?refreshShop\(f, now\)/);

  const farm = fixtureFarm();
  const before = structuredClone(farm);
  const worldBefore = structuredClone(allUgc());
  const result = projectHumanFarmCatalog(farm, NOW);
  assert.deepEqual(farm, before);
  assert.deepEqual(allUgc(), worldBefore);
  assert.equal(result.data.shop.status, "available");
  assert.equal(result.data.shop.refreshed_at, "2026-08-24T03:00:00.000Z");
});

test("structured catalog reads every scoped section without mutating farm state", () => {
  const farm = fixtureFarm();
  const before = structuredClone(farm);
  const worldBefore = structuredClone(allUgc());
  const result = projectHumanFarmCatalog(farm, NOW);
  const after = structuredClone(farm);

  assert.deepEqual(after, before);
  assert.deepEqual(allUgc(), worldBefore);
  assert.deepEqual(ownKeys(result), ["data", "server_time"]);
  assert.deepEqual(ownKeys(result.data), [
    "backpack",
    "bulletin",
    "codex",
    "expedition",
    "farm",
    "market",
    "neighborhood",
    "settings",
    "shop",
    "smelting",
  ]);
  assert.equal(result.data.farm.farm_doorplate, FARM_DOORPLATE);
  assert.equal(result.data.settings.farm_name, "渡的小农场");
  assert.equal(result.data.bulletin.messages[0].text, "来看看吧");
  assert.equal(result.data.bulletin.ranch_notices[0].text, "有一条旧播报");
  assert.equal(result.data.expedition.active, true);
  assert.equal(result.data.expedition.map_id, "mystery-map");
  assert.equal(result.data.smelting.write_status, "unavailable");
  assert.equal(result.data.bulletin.tasks.status, "unavailable");
  assert.equal(result.data.bulletin.mature_broadcast.status, "unavailable");

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("do-not-return-this-key"), false);
  assert.equal(serialized.includes("do-not-return-this-token"), false);
});

test("unknown persisted ids remain explicit unavailable identities", () => {
  const result = projectHumanFarmCatalog(fixtureFarm(), NOW);
  const backpackUnknown = result.data.backpack.items.find((item) => item.item_id === "mystery_seed");
  const codexUnknown = result.data.codex.entries.find((entry) => entry.crop_id === "mystery_crop");
  const recipeUnknown = result.data.smelting.recipes.find((recipe) => recipe.recipe_id === "mystery-recipe");
  const marketUnknown = result.data.market.listings.find((listing) => listing.item_id === "mystery_material");
  const shopUnknown = result.data.shop.items.find((item) => item.item_id === "mystery-seed");

  for (const item of [backpackUnknown, codexUnknown, recipeUnknown, marketUnknown, shopUnknown]) {
    assert.ok(item);
    assert.equal(item.identity_state, "unavailable");
    assert.equal("name" in item ? item.name : item.output_name, null);
  }
});

test("an uninitialized shop is unavailable and is not initialized by reading", () => {
  const farm = fixtureFarm();
  for (const shop of [undefined, { refreshAt: 0, recipe: null }, { refreshAt: -1, recipe: null }]) {
    if (shop === undefined) delete farm.shop;
    else farm.shop = shop;
    const before = structuredClone(farm);
    const result = projectHumanFarmCatalog(farm, NOW);

    assert.deepEqual(farm, before);
    assert.deepEqual(result.data.shop, {
      status: "unavailable",
      reason: "not_initialized",
      message: "商店还没有初始化的持久化货架。",
    });
  }
});

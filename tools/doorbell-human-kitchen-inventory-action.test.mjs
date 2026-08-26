import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-kitchen-inventory-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-25T04:00:00.000Z");
const FARM_HUMAN_KEY = "private-kitchen-inventory-human-key";

const { ensureKitchen, ensureRanch } = await import("../dist/engine.js");
const { makeFarm } = await import("../dist/game.js");
const { ensureFishing } = await import("../dist/fishing.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { projectHumanKitchen } = await import("../dist/server/kitchen-structured.js");
const {
  handleHumanKitchenInventoryAction,
  kitchenInventoryRevision,
} = await import("../dist/server/kitchen-inventory-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("料理库存操作测试农场", 123456, {
    humanKey: FARM_HUMAN_KEY,
    humanName: "测试伴侣",
  });
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.silver = 1_000;
  const ranch = ensureRanch(farm);
  ranch.coins = 50;
  ranch.pets = [{ kindId: "cat", dishBuff: null }];
  const kitchen = ensureKitchen(farm);
  kitchen.products = [
    { id: "egg-a", itemId: "chicken_egg", name: "鸡蛋", emoji: "🥚", value: 30 },
  ];
  kitchen.ingredients = { salt: 2 };
  kitchen.dishes = [
    { id: "dish-a", recipeId: "fried_egg", name: "香煎蛋", rarity: "N", value: 100, createdAt: NOW },
    { id: "dish-b", recipeId: "fried_egg", name: "香煎蛋", rarity: "N", value: 110, createdAt: NOW },
  ];
  const fishing = ensureFishing(farm);
  fishing.catchInventory = [
    { id: "fish-a", fishId: "mud_carp", size: 20, rawValue: 70, sellSilver: 7 },
    { id: "fish-b", fishId: "mud_carp", size: 24, rawValue: 90, sellSilver: 9 },
  ];
  fishing.items = { ambergris: 2, ancient_key: 1 };
  insertFarm(farm);
  return getFarm(id);
}

function body(farm, action, key, extra = {}, now = NOW) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_kitchen_inventory_revision: kitchenInventoryRevision(farm, now),
    action,
    ...extra,
  };
}

function key(n) {
  return `019ffb01-49cd-7020-84af-3d04fb1ed0${String(n).padStart(2, "2")}`;
}

test("use, recycle, stall, fish and treasure actions commit authoritative results", () => {
  const farm = addFarm();

  const use = handleHumanKitchenInventoryAction(
    farm,
    body(farm, "use", key(1), { dish_instance_id: "dish-a", target: "cat" }),
    NOW,
  );
  assert.equal(use.status, 200);
  assert.equal(use.json.data.result.action, "use");
  assert.equal(use.json.data.result.outcome.target, "cat");
  assert.ok(use.json.data.resource.dish_instances.items.every((item) => item.dish_instance_id !== "dish-a"));
  assert.ok(getFarm(farm.id).ranch.pets[0].dishBuff);

  const recycle = handleHumanKitchenInventoryAction(
    getFarm(farm.id),
    body(getFarm(farm.id), "recycle", key(2), {
      item_kind: "product",
      item_instance_ids: ["egg-a"],
      quantity: 1,
    }),
    NOW,
  );
  assert.equal(recycle.status, 200);
  assert.equal(recycle.json.data.result.outcome.value, 30);
  assert.equal(getFarm(farm.id).ranch.coins, 80);

  const stall = handleHumanKitchenInventoryAction(
    getFarm(farm.id),
    body(getFarm(farm.id), "stall", key(3), {
      item_instance_ids: ["dish-b"],
      quantity: 1,
      price: 77,
    }),
    NOW,
  );
  assert.equal(stall.status, 200);
  assert.equal(stall.json.data.result.outcome.price, 77);
  assert.equal(getFarm(farm.id).market.find((item) => item.id === "dish-b")?.price, 77);

  const fish = handleHumanKitchenInventoryAction(
    getFarm(farm.id),
    body(getFarm(farm.id), "sell_fish", key(4), {
      catch_instance_ids: ["fish-a", "fish-b"],
      quantity: 2,
    }),
    NOW,
  );
  assert.equal(fish.status, 200);
  assert.equal(fish.json.data.result.outcome.silver, 16);
  assert.equal(getFarm(farm.id).silver, 1_016);
  assert.equal(getFarm(farm.id).fishing.catchInventory.length, 0);

  const treasure = handleHumanKitchenInventoryAction(
    getFarm(farm.id),
    body(getFarm(farm.id), "sell_treasure", key(5), {
      treasure_item_id: "ambergris",
      quantity: 2,
    }),
    NOW,
  );
  assert.equal(treasure.status, 200);
  assert.equal(treasure.json.data.result.outcome.silver, 100);
  assert.equal(getFarm(farm.id).silver, 1_116);
  assert.equal(getFarm(farm.id).fishing.items.ambergris, 0);
  assert.match(treasure.json.kitchen_inventory_revision, /^kitchen-inventory-v1:[0-9a-f]{64}$/);
});

test("stale, rejected and malformed actions do not mutate inventory or create receipts", () => {
  const farm = addFarm("BCDFGH");
  const stale = body(farm, "recycle", key(6), {
    item_kind: "product",
    item_instance_ids: ["egg-a"],
    quantity: 1,
  });
  farm.silver += 1;
  const before = structuredClone(getFarm(farm.id));
  const staleResult = handleHumanKitchenInventoryAction(farm, stale, NOW);
  assert.equal(staleResult.status, 409);
  assert.equal(staleResult.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(farm.id), before);
  assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanKitchenInventoryActionReceipts ?? {}, key(6)), false);

  const rejectedFarm = addFarm("DEF567");
  const rejectedBefore = structuredClone(rejectedFarm);
  const rejected = handleHumanKitchenInventoryAction(
    rejectedFarm,
    body(rejectedFarm, "recycle", key(7), {
      item_kind: "product",
      item_instance_ids: ["missing-product"],
      quantity: 1,
    }),
    NOW,
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(rejectedFarm.id), rejectedBefore);
  assert.equal(Object.hasOwn(getFarm(rejectedFarm.id).doorbellHumanKitchenInventoryActionReceipts ?? {}, key(7)), false);

  const malformed = handleHumanKitchenInventoryAction(
    rejectedFarm,
    { ...body(rejectedFarm, "use", key(8), { dish_instance_id: "dish-a", target: "cat" }), extra: true },
    NOW,
  );
  assert.equal(malformed.status, 400);
  assert.equal(malformed.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(rejectedFarm.id), rejectedBefore);
});

test("same idempotency payload replays and a different payload conflicts", () => {
  const farm = addFarm("GHJ789");
  const request = body(farm, "use", key(9), { dish_instance_id: "dish-a", target: "cat" });
  const first = handleHumanKitchenInventoryAction(farm, request, NOW);
  assert.equal(first.status, 200);
  const afterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanKitchenInventoryAction(getFarm(farm.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), afterFirst);

  const conflict = handleHumanKitchenInventoryAction(
    getFarm(farm.id),
    { ...request, target: "self" },
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), afterFirst);
});

test("a failed save leaves the original farm and receipt ledger untouched", () => {
  const farm = addFarm("KMPQRS");
  const circular = {};
  circular.self = circular;
  farm.doorbellHumanKitchenInventoryActionReceipts = { old: circular };
  const before = structuredClone(farm);
  const result = handleHumanKitchenInventoryAction(
    farm,
    body(farm, "recycle", key(10), {
      item_kind: "product",
      item_instance_ids: ["egg-a"],
      quantity: 1,
    }),
    NOW,
  );
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(farm.id), before);
  assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanKitchenInventoryActionReceipts, key(10)), false);
  delete farm.doorbellHumanKitchenInventoryActionReceipts;
});

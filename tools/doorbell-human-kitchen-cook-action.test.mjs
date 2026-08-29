import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-kitchen-cook-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-25T04:00:00.000Z");
const FARM_HUMAN_KEY = "private-kitchen-cook-human-key";

const { currentDayIndex } = await import("../dist/time.js");
const { ensureKitchen, ensureRanch } = await import("../dist/engine.js");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const {
  handleHumanKitchenCookAction,
  kitchenCookRevision,
} = await import("../dist/server/kitchen-cook-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("料理测试农场", 123456, {
    humanKey: FARM_HUMAN_KEY,
    humanName: "测试伴侣",
  });
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.silver = 500;
  const ranch = ensureRanch(farm);
  ranch.coins = 0;
  const kitchen = ensureKitchen(farm);
  kitchen.products = [
    { id: "egg-a", itemId: "chicken_egg", value: 30, createdAt: NOW },
  ];
  kitchen.ingredients = { salt: 1 };
  kitchen.dishes = [];
  kitchen.knownRecipes = [];
  kitchen.shop = {
    day: currentDayIndex(NOW),
    ingredientIds: [],
    recipeIds: [],
    bought: {},
  };
  insertFarm(farm);
  return getFarm(id);
}

function body(
  farm,
  key,
  items = ["egg-a", "salt"],
  revision = kitchenCookRevision(farm, NOW),
  methodId = "pan-fry",
) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_kitchen_inventory_revision: revision,
    method_id: methodId,
    items,
  };
}

test("Human cook reuses kitchenCook for deduction, discovery, dish value, and projection", () => {
  const farm = addFarm();
  const key = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanKitchenCookAction(farm, body(farm, key), NOW);

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, key);
  const outcome = result.json.data.result.outcome;
  assert.equal(outcome.kind, "cook");
  assert.deepEqual(outcome.item_refs, ["egg-a", "salt"]);
  assert.match(outcome.dish_instance_id, /^[0-9a-f-]{36}$/i);
  assert.equal(outcome.recipe_id, "fried_egg");
  assert.equal(outcome.name, "香煎蛋");
  assert.equal(outcome.rarity, "N");
  assert.ok(Number.isSafeInteger(outcome.recycle_silver));
  assert.equal(outcome.odd, false);
  assert.equal(outcome.discovered, true);
  assert.equal(outcome.qixi, null);
  const saved = getFarm(farm.id);
  assert.equal(saved.ranch.kitchen.products.length, 0);
  assert.equal(saved.ranch.kitchen.ingredients.salt, undefined);
  assert.deepEqual(saved.ranch.kitchen.knownRecipes, ["fried_egg"]);
  assert.equal(saved.ranch.kitchen.dishes[0].recipeId, "fried_egg");
  assert.equal(saved.ranch.kitchen.dishes[0].value, outcome.value_gold);
  assert.match(result.json.kitchen_inventory_revision, /^kitchen-inventory-v1:[0-9a-f]{64}$/);
});

test("Human known-recipe cook selects inventory and the bound method inside the existing authority", () => {
  const farm = addFarm("ACD456");
  farm.ranch.kitchen.knownRecipes = ["fried_egg"];
  const key = "159ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanKitchenCookAction(
    farm,
    {
      farm_human_key: farm.humanKey,
      expected_farm_doorplate: farm.id,
      idempotency_key: key,
      expected_kitchen_inventory_revision: kitchenCookRevision(farm, NOW),
      recipe_id: "fried_egg",
    },
    NOW,
  );
  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.outcome.recipe_id, "fried_egg");
  assert.deepEqual(result.json.data.result.outcome.item_refs, ["egg-a", "salt"]);
  assert.equal(getFarm(farm.id).ranch.kitchen.products.length, 0);
  assert.equal(getFarm(farm.id).ranch.kitchen.ingredients.salt, undefined);
});

test("Human cook requires recipe_id or items, never both", () => {
  const farm = addFarm("ADE567");
  farm.ranch.kitchen.knownRecipes = ["fried_egg"];
  const request = {
    ...body(farm, "169ffb01-49cd-7020-84af-3d04fb1ed03d"),
    recipe_id: "fried_egg",
  };
  const before = structuredClone(farm);
  const result = handleHumanKitchenCookAction(farm, request, NOW);
  assert.equal(result.status, 400);
  assert.equal(result.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(farm.id), before);
});

test("Human known-recipe cook rejects a locked recipe without mutation", () => {
  const farm = addFarm("AEF678");
  const before = structuredClone(farm);
  const result = handleHumanKitchenCookAction(
    farm,
    {
      farm_human_key: farm.humanKey,
      expected_farm_doorplate: farm.id,
      idempotency_key: "179ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_kitchen_inventory_revision: kitchenCookRevision(farm, NOW),
      recipe_id: "fried_egg",
    },
    NOW,
  );
  assert.equal(result.status, 409);
  assert.equal(result.json.error.code, "cook_rejected");
  assert.match(result.json.error.message, /还没有解锁/);
  assert.deepEqual(getFarm(farm.id), before);
});

test("engine rejection is atomic and does not create a receipt", () => {
  const farm = addFarm("BCDFGH");
  const before = structuredClone(farm);
  const key = "029ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanKitchenCookAction(farm, body(farm, key, ["missing-product", "salt"]), NOW);

  assert.equal(result.status, 409);
  assert.equal(result.json.error.code, "cook_rejected");
  assert.deepEqual(getFarm(farm.id), before);
  assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanKitchenCookReceipts ?? {}, key), false);
});

test("the same cook key replays the saved receipt and a different payload conflicts", () => {
  const farm = addFarm("DEF567");
  const key = "039ffb01-49cd-7020-84af-3d04fb1ed03d";
  const request = body(farm, key);
  const first = handleHumanKitchenCookAction(farm, request, NOW);
  assert.equal(first.status, 200);
  const afterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanKitchenCookAction(getFarm(farm.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), afterFirst);

  const conflict = handleHumanKitchenCookAction(
    getFarm(farm.id),
    body(getFarm(farm.id), key, ["egg-a", "salt", "salt"], first.json.kitchen_inventory_revision),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), afterFirst);
});

test("a failed save leaves the live farm and receipt ledger untouched", () => {
  const farm = addFarm("GHJ789");
  const circular = {};
  circular.self = circular;
  farm.doorbellHumanKitchenCookReceipts = { old: circular };
  const before = structuredClone(farm);
  const key = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanKitchenCookAction(farm, body(farm, key), NOW);

  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(farm.id), before);
  assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanKitchenCookReceipts, key), false);
  delete farm.doorbellHumanKitchenCookReceipts;
});

test("cook action matches method_id and requires the recipe's paid tool without mutation", () => {
  const farm = addFarm("JKM678");
  farm.ranch.kitchen.products = [
    { id: "duck-a", itemId: "duck_meat", value: 30, createdAt: NOW },
  ];
  farm.ranch.kitchen.ingredients = { onion: 1, salt: 1 };
  const key = "129ffb01-49cd-7020-84af-3d04fb1ed03d";
  const request = body(farm, key, ["duck-a", "onion", "salt"], undefined, "roast");
  const before = structuredClone(farm);

  const rejected = handleHumanKitchenCookAction(farm, request, NOW);
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "cook_rejected");
  assert.match(rejected.json.error.message, /烤炉/);
  assert.deepEqual(getFarm(farm.id), before);

  farm.ranch.kitchen.ownedTools = ["oven"];
  const allowed = handleHumanKitchenCookAction(
    farm,
    body(
      farm,
      "139ffb01-49cd-7020-84af-3d04fb1ed03d",
      ["duck-a", "onion", "salt"],
      kitchenCookRevision(farm, NOW),
      "roast",
    ),
    NOW,
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.data.result.outcome.recipe_id, "onion_roast_duck");
});

test("a different method cannot reuse a matching ingredient recipe, and deep-fry stays empty", () => {
  const farm = addFarm("NPQ789");
  farm.ranch.kitchen.ownedTools = ["fryer"];
  const before = structuredClone(farm);
  const result = handleHumanKitchenCookAction(
    farm,
    body(
      farm,
      "149ffb01-49cd-7020-84af-3d04fb1ed03d",
      ["egg-a", "salt"],
      kitchenCookRevision(farm, NOW),
      "deep-fry",
    ),
    NOW,
  );

  assert.equal(result.status, 409);
  assert.equal(result.json.error.code, "cook_rejected");
  assert.deepEqual(getFarm(farm.id), before);
});

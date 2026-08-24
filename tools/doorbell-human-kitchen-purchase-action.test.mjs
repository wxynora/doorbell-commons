import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-kitchen-purchase-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-kitchen-purchase-human-key";

const { currentDayIndex } = await import("../dist/time.js");
const { cooking, cookingIngredientById } = await import("../dist/content.js");
const { ensureKitchen, ensureRanch } = await import("../dist/engine.js");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { handleHumanKitchenPurchase, kitchenPurchaseRevision } = await import(
  "../dist/server/kitchen-purchase-action.js",
);

const SALT = cookingIngredientById.get("salt");
assert.ok(SALT, "the fixture needs the authoritative salt definition");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = FARM_DOORPLATE, silver = 500) {
  const farm = makeFarm("料理购买测试农场", 123456);
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.silver = silver;
  const ranch = ensureRanch(farm);
  const kitchen = ensureKitchen(farm);
  ranch.coins = 0;
  kitchen.products = [];
  kitchen.ingredients = {};
  kitchen.dishes = [];
  kitchen.knownRecipes = [];
  kitchen.shop = {
    day: currentDayIndex(NOW),
    ingredientIds: ["tea"],
    recipeIds: [],
    bought: {},
  };
  insertFarm(farm);
  return getFarm(id);
}

function purchaseBody(farm, revision, key, overrides = {}) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_shop_revision: revision,
    kind: "ingredient",
    item_id: "salt",
    quantity: 2,
    ...overrides,
  };
}

test("Human kitchen purchase delegates one item to kitchenBuy and saves once atomically", () => {
  const farm = addFarm();
  const revision = kitchenPurchaseRevision(farm, NOW);
  const cost = SALT.price * 2;
  const beforeSilver = farm.silver;

  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, revision, "019ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, "019ffb01-49cd-7020-84af-3d04fb1ed03d");
  assert.equal(result.json.data.result.kind, "ingredient");
  assert.equal(result.json.data.result.item_id, "salt");
  assert.equal(result.json.data.result.quantity, 2);
  assert.equal(result.json.data.result.total_price_silver, cost);
  assert.equal(result.json.data.result.silver_balance, beforeSilver - cost);
  assert.equal(result.json.data.resource.balance.silver.value, beforeSilver - cost);
  assert.equal(result.json.shop_revision, kitchenPurchaseRevision(getFarm(farm.id), NOW));
  assert.equal(getFarm(farm.id).ranch.kitchen.ingredients.salt, 2);
  assert.equal(getFarm(farm.id).ranch.kitchen.shop.bought["ingredient:salt"], 2);
  assert.equal(getFarm(farm.id).silver, beforeSilver - cost);
  assert.equal(
    getFarm(farm.id).doorbellHumanKitchenPurchaseReceipts["019ffb01-49cd-7020-84af-3d04fb1ed03d"].response
      .data.result.receipt_id,
    "019ffb01-49cd-7020-84af-3d04fb1ed03d",
  );
});

test("a recipe purchase uses the authoritative rarity price and persists the learned recipe", () => {
  const farm = addFarm("BCDFGH", 500);
  farm.ranch.kitchen.shop.recipeIds = ["fried_egg"];
  const revision = kitchenPurchaseRevision(farm, NOW);
  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, revision, "029ffb01-49cd-7020-84af-3d04fb1ed03d", {
      kind: "recipe",
      item_id: "fried_egg",
      quantity: 1,
    }),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.kind, "recipe");
  assert.equal(result.json.data.result.item_id, "fried_egg");
  assert.equal(result.json.data.result.quantity, 1);
  assert.equal(result.json.data.result.total_price_silver, cooking.recipePrices.N);
  assert.equal(result.json.data.result.silver_balance, 500 - cooking.recipePrices.N);
  assert.deepEqual(getFarm(farm.id).ranch.kitchen.knownRecipes, ["fried_egg"]);
});

test("the same kitchen purchase key replays, while a different payload conflicts without mutation", () => {
  const farm = addFarm("DEF567");
  const revision = kitchenPurchaseRevision(farm, NOW);
  const body = purchaseBody(farm, revision, "119ffb01-49cd-7020-84af-3d04fb1ed03d");
  const first = handleHumanKitchenPurchase(farm, body, NOW);
  assert.equal(first.status, 200);
  const savedAfterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanKitchenPurchase(getFarm(farm.id), body, NOW);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);

  const conflict = handleHumanKitchenPurchase(
    getFarm(farm.id),
    purchaseBody(getFarm(farm.id), first.json.shop_revision, body.idempotency_key, {
      item_id: "tea",
      quantity: 1,
    }),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
});

test("a stale kitchen state revision is rejected before the authority can mutate it", () => {
  const farm = addFarm("GHJ789");
  const revision = kitchenPurchaseRevision(farm, NOW);
  const before = structuredClone(farm);
  farm.silver += 1;

  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, revision, "219ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );

  assert.equal(result.status, 409);
  assert.equal(result.json.error.code, "state_conflict");
  assert.equal(typeof result.json.error.current_shop_revision, "string");
  assert.notEqual(result.json.error.current_shop_revision, revision);
  assert.equal(farm.ranch.kitchen.ingredients.salt, before.ranch?.kitchen?.ingredients?.salt);
  assert.equal(farm.ranch.kitchen.shop.bought["ingredient:salt"], undefined);
});

test("authority rejection for insufficient silver or daily limit is all-or-nothing", () => {
  const poorFarm = addFarm("KMPQRS", SALT.price * 2 - 1);
  const poorBefore = structuredClone(poorFarm);
  const poor = handleHumanKitchenPurchase(
    poorFarm,
    purchaseBody(poorFarm, kitchenPurchaseRevision(poorFarm, NOW), "319ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(poor.status, 409);
  assert.equal(poor.json.error.code, "purchase_rejected");
  assert.match(poor.json.error.message, /银币不足/);
  assert.deepEqual(getFarm(poorFarm.id), poorBefore);

  const cappedFarm = addFarm("TUV234", 500);
  cappedFarm.ranch.kitchen.shop.bought["ingredient:salt"] = SALT.dailyBuyLimit - 1;
  const cappedBefore = structuredClone(cappedFarm);
  const capped = handleHumanKitchenPurchase(
    cappedFarm,
    purchaseBody(cappedFarm, kitchenPurchaseRevision(cappedFarm, NOW), "419ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(capped.status, 409);
  assert.equal(capped.json.error.code, "purchase_rejected");
  assert.match(capped.json.error.message, /每天最多/);
  assert.deepEqual(getFarm(cappedFarm.id), cappedBefore);
});

test("an unavailable or stale shelf does not get lazily initialized by a Human purchase", () => {
  const farm = addFarm("WXYZ23");
  farm.ranch.kitchen.shop.day -= 1;
  const before = structuredClone(farm);
  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, kitchenPurchaseRevision(farm, NOW), "519ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );

  assert.equal(result.status, 409);
  assert.equal(result.json.error.code, "shop_unavailable");
  assert.deepEqual(getFarm(farm.id), before);
});

test("a failed atomic save leaves the old farm and receipt ledger untouched", () => {
  const farm = addFarm("Y23456");
  const circular = {};
  circular.self = circular;
  farm.doorbellHumanKitchenPurchaseReceipts = { old: circular };
  const beforeSilver = farm.silver;
  const beforeIngredients = structuredClone(farm.ranch.kitchen.ingredients);
  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, kitchenPurchaseRevision(farm, NOW), "619ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );

  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "farm_unavailable");
  assert.equal(getFarm(farm.id), farm);
  assert.equal(getFarm(farm.id).silver, beforeSilver);
  assert.deepEqual(getFarm(farm.id).ranch.kitchen.ingredients, beforeIngredients);
  assert.equal(
    Object.hasOwn(
      getFarm(farm.id).doorbellHumanKitchenPurchaseReceipts,
      "619ffb01-49cd-7020-84af-3d04fb1ed03d",
    ),
    false,
  );
  delete farm.doorbellHumanKitchenPurchaseReceipts;
});

test("batch or tool purchase fields are not accepted by the single-item adapter", () => {
  const farm = addFarm("Z23456");
  const invalid = handleHumanKitchenPurchase(
    farm,
    {
      farm_human_key: farm.humanKey,
      expected_farm_doorplate: farm.id,
      idempotency_key: "719ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_shop_revision: kitchenPurchaseRevision(farm, NOW),
      items: [{ kind: "ingredient", item_id: "salt", quantity: 2 }],
    },
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(farm.id).ranch.kitchen.ingredients, {});
});

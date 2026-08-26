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
const TEA = cookingIngredientById.get("tea");
assert.ok(SALT, "the fixture needs the authoritative salt definition");
assert.ok(TEA, "the fixture needs the authoritative tea definition");

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

function purchaseBody(farm, revision, key, items = [{ kind: "ingredient", item_id: "salt", quantity: 2 }]) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_shop_revision: revision,
    items,
  };
}

test("Human kitchen purchase commits the whole cart through kitchenBuy", () => {
  const farm = addFarm();
  const revision = kitchenPurchaseRevision(farm, NOW);
  const saltQuantity = 2;
  const teaQuantity = 1;
  const totalPrice = SALT.price * saltQuantity + TEA.price * teaQuantity;
  const beforeSilver = farm.silver;
  const key = "019ffb01-49cd-7020-84af-3d04fb1ed03d";

  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, revision, key, [
      { kind: "ingredient", item_id: "salt", quantity: saltQuantity },
      { kind: "ingredient", item_id: "tea", quantity: teaQuantity },
    ]),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.json.data.result, {
    receipt_id: key,
    items: [
      { kind: "ingredient", item_id: "salt", quantity: saltQuantity, total_price_silver: SALT.price * saltQuantity },
      { kind: "ingredient", item_id: "tea", quantity: teaQuantity, total_price_silver: TEA.price * teaQuantity },
    ],
    total_price_silver: totalPrice,
    silver_balance: beforeSilver - totalPrice,
  });
  assert.equal(result.json.data.resource.balance.silver.value, beforeSilver - totalPrice);
  assert.equal(result.json.shop_revision, kitchenPurchaseRevision(getFarm(farm.id), NOW));
  assert.equal(getFarm(farm.id).ranch.kitchen.ingredients.salt, saltQuantity);
  assert.equal(getFarm(farm.id).ranch.kitchen.ingredients.tea, teaQuantity);
  assert.equal(getFarm(farm.id).ranch.kitchen.shop.bought["ingredient:salt"], saltQuantity);
  assert.equal(getFarm(farm.id).ranch.kitchen.shop.bought["ingredient:tea"], teaQuantity);
  assert.equal(getFarm(farm.id).silver, beforeSilver - totalPrice);
});

test("a recipe line keeps the authoritative rarity price and persists the learned recipe", () => {
  const farm = addFarm("BCDFGH", 500);
  farm.ranch.kitchen.shop.recipeIds = ["fried_egg"];
  const revision = kitchenPurchaseRevision(farm, NOW);
  const key = "029ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, revision, key, [{ kind: "recipe", item_id: "fried_egg", quantity: 1 }]),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.json.data.result, {
    receipt_id: key,
    items: [{ kind: "recipe", item_id: "fried_egg", quantity: 1, total_price_silver: cooking.recipePrices.N }],
    total_price_silver: cooking.recipePrices.N,
    silver_balance: 500 - cooking.recipePrices.N,
  });
  assert.deepEqual(getFarm(farm.id).ranch.kitchen.knownRecipes, ["fried_egg"]);
});

test("a tool line uses the paid catalog, persists ownership, and appears in the receipt", () => {
  const farm = addFarm("CDE234", 2_000);
  const revision = kitchenPurchaseRevision(farm, NOW);
  const key = "0a9ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, revision, key, [
      { kind: "tool", item_id: "roast", quantity: 1 },
      { kind: "ingredient", item_id: "salt", quantity: 1 },
    ]),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.notEqual(result.json.shop_revision, revision);
  assert.deepEqual(result.json.data.result.items, [
    { kind: "tool", item_id: "roast", quantity: 1, total_price_silver: 800 },
    { kind: "ingredient", item_id: "salt", quantity: 1, total_price_silver: SALT.price },
  ]);
  assert.equal(result.json.data.result.total_price_silver, 800 + SALT.price);
  assert.equal(result.json.data.result.silver_balance, 2_000 - 800 - SALT.price);
  assert.deepEqual(getFarm(farm.id).ranch.kitchen.ownedTools, ["roast"]);
  assert.equal(
    getFarm(farm.id).ranch.kitchen.knownRecipes.length,
    0,
    "tool purchase must not touch recipe metadata",
  );
  assert.equal(
    result.json.data.resource.tools.items.find((tool) => tool.tool_id === "roast")?.owned,
    true,
  );
  assert.equal(
    result.json.data.resource.tools.items.find((tool) => tool.tool_id === "steam")?.owned,
    false,
  );
});

test("a tool purchase replays by UUID without another debit", () => {
  const farm = addFarm("EFG567", 2_000);
  const revision = kitchenPurchaseRevision(farm, NOW);
  const key = "0b9ffb01-49cd-7020-84af-3d04fb1ed03d";
  const body = purchaseBody(farm, revision, key, [{ kind: "tool", item_id: "steam", quantity: 1 }]);
  const first = handleHumanKitchenPurchase(farm, body, NOW);
  assert.equal(first.status, 200);
  const savedAfterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanKitchenPurchase(getFarm(farm.id), body, NOW);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
});

test("unknown, already-owned, and unaffordable tools reject the cloned cart", () => {
  const unknownFarm = addFarm("GHJ234", 2_000);
  const unknownBefore = structuredClone(unknownFarm);
  const unknown = handleHumanKitchenPurchase(
    unknownFarm,
    purchaseBody(unknownFarm, kitchenPurchaseRevision(unknownFarm, NOW), "0c9ffb01-49cd-7020-84af-3d04fb1ed03d", [
      { kind: "tool", item_id: "not-a-tool", quantity: 1 },
    ]),
    NOW,
  );
  assert.equal(unknown.status, 409);
  assert.equal(unknown.json.error.code, "purchase_rejected");
  assert.deepEqual(getFarm(unknownFarm.id), unknownBefore);

  const ownedFarm = addFarm("KMN567", 2_000);
  ownedFarm.ranch.kitchen.ownedTools = ["roast"];
  const ownedBefore = structuredClone(ownedFarm);
  const owned = handleHumanKitchenPurchase(
    ownedFarm,
    purchaseBody(ownedFarm, kitchenPurchaseRevision(ownedFarm, NOW), "0d9ffb01-49cd-7020-84af-3d04fb1ed03d", [
      { kind: "tool", item_id: "roast", quantity: 1 },
    ]),
    NOW,
  );
  assert.equal(owned.status, 409);
  assert.equal(owned.json.error.code, "purchase_rejected");
  assert.deepEqual(getFarm(ownedFarm.id), ownedBefore);

  const poorFarm = addFarm("NPQ789", 1_599);
  const poorBefore = structuredClone(poorFarm);
  const poor = handleHumanKitchenPurchase(
    poorFarm,
    purchaseBody(poorFarm, kitchenPurchaseRevision(poorFarm, NOW), "0e9ffb01-49cd-7020-84af-3d04fb1ed03d", [
      { kind: "tool", item_id: "deep-fry", quantity: 1 },
    ]),
    NOW,
  );
  assert.equal(poor.status, 409);
  assert.equal(poor.json.error.code, "purchase_rejected");
  assert.match(poor.json.error.message, /银币不足/);
  assert.deepEqual(getFarm(poorFarm.id), poorBefore);
});

test("a rejected later line rolls back earlier lines and does not save a receipt", () => {
  const farm = addFarm("DEF567", 20);
  const revision = kitchenPurchaseRevision(farm, NOW);
  const key = "039ffb01-49cd-7020-84af-3d04fb1ed03d";
  const before = structuredClone(getFarm(farm.id));

  const result = handleHumanKitchenPurchase(
    farm,
    purchaseBody(farm, revision, key, [
      { kind: "ingredient", item_id: "salt", quantity: 2 },
      { kind: "ingredient", item_id: "tea", quantity: 1 },
    ]),
    NOW,
  );

  assert.equal(result.status, 409);
  assert.equal(result.json.error.code, "purchase_rejected");
  assert.match(result.json.error.message, /银币不足/);
  assert.deepEqual(getFarm(farm.id), before);
  assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanKitchenPurchaseReceipts ?? {}, key), false);
});

test("the same cart key replays, while a different cart payload conflicts without mutation", () => {
  const farm = addFarm("GHJ789");
  const revision = kitchenPurchaseRevision(farm, NOW);
  const key = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
  const body = purchaseBody(farm, revision, key, [
    { kind: "ingredient", item_id: "salt", quantity: 2 },
    { kind: "ingredient", item_id: "tea", quantity: 1 },
  ]);
  const first = handleHumanKitchenPurchase(farm, body, NOW);
  assert.equal(first.status, 200);
  const savedAfterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanKitchenPurchase(getFarm(farm.id), body, NOW);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);

  const conflict = handleHumanKitchenPurchase(
    getFarm(farm.id),
    purchaseBody(getFarm(farm.id), first.json.shop_revision, key, [
      { kind: "ingredient", item_id: "salt", quantity: 1 },
      { kind: "ingredient", item_id: "tea", quantity: 1 },
    ]),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
});

test("a stale kitchen state revision is rejected before the authority can mutate it", () => {
  const farm = addFarm("KMPQRS");
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
  const poorFarm = addFarm("TUV234", SALT.price * 2 - 1);
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

  const cappedFarm = addFarm("WXYZ23", 500);
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
  const farm = addFarm("234567");
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
  const farm = addFarm("345678");
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

test("the cart request and each line are strict, non-empty, positive, and deduplicated", () => {
  const farm = addFarm("456789");
  const revision = kitchenPurchaseRevision(farm, NOW);
  const key = "719ffb01-49cd-7020-84af-3d04fb1ed03d";
  const valid = purchaseBody(farm, revision, key);
  const invalidBodies = [
    { ...valid, extra: true },
    { ...valid, expected_shop_revision: `kitchen-v1:${"A".repeat(64)}` },
    { ...valid, expected_shop_revision: `kitchen-v1:${"0".repeat(63)}` },
    { ...valid, expected_shop_revision: `kitchen-v2:${"0".repeat(64)}` },
    { ...valid, items: [] },
    { ...valid, items: [{ kind: "ingredient", item_id: "salt", quantity: 0 }] },
    { ...valid, items: [{ kind: "ingredient", item_id: "salt", quantity: 1, extra: true }] },
    {
      ...valid,
      items: [
        { kind: "ingredient", item_id: "salt", quantity: 1 },
        { kind: "ingredient", item_id: "salt", quantity: 1 },
      ],
    },
    { ...valid, items: [{ kind: "recipe", item_id: "fried_egg", quantity: 2 }] },
    { ...valid, items: [{ kind: "tool", item_id: "roast", quantity: 2 }] },
  ];

  for (const body of invalidBodies) {
    const result = handleHumanKitchenPurchase(farm, body, NOW);
    assert.equal(result.status, 400);
    assert.equal(result.json.error.code, "invalid_request");
  }
  assert.deepEqual(getFarm(farm.id).ranch.kitchen.ingredients, {});
  assert.equal(getFarm(farm.id).silver, 500);
});

test("an invalid authoritative silver balance fails before kitchenBuy or replaceFarm", () => {
  for (const [id, invalidSilver, key] of [
    ["56789A", -1, "819ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["6789AB", 1.5, "919ffb01-49cd-7020-84af-3d04fb1ed03d"],
  ]) {
    const farm = addFarm(id);
    farm.silver = invalidSilver;
    const before = structuredClone(farm);
    const result = handleHumanKitchenPurchase(
      farm,
      purchaseBody(farm, kitchenPurchaseRevision(farm, NOW), key),
      NOW,
    );

    assert.equal(result.status, 503);
    assert.equal(result.json.error.code, "farm_unavailable");
    assert.match(result.json.error.message, /silver balance is invalid/);
    assert.equal(getFarm(farm.id), farm);
    assert.deepEqual(getFarm(farm.id), before);
    assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanKitchenPurchaseReceipts ?? {}, key), false);
  }
});

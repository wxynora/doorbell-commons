import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-market-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-25T04:00:00.000Z");

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const {
  handleHumanMarketAction,
  marketActionRevision,
  readHumanMarket,
} = await import("../dist/server/market-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("集市动作测试农场", 123456, { aiName: "小机", humanName: "渡" });
  farm.id = id;
  farm.humanKey = `market-human-${id}`;
  farm.silver = 0;
  insertFarm(farm);
  return getFarm(id);
}

function body(farm, revision, idempotencyKey, action, fields = {}) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: idempotencyKey,
    expected_revision: revision,
    action,
    ...fields,
  };
}

test("market adapter exposes the existing market resource and single-farm listing authorities", () => {
  const farm = addFarm();
  farm.materials.ordinary_stone = 2;
  const before = readHumanMarket(farm, NOW);
  assert.equal(before.data.market.status, "available");

  const key = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanMarketAction(
    farm,
    body(farm, marketActionRevision(farm, NOW), key, "list", {
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    }),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, key);
  assert.equal(result.json.data.result.action, "list");
  assert.equal(result.json.data.result.outcome.item_id, "ordinary_stone");
  assert.equal(result.json.data.resource.market.listings[0].quantity, 1);
  assert.equal(getFarm(farm.id).materials.ordinary_stone, 1);
  assert.equal(typeof result.json.revision, "string");
});

test("ordinary unlisting and barter listing/withdrawal use the existing authorities", () => {
  const farm = addFarm("BCDFGH");
  farm.materials.ordinary_stone = 2;
  const listKey = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
  const listed = handleHumanMarketAction(
    farm,
    body(farm, marketActionRevision(farm, NOW), listKey, "list", {
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    }),
    NOW,
  );
  assert.equal(listed.status, 200);
  const unlisted = handleHumanMarketAction(
    getFarm(farm.id),
    body(getFarm(farm.id), listed.json.revision, "219ffb01-49cd-7020-84af-3d04fb1ed03d", "unlist", {
      kind: "material",
      item_id: "ordinary_stone",
    }),
    NOW,
  );
  assert.equal(unlisted.status, 200);
  assert.equal(unlisted.json.data.result.outcome.quantity, 1);
  assert.equal(getFarm(farm.id).materials.ordinary_stone, 2);

  const barterKey = "319ffb01-49cd-7020-84af-3d04fb1ed03d";
  const barter = handleHumanMarketAction(
    getFarm(farm.id),
    body(getFarm(farm.id), unlisted.json.revision, barterKey, "barter-list", {
      give_kind: "material",
      give_item_id: "ordinary_stone",
      give_qty: 1,
      want_kind: "seed",
      want_item_id: "eternal_frost_bloom",
      want_qty: 1,
    }),
    NOW,
  );
  assert.equal(barter.status, 200);
  const listingId = barter.json.data.result.outcome.listing_id;
  assert.match(listingId, /^[0-9a-f-]{36}$/i);
  assert.equal(getFarm(farm.id).materials.ordinary_stone, 1);

  const withdrawn = handleHumanMarketAction(
    getFarm(farm.id),
    body(getFarm(farm.id), barter.json.revision, "419ffb01-49cd-7020-84af-3d04fb1ed03d", "barter-unlist", {
      listing_id: listingId,
    }),
    NOW,
  );
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.json.data.result.outcome.listing_id, listingId);
  assert.equal(getFarm(farm.id).materials.ordinary_stone, 2);
  assert.equal(getFarm(farm.id).humanBarters.length, 0);
});

test("ingredient and dish offers delegate price validation and instance handling to kitchenSellSelected", () => {
  const farm = addFarm("234567");
  farm.ranch = {
    coins: 0,
    animals: [],
    pets: [],
    patrolGoose: null,
    wardrobe: [],
    decor: [],
    decorStore: [],
    raids: [],
    raidDebts: [],
    shop: { day: 0, acc: [], decor: [] },
    kitchen: {
      products: [],
      ingredients: { salt: 2 },
      dishes: [
        {
          id: "dish-instance-1",
          recipeId: "fried_egg",
          name: "香煎蛋",
          rarity: "N",
          value: 20,
        },
      ],
      knownRecipes: [],
    },
  };

  const ingredient = handleHumanMarketAction(
    farm,
    body(farm, marketActionRevision(farm, NOW), "b19ffb01-49cd-7020-84af-3d04fb1ed03d", "list", {
      kind: "ingredient",
      item_id: "salt",
      qty: 1,
      price: 17,
    }),
    NOW,
  );
  assert.equal(ingredient.status, 200);
  assert.equal(ingredient.json.data.result.outcome.price, 17);
  assert.equal(getFarm(farm.id).ranch.kitchen.ingredients.salt, 1);

  const dish = handleHumanMarketAction(
    getFarm(farm.id),
    body(getFarm(farm.id), ingredient.json.revision, "c19ffb01-49cd-7020-84af-3d04fb1ed03d", "list", {
      kind: "dish",
      item_id: "dish-instance-1",
      qty: 1,
      price: 31,
    }),
    NOW,
  );
  assert.equal(dish.status, 200);
  assert.equal(dish.json.data.result.outcome.price, 31);
  assert.equal(dish.json.data.resource.market.listings.some((listing) => listing.kind === "dish"), true);
});

test("cash purchases and barter accepts stay blocked until store-level multi-farm atomic commit exists", () => {
  const seller = addFarm("DEF567");
  const buyer = addFarm("GHJ789");
  seller.materials.ordinary_stone = 1;
  const offer = handleHumanMarketAction(
    seller,
    body(seller, marketActionRevision(seller, NOW), "519ffb01-49cd-7020-84af-3d04fb1ed03d", "list", {
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    }),
    NOW,
  );
  assert.equal(offer.status, 200);
  buyer.silver = 10_000;
  const sellerBefore = structuredClone(getFarm(seller.id));
  const buyerBefore = structuredClone(getFarm(buyer.id));
  const purchase = handleHumanMarketAction(
    buyer,
    body(buyer, marketActionRevision(buyer, NOW), "619ffb01-49cd-7020-84af-3d04fb1ed03d", "buy", {
      seller_doorplate: seller.id,
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    }),
    NOW,
  );
  assert.equal(purchase.status, 503);
  assert.equal(purchase.json.error.code, "cross_farm_atomicity_unavailable");
  assert.deepEqual(getFarm(seller.id), sellerBefore);
  assert.deepEqual(getFarm(buyer.id), buyerBefore);

  const barterSeller = addFarm("KMPQRS");
  const barterBuyer = addFarm("NPQ234");
  barterSeller.materials.ordinary_stone = 1;
  const barter = handleHumanMarketAction(
    barterSeller,
    body(barterSeller, marketActionRevision(barterSeller, NOW), "719ffb01-49cd-7020-84af-3d04fb1ed03d", "barter-list", {
      give_kind: "material",
      give_item_id: "ordinary_stone",
      give_qty: 1,
      want_kind: "seed",
      want_item_id: "eternal_frost_bloom",
      want_qty: 1,
    }),
    NOW,
  );
  assert.equal(barter.status, 200);
  barterBuyer.seeds.eternal_frost_bloom = 1;
  const barterSellerBefore = structuredClone(getFarm(barterSeller.id));
  const barterBuyerBefore = structuredClone(getFarm(barterBuyer.id));
  const accepted = handleHumanMarketAction(
    barterBuyer,
    body(barterBuyer, marketActionRevision(barterBuyer, NOW), "819ffb01-49cd-7020-84af-3d04fb1ed03d", "barter-accept", {
      seller_doorplate: barterSeller.id,
      listing_id: barter.json.data.result.outcome.listing_id,
    }),
    NOW,
  );
  assert.equal(accepted.status, 503);
  assert.equal(accepted.json.error.code, "cross_farm_atomicity_unavailable");
  assert.deepEqual(getFarm(barterSeller.id), barterSellerBefore);
  assert.deepEqual(getFarm(barterBuyer.id), barterBuyerBefore);
});

test("market writes replay by UUID, reject stale state and extra client settlement fields", () => {
  const farm = addFarm("TUV234");
  farm.materials.ordinary_stone = 1;
  const key = "919ffb01-49cd-7020-84af-3d04fb1ed03d";
  const request = body(farm, marketActionRevision(farm, NOW), key, "list", {
    kind: "material",
    item_id: "ordinary_stone",
    qty: 1,
  });
  const first = handleHumanMarketAction(farm, request, NOW);
  assert.equal(first.status, 200);
  const saved = structuredClone(getFarm(farm.id));
  const replay = handleHumanMarketAction(getFarm(farm.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), saved);

  const conflict = handleHumanMarketAction(
    getFarm(farm.id),
    body(getFarm(farm.id), first.json.revision, key, "list", {
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
      price: 1,
    }),
    NOW,
  );
  assert.equal(conflict.status, 400);
  assert.deepEqual(getFarm(farm.id), saved);

  const staleFarm = addFarm("WXYZ23");
  staleFarm.materials.ordinary_stone = 1;
  const staleRevision = marketActionRevision(staleFarm, NOW);
  staleFarm.materials.ordinary_stone = 2;
  const staleBefore = structuredClone(staleFarm);
  const stale = handleHumanMarketAction(
    staleFarm,
    body(staleFarm, staleRevision, "a19ffb01-49cd-84af-8d04-3d04fb1ed03d", "list", {
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    }),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(staleFarm.id), staleBefore);
});

test("a failed single-farm save leaves inventory, UGC and the receipt ledger untouched", () => {
  const farm = addFarm("345678");
  farm.seeds.eternal_frost_bloom = 1;
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  farm.doorbellHumanMarketActionReceipts = { old: circularReceipt };
  const before = structuredClone(farm);
  const key = "a29ffb01-49cd-84af-8d04-3d04fb1ed03d";
  const failed = handleHumanMarketAction(
    farm,
    body(farm, marketActionRevision(farm, NOW), key, "list", {
      kind: "seed",
      item_id: "eternal_frost_bloom",
      qty: 1,
    }),
    NOW,
  );
  assert.equal(failed.status, 503);
  assert.equal(failed.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(farm.id), before);
  assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanMarketActionReceipts, key), false);
  delete farm.doorbellHumanMarketActionReceipts;
});

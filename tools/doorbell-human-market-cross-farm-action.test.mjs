import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-market-cross-farm-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-25T04:00:00.000Z");

const { makeFarm } = await import("../dist/game.js");
const { humanBarterList } = await import("../dist/engine.js");
const { dumpUgc, loadUgc, registerUgc } = await import("../dist/ugc.js");
const { getFarm, insertFarm, save } = await import("../dist/store.js");
const { marketActionRevision } = await import("../dist/server/market-revision.js");
const { handleHumanCrossFarmMarketAction } = await import("../dist/server/market-cross-farm-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id) {
  const farm = makeFarm("跨户集市测试农场", 123456, { aiName: "小机", humanName: "渡" });
  farm.id = id;
  farm.humanKey = `cross-market-human-${id}`;
  farm.silver = 0;
  insertFarm(farm);
  return getFarm(id);
}

function body(buyer, action, idempotencyKey, expectedRevision, fields) {
  return {
    farm_human_key: buyer.humanKey,
    expected_farm_doorplate: buyer.id,
    idempotency_key: idempotencyKey,
    expected_revision: expectedRevision,
    action,
    ...fields,
  };
}

test("cross-farm cash purchase and barter acceptance commit both farms together", () => {
  loadUgc([]);
  const seller = addFarm("ABC234");
  const buyer = addFarm("DEF567");
  seller.materials.ordinary_stone = 1;
  seller.market = [{ kind: "material", id: "ordinary_stone", qty: 1, price: 10 }];
  buyer.silver = 100;
  save();

  const purchase = handleHumanCrossFarmMarketAction(
    buyer,
    seller,
    body(buyer, "buy", "019ffb01-49cd-7020-84af-3d04fb1ed03d", marketActionRevision(buyer, NOW), {
      seller_doorplate: seller.id,
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    }),
    NOW,
  );
  assert.equal(purchase.status, 200);
  assert.equal(getFarm(seller.id).market.length, 0);
  assert.equal(getFarm(seller.id).silver, 9);
  assert.equal(getFarm(buyer.id).silver, 90);
  assert.equal(getFarm(buyer.id).materials.ordinary_stone, 1);

  const sellerAfterPurchase = getFarm(seller.id);
  const buyerAfterPurchase = getFarm(buyer.id);
  sellerAfterPurchase.materials.ordinary_stone = 1;
  buyerAfterPurchase.materials.dry_branch = 1;
  const listed = humanBarterList(sellerAfterPurchase, "material", "ordinary_stone", 1, "material", "dry_branch", 1, NOW);
  assert.equal(listed.ok, true);
  save();
  const accepted = handleHumanCrossFarmMarketAction(
    buyerAfterPurchase,
    sellerAfterPurchase,
    body(buyerAfterPurchase, "barter-accept", "119ffb01-49cd-7020-84af-3d04fb1ed03d", marketActionRevision(buyerAfterPurchase, NOW), {
      seller_doorplate: seller.id,
      listing_id: listed.listing.id,
    }),
    NOW,
  );
  assert.equal(accepted.status, 200);
  assert.equal(getFarm(seller.id).humanBarters.length, 0);
  assert.equal(getFarm(seller.id).materials.dry_branch, 1);
  assert.equal(getFarm(buyer.id).materials.ordinary_stone, 2);
  assert.equal(Object.hasOwn(getFarm(buyer.id).materials, "dry_branch"), false);
});

test("a failed cross-farm save leaves both farms and the UGC catalog untouched", () => {
  loadUgc([]);
  const seller = addFarm("GHJ789");
  const buyer = addFarm("KMPQRS");
  registerUgc({
    id: "ugc_atomic_test",
    name: "原子测试作物",
    category: "ugc",
    rarity: "N",
    seedType: "limited",
    limitedId: "ugc_atomic_test",
    growTicks: 1,
    water: null,
    seedPrice: 1,
    sellPrice: 10,
    banned: false,
    sales: 0,
    buyers: [],
  });
  seller.market = [{ kind: "seed", id: "ugc_atomic_test", qty: 1, price: 12 }];
  buyer.silver = 100;
  save();
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  buyer.doorbellHumanMarketActionReceipts = { old: circularReceipt };
  const sellerBefore = structuredClone(seller);
  const buyerBefore = structuredClone(buyer);
  const ugcBefore = structuredClone(dumpUgc());

  const failed = handleHumanCrossFarmMarketAction(
    buyer,
    seller,
    body(buyer, "buy", "219ffb01-49cd-7020-84af-3d04fb1ed03d", marketActionRevision(buyer, NOW), {
      seller_doorplate: seller.id,
      kind: "seed",
      item_id: "ugc_atomic_test",
      qty: 1,
    }),
    NOW,
  );
  assert.equal(failed.status, 503);
  assert.equal(failed.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(seller.id), sellerBefore);
  assert.deepEqual(getFarm(buyer.id), buyerBefore);
  assert.deepEqual(dumpUgc(), ugcBefore);
  assert.equal(Object.hasOwn(getFarm(buyer.id).doorbellHumanMarketActionReceipts, "219ffb01-49cd-7020-84af-3d04fb1ed03d"), false);

  delete buyer.doorbellHumanMarketActionReceipts;
  loadUgc([]);
  save();
});

test("cross-farm idempotency replays the same receipt and rejects a different payload", () => {
  loadUgc([]);
  const seller = addFarm("NPQ234");
  const buyer = addFarm("RST567");
  seller.market = [{ kind: "material", id: "ordinary_stone", qty: 2, price: 10 }];
  buyer.silver = 100;
  save();
  const key = "319ffb01-49cd-7020-84af-3d04fb1ed03d";
  const request = body(buyer, "buy", key, marketActionRevision(buyer, NOW), {
    seller_doorplate: seller.id,
    kind: "material",
    item_id: "ordinary_stone",
    qty: 1,
  });
  const first = handleHumanCrossFarmMarketAction(buyer, seller, request, NOW);
  assert.equal(first.status, 200);
  const sellerAfter = structuredClone(getFarm(seller.id));
  const buyerAfter = structuredClone(getFarm(buyer.id));
  const ugcAfter = structuredClone(dumpUgc());

  const replay = handleHumanCrossFarmMarketAction(getFarm(buyer.id), getFarm(seller.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(seller.id), sellerAfter);
  assert.deepEqual(getFarm(buyer.id), buyerAfter);
  assert.deepEqual(dumpUgc(), ugcAfter);

  const conflict = handleHumanCrossFarmMarketAction(
    getFarm(buyer.id),
    getFarm(seller.id),
    { ...request, qty: 2 },
    NOW + 60_000,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(seller.id), sellerAfter);
  assert.deepEqual(getFarm(buyer.id), buyerAfter);
});

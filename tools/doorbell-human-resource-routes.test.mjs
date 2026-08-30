import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-resources-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-human-resource-test-token";

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const originalDateNow = Date.now;
Date.now = () => NOW;

const { makeFarm } = await import("../dist/game.js");
const { humanBarterList } = await import("../dist/engine.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");
const { currentDayIndex } = await import("../dist/time.js");
const { originalPlantActionRevision } = await import("../dist/server/original-plant-action.js");
const { cropCodexActionRevision } = await import("../dist/server/crop-codex-revision.js");
const { smeltingActionRevision } = await import("../dist/server/smelting-revision.js");
const { kitchenInventoryRevision } = await import(
  "../dist/server/kitchen-inventory-action.js"
);
const { kitchenCookRevision } = await import("../dist/server/kitchen-cook-action.js");
const { expeditionActionRevision } = await import("../dist/server/expedition-action.js");
const { marketActionRevision } = await import("../dist/server/market-action.js");
const { neighborhoodMessageActionRevision } = await import(
  "../dist/server/neighborhood-message-action.js"
);

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-resource-human-key";
const BULLETIN_FARM_DOORPLATE = "MNP234";
const BULLETIN_FARM_HUMAN_KEY = "private-bulletin-resource-human-key";
const ORIGINAL_PLANT_DOORPLATE = "BCDFGH";
const ORIGINAL_PLANT_HUMAN_KEY = "private-original-plant-resource-human-key";
const POOR_ORIGINAL_PLANT_DOORPLATE = "CDEFGH";
const POOR_ORIGINAL_PLANT_HUMAN_KEY = "private-poor-original-plant-resource-human-key";
const NEIGHBOR_DOORPLATE = "DEF567";
const MARKET_SELLER_DOORPLATE = "GHJ789";
const MARKET_SELLER_HUMAN_KEY = "private-market-seller-human-key";
const MARKET_BUYER_DOORPLATE = "JKM234";
const MARKET_BUYER_HUMAN_KEY = "private-market-buyer-human-key";
const PATHS = [
  "/internal/doorbell/human/catalog/read",
  "/internal/doorbell/human/kitchen/read",
  "/internal/doorbell/human/ranch/read",
];
const BULLETIN_PATH = "/internal/doorbell/human/bulletin/read";
const BULLETIN_ACK_PATH = "/internal/doorbell/human/bulletin/ack";

async function readResource(baseUrl, path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer farm-doorbell-human-resource-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

test("Doorbell Human catalog, bulletin, kitchen, and ranch reads are registered and keep credentials private", async (t) => {
  t.after(() => {
    Date.now = originalDateNow;
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  const farm = makeFarm("资源接线测试农场");
  farm.id = FARM_DOORPLATE;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.coins = 123;
  farm.silver = 456;
  farm.codex = { wheat: { count: 1, bestQuality: 1, firstAt: NOW - 1_000 } };
  farm.starred = [];
  farm.materials = { ordinary_stone: 1, dry_branch: 1, clay_lump: 1 };
  farm.ranch = {
    coins: 789,
    animals: [
      {
        kindId: "chicken",
        name: "小鸡",
        level: 1,
        ticksSinceProduce: 0,
        pending: 0,
        pendingMeat: 0,
        feedBoostPending: false,
        pendingBoost: false,
        acc: [],
      },
    ],
    pets: [],
    patrolGoose: null,
    pinned: [],
    wardrobe: [],
    decor: [],
    decorStore: ["flowerbed"],
    raidDebts: [],
    raids: [],
    kitchen: {
      products: [
        { id: "route-egg", itemId: "chicken_egg", name: "鸡蛋", emoji: "🥚", value: 30 },
        { id: "route-cook-egg", itemId: "chicken_egg", name: "鸡蛋", emoji: "🥚", value: 30 },
      ],
      ingredients: {},
      dishes: [],
      knownRecipes: [],
      shop: {
        day: currentDayIndex(NOW),
        ingredientIds: [],
        recipeIds: [],
        bought: {},
      },
    },
  };
  insertFarm(farm);

  const bulletinFarm = makeFarm("播报已读测试农场");
  bulletinFarm.id = BULLETIN_FARM_DOORPLATE;
  bulletinFarm.humanKey = BULLETIN_FARM_HUMAN_KEY;
  bulletinFarm.task = {
    seq: 1,
    kind: "craft",
    target: 1,
    progress: 0,
    reward: 60,
    currency: "coin",
    accepted: true,
    offeredAt: NOW - 60_000,
  };
  bulletinFarm.messages = [
    { id: "route-message", by: NEIGHBOR_DOORPLATE, name: "邻居", text: "来串门啦", at: NOW - 20_000 },
  ];
  bulletinFarm.ranch = {
    notices: [{ at: NOW - 30_000, text: "牧场里有新动静", section: "ranch" }],
  };
  bulletinFarm.trail = [
    {
      eventId: "route-trail-watered",
      t: NOW - 10_000,
      kind: "watered",
      by: "邻居",
      plotId: 2,
    },
  ];
  insertFarm(bulletinFarm);

  const neighbor = makeFarm("邻里留言目标农场");
  neighbor.id = NEIGHBOR_DOORPLATE;
  neighbor.humanKey = "private-neighbor-human-key";
  neighbor.social = { visit: true, steal: true, water: true, message: true };
  neighbor.messages = [];
  insertFarm(neighbor);

  const originalPlantFarm = makeFarm("原创植物资源测试农场");
  originalPlantFarm.id = ORIGINAL_PLANT_DOORPLATE;
  originalPlantFarm.humanKey = ORIGINAL_PLANT_HUMAN_KEY;
  originalPlantFarm.coins = 500;
  insertFarm(originalPlantFarm);

  const poorOriginalPlantFarm = makeFarm("余额不足原创植物资源测试农场");
  poorOriginalPlantFarm.id = POOR_ORIGINAL_PLANT_DOORPLATE;
  poorOriginalPlantFarm.humanKey = POOR_ORIGINAL_PLANT_HUMAN_KEY;
  poorOriginalPlantFarm.coins = 100;
  insertFarm(poorOriginalPlantFarm);

  const marketSeller = makeFarm("跨户集市卖家");
  marketSeller.id = MARKET_SELLER_DOORPLATE;
  marketSeller.humanKey = MARKET_SELLER_HUMAN_KEY;
  marketSeller.materials = { ordinary_stone: 2 };
  marketSeller.market = [{ kind: "material", id: "ordinary_stone", qty: 1, price: 10 }];
  insertFarm(marketSeller);

  const marketBuyer = makeFarm("跨户集市买家");
  marketBuyer.id = MARKET_BUYER_DOORPLATE;
  marketBuyer.humanKey = MARKET_BUYER_HUMAN_KEY;
  marketBuyer.silver = 100;
  marketBuyer.materials = { dry_branch: 1 };
  insertFarm(marketBuyer);

  const barter = humanBarterList(
    marketSeller,
    "material",
    "ordinary_stone",
    1,
    "material",
    "dry_branch",
    1,
    NOW,
  );
  assert.equal(barter.ok, true);
  const marketBarterListingId = barter.listing.id;

  const server = startServer(0);
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const payload = {
    farm_human_key: FARM_HUMAN_KEY,
    expected_farm_doorplate: FARM_DOORPLATE,
  };
  const bulletinPayload = {
    farm_human_key: BULLETIN_FARM_HUMAN_KEY,
    expected_farm_doorplate: BULLETIN_FARM_DOORPLATE,
  };

  for (const path of PATHS) {
    const result = await readResource(baseUrl, path, payload);
    assert.equal(result.response.status, 200, path);
    assert.match(String(result.response.headers.get("cache-control")), /no-store/);
    assert.equal(result.body.data.farm.farm_doorplate, FARM_DOORPLATE);
    assert.equal(JSON.stringify(result.body).includes(FARM_HUMAN_KEY), false);
    if (path.endsWith("/kitchen/read")) {
      assert.match(
        result.body.kitchen_inventory_revision,
        /^kitchen-inventory-v1:[0-9a-f]{64}$/,
      );
      assert.match(result.body.shop_revision, /^kitchen-v1:[0-9a-f]{64}$/);
    }
  }

  const bulletinRead = await readResource(baseUrl, BULLETIN_PATH, bulletinPayload);
  assert.equal(bulletinRead.response.status, 200);
  assert.equal(bulletinRead.body.subject.farm_doorplate, BULLETIN_FARM_DOORPLATE);
  assert.match(bulletinRead.body.revision, /^farm-bulletin-v1:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(bulletinRead.body).includes(BULLETIN_FARM_HUMAN_KEY), false);
  assert.equal(bulletinRead.body.data.trail.has_unread, true);
  assert.deepEqual(bulletinRead.body.data.trail.entries.map((entry) => entry.event_id), [
    "route-trail-watered",
  ]);
  const bulletinSourcesBeforeAck = structuredClone({
    task: getFarm(BULLETIN_FARM_DOORPLATE).task,
    plots: getFarm(BULLETIN_FARM_DOORPLATE).plots,
    messages: getFarm(BULLETIN_FARM_DOORPLATE).messages,
    ranchNotices: getFarm(BULLETIN_FARM_DOORPLATE).ranch.notices,
    trail: getFarm(BULLETIN_FARM_DOORPLATE).trail,
  });
  const trailAckPayload = {
    ...bulletinPayload,
    expected_bulletin_revision: bulletinRead.body.revision,
    idempotency_key: "219ffb01-49cd-7020-84af-3d04fb1ed03e",
    acknowledge: "trail",
  };
  const trailAck = await readResource(baseUrl, BULLETIN_ACK_PATH, trailAckPayload);
  assert.equal(trailAck.response.status, 200);
  assert.equal(trailAck.body.data.resource.trail.has_unread, false);
  assert.deepEqual(trailAck.body.data.resource.trail.entries.map((entry) => entry.event_id), [
    "route-trail-watered",
  ]);
  assert.equal(trailAck.body.data.resource.available.messages.length, 1);
  const bulletinAckPayload = {
    ...bulletinPayload,
    expected_bulletin_revision: bulletinRead.body.revision,
    idempotency_key: "219ffb01-49cd-7020-84af-3d04fb1ed03d",
    acknowledge: "system_notifications",
  };
  const bulletinAck = await readResource(baseUrl, BULLETIN_ACK_PATH, bulletinAckPayload);
  assert.equal(bulletinAck.response.status, 200);
  assert.equal(bulletinAck.body.data.result.receipt_id, bulletinAckPayload.idempotency_key);
  assert.ok(bulletinAck.body.data.result.acknowledged_count >= 3);
  assert.deepEqual(bulletinAck.body.data.resource.available, {
    tasks: [],
    mature_plots: [],
    messages: [],
    ranch_notifications: [],
  });
  assert.equal(bulletinAck.body.data.resource.trail.has_unread, false);
  assert.equal(bulletinAck.body.data.resource.trail.entries.length, 1);
  assert.deepEqual(
    {
      task: getFarm(BULLETIN_FARM_DOORPLATE).task,
      plots: getFarm(BULLETIN_FARM_DOORPLATE).plots,
      messages: getFarm(BULLETIN_FARM_DOORPLATE).messages,
      ranchNotices: getFarm(BULLETIN_FARM_DOORPLATE).ranch.notices,
      trail: getFarm(BULLETIN_FARM_DOORPLATE).trail,
    },
    bulletinSourcesBeforeAck,
  );
  const replayedBulletinAck = await readResource(baseUrl, BULLETIN_ACK_PATH, bulletinAckPayload);
  assert.equal(replayedBulletinAck.response.status, 200);
  assert.deepEqual(replayedBulletinAck.body, bulletinAck.body);
  const legacySystemAckPayload = { ...bulletinAckPayload };
  delete legacySystemAckPayload.acknowledge;
  const legacyReplayedBulletinAck = await readResource(
    baseUrl,
    BULLETIN_ACK_PATH,
    legacySystemAckPayload,
  );
  assert.equal(legacyReplayedBulletinAck.response.status, 200);
  assert.deepEqual(legacyReplayedBulletinAck.body, bulletinAck.body);

  const persistedWorld = JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8"));
  const persistedBulletinFarm = persistedWorld.farms.find(
    (entry) => entry.id === BULLETIN_FARM_DOORPLATE,
  );
  assert.deepEqual(
    persistedBulletinFarm.doorbellHumanBulletinReadState.acknowledged_reminder_keys,
    getFarm(BULLETIN_FARM_DOORPLATE).doorbellHumanBulletinReadState
      .acknowledged_reminder_keys,
  );
  assert.equal(
    persistedBulletinFarm.doorbellHumanBulletinReadState.trail_seen_event_id,
    "route-trail-watered",
  );
  const bulletinAfterAck = await readResource(baseUrl, BULLETIN_PATH, bulletinPayload);
  assert.deepEqual(bulletinAfterAck.body.data.available.tasks, []);
  assert.deepEqual(bulletinAfterAck.body.data.available.mature_plots, []);
  assert.deepEqual(bulletinAfterAck.body.data.available.messages, []);
  assert.deepEqual(bulletinAfterAck.body.data.available.ranch_notifications, []);
  assert.equal(bulletinAfterAck.body.data.trail.has_unread, false);
  assert.equal(bulletinAfterAck.body.data.trail.entries.length, 1);
  getFarm(BULLETIN_FARM_DOORPLATE).messages.push({
    id: "route-message-new",
    by: NEIGHBOR_DOORPLATE,
    name: "邻居",
    text: "这是新留言",
    at: NOW,
  });
  getFarm(BULLETIN_FARM_DOORPLATE).trail.unshift({
    eventId: "route-trail-stolen",
    t: NOW,
    kind: "stolen",
    by: "另一位邻居",
    actorFarmId: NEIGHBOR_DOORPLATE,
    plotId: 3,
    crop: "草莓",
  });
  const bulletinWithNewMessage = await readResource(baseUrl, BULLETIN_PATH, bulletinPayload);
  assert.deepEqual(
    bulletinWithNewMessage.body.data.available.messages.map((message) => message.id),
    ["route-message-new"],
  );
  assert.equal(bulletinWithNewMessage.body.data.trail.has_unread, true);
  assert.equal(bulletinWithNewMessage.body.data.trail.entries[0].event_id, "route-trail-stolen");

  const sellerBeforeCatalogRead = structuredClone(getFarm(MARKET_SELLER_DOORPLATE));
  const catalogRead = await readResource(baseUrl, PATHS[0], payload);
  assert.deepEqual(getFarm(MARKET_SELLER_DOORPLATE), sellerBeforeCatalogRead);
  assert.match(catalogRead.body.revision, /^farm-catalog-v1:[0-9a-f]{64}$/);
  assert.equal(
    catalogRead.body.codex_revision,
    cropCodexActionRevision(getFarm(FARM_DOORPLATE), NOW),
  );
  assert.match(catalogRead.body.expedition_revision, /^farm-expedition-v1:[0-9a-f]{64}$/);
  assert.match(catalogRead.body.market_revision, /^farm-market-v1:[0-9a-f]{64}$/);
  assert.equal(catalogRead.body.data.smelting.write_status, "available");
  assert.equal(
    catalogRead.body.data.smelting.revision,
    smeltingActionRevision(getFarm(FARM_DOORPLATE)),
  );
  const cashListing = catalogRead.body.data.market.listings.find(
    (listing) =>
      listing.seller_farm_doorplate === MARKET_SELLER_DOORPLATE &&
      listing.kind === "material" &&
      listing.item_id === "ordinary_stone",
  );
  assert.equal(cashListing.quantity, 1);
  assert.equal(cashListing.price, 10);
  const barterListing = catalogRead.body.data.market.barter_listings.find(
    (listing) =>
      listing.seller_farm_doorplate === MARKET_SELLER_DOORPLATE &&
      listing.listing_id === marketBarterListingId,
  );
  assert.equal(barterListing.give.item_id, "ordinary_stone");
  assert.equal(barterListing.want.item_id, "dry_branch");
  assert.equal(Object.hasOwn(barterListing, "listed_at"), false);
  assert.equal(
    catalogRead.body.data.market.listings.some((listing) => listing.listing_id === marketBarterListingId),
    false,
  );
  assert.equal(JSON.stringify(catalogRead.body).includes(MARKET_SELLER_HUMAN_KEY), false);

  const cropStar = await readResource(baseUrl, "/internal/doorbell/human/codex/action", {
    ...payload,
    crop_id: "wheat",
    action: "star",
    expected_codex_revision: catalogRead.body.codex_revision,
    idempotency_key: "719ffb01-49cd-7020-84af-3d04fb1ed03d",
  });
  assert.equal(cropStar.response.status, 200);
  assert.equal(cropStar.body.data.result.crop_id, "wheat");
  assert.equal(cropStar.body.data.result.starred, true);

  const smelting = await readResource(baseUrl, "/internal/doorbell/human/smelting/action", {
    ...payload,
    material_ids: ["ordinary_stone", "dry_branch", "clay_lump"],
    expected_smelting_revision: catalogRead.body.data.smelting.revision,
    idempotency_key: "819ffb01-49cd-7020-84af-3d04fb1ed03d",
  });
  assert.equal(smelting.response.status, 200);
  assert.equal(smelting.body.data.result.receipt_id, "819ffb01-49cd-7020-84af-3d04fb1ed03d");
  assert.deepEqual(smelting.body.data.result.material_ids, [
    "ordinary_stone",
    "dry_branch",
    "clay_lump",
  ]);
  assert.equal(typeof smelting.body.data.result.crop_name, "string");
  assert.equal(getFarm(FARM_DOORPLATE).materials.ordinary_stone, undefined);

  const kitchenRecycle = await readResource(
    baseUrl,
    "/internal/doorbell/human/kitchen/inventory/action",
    {
      ...payload,
      idempotency_key: "619ffb01-49cd-7020-84af-3d04fb1ed04d",
      expected_kitchen_inventory_revision: kitchenInventoryRevision(
        getFarm(FARM_DOORPLATE),
        NOW,
      ),
      action: "recycle",
      item_kind: "product",
      item_instance_ids: ["route-egg"],
      quantity: 1,
    },
  );
  assert.equal(kitchenRecycle.response.status, 200);
  assert.equal(kitchenRecycle.body.data.result.outcome.kind, "recycle");
  assert.equal(kitchenRecycle.body.data.result.outcome.quantity, 1);

  const unauthenticatedOriginalPlantAction = await fetch(
    `${baseUrl}/internal/doorbell/human/original-plant/action`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const unauthenticatedOriginalPlantActionBody = await unauthenticatedOriginalPlantAction.json();
  assert.equal(unauthenticatedOriginalPlantAction.status, 401);
  assert.equal(unauthenticatedOriginalPlantActionBody.error.code, "authentication_required");

  const originalPlantPayload = {
    farm_human_key: ORIGINAL_PLANT_HUMAN_KEY,
    expected_farm_doorplate: ORIGINAL_PLANT_DOORPLATE,
  };
  const originalPlantRequest = {
    ...originalPlantPayload,
    idempotency_key: "619ffb01-49cd-7020-84af-3d04fb1ed03d",
    expected_revision: originalPlantActionRevision(getFarm(ORIGINAL_PLANT_DOORPLATE), NOW),
    payload: {
      name: "月光番茄",
      latin: "Solanum luna",
      desc: "在月光里慢慢变甜的番茄。",
      plant: "把一颗月光埋进土里。",
      harvest: "月光从果实里流出来了。",
    },
  };
  const originalPlantAction = await readResource(
    baseUrl,
    "/internal/doorbell/human/original-plant/action",
    originalPlantRequest,
  );
  assert.equal(originalPlantAction.response.status, 200);
  assert.equal(originalPlantAction.body.data.result.receipt_id, originalPlantRequest.idempotency_key);
  assert.equal(originalPlantAction.body.data.result.fee, 200);
  assert.equal(originalPlantAction.body.data.result.seeds, 5);
  assert.equal(originalPlantAction.body.data.result.coins_balance, 300);
  assert.equal(originalPlantAction.body.data.result.crop.name, "月光番茄");
  assert.equal(originalPlantAction.body.data.result.crop.category, "ugc");
  assert.match(originalPlantAction.body.revision, /^farm-original-plant-v1:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(originalPlantAction.body).includes(ORIGINAL_PLANT_HUMAN_KEY), false);
  assert.equal(getFarm(ORIGINAL_PLANT_DOORPLATE).coins, 300);

  const originalPlantReplay = await readResource(
    baseUrl,
    "/internal/doorbell/human/original-plant/action",
    originalPlantRequest,
  );
  assert.equal(originalPlantReplay.response.status, 200);
  assert.deepEqual(originalPlantReplay.body, originalPlantAction.body);
  assert.equal(getFarm(ORIGINAL_PLANT_DOORPLATE).coins, 300);

  const poorOriginalPlantRequest = {
    farm_human_key: POOR_ORIGINAL_PLANT_HUMAN_KEY,
    expected_farm_doorplate: POOR_ORIGINAL_PLANT_DOORPLATE,
    idempotency_key: "719ffb01-49cd-7020-84af-3d04fb1ed03d",
    expected_revision: originalPlantActionRevision(getFarm(POOR_ORIGINAL_PLANT_DOORPLATE), NOW),
    payload: originalPlantRequest.payload,
  };
  const poorOriginalPlantAction = await readResource(
    baseUrl,
    "/internal/doorbell/human/original-plant/action",
    poorOriginalPlantRequest,
  );
  assert.equal(poorOriginalPlantAction.response.status, 409);
  assert.equal(poorOriginalPlantAction.body.error.code, "action_rejected");
  assert.equal(getFarm(POOR_ORIGINAL_PLANT_DOORPLATE).coins, 100);

  const settingsAction = await readResource(
    baseUrl,
    "/internal/doorbell/human/settings/action",
    {
      ...payload,
      idempotency_key: "519ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_catalog_revision: catalogRead.body.revision,
      field: "farm_name",
      value: "新的资源测试农场",
    },
  );
  assert.equal(settingsAction.response.status, 200);
  assert.equal(settingsAction.body.data.result.field, "farm_name");
  assert.equal(settingsAction.body.data.resource.farm.farm_name, "新的资源测试农场");
  assert.equal(settingsAction.body.data.resource.settings.farm_name, "新的资源测试农场");
  assert.equal(JSON.stringify(settingsAction.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).name, "新的资源测试农场");

  const kitchenRead = await readResource(baseUrl, PATHS[1], payload);
  const purchase = await readResource(baseUrl, "/internal/doorbell/human/kitchen/purchase", {
    ...payload,
    idempotency_key: "019ffb01-49cd-7020-84af-3d04fb1ed03d",
    expected_shop_revision: kitchenRead.body.shop_revision,
    items: [{ kind: "ingredient", item_id: "salt", quantity: 1 }],
  });
  assert.equal(purchase.response.status, 200);
  assert.equal(purchase.body.data.result.items[0].item_id, "salt");
  assert.equal(purchase.body.data.result.items[0].quantity, 1);
  assert.equal(purchase.body.data.resource.balance.silver.value < 456, true);
  assert.equal(JSON.stringify(purchase.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).ranch.kitchen.ingredients.salt, 1);

  const unauthenticatedRefresh = await fetch(
    `${baseUrl}/internal/doorbell/human/kitchen/shop/refresh`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const unauthenticatedRefreshBody = await unauthenticatedRefresh.json();
  assert.equal(unauthenticatedRefresh.status, 401);
  assert.equal(unauthenticatedRefreshBody.error.code, "authentication_required");

  const refresh = await readResource(
    baseUrl,
    "/internal/doorbell/human/kitchen/shop/refresh",
    {
      ...payload,
      idempotency_key: "029ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_shop_revision: purchase.body.shop_revision,
    },
  );
  assert.equal(refresh.response.status, 200);
  assert.equal(refresh.body.data.result.cost_coins, 100);
  assert.equal(refresh.body.data.result.coins_balance, 23);
  assert.equal(refresh.body.data.result.refresh_used_count, 1);
  assert.equal(refresh.body.data.result.refresh_remaining_count, 9);
  assert.match(refresh.body.shop_revision, /^kitchen-v1:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(refresh.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).coins, 23);

  const refreshError = await readResource(
    baseUrl,
    "/internal/doorbell/human/kitchen/shop/refresh",
    {
      ...payload,
      idempotency_key: "039ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_shop_revision: refresh.body.shop_revision,
    },
  );
  assert.equal(refreshError.response.status, 409);
  assert.equal(refreshError.body.error.code, "insufficient_coins");
  assert.equal(getFarm(FARM_DOORPLATE).coins, 23);

  const unauthenticatedCook = await fetch(
    `${baseUrl}/internal/doorbell/human/kitchen/cook`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const unauthenticatedCookBody = await unauthenticatedCook.json();
  assert.equal(unauthenticatedCook.status, 401);
  assert.equal(unauthenticatedCookBody.error.code, "authentication_required");

  const kitchenCook = await readResource(baseUrl, "/internal/doorbell/human/kitchen/cook", {
    ...payload,
    idempotency_key: "b19ffb01-49cd-7020-84af-3d04fb1ed03d",
    expected_kitchen_inventory_revision: kitchenCookRevision(getFarm(FARM_DOORPLATE), NOW),
    items: ["route-cook-egg", "salt"],
  });
  assert.equal(kitchenCook.response.status, 200);
  assert.equal(kitchenCook.body.data.result.receipt_id, "b19ffb01-49cd-7020-84af-3d04fb1ed03d");
  assert.equal(kitchenCook.body.data.result.outcome.kind, "cook");
  assert.equal(kitchenCook.body.data.result.outcome.recipe_id, "fried_egg");
  assert.deepEqual(kitchenCook.body.data.result.outcome.item_refs, ["route-cook-egg", "salt"]);
  assert.equal(JSON.stringify(kitchenCook.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).ranch.kitchen.products.length, 0);
  assert.equal(getFarm(FARM_DOORPLATE).ranch.kitchen.ingredients.salt, undefined);

  const recipeFarm = getFarm(FARM_DOORPLATE);
  recipeFarm.ranch.kitchen.products = [
    { id: "route-known-egg", itemId: "chicken_egg", value: 30, createdAt: NOW },
  ];
  recipeFarm.ranch.kitchen.ingredients = { salt: 1 };
  recipeFarm.ranch.kitchen.knownRecipes = ["fried_egg"];
  const knownRecipeCook = await readResource(baseUrl, "/internal/doorbell/human/kitchen/cook", {
    ...payload,
    idempotency_key: "c19ffb01-49cd-7020-84af-3d04fb1ed03d",
    expected_kitchen_inventory_revision: kitchenCookRevision(recipeFarm, NOW),
    recipe_id: "fried_egg",
  });
  assert.equal(knownRecipeCook.response.status, 200);
  assert.equal(knownRecipeCook.body.data.result.outcome.recipe_id, "fried_egg");
  assert.deepEqual(knownRecipeCook.body.data.result.outcome.item_refs, ["route-known-egg", "salt"]);

  const ranchRead = await readResource(baseUrl, PATHS[2], payload);
  const ranchCollection = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      idempotency_key: "619ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
    },
  );
  assert.equal(ranchCollection.response.status, 409);
  assert.equal(ranchCollection.body.error.code, "no_collectable");

  const ranchCollectionInvalidUuid = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      idempotency_key: "not-a-uuid",
      expected_revision: ranchRead.body.revision,
    },
  );
  assert.equal(ranchCollectionInvalidUuid.response.status, 400);
  assert.equal(ranchCollectionInvalidUuid.body.error.code, "invalid_request");

  const ranchCollectionExtraField = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      idempotency_key: "719ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
      items: [],
    },
  );
  assert.equal(ranchCollectionExtraField.response.status, 400);
  assert.equal(ranchCollectionExtraField.body.error.code, "invalid_request");

  const ranchCollectionSpoofedBinding = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      farm_human_key: "spoofed-human-key",
      idempotency_key: "819ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
    },
  );
  assert.equal(ranchCollectionSpoofedBinding.response.status, 404);
  assert.equal(ranchCollectionSpoofedBinding.body.error.code, "farm_credential_not_found");

  const ranchAction = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/resident-action",
    {
      ...payload,
      idempotency_key: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
      action: "rename",
      resident_type: "animal",
      kind_id: "chicken",
      payload: { name: "小太阳" },
    },
  );
  assert.equal(ranchAction.response.status, 200);
  assert.equal(ranchAction.body.data.result.action, "rename");
  assert.equal(ranchAction.body.data.result.kind_id, "chicken");
  assert.equal(JSON.stringify(ranchAction.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).ranch.animals[0].name, "小太阳");

  const unauthenticatedDecorationAction = await fetch(
    `${baseUrl}/internal/doorbell/human/ranch/decoration-action`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const unauthenticatedDecorationActionBody = await unauthenticatedDecorationAction.json();
  assert.equal(unauthenticatedDecorationAction.status, 401);
  assert.equal(unauthenticatedDecorationActionBody.error.code, "authentication_required");

  const decorationPlace = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/decoration-action",
    {
      ...payload,
      idempotency_key: "219ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchAction.body.revision,
      action: "place",
      decoration_id: "flowerbed",
    },
  );
  assert.equal(decorationPlace.response.status, 200);
  assert.equal(decorationPlace.body.data.result.action, "place");
  assert.equal(decorationPlace.body.data.result.decoration_id, "flowerbed");
  assert.equal(decorationPlace.body.data.result.outcome.kind, "place");
  assert.equal(decorationPlace.body.data.result.outcome.decoration_id, "flowerbed");
  assert.equal(decorationPlace.body.data.resource.farm.farm_doorplate, FARM_DOORPLATE);
  assert.equal(JSON.stringify(decorationPlace.body).includes(FARM_HUMAN_KEY), false);
  assert.deepEqual(getFarm(FARM_DOORPLATE).ranch.decor, ["flowerbed"]);
  assert.deepEqual(getFarm(FARM_DOORPLATE).ranch.decorStore, []);

  const decorationUnplace = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/decoration-action",
    {
      ...payload,
      idempotency_key: "319ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: decorationPlace.body.revision,
      action: "unplace",
      decoration_id: "flowerbed",
    },
  );
  assert.equal(decorationUnplace.response.status, 200);
  assert.equal(decorationUnplace.body.data.result.action, "unplace");
  assert.equal(decorationUnplace.body.data.result.decoration_id, "flowerbed");
  assert.equal(decorationUnplace.body.data.result.outcome.kind, "unplace");
  assert.deepEqual(getFarm(FARM_DOORPLATE).ranch.decor, []);
  assert.deepEqual(getFarm(FARM_DOORPLATE).ranch.decorStore, ["flowerbed"]);

  const ranchInteraction = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/interaction/action",
    {
      ...payload,
      idempotency_key: "419ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: decorationUnplace.body.revision,
      action: "remit",
      amount: 5,
    },
  );
  assert.equal(ranchInteraction.response.status, 200);
  assert.equal(ranchInteraction.body.data.result.action, "remit");
  assert.equal(ranchInteraction.body.data.result.outcome.amount, 5);
  assert.equal(ranchInteraction.body.data.resource.farm.farm_doorplate, FARM_DOORPLATE);
  assert.equal(JSON.stringify(ranchInteraction.body).includes(FARM_HUMAN_KEY), false);

  const expedition = await readResource(
    baseUrl,
    "/internal/doorbell/human/expedition/action",
    {
      ...payload,
      idempotency_key: "819ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: expeditionActionRevision(getFarm(FARM_DOORPLATE), NOW),
      action: "charm",
      payload: { kind: "check", blessing: "平安回来。" },
    },
  );
  assert.equal(expedition.response.status, 200);
  assert.equal(expedition.body.data.result.action, "charm");
  assert.equal(expedition.body.data.resource.farm.farm_doorplate, FARM_DOORPLATE);
  assert.equal(JSON.stringify(expedition.body).includes(FARM_HUMAN_KEY), false);

  const marketBrowse = await readResource(
    baseUrl,
    "/internal/doorbell/human/market/action",
    {
      ...payload,
      idempotency_key: "919ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: marketActionRevision(getFarm(FARM_DOORPLATE), NOW),
      action: "browse",
    },
  );
  assert.equal(marketBrowse.response.status, 200);
  assert.equal(marketBrowse.body.data.result.action, "browse");
  assert.equal(marketBrowse.body.data.resource.farm.farm_doorplate, FARM_DOORPLATE);
  assert.equal(JSON.stringify(marketBrowse.body).includes(FARM_HUMAN_KEY), false);

  const marketBuy = await readResource(
    baseUrl,
    "/internal/doorbell/human/market/action",
    {
      farm_human_key: MARKET_BUYER_HUMAN_KEY,
      expected_farm_doorplate: MARKET_BUYER_DOORPLATE,
      idempotency_key: "b19ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: marketActionRevision(getFarm(MARKET_BUYER_DOORPLATE), NOW),
      action: "buy",
      seller_doorplate: MARKET_SELLER_DOORPLATE,
      kind: "material",
      item_id: "ordinary_stone",
      qty: 1,
    },
  );
  assert.equal(marketBuy.response.status, 200);
  assert.equal(marketBuy.body.data.result.action, "buy");
  assert.equal(marketBuy.body.data.result.outcome.seller_doorplate, MARKET_SELLER_DOORPLATE);
  assert.equal(getFarm(MARKET_SELLER_DOORPLATE).market.length, 0);
  assert.equal(getFarm(MARKET_BUYER_DOORPLATE).materials.ordinary_stone, 1);
  assert.equal(JSON.stringify(marketBuy.body).includes(MARKET_BUYER_HUMAN_KEY), false);
  assert.equal(JSON.stringify(marketBuy.body).includes(MARKET_SELLER_HUMAN_KEY), false);

  const marketBarterAccept = await readResource(
    baseUrl,
    "/internal/doorbell/human/market/action",
    {
      farm_human_key: MARKET_BUYER_HUMAN_KEY,
      expected_farm_doorplate: MARKET_BUYER_DOORPLATE,
      idempotency_key: "c19ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: marketActionRevision(getFarm(MARKET_BUYER_DOORPLATE), NOW),
      action: "barter-accept",
      seller_doorplate: MARKET_SELLER_DOORPLATE,
      listing_id: marketBarterListingId,
    },
  );
  assert.equal(marketBarterAccept.response.status, 200);
  assert.equal(marketBarterAccept.body.data.result.action, "barter-accept");
  assert.equal(marketBarterAccept.body.data.result.outcome.listing_id, marketBarterListingId);
  assert.equal(getFarm(MARKET_SELLER_DOORPLATE).humanBarters.length, 0);
  assert.equal(getFarm(MARKET_BUYER_DOORPLATE).materials.ordinary_stone, 2);
  assert.equal(getFarm(MARKET_SELLER_DOORPLATE).materials.dry_branch, 1);
  assert.equal(JSON.stringify(marketBarterAccept.body).includes(MARKET_BUYER_HUMAN_KEY), false);
  assert.equal(JSON.stringify(marketBarterAccept.body).includes(MARKET_SELLER_HUMAN_KEY), false);

  const neighborhoodMessage = await readResource(
    baseUrl,
    "/internal/doorbell/human/neighborhood/message/action",
    {
      ...payload,
      target_farm_doorplate: NEIGHBOR_DOORPLATE,
      message: "来看看你家的花。",
      expected_neighborhood_revision: neighborhoodMessageActionRevision(
        getFarm(FARM_DOORPLATE),
        NOW,
      ),
      idempotency_key: "a19ffb01-49cd-7020-84af-3d04fb1ed03d",
    },
  );
  assert.equal(neighborhoodMessage.response.status, 200);
  assert.equal(neighborhoodMessage.body.data.result.target_farm_doorplate, NEIGHBOR_DOORPLATE);
  assert.equal(neighborhoodMessage.body.data.resource.messages[0].text, "来看看你家的花。");
  assert.equal(JSON.stringify(neighborhoodMessage.body).includes(FARM_HUMAN_KEY), false);

  const decorationReplay = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/decoration-action",
    {
      ...payload,
      idempotency_key: "319ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: decorationPlace.body.revision,
      action: "unplace",
      decoration_id: "flowerbed",
    },
  );
  assert.equal(decorationReplay.response.status, 200);
  assert.deepEqual(decorationReplay.body, decorationUnplace.body);
  assert.deepEqual(getFarm(FARM_DOORPLATE).ranch.decor, []);
  assert.deepEqual(getFarm(FARM_DOORPLATE).ranch.decorStore, ["flowerbed"]);

  const extraField = await readResource(baseUrl, PATHS[0], {
    ...payload,
    farm_doorplate: "DEF567",
  });
  assert.equal(extraField.response.status, 400);
  assert.equal(extraField.body.error.code, "invalid_request");

  const wrongBinding = await readResource(baseUrl, PATHS[1], {
    ...payload,
    expected_farm_doorplate: "DEF567",
  });
  assert.equal(wrongBinding.response.status, 409);
  assert.equal(wrongBinding.body.error.code, "farm_doorplate_mismatch");

  const missingCredential = await readResource(baseUrl, PATHS[2], {
    ...payload,
    farm_human_key: "missing-resource-human-key",
  });
  assert.equal(missingCredential.response.status, 404);
  assert.equal(missingCredential.body.error.code, "farm_credential_not_found");
  assert.equal(JSON.stringify(missingCredential.body).includes("missing-resource-human-key"), false);
});

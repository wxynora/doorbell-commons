import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-chef-kitchen-benefit-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "chef-kitchen-benefit-service-token";

const NOW = Date.parse("2026-08-28T04:00:00.000Z");
const MIGRATION_ID = "migration-chef-benefit";
const RESIDENT_ID = "019ffb01-49cd-7020-84af-3d04fb1ed03d";

const { currentDayIndex } = await import("../dist/time.js");
const { cookingIngredientById } = await import("../dist/content.js");
const { ensureKitchen, ensureRanch, kitchenBuy, kitchenView } = await import("../dist/engine.js");
const { kitchenIngredientDailyBuyLimit } = await import("../dist/domain/kitchen/shop.js");
const { makeFarm } = await import("../dist/game.js");
const { insertFarm, getFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");
const {
  openLingyeWorldDatabase,
  registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const {
  farmCareerQualificationLevel,
  farmKitchenCareerBenefits,
} = await import("../dist/career/farm-benefits.js");
const { projectHumanKitchen } = await import("../dist/server/kitchen-structured.js");
const {
  handleHumanKitchenPurchase,
  kitchenPurchaseRevision,
} = await import("../dist/server/kitchen-purchase-action.js");

const SALT = cookingIngredientById.get("salt");
assert.ok(SALT);

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function makeKitchenFarm(id, migrationId = MIGRATION_ID) {
  const farm = makeFarm("料理师增益测试农场", 123456);
  farm.id = id;
  farm.humanKey = `human-${id}`;
  farm.silver = 100_000;
  if (migrationId) farm.doorbellMcpMigration = { migrationId };
  ensureRanch(farm);
  const kitchen = ensureKitchen(farm);
  kitchen.products = [];
  kitchen.ingredients = {};
  kitchen.dishes = [];
  kitchen.knownRecipes = [];
  kitchen.shop = {
    day: currentDayIndex(NOW),
    ingredientIds: [],
    recipeIds: [],
    bought: {},
  };
  return farm;
}

function activateChefCertificate(database, status = "active") {
  registerLingyeResidentReference(database, {
    residentId: RESIDENT_ID,
    bindingReference: MIGRATION_ID,
    registeredAt: NOW - 1_000,
  });
  database.prepare(`
    INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
    VALUES (?, 'chef', 1, ?)
  `).run(RESIDENT_ID, NOW - 900);
  database.prepare(`
    INSERT INTO career_certificates (
      resident_id, career, qualification_level, status,
      source_attempt_id, issued_at, effective_at
    ) VALUES (?, 'chef', 1, ?, 'attempt-chef-benefit', ?, ?)
  `).run(RESIDENT_ID, status, NOW - 800, status === "active" ? NOW - 700 : null);
}

test("only an active chef certificate on the migrated resident grants the kitchen benefit", () => {
  const database = openLingyeWorldDatabase(":memory:");
  const farm = makeKitchenFarm("ABC234");
  assert.equal(farmCareerQualificationLevel(database, farm, "chef"), 0);
  assert.deepEqual(farmKitchenCareerBenefits(database, farm), {
    chefQualificationLevel: 0,
    ingredientDailyBuyMultiplier: 1,
  });

  activateChefCertificate(database, "pending_review_configuration");
  assert.equal(farmCareerQualificationLevel(database, farm, "chef"), 0);
  database.prepare(`
    UPDATE career_certificates SET status = 'active', effective_at = ?
    WHERE resident_id = ? AND career = 'chef' AND qualification_level = 1
  `).run(NOW, RESIDENT_ID);
  assert.deepEqual(farmKitchenCareerBenefits(database, farm), {
    chefQualificationLevel: 1,
    ingredientDailyBuyMultiplier: 2,
  });

  assert.equal(farmCareerQualificationLevel(database, makeKitchenFarm("BCD345", null), "chef"), 0);
  database.close();
});

test("the original kitchen authority allows exactly twice the normal ingredient limit", () => {
  const database = openLingyeWorldDatabase(":memory:");
  activateChefCertificate(database);
  const benefits = farmKitchenCareerBenefits(database, makeKitchenFarm("CDE456"));
  const normalLimit = kitchenIngredientDailyBuyLimit(SALT);

  const normalFarm = makeKitchenFarm("DEF567");
  const normal = kitchenBuy(normalFarm, "ingredient", SALT.id, normalLimit + 1, NOW);
  assert.equal(normal.ok, false);

  const chefFarm = makeKitchenFarm("EFG678");
  const doubled = kitchenBuy(chefFarm, "ingredient", SALT.id, normalLimit * 2, NOW, benefits);
  assert.equal(doubled.ok, true);
  assert.equal(chefFarm.ranch.kitchen.ingredients[SALT.id], normalLimit * 2);
  const overLimit = kitchenBuy(chefFarm, "ingredient", SALT.id, 1, NOW, benefits);
  assert.equal(overLimit.ok, false);
  assert.match(overLimit.error, new RegExp(`每天最多买 ${normalLimit * 2} 份`));
  database.close();
});

test("agent and Human projections expose the same doubled daily limit", () => {
  const database = openLingyeWorldDatabase(":memory:");
  activateChefCertificate(database);
  const farm = makeKitchenFarm("FGH789");
  const benefits = farmKitchenCareerBenefits(database, farm);
  const normalLimit = kitchenIngredientDailyBuyLimit(SALT);

  const agentSalt = kitchenView(farm, NOW, benefits).ingredients.find((item) => item.id === SALT.id);
  const humanSalt = projectHumanKitchen(farm, NOW, benefits).data.daily_shop.ingredients
    .find((item) => item.ingredient_id === SALT.id);
  assert.equal(agentSalt.dailyBuyLimit, normalLimit * 2);
  assert.equal(humanSalt.daily_buy_limit, normalLimit * 2);
  database.close();
});

test("Human cart can use the chef limit and replay without another debit", () => {
  const database = openLingyeWorldDatabase(":memory:");
  activateChefCertificate(database);
  const farm = makeKitchenFarm("GHJ234");
  insertFarm(farm);
  const saved = getFarm(farm.id);
  const benefits = farmKitchenCareerBenefits(database, saved);
  const normalLimit = kitchenIngredientDailyBuyLimit(SALT);
  const quantity = normalLimit + 1;
  const key = "029ffb01-49cd-7020-84af-3d04fb1ed03d";
  const body = {
    farm_human_key: saved.humanKey,
    expected_farm_doorplate: saved.id,
    idempotency_key: key,
    expected_shop_revision: kitchenPurchaseRevision(saved, NOW, benefits),
    items: [{ kind: "ingredient", item_id: SALT.id, quantity }],
  };

  const first = handleHumanKitchenPurchase(saved, body, NOW, benefits);
  assert.equal(first.status, 200);
  const silverAfterFirst = getFarm(saved.id).silver;
  const replay = handleHumanKitchenPurchase(getFarm(saved.id), body, NOW, benefits);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.equal(getFarm(saved.id).silver, silverAfterFirst);
  assert.equal(first.json.data.resource.daily_shop.ingredients
    .find((item) => item.ingredient_id === SALT.id).daily_buy_limit, normalLimit * 2);
  database.close();
});

test("the Doorbell Human kitchen route derives the chef limit from the server-side binding", async (t) => {
  const originalDateNow = Date.now;
  Date.now = () => NOW;
  t.after(() => {
    Date.now = originalDateNow;
  });
  const database = openLingyeWorldDatabase();
  activateChefCertificate(database);
  database.close();

  const farm = makeKitchenFarm("HJK345");
  insertFarm(farm);
  const server = startServer(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/internal/doorbell/human/kitchen/read`, {
    method: "POST",
    headers: {
      authorization: "Bearer chef-kitchen-benefit-service-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      farm_human_key: farm.humanKey,
      expected_farm_doorplate: farm.id,
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.daily_shop.ingredients
    .find((item) => item.ingredient_id === SALT.id).daily_buy_limit,
  kitchenIngredientDailyBuyLimit(SALT) * 2);
  assert.equal(JSON.stringify(body).includes(MIGRATION_ID), false);

  const quantity = kitchenIngredientDailyBuyLimit(SALT) + 1;
  const farmAction = await fetch(`http://127.0.0.1:${address.port}/farms/${farm.id}/kitchen`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: farm.token,
      op: "buy",
      kind: "ingredient",
      id: SALT.id,
      qty: quantity,
    }),
  });
  assert.equal(farmAction.status, 200);
  assert.equal(getFarm(farm.id).ranch.kitchen.ingredients[SALT.id], quantity);

  const kitchenViewAction = await fetch(`http://127.0.0.1:${address.port}/farms/${farm.id}/kitchen`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: farm.token, op: "view" }),
  });
  assert.equal(kitchenViewAction.status, 200);
  assert.match((await kitchenViewAction.json()).text, /料理台/u);

  const humanPage = await fetch(`http://127.0.0.1:${address.port}/ui/${farm.humanKey}/cooking`);
  assert.equal(humanPage.status, 200);
  assert.match(await humanPage.text(), new RegExp(`今日 ${quantity}/${kitchenIngredientDailyBuyLimit(SALT) * 2}`));
});

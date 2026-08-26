import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-kitchen-shop-refresh-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const NEXT_DAY = NOW + 24 * 60 * 60 * 1000;
const FARM_HUMAN_KEY = "private-kitchen-shop-refresh-human-key";

const { currentDayIndex } = await import("../dist/time.js");
const { ensureKitchen, ensureRanch, refreshKitchenShop } = await import("../dist/engine.js");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { projectHumanKitchen } = await import("../dist/server/kitchen-structured.js");
const {
  handleHumanKitchenShopRefresh,
  kitchenShopRefreshRevision,
} = await import("../dist/server/kitchen-shop-refresh-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234", coins = 5_000) {
  const farm = makeFarm("料理食材刷新测试农场", 123456);
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.coins = coins;
  farm.silver = 500;
  farm.rngState = 987654;
  const ranch = ensureRanch(farm);
  const kitchen = ensureKitchen(farm);
  ranch.coins = 321;
  kitchen.products = [];
  kitchen.ingredients = { salt: 2, tea: 1 };
  kitchen.dishes = [];
  kitchen.knownRecipes = [];
  kitchen.shop = {
    day: currentDayIndex(NOW),
    ingredientIds: ["onion", "potato", "corn", "carrot", "tomato", "basil"],
    recipeIds: ["fried_egg", "honey_tea"],
    bought: { "ingredient:salt": 2, "ingredient:onion": 1 },
  };
  insertFarm(farm);
  return getFarm(id);
}

function refreshBody(farm, revision, key) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_shop_revision: revision,
  };
}

function revision(farm, now = NOW) {
  return kitchenShopRefreshRevision(farm, now);
}

test("the first refresh charges 100 farm coins and only rerolls ingredients", () => {
  const farm = addFarm();
  const day = currentDayIndex(NOW);
  const key = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
  const expected = revision(farm);
  const recipeIds = structuredClone(farm.ranch.kitchen.shop.recipeIds);
  const bought = structuredClone(farm.ranch.kitchen.shop.bought);
  const ingredientIds = structuredClone(farm.ranch.kitchen.shop.ingredientIds);
  const beforeRng = farm.rngState;

  const result = handleHumanKitchenShopRefresh(farm, refreshBody(farm, expected, key), NOW);

  assert.equal(result.status, 200);
  assert.deepEqual(result.json.data.result, {
    receipt_id: key,
    cost_coins: 100,
    coins_balance: 4_900,
    refresh_window_id: day,
    refresh_used_count: 1,
    refresh_remaining_count: 9,
    refresh_limit: 10,
    next_cost_coins: 200,
    can_refresh: true,
  });
  assert.equal(result.json.shop_revision, revision(getFarm(farm.id)));
  assert.equal(result.json.data.resource.daily_shop.refresh_window_id, day);
  assert.equal(result.json.data.resource.daily_shop.refresh_used_count, 1);
  assert.equal(result.json.data.resource.daily_shop.refresh_remaining_count, 9);
  assert.equal(result.json.data.resource.daily_shop.next_cost_coins, 200);

  const saved = getFarm(farm.id);
  assert.equal(saved.coins, 4_900);
  assert.notDeepEqual(saved.ranch.kitchen.shop.ingredientIds, ingredientIds);
  assert.deepEqual(saved.ranch.kitchen.shop.recipeIds, recipeIds);
  assert.deepEqual(saved.ranch.kitchen.shop.bought, bought);
  assert.notEqual(saved.rngState, beforeRng);
  assert.deepEqual(saved.ranch.kitchen.ingredients, { salt: 2, tea: 1 });
});

test("successful refreshes use the 100-to-1000 ladder, then stop at ten", () => {
  const farm = addFarm("BCDFGH", 5_500);
  let currentRevision = revision(farm);
  let last;
  for (let index = 1; index <= 10; index += 1) {
    const key = `${String(index).padStart(2, "0")}9ffb01-49cd-7020-84af-3d04fb1ed03d`;
    last = handleHumanKitchenShopRefresh(
      getFarm(farm.id),
      refreshBody(getFarm(farm.id), currentRevision, key),
      NOW,
    );
    assert.equal(last.status, 200);
    assert.equal(last.json.data.result.cost_coins, index * 100);
    assert.equal(last.json.data.result.coins_balance, 5_500 - (index * (index + 1) * 100) / 2);
    assert.equal(last.json.data.result.refresh_used_count, index);
    assert.equal(last.json.data.result.refresh_remaining_count, 10 - index);
    assert.equal(last.json.data.result.next_cost_coins, Math.min((index + 1) * 100, 1_000));
    assert.equal(last.json.data.result.can_refresh, index < 10);
    currentRevision = last.json.shop_revision;
  }

  const beforeExhausted = structuredClone(getFarm(farm.id));
  const exhausted = handleHumanKitchenShopRefresh(
    getFarm(farm.id),
    refreshBody(getFarm(farm.id), currentRevision, "119ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(exhausted.status, 409);
  assert.equal(exhausted.json.error.code, "refresh_exhausted");
  assert.deepEqual(getFarm(farm.id), beforeExhausted);
  assert.equal(last.json.data.result.refresh_limit, 10);
});

test("insufficient coins, stale revision, and invalid requests are zero-change", () => {
  const poorFarm = addFarm("DEF567", 99);
  const poorBefore = structuredClone(poorFarm);
  const poor = handleHumanKitchenShopRefresh(
    poorFarm,
    refreshBody(poorFarm, revision(poorFarm), "219ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(poor.status, 409);
  assert.equal(poor.json.error.code, "insufficient_coins");
  assert.deepEqual(getFarm(poorFarm.id), poorBefore);
  assert.equal(Object.hasOwn(getFarm(poorFarm.id).doorbellHumanKitchenShopRefreshReceipts ?? {}, "219ffb01-49cd-7020-84af-3d04fb1ed03d"), false);

  const staleFarm = addFarm("GHJ789");
  const staleRevision = revision(staleFarm);
  staleFarm.silver += 1;
  const staleBefore = structuredClone(staleFarm);
  const stale = handleHumanKitchenShopRefresh(
    staleFarm,
    refreshBody(staleFarm, staleRevision, "319ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(staleFarm.id), staleBefore);

  const invalidFarm = addFarm("KMPQRS");
  const invalid = handleHumanKitchenShopRefresh(
    invalidFarm,
    { ...refreshBody(invalidFarm, revision(invalidFarm), "419ffb01-49cd-7020-84af-3d04fb1ed03d"), extra: true },
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(invalidFarm.id).ranch.kitchen.shop.bought, {
    "ingredient:salt": 2,
    "ingredient:onion": 1,
  });

  const malformedRevision = handleHumanKitchenShopRefresh(
    invalidFarm,
    { ...refreshBody(invalidFarm, `kitchen-v1:${"A".repeat(64)}`, "429ffb01-49cd-7020-84af-3d04fb1ed03d") },
    NOW,
  );
  assert.equal(malformedRevision.status, 400);
  assert.equal(malformedRevision.json.error.code, "invalid_request");
});

test("same idempotency payload replays, a different payload conflicts, and replay does not consume a refresh", () => {
  const farm = addFarm("MNPQRS");
  const key = "519ffb01-49cd-7020-84af-3d04fb1ed03d";
  const body = refreshBody(farm, revision(farm), key);
  const first = handleHumanKitchenShopRefresh(farm, body, NOW);
  assert.equal(first.status, 200);
  const savedAfterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanKitchenShopRefresh(getFarm(farm.id), body, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);

  const conflict = handleHumanKitchenShopRefresh(
    getFarm(farm.id),
    refreshBody(getFarm(farm.id), first.json.shop_revision, key),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
});

test("the refresh count resets with the next Beijing day", () => {
  const farm = addFarm("TUV234", 5_000);
  const first = handleHumanKitchenShopRefresh(
    farm,
    refreshBody(farm, revision(farm), "619ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(first.status, 200);

  refreshKitchenShop(getFarm(farm.id), NEXT_DAY);
  const nextDayFarm = getFarm(farm.id);
  const nextDay = currentDayIndex(NEXT_DAY);
  const next = handleHumanKitchenShopRefresh(
    nextDayFarm,
    refreshBody(nextDayFarm, revision(nextDayFarm, NEXT_DAY), "719ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NEXT_DAY,
  );
  assert.equal(next.status, 200);
  assert.equal(next.json.data.result.cost_coins, 100);
  assert.equal(next.json.data.result.refresh_window_id, nextDay);
  assert.equal(next.json.data.result.refresh_used_count, 1);
  assert.equal(nextDayFarm.ranch.kitchen.shop.recipeIds.length, 2);
});

test("the structured projection exposes an honest refresh state without writing", () => {
  const farm = addFarm("WXYZ23");
  const before = structuredClone(farm);
  const projected = projectHumanKitchen(farm, NOW);
  assert.deepEqual(farm, before);
  assert.equal(projected.data.daily_shop.refresh_window_id, currentDayIndex(NOW));
  assert.equal(projected.data.daily_shop.refresh_used_count, 0);
  assert.equal(projected.data.daily_shop.refresh_remaining_count, 10);
  assert.equal(projected.data.daily_shop.refresh_limit, 10);
  assert.equal(projected.data.daily_shop.next_cost_coins, 100);
  assert.equal(projected.data.daily_shop.can_refresh, true);
  assert.equal(projected.data.daily_shop.refresh_reset_at, "2026-08-24T16:00:00.000Z");
});

test("an invalid authoritative farm coin balance is rejected before refresh or save", () => {
  for (const [id, coins, key] of [
    ["YZ2345", -1, "829ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["234567", 1.5, "929ffb01-49cd-7020-84af-3d04fb1ed03d"],
  ]) {
    const farm = addFarm(id, coins);
    const before = structuredClone(farm);
    const result = handleHumanKitchenShopRefresh(
      farm,
      refreshBody(farm, revision(farm), key),
      NOW,
    );
    assert.equal(result.status, 503);
    assert.equal(result.json.error.code, "farm_unavailable");
    assert.match(result.json.error.message, /coins balance is invalid/);
    assert.deepEqual(getFarm(farm.id), before);
    assert.equal(Object.hasOwn(getFarm(farm.id).doorbellHumanKitchenShopRefreshReceipts ?? {}, key), false);
  }
});

test("a clone or save failure leaves the farm and refresh receipt ledger untouched", () => {
  const farm = addFarm("345678");
  const circular = {};
  circular.self = circular;
  farm.doorbellHumanKitchenShopRefreshReceipts = { old: circular };
  const beforeCoins = farm.coins;
  const beforeIngredients = structuredClone(farm.ranch.kitchen.ingredients);
  const result = handleHumanKitchenShopRefresh(
    farm,
    refreshBody(farm, revision(farm), "A29ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );

  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "farm_unavailable");
  assert.equal(getFarm(farm.id), farm);
  assert.equal(getFarm(farm.id).coins, beforeCoins);
  assert.deepEqual(getFarm(farm.id).ranch.kitchen.ingredients, beforeIngredients);
  assert.equal(
    Object.hasOwn(
      getFarm(farm.id).doorbellHumanKitchenShopRefreshReceipts,
      "A29ffb01-49cd-7020-84af-3d04fb1ed03d",
    ),
    false,
  );
  delete farm.doorbellHumanKitchenShopRefreshReceipts;
});

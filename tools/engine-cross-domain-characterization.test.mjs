import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-engine-cross-domain-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const { makeFarm } = await import("../dist/game.js");
const {
  bribeGuardDog,
  ensureKitchen,
  ensureRanch,
  plantBatch,
  refreshShop,
  steal,
  tryWaterReward,
  visitorWater,
} = await import("../dist/engine.js");
const { currentDayIndex } = await import("../dist/time.js");

const NOW = Date.parse("2026-08-26T12:00:00+08:00");

function farm(name, id, seed = 1) {
  const value = makeFarm(name, seed, { aiName: `${name}小机`, humanName: `${name}主人` });
  value.id = id;
  value.lastTickAt = NOW;
  return value;
}

function ripeCommon(plot) {
  plot.crop = {
    seedType: "common",
    growTicks: 6,
    progress: 6,
    ripe: true,
    waterCount: 0,
  };
}

function guardEncounter(suffix) {
  const victim = farm(`守田${suffix}`, `VICTIM-${suffix}`, 7);
  const thief = farm(`访客${suffix}`, `THIEF-${suffix}`, 99);
  ensureRanch(victim).pets.push({ kindId: "dog", name: `旺财${suffix}` });
  ripeCommon(victim.plots[0]);

  const blocked = steal(victim, 1, thief.id, NOW, thief);
  return { blocked, thief, victim };
}

test("guard-dog theft advances the victim RNG and records one resumable pending guard", () => {
  const { blocked, thief, victim } = guardEncounter("RNG");
  const kitchen = ensureKitchen(thief);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.guardBlocked, true);
  assert.equal(blocked.dogName, "旺财RNG");
  assert.match(blocked.error, /旺财RNG就冲出来狂吠/);
  assert.equal(victim.rngState, 1_831_565_820);
  assert.deepEqual(kitchen.pendingGuard, {
    victimId: victim.id,
    plotId: 1,
    by: thief.id,
    at: NOW,
  });
  assert.deepEqual(thief.stealQuota, {
    day: currentDayIndex(NOW),
    n: 1,
    lastAt: NOW,
  });
  assert.equal(victim.stealCooldowns[thief.id], NOW);
  assert.notEqual(victim.plots[0].crop, null);
  assert.match(victim.log.at(-1), /旺财RNG一通狂吠吓跑了/);
  assert.deepEqual(victim.trail.at(-1), {
    t: NOW,
    kind: "foiled",
    by: thief.name,
    plotId: 1,
  });
});

test("guard bribe keeps the selected dish on failed continuation and consumes it only after success", () => {
  const failed = guardEncounter("失败");
  const failedKitchen = ensureKitchen(failed.thief);
  failedKitchen.dishes.push(
    { id: "dish-spare", recipeId: "fried_egg", name: "备用煎蛋" },
    { id: "dish-selected", recipeId: "honey_tea", name: "蜂蜜茶" },
  );
  failed.victim.plots[0].crop = null;

  const failedBribe = bribeGuardDog(failed.thief, failed.victim, "dish-selected", NOW);

  assert.equal(failedBribe.ok, false);
  assert.equal(failedBribe.dishKept, true);
  assert.match(failedBribe.error, /1 号地没有作物/);
  assert.deepEqual(failedKitchen.dishes.map((dish) => dish.id), ["dish-spare", "dish-selected"]);
  assert.equal(failedKitchen.pendingGuard, undefined);
  assert.equal(failed.thief.stealQuota.n, 1);
  assert.equal(failed.victim.stealCooldowns[failed.thief.id], NOW);

  const succeeded = guardEncounter("成功");
  const succeededKitchen = ensureKitchen(succeeded.thief);
  succeededKitchen.dishes.push(
    { id: "dish-spare", recipeId: "fried_egg", name: "备用煎蛋" },
    { id: "dish-selected", recipeId: "honey_tea", name: "蜂蜜茶" },
  );

  const successfulBribe = bribeGuardDog(succeeded.thief, succeeded.victim, "蜂蜜茶", NOW);

  assert.equal(successfulBribe.ok, true);
  assert.equal(successfulBribe.bribed, true);
  assert.equal(successfulBribe.dishName, "蜂蜜茶");
  assert.deepEqual(succeededKitchen.dishes.map((dish) => dish.id), ["dish-spare"]);
  assert.equal(succeededKitchen.pendingGuard, undefined);
  assert.equal(succeeded.victim.plots[0].crop, null);
  assert.equal(succeeded.thief.stealQuota.n, 1);
  assert.equal(succeeded.victim.stealCooldowns[succeeded.thief.id], NOW);
  assert.ok(succeeded.victim.stealShieldUntil > NOW);
});

test("visitor watering mutates the target while the one-bottle reward belongs to the visitor", () => {
  const target = farm("被浇农场", "TARGET-WATER", 21);
  const visitor = farm("浇水访客", "VISITOR-WATER", 22);
  target.plots[0].crop = {
    seedType: "common",
    growTicks: 6,
    progress: 4,
    ripe: false,
    waterCount: 0,
  };
  const targetPotionBefore = target.items.speed_potion;
  const visitorPotionBefore = visitor.items.speed_potion;

  const watered = visitorWater(target, visitor.id, undefined, visitor.name, NOW);
  const rewarded = watered.ok ? tryWaterReward(target, visitor, NOW) : false;

  assert.deepEqual(watered, { ok: true, plotId: 1, ripened: false });
  assert.equal(rewarded, true);
  assert.equal(target.plots[0].crop.progress, 5);
  assert.equal(target.plots[0].crop.waterCount, 0);
  assert.equal(target.waterVisits[visitor.id], currentDayIndex(NOW));
  assert.equal(target.items.speed_potion, targetPotionBefore);
  assert.equal(visitor.items.speed_potion, visitorPotionBefore + 1);
  assert.deepEqual(visitor.waterReward, { day: currentDayIndex(NOW), n: 1 });
  assert.match(target.log.at(-1), /浇水访客帮 1 号地浇水，加速 30 分钟/);
  assert.match(visitor.log.at(-1), /帮「被浇农场」浇水，掉落 1 瓶加速药水/);
  assert.deepEqual(target.trail.at(-1), {
    t: NOW,
    kind: "watered",
    by: visitor.name,
    plotId: 1,
  });

  const duplicate = visitorWater(target, visitor.id, 1, visitor.name, NOW);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /明天再来/);
  assert.equal(visitor.items.speed_potion, visitorPotionBefore + 1);
  assert.equal(visitor.waterReward.n, 1);
});

test("shop refresh consumes RNG in recipe, potion-set, then limited-seed order", () => {
  const subject = farm("商店农场", "SHOP-RNG", 1);

  refreshShop(subject, NOW);

  assert.equal(subject.shop.refreshAt, NOW);
  assert.equal(subject.shop.recipe, null);
  assert.deepEqual(subject.shop.potionSet, { price: 250, qty: 6, buyers: [] });
  assert.equal(subject.shop.npcSeed, null);
  assert.equal(subject.rngState, 1_199_730_144);

  const snapshot = structuredClone(subject.shop);
  refreshShop(subject, NOW + 1);
  assert.deepEqual(subject.shop, snapshot);
  assert.equal(subject.rngState, 1_199_730_144);
});

test("plant batch keeps completed cheap seeds when the next queued seed cannot be afforded", () => {
  const subject = farm("批量农场", "BATCH-PARTIAL", 33);
  subject.coins = 10;

  const result = plantBatch(subject, { common: 2 }, NOW);

  assert.deepEqual(result, {
    ok: true,
    planted: { common: 1, fantasy: 0, limited: 0 },
    limitedIds: [],
    spent: 8,
    leftover: 1,
    error: undefined,
  });
  assert.equal(subject.coins, 2);
  assert.deepEqual(subject.plots[0].crop, {
    seedType: "common",
    growTicks: 6,
    progress: 0,
    ripe: false,
    waterCount: 0,
  });
  assert.equal(subject.plots[1].crop, null);
  assert.equal(subject.plots.filter((plot) => plot.crop).length, 1);
  assert.match(subject.log.at(-1), /种下一颗普通种子/);
});

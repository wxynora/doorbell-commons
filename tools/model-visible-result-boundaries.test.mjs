import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { fishingFish } from "../dist/content.js";
import {
  ensureFishing,
  grantFloodFish,
  runFishing,
} from "../dist/fishing.js";
import { makeFarm } from "../dist/game.js";
import {
  handleKitchenAction,
  KITCHEN_DOMAIN_ERROR_TEXT,
  kitchenDomainErrorText,
} from "../dist/game/actions/kitchen.js";
import {
  farmActionTouchesLockedCareerObject,
  lockedCareerObjectText,
} from "../dist/career/p3-commission-runtime.js";

const NOW = Date.UTC(2026, 7, 30, 4, 0, 0);
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const LONG_HEX = /\b[0-9a-f]{64}\b/i;
const SNAKE_DOMAIN_CODE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

function assertNoTechnicalBody(text) {
  assert.doesNotMatch(text, UUID);
  assert.doesNotMatch(text, LONG_HEX);
  assert.doesNotMatch(text, /\bOP_REJECTED\b/);
  assert.doesNotMatch(text, SNAKE_DOMAIN_CODE);
  assert.doesNotMatch(text, /\{"action"/);
}

test("fishing keeps short public references stable and rejects cross-use, expiry, and replay", () => {
  const farm = {
    id: "REFTEST",
    coins: 1_000,
    silver: 0,
    rngState: 1,
    fishing: {
      rngState: 272,
      rngCalls: 0,
      baitInventory: { basic_worm: 1 },
    },
  };

  const captured = runFishing(farm, { times: 1 }, NOW, [farm]);
  assert.equal(captured.ok, true);
  const chestRef = captured.text.match(/箱-[23456789A-HJ-NP-Z]{6}/)?.[0];
  assert.ok(chestRef, captured.text);
  assertNoTechnicalBody(captured.text);

  const firstBasket = runFishing(farm, { view: "basket" }, NOW, [farm]);
  assert.match(firstBasket.text, new RegExp(chestRef));
  assertNoTechnicalBody(firstBasket.text);

  const restored = structuredClone(farm);
  ensureFishing(restored);
  const restoredBasket = runFishing(restored, { view: "basket" }, NOW, [restored]);
  assert.match(restoredBasket.text, new RegExp(chestRef));

  const floodFish = fishingFish.find((fish) =>
    ["common", "uncommon"].includes(fish.rarity)
      && fish.tags?.some((tag) => tag === "freshwater" || tag === "brackish"));
  assert.ok(floodFish);
  const caught = grantFloodFish(restored, floodFish.id, floodFish.size_min);
  const fishRef = caught.instance.publicRef;
  const legacyFishId = caught.instance.id;
  assert.match(fishRef, /^鱼-[23456789A-HJ-NP-Z]{6}$/);

  const fishAsChest = runFishing(restored, { open: fishRef }, NOW, [restored]);
  assert.equal(fishAsChest.ok, false);
  assert.match(fishAsChest.text, /鱼获引用.*不能拿来开宝箱/);

  const chestAsFish = runFishing(restored, { sell: chestRef }, NOW, [restored]);
  assert.equal(chestAsFish.ok, false);
  assert.match(chestAsFish.text, /宝箱引用.*不能当作鱼获出售/);

  const sold = runFishing(restored, { sell: fishRef }, NOW, [restored]);
  assert.equal(sold.ok, true);
  assert.match(sold.text, new RegExp(fishRef));
  const expired = runFishing(restored, { sell: fishRef }, NOW, [restored]);
  assert.equal(expired.ok, false);
  assert.match(expired.text, /引用已失效/);
  const expiredLegacyId = runFishing(restored, { sell: legacyFishId }, NOW, [restored]);
  assert.equal(expiredLegacyId.ok, false);
  assert.match(expiredLegacyId.text, /旧引用已经失效/);
  assertNoTechnicalBody(expiredLegacyId.text);

  const beforeOpenCoins = restored.coins;
  const opened = runFishing(restored, { open: chestRef }, NOW, [restored]);
  assert.equal(opened.ok, true);
  assert.ok(restored.coins < beforeOpenCoins);
  const afterOpen = structuredClone(restored);
  const replayed = runFishing(afterOpen, { open: chestRef }, NOW, [afterOpen]);
  assert.equal(replayed.ok, false);
  assert.match(replayed.text, /已经打开过.*不能重复开箱/);
  assert.equal(afterOpen.coins, restored.coins);

  for (const result of [restoredBasket, fishAsChest, chestAsFish, sold, expired, expiredLegacyId, opened, replayed])
    assertNoTechnicalBody(result.text);
});

test("every career-locked farm action has a concrete Chinese no-op reason", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE career_job_object_locks (
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      locked_at INTEGER NOT NULL
    );
  `);
  database.prepare(`
    INSERT INTO career_job_object_locks (object_type, object_id, job_id, locked_at)
    VALUES (?, ?, ?, ?)
  `).run("farm_plot", "LOCKFARM:plot:1", "job-1", NOW);

  const cases = [
    ["run", {}, "一条龙操作"],
    ["water", { plotId: 1 }, "浇水"],
    ["harvest", { plotId: 1 }, "收获"],
    ["ripen", { plots: [1] }, "催熟"],
    ["steal", { plotId: 1 }, "偷菜"],
    ["use", { plotId: 1 }, "加速道具"],
  ];
  for (const [action, params, wording] of cases) {
    assert.equal(
      farmActionTouchesLockedCareerObject(database, "LOCKFARM", action, params),
      true,
      action,
    );
    const text = lockedCareerObjectText(action);
    assert.match(text, new RegExp(wording));
    assert.match(text, /职业委托/);
    assert.match(text, /没有执行/);
    assertNoTechnicalBody(text);
  }
  const serverSource = readFileSync(new URL("../dist/server.js", import.meta.url), "utf8");
  assert.match(serverSource, /text: lockedCareerObjectText\(action\)/);
  assert.doesNotMatch(serverSource, /text:\s*["']OP_REJECTED["']/);
  database.close();
});

test("all explicit kitchen domain codes map to Chinese model-visible text", () => {
  const kitchenDomainDirectory = new URL("../dist/domain/kitchen/", import.meta.url);
  const explicitCodes = new Set();
  for (const name of readdirSync(kitchenDomainDirectory).filter((entry) => entry.endsWith(".js"))) {
    const source = readFileSync(new URL(name, kitchenDomainDirectory), "utf8");
    for (const match of source.matchAll(/code:\s*"([a-z0-9_]+)"/g))
      explicitCodes.add(match[1]);
  }
  assert.ok(explicitCodes.size > 20);
  for (const code of explicitCodes) {
    assert.equal(Object.hasOwn(KITCHEN_DOMAIN_ERROR_TEXT, code), true, code);
    const text = kitchenDomainErrorText({ code });
    assert.match(text, /[\u3400-\u9fff]/);
    assertNoTechnicalBody(text);
  }

  const unknown = kitchenDomainErrorText({ code: "future_domain_failure" });
  assert.match(unknown, /料理台暂时无法完成/);
  assertNoTechnicalBody(unknown);

  const farm = makeFarm("厨房结果边界", 7);
  const thrown = handleKitchenAction("kitchen", farm, {
    op: "cook",
    name: "测试菜谱",
    method: "steam",
    items: ["rice", "egg"],
  }, NOW, {
    researchOriginalRecipe() {
      throw Object.assign(new Error("internal"), { code: "chef_recipe_identity_exists" });
    },
  });
  assert.equal(thrown.ok, false);
  assertNoTechnicalBody(thrown.text);

  const failedStatus = handleKitchenAction("kitchen", farm, {
    op: "cook",
    name: "测试菜谱",
    method: "steam",
    items: ["rice", "egg"],
  }, NOW, {
    researchOriginalRecipe() {
      return { status: "failed", recipe: null };
    },
  });
  assert.equal(failedStatus.ok, true);
  assert.match(failedStatus.text, /没有研发成功/);
  assertNoTechnicalBody(failedStatus.text);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runFishing } from "../dist/fishing.js";
import { handleKitchenAction } from "../dist/game/actions/kitchen.js";
import {
  normalizePublicExpeditionWorld,
  publicExpeditionText,
} from "../dist/public-expedition.js";
import { qixiLantern2026StatusText } from "../dist/qixi-lantern-2026.js";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const legacyActionJson = /\{"action"|JSON\.stringify\(\{ action/;

test("铃野共行只给出当前 Doorbell 的真实操作", () => {
  const now = Date.parse("2026-08-30T12:00:00+08:00");
  const farm = { id: "farm-a", name: "甲农场", ranch: { kitchen: { dishes: [] } } };
  const world = normalizePublicExpeditionWorld(undefined, now);

  const choiceText = publicExpeditionText(world, farm, now, [farm]);
  assert.match(choiceText, /A → doorbell\(\{"op":"farm\.together\.choose","args":\{"option":"A"\}\}\)/);
  assert.doesNotMatch(choiceText, legacyActionJson);

  world.phase = "task";
  world.currentTaskId = "recipe_dish";
  world.tasks.recipe_dish = { id: "recipe_dish", contributions: [], completedAt: null };
  farm.ranch.kitchen.dishes.push({ id: "dish-a", recipeId: "herb_grilled_fish", name: "香草烤鱼" });
  const dishText = publicExpeditionText(world, farm, now, [farm]);
  assert.match(dishText, /doorbell\(\{"op":"farm\.kitchen\.use","args":\{"dishId":"香草烤鱼","target":"鹤姨"\}\}\)/);
  assert.doesNotMatch(dishText, legacyActionJson);
});

test("七夕未开放的操作不伪造 canonical op", () => {
  const now = Date.parse("2026-08-19T12:00:00+08:00");
  const world = {
    discoveredObjects: { "copper-bell": 1, "qiaoguo-mold": 1, "mailbag-buckle": 1 },
  };
  const farm = { id: "farm-a", name: "甲农场" };
  const text = qixiLantern2026StatusText(farm, world, now);

  assert.match(text, /当前 Doorbell 连接未开放这项操作，不能在这里提交。/);
  assert.match(text, /doorbell\(\{"op":"farm\.kitchen\.use","args":\{"dishId":"蜂蜜茶","target":"鹤姨"\}\}\)/);
  assert.doesNotMatch(text, legacyActionJson);
  assert.doesNotMatch(text, /"op":"farm\.[^"]*qixi/);
});

test("钓鱼与料理的下一步使用 registry 中的 op 和 args", () => {
  const now = Date.parse("2026-08-30T12:00:00+08:00");
  const farm = { id: "farm-a", name: "甲农场", coins: 0, silver: 0, rngState: 1 };
  const fishing = runFishing(farm, { location: "不存在的钓点" }, now, [farm]);
  assert.match(fishing.text, /doorbell\(\{"op":"farm\.fish\.view","args":\{"section":"spots"\}\}\)/);

  const kitchen = handleKitchenAction("kitchen", farm, { op: "use", target: "guard-dog" }, now);
  assert.match(kitchen.text, /doorbell\(\{"op":"farm\.kitchen\.bribe","args":\{"dishId":"料理名","to":"被拦农场编号"\}\}\)/);
});

test("指定运行文案不再夹带旧 action JSON、HTTP 或凭据教程", () => {
  for (const path of [
    "dist/qixi-lantern-2026.js",
    "dist/public-expedition.js",
    "dist/expedition.js",
    "dist/glimmer.js",
    "dist/game/actions/field.js",
    "dist/game/help.js",
    "dist/game/market.js",
    "dist/game/visit-npc.js",
    "dist/game/presentation/catalog.js",
    "dist/game/presentation/farm.js",
    "dist/game/presentation/shop.js",
    "dist/server/farm/help.js",
    "dist/server/farm/social.js",
  ]) {
    assert.doesNotMatch(source(path), legacyActionJson, path);
  }

  const server = source("dist/server.js");
  for (const fragment of [
    '用 {"action":"together"}',
    '{"action":"kitchen"',
  ]) {
    assert.equal(server.includes(fragment), false, fragment);
  }
});

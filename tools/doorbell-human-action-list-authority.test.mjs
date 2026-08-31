import assert from "node:assert/strict";
import test from "node:test";

import { makeFarm } from "../dist/game.js";
import { projectHumanActionListAuthority } from "../dist/server/action-list-authority-structured.js";
import { insertFarm } from "../dist/store.js";
import { currentDayIndex } from "../dist/time.js";

const NOW = Date.parse("2026-08-31T04:00:00.000Z");

function farm(id, name, seed) {
  const value = makeFarm(name, seed, { aiName: `${name}小机`, humanName: `${name}主人` });
  value.id = id;
  value.lastTickAt = NOW;
  value.createdAt = NOW;
  value.social = { visit: true, steal: true, water: true, message: true };
  return value;
}

test("action-list authority exposes unvisited ripe steal targets and existing fishing counts", () => {
  const owner = farm("3ET3FE", "自己农场", 1);
  const stolen = farm("4OLD22", "今天偷过", 2);
  const fresh = farm("5NEW22", "还没偷过", 3);
  stolen.plots[0].crop = {
    id: "wheat",
    seedType: "common",
    growTicks: 3,
    progress: 3,
    ripe: true,
    waterCount: 0,
  };
  fresh.plots[0].crop = {
    id: "wheat",
    seedType: "common",
    growTicks: 3,
    progress: 3,
    ripe: true,
    waterCount: 0,
  };
  stolen.stealCooldowns[owner.id] = NOW;
  owner.fishing = {
    dailyCasts: { day: currentDayIndex(NOW), count: 17 },
    baitInventory: { basic_worm: 2 },
  };
  insertFarm(owner);
  insertFarm(stolen);
  insertFarm(fresh);

  const ownerBefore = structuredClone(owner);
  const stolenBefore = structuredClone(stolen);
  const freshBefore = structuredClone(fresh);
  const result = projectHumanActionListAuthority(owner, NOW);
  assert.deepEqual(owner, ownerBefore);
  assert.deepEqual(stolen, stolenBefore);
  assert.deepEqual(fresh, freshBefore);
  assert.equal(result.data.farm.farm_doorplate, owner.id);
  assert.equal(result.data.steal.targets.some((target) => target.farm_name === "今天偷过"), false);
  const freshTarget = result.data.steal.targets.find(
    (target) => target.farm_name === "还没偷过",
  );
  assert.ok(freshTarget);
  assert.deepEqual(freshTarget.ripe_plot_ids, [1]);
  assert.equal(result.data.fishing.daily_limit, 20);
  assert.equal(result.data.fishing.used_today, 17);
  assert.equal(result.data.fishing.remaining_today, 3);
  assert.equal(
    result.data.fishing.available_baits.some(
      (bait) => bait.bait_id === "basic_worm" && bait.quantity === 2,
    ),
    true,
  );
  assert.equal(
    result.data.activities.some(
      (activity) =>
        activity.activity_id === "glimmer" &&
        activity.name === "流光原野" &&
        activity.call.op === "farm.glimmer.status",
    ),
    true,
  );
  assert.equal(
    result.data.activities.every((activity) => typeof activity.name === "string"),
    true,
  );
});

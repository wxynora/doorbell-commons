import assert from "node:assert/strict";
import test from "node:test";

import { LAND_LUCK, LAND_UPGRADE_REQ } from "../dist/config.js";
import { cropById, crops, landTiers, titles, totalCropCount } from "../dist/content.js";
import {
  isLimitedAvailable,
  newVarietiesAtTier,
  nextUpgradeReq,
  upgradeLand,
} from "../dist/engine.js";
import { makeFarm } from "../dist/game.js";
import { checkTitles, isUnlocked } from "../dist/titles.js";

const ADDED_CROPS = [
  "choy_sum",
  "celtuce",
  "yardlong_bean",
  "wax_gourd",
  "lotus_root",
  "water_bamboo",
  "garlic_sprout",
  "red_choy_sum",
  "peach_rain_lotus_root",
  "green_thunder_bamboo_shoot",
  "rain_curtain_lotus",
  "star_thunder_gourd",
  "osmanthus_moon_tuber",
  "frost_persimmon_lantern",
  "thirty_six_furrow_sunflower",
  "season_wheel_tree",
];

const EXPECTED_LAND = [
  { tier: 6, name: "广畴", plots: 24, cost: 200_000 },
  { tier: 7, name: "阡陌", plots: 28, cost: 300_000 },
  { tier: 8, name: "沃野", plots: 32, cost: 400_000 },
  { tier: 9, name: "丰原", plots: 36, cost: 500_000 },
];

test("expanded crop catalog stays data-driven, unique and reachable", () => {
  assert.equal(totalCropCount, 193);
  assert.equal(crops.length, 193);
  assert.equal(new Set(crops.map((crop) => crop.id)).size, crops.length);
  assert.equal(new Set(crops.map((crop) => crop.name)).size, crops.length);

  assert.deepEqual(
    Object.fromEntries(
      ["common", "fantasy", "limited"].map((category) => [
        category,
        crops.filter((crop) => crop.category === category).length,
      ]),
    ),
    { common: 68, fantasy: 76, limited: 49 },
  );
  assert.deepEqual(
    Object.fromEntries(
      ["N", "R", "SR", "SSR", "SP"].map((rarity) => [
        rarity,
        crops.filter((crop) => crop.rarity === rarity).length,
      ]),
    ),
    { N: 29, R: 55, SR: 60, SSR: 41, SP: 8 },
  );

  for (const id of ADDED_CROPS) {
    const crop = cropById.get(id);
    assert.ok(crop, `${id} must be indexed`);
    assert.match(crop.name, /\S/u);
    assert.match(crop.desc, /\S/u);
    assert.match(crop.plantLine, /\S/u);
    assert.match(crop.lore, /\S/u);
    assert.ok(["common", "fantasy", "limited"].includes(crop.category));
    assert.ok(["N", "R", "SR", "SSR", "SP"].includes(crop.rarity));
    assert.ok(Number.isSafeInteger(crop.growTicks) && crop.growTicks > 0);
    assert.ok(Number.isSafeInteger(crop.seedPrice) && crop.seedPrice > 0);
    assert.ok(Number.isSafeInteger(crop.sellPrice) && crop.sellPrice > crop.seedPrice);
  }

  assert.deepEqual(
    Object.fromEntries([5, 6, 7, 8, 9].map((tier) => [tier, newVarietiesAtTier(tier)])),
    { 5: 3, 6: 3, 7: 2, 8: 1, 9: 1 },
  );
  assert.deepEqual(
    ADDED_CROPS.map((id) => cropById.get(id).rarity).filter((rarity) => rarity === "SP"),
    ["SP", "SP"],
  );
  assert.deepEqual(
    {
      unlockType: cropById.get("thirty_six_furrow_sunflower").unlockType,
      unlockRule: cropById.get("thirty_six_furrow_sunflower").unlockRule,
      craftable: cropById.get("thirty_six_furrow_sunflower").craftable,
    },
    { unlockType: "action", unlockRule: { kind: "landMax" }, craftable: false },
  );
  assert.deepEqual(
    {
      unlockType: cropById.get("season_wheel_tree").unlockType,
      unlockRule: cropById.get("season_wheel_tree").unlockRule ?? null,
      craftable: cropById.get("season_wheel_tree").craftable ?? true,
    },
    { unlockType: "craft", unlockRule: null, craftable: true },
  );
});

test("a persisted 20-plot farm upgrades through the exact 24-36 plot contract", () => {
  assert.equal(landTiers.length, 9);
  assert.deepEqual(
    landTiers.slice(-4).map((tier) => ({
      tier: tier.tier,
      name: tier.name,
      plots: tier.plots,
      cost: LAND_UPGRADE_REQ[tier.tier].coins,
    })),
    EXPECTED_LAND,
  );
  assert.deepEqual(
    Object.fromEntries(EXPECTED_LAND.map(({ tier }) => [tier, LAND_LUCK[tier]])),
    { 6: 1.5, 7: 1.5, 8: 1.5, 9: 1.5 },
  );
  for (const { tier, cost } of EXPECTED_LAND) {
    assert.deepEqual(LAND_UPGRADE_REQ[tier], {
      coins: cost,
      commonCodex: 24,
      fantasyCodex: 10,
      codexPct: 0,
    });
  }

  const farm = makeFarm("扩地测试", 12345);
  farm.landTier = 5;
  farm.plots = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, crop: null }));
  farm.coins = EXPECTED_LAND.reduce((sum, tier) => sum + tier.cost, 0);
  const common = crops.filter((crop) => crop.category === "common").slice(0, 24);
  const fantasy = crops.filter((crop) => crop.category === "fantasy").slice(0, 10);
  farm.codex = Object.fromEntries(
    [...common, ...fantasy].map((crop) => [crop.id, { count: 1, bestQuality: 1, firstAt: 1 }]),
  );
  const before = structuredClone(farm);

  assert.equal(isLimitedAvailable(cropById.get("max_land_bloom"), before, 0), true);
  assert.equal(
    isLimitedAvailable(cropById.get("thirty_six_furrow_sunflower"), before, 0),
    false,
  );

  for (const expected of EXPECTED_LAND) {
    const pending = nextUpgradeReq(farm);
    assert.equal(pending.next.tier, expected.tier);
    assert.equal(pending.req.coins, expected.cost);
    const result = upgradeLand(farm, expected.tier);
    assert.deepEqual(
      { ok: result.ok, tier: result.tier, name: result.name },
      { ok: true, tier: expected.tier, name: expected.name },
    );
    assert.equal(farm.plots.length, expected.plots);
    assert.deepEqual(
      farm.plots.map((plot) => plot.id),
      Array.from({ length: expected.plots }, (_, index) => index + 1),
    );
  }

  assert.equal(farm.coins, 0);
  assert.equal(farm.landTier, 9);
  assert.equal(farm.plots.length, 36);
  assert.equal(nextUpgradeReq(farm), null);
  assert.deepEqual(upgradeLand(farm, 10), { ok: false, error: "已是最高品阶，无需升级" });
  assert.equal(isLimitedAvailable(cropById.get("max_land_bloom"), farm, 0), true);
  assert.equal(
    isLimitedAvailable(cropById.get("thirty_six_furrow_sunflower"), farm, 0),
    true,
  );

  checkTitles(farm);
  const landTitleIds = titles.filter((title) => title.field === "landTier").map((title) => title.id);
  assert.deepEqual(landTitleIds, ["land_6", "land_7", "land_8", "land_9"]);
  assert.equal(landTitleIds.every((id) => isUnlocked(farm, id)), true);
});

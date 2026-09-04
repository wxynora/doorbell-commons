import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-land-smelting-recipes-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const { cropById, recipes } = await import("../dist/content.js");
const { makeFarm } = await import("../dist/game.js");
const { craft } = await import("../dist/domain/field/smelting.js");
const { buyRecipe } = await import("../dist/domain/field/shop.js");

const SEASON_RECIPE = ["time_amber", "tarnished_lunar_bronze", "world_tree_seed"];
const SUNFLOWER_RECIPE = ["clay_lump", "ancient_resin", "phoenix_ember"];
const SUNFLOWER_ID = "thirty_six_furrow_sunflower";

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function fillMaterials(farm, materialIds) {
  for (const id of materialIds) farm.materials[id] = (farm.materials[id] ?? 0) + 1;
}

test("new land crops have unique fixed smelting formulas", () => {
  const combinations = recipes.map((recipe) => [...recipe.materials].sort().join("+"));
  assert.equal(new Set(combinations).size, combinations.length);
  assert.equal(new Set(recipes.map((recipe) => recipe.output)).size, recipes.length);

  const season = recipes.find((recipe) => recipe.output === "season_wheel_tree");
  assert.deepEqual(season?.materials, SEASON_RECIPE);
  assert.equal(season?.requiresCodex, undefined);
  assert.equal(cropById.get(season.output)?.rarity, "SP");

  const sunflower = recipes.find((recipe) => recipe.output === SUNFLOWER_ID);
  assert.deepEqual(sunflower?.materials, SUNFLOWER_RECIPE);
  assert.equal(sunflower?.requiresCodex, true);
  assert.equal(cropById.get(sunflower.output)?.unlockRule?.kind, "landMax");
});

test("the season wheel formula works immediately while the 36-furrow formula cannot bypass its codex gate", () => {
  const seasonFarm = makeFarm("四时配方测试");
  fillMaterials(seasonFarm, SEASON_RECIPE);
  const season = craft(seasonFarm, SEASON_RECIPE, Date.now());
  assert.equal(season.ok, true);
  assert.equal(season.byRecipe, true);
  assert.equal(season.cropId, "season_wheel_tree");

  const lockedFarm = makeFarm("三十六畦前置测试");
  fillMaterials(lockedFarm, SUNFLOWER_RECIPE);
  const locked = craft(lockedFarm, SUNFLOWER_RECIPE, Date.now());
  assert.equal(locked.ok, true);
  assert.equal(locked.byRecipe, false);
  assert.notEqual(locked.cropId, SUNFLOWER_ID);

  const unlockedFarm = makeFarm("三十六畦配方测试");
  unlockedFarm.codex[SUNFLOWER_ID] = 1;
  fillMaterials(unlockedFarm, SUNFLOWER_RECIPE);
  const unlocked = craft(unlockedFarm, SUNFLOWER_RECIPE, Date.now());
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.byRecipe, true);
  assert.equal(unlocked.cropId, SUNFLOWER_ID);
});

test("the 36-furrow recipe stays out of the shop before codex discovery", () => {
  const now = Date.now();
  const locked = makeFarm("未解锁配方商店");
  locked.coins = 10_000;
  locked.shop.refreshAt = now + 1;
  locked.shop.recipe = SUNFLOWER_ID;
  const rejected = buyRecipe(locked, now);
  assert.equal(rejected.ok, false);
  assert.equal(locked.coins, 10_000);
  assert.equal(locked.knownRecipes.includes(SUNFLOWER_ID), false);

  const unlocked = makeFarm("已解锁配方商店");
  unlocked.coins = 10_000;
  unlocked.codex[SUNFLOWER_ID] = 1;
  unlocked.shop.refreshAt = now + 1;
  unlocked.shop.recipe = SUNFLOWER_ID;
  const bought = buyRecipe(unlocked, now);
  assert.equal(bought.ok, true);
  assert.equal(bought.output, SUNFLOWER_ID);
  assert.equal(unlocked.knownRecipes.includes(SUNFLOWER_ID), true);
});

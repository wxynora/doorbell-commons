import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-agronomist-material-billing-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { agronomyTreatmentMaterialUsage, treatmentGold } =
  await import("../dist/career/p3-commission-runtime.js");

const NOW = Date.parse("2026-08-28T04:00:00.000Z");
const FARM_ID_PREFIX = "AGRMATBILL";
let farmSequence = 0;

function installTreatmentSource() {
  const farmId = `${FARM_ID_PREFIX}${++farmSequence}`;
  const sourceId = `p3:agronomy:${farmId}:fixture:1`;
  const farm = makeFarm("Agronomy material billing", 723);
  farm.id = farmId;
  farm.plots[0].crop = {
    seedType: "common",
    progress: 1,
    growTicks: 10,
    waterCount: 0,
    ripe: false,
    lingyeAgronomy: {
      sourceId,
      condition: "drought",
      status: "treating",
      generatedDay: 20_000,
      generatedAt: NOW,
      checks: ["soil"],
      treatments: [],
      qualityPenalty: true,
    },
  };
  farm.lingyeP3 = {
    version: 1,
    lastAdvancedDay: 20_000,
    lastAnimalRecoveryDay: null,
    history: [],
    actionReceipts: {},
  };
  insertFarm(farm);
  return {
    career: "agronomist",
    sourceId,
    objectType: "farm_plot",
    objectId: `${farmId}:plot:${farm.plots[0].id}`,
    farmId,
    difficultyLevel: 1,
  };
}

test.after(() => rmSync(dataDirectory, { recursive: true, force: true }));

test("agronomy billing applies 5/10/15 percent batch saving and existing gold prices", () => {
  const requirements = { "water-retaining-cover": 20 };
  for (const [level, saved] of [[2, 1], [3, 2], [4, 3]]) {
    const usage = agronomyTreatmentMaterialUsage(requirements, level);
    assert.equal(usage.totalRequired, 20);
    assert.equal(usage.totalSaved, saved);
    assert.equal(usage.totalConsumed, 20 - saved);
    assert.equal(usage.requiredGold, 100_000);
    assert.equal(usage.consumedGold, (20 - saved) * 5_000);
    assert.equal(usage.savedGold, saved * 5_000);
    assert.equal(usage.consumed["water-retaining-cover"] >= 1, true);
  }

  const mixed = agronomyTreatmentMaterialUsage({
    "drainage-material": 5,
    "insect-trap": 5,
    "soil-conditioner": 5,
    "water-retaining-cover": 5,
  }, 4);
  assert.equal(mixed.totalSaved, Math.floor(20 * 0.15));
  assert.equal(mixed.totalConsumed, 20 - Math.floor(20 * 0.15));
  assert.deepEqual(
    Object.values(mixed.consumed).every((quantity) => quantity >= 1),
    true,
  );
  assert.equal(mixed.requiredGold, 80_000);
  assert.equal(mixed.consumedGold, 74_000);
  assert.equal(mixed.savedGold, 6_000);
});

test("a single material remains one unit and the live treatmentGold path charges it", () => {
  const job = installTreatmentSource();
  const one = agronomyTreatmentMaterialUsage({ "water-retaining-cover": 1 }, 4);
  assert.deepEqual(one.consumed, { "water-retaining-cover": 1 });
  assert.equal(one.totalSaved, 0);
  assert.equal(one.consumedGold, 5_000);
  assert.equal(treatmentGold(job, "water-retaining-cover"), 5_000);
  assert.equal(
    treatmentGold(job, "water-retaining-cover", 4, { "water-retaining-cover": 20 }),
    85_000,
  );
  // A valid but incorrect treatment is still the candidate material the
  // existing world contract would consume; it is not silently free.
  assert.equal(treatmentGold(job, "drainage-material"), 2_000);
});

test("an unavailable material fails before changing the authoritative farm", () => {
  const job = installTreatmentSource();
  const before = JSON.stringify(getFarm(job.farmId));
  assert.throws(
    () => treatmentGold(job, "water-retaining-cover", 4, { "unknown-material": 2 }),
    /agronomy_treatment_material_not_available/u,
  );
  assert.equal(JSON.stringify(getFarm(job.farmId)), before);
});

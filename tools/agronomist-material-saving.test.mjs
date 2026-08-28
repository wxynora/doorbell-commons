import assert from "node:assert/strict";
import test from "node:test";

const {
  AGRONOMY_CONDITIONS,
  AGRONOMY_MATERIAL_SAVING_RATES,
  agronomyMaterialSavingRate,
  agronomyMaterialUsage,
  treatAgronomyIssue,
} = await import("../dist/career/p3-world.js");

const NOW = Date.parse("2026-08-28T04:00:00.000Z");

test("agronomist material saving rates are fixed by qualification", () => {
  assert.deepEqual(AGRONOMY_MATERIAL_SAVING_RATES, {
    1: 0,
    2: 0.05,
    3: 0.10,
    4: 0.15,
  });
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(agronomyMaterialSavingRate), [0, 0, 0.05, 0.10, 0.15, 0]);
});

test("batch saving floors the reduction and keeps one of every required material", () => {
  const usage = agronomyMaterialUsage({
    "drainage-material": 1,
    "insect-trap": 1,
    "water-retaining-cover": 8,
  }, 4);

  assert.deepEqual(usage.required, {
    "drainage-material": 1,
    "insect-trap": 1,
    "water-retaining-cover": 8,
  });
  assert.deepEqual(usage.consumed, {
    "drainage-material": 1,
    "insect-trap": 1,
    "water-retaining-cover": 7,
  });
  assert.deepEqual(usage.saved, { "water-retaining-cover": 1 });
  assert.equal(usage.eligibleDemand, 10);
  assert.equal(usage.totalSaved, Math.floor(10 * 0.15));
  assert.equal(usage.totalConsumed, 9);

  const smallBatch = agronomyMaterialUsage({ "drainage-material": 2 }, 2);
  assert.equal(smallBatch.totalSaved, Math.floor(2 * 0.05));
  assert.deepEqual(smallBatch.consumed, { "drainage-material": 2 });
});

test("nonordinary or explicitly non-savable materials are consumed in full", () => {
  const usage = agronomyMaterialUsage([
    { id: "drainage-material", quantity: 10 },
    { id: "event-only-net", quantity: 10, savable: false },
    { id: "unknown-special-material", quantity: 10 },
  ], 4);

  assert.deepEqual(usage.consumed, {
    "drainage-material": 9,
    "event-only-net": 10,
    "unknown-special-material": 10,
  });
  assert.deepEqual(usage.saved, { "drainage-material": 1 });
  assert.equal(usage.eligibleDemand, 10);
});

test("an incorrect agronomy treatment remains a real consumed attempt and does not resolve the issue", () => {
  const sourceId = "p3:agronomy:material-test";
  const farm = {
    id: "AGR-MATERIAL",
    plots: [{
      id: 1,
      crop: {
        lingyeAgronomy: {
          sourceId,
          condition: "local_pest",
          status: "treating",
          checks: ["leaf"],
          treatments: [],
          qualityPenalty: true,
        },
      },
    }],
  };

  const wrong = treatAgronomyIssue(farm, sourceId, "water-retaining-cover", 1, NOW);
  assert.equal(wrong.resolved, false);
  assert.equal(wrong.materialGold, AGRONOMY_CONDITIONS.drought.materialGold);
  assert.deepEqual(farm.plots[0].crop.lingyeAgronomy.treatments, ["water-retaining-cover"]);
  assert.equal(farm.plots[0].crop.lingyeAgronomy.status, "treating");
});

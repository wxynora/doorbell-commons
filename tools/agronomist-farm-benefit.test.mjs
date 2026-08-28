import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-agronomist-farm-benefit-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const { harvest } = await import("../dist/engine.js");
const { makeFarm } = await import("../dist/game.js");
const {
  farmAgronomistCareerBenefits,
  farmCareerQualificationLevel,
} = await import("../dist/career/farm-benefits.js");
const {
  openLingyeWorldDatabase,
  registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");

const NOW = Date.parse("2026-08-28T04:00:00.000Z");
const RESIDENT_ID = "019ffe01-49cd-7020-84af-3d04fb1ed03d";
const MIGRATION_ID = "migration-agronomist-farm-benefit";
const QUIET_SEASON_MOD = { type: "test" };

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function certify(database, level, status = "active", bindingReference = MIGRATION_ID) {
  registerLingyeResidentReference(database, {
    residentId: RESIDENT_ID,
    bindingReference,
    registeredAt: NOW - 1_000,
  });
  database.prepare(`
    INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
    VALUES (?, 'agronomist', 1, ?)
  `).run(RESIDENT_ID, NOW - 900);
  database.prepare(`
    INSERT INTO career_certificates (
      resident_id, career, qualification_level, status,
      source_attempt_id, issued_at, effective_at
    ) VALUES (?, 'agronomist', ?, ?, ?, ?, ?)
  `).run(
    RESIDENT_ID,
    level,
    status,
    `attempt-agronomist-benefit-${level}-${status}`,
    NOW - 800,
    status === "active" ? NOW - 700 : null,
  );
}

function ordinaryHarvestFarm(id, crop = {}) {
  const farm = makeFarm("农艺师收成测试农场", 2468);
  farm.id = id;
  farm.coins = 0;
  farm.silver = 0;
  farm.codex = {};
  farm.plots[0].crop = {
    seedType: "common",
    growTicks: 1,
    progress: 1,
    ripe: true,
    waterCount: 0,
    ...crop,
  };
  return farm;
}

test("agronomist benefit is derived only from the bound resident's active certificate", () => {
  const database = openLingyeWorldDatabase(":memory:");
  const farm = ordinaryHarvestFarm("AGR-BENEFIT");
  farm.doorbellMcpMigration = { migrationId: MIGRATION_ID };

  assert.equal(farmCareerQualificationLevel(database, farm, "agronomist"), 0);
  assert.deepEqual(farmAgronomistCareerBenefits(database, farm), {
    agronomistQualificationLevel: 0,
    agronomistExtraHarvestChance: 0,
  });

  certify(database, 4, "pending_review_configuration");
  assert.deepEqual(farmAgronomistCareerBenefits(database, farm), {
    agronomistQualificationLevel: 0,
    agronomistExtraHarvestChance: 0,
  });

  database.prepare(`
    UPDATE career_certificates
    SET status = 'active', effective_at = ?
    WHERE resident_id = ? AND career = 'agronomist'
  `).run(NOW, RESIDENT_ID);
  for (const [level, chance] of [[1, 0.03], [2, 0.06], [3, 0.10], [4, 0.15]]) {
    database.prepare(`
      UPDATE career_certificates SET qualification_level = ?
      WHERE resident_id = ? AND career = 'agronomist'
    `).run(level, RESIDENT_ID);
    assert.deepEqual(farmAgronomistCareerBenefits(database, farm), {
      agronomistQualificationLevel: level,
      agronomistExtraHarvestChance: chance,
    });
  }
  assert.equal(farmAgronomistCareerBenefits(database, {
    ...farm,
    doorbellMcpMigration: { migrationId: "not-the-bound-migration" },
  }).agronomistQualificationLevel, 0);
  database.close();
});

test("ordinary harvest uses the same authoritative coin settlement for the extra product", () => {
  const baseFarm = ordinaryHarvestFarm("AGR-ROLL");
  const normalFarm = structuredClone(baseFarm);
  const agronomistFarm = structuredClone(baseFarm);
  const normal = harvest(normalFarm, 1, NOW, QUIET_SEASON_MOD, {
    agronomistExtraHarvestChance: 0,
  });
  const agronomist = harvest(agronomistFarm, 1, NOW, QUIET_SEASON_MOD, {
    agronomistExtraHarvestChance: 1,
  });

  assert.equal(normal.ok, true);
  assert.equal(agronomist.ok, true);
  assert.equal(agronomist.crop.id, normal.crop.id);
  assert.equal(agronomist.quality.id, normal.quality.id);
  assert.equal(normal.extraYield, 0);
  assert.equal(normal.extraValue, 0);
  assert.equal(agronomist.extraYield, 1);
  assert.equal(agronomist.extraValue, normal.value);
  assert.equal(agronomist.value, normal.value + agronomist.extraValue);
  assert.equal(
    agronomistFarm.coins - normalFarm.coins,
    agronomist.extraValue,
    "the extra product is settled into farm.coins with the original harvest",
  );
  assert.equal(agronomistFarm.plots[0].crop, null);
  assert.equal(normalFarm.plots[0].crop, null);
});

test("limited, SP, and explicit activity/task crops never receive the extra product", () => {
  const cases = [
    { id: "AGR-LIMITED", crop: { seedType: "limited", limitedId: "completion_bloom" } },
    { id: "AGR-SP", crop: { seedType: "limited", limitedId: "max_land_bloom" } },
    { id: "AGR-ACTIVITY", crop: { seedType: "limited", limitedId: "magpie_bridge_vine" } },
    { id: "AGR-TASK", crop: { task: true } },
  ];

  for (const { id, crop } of cases) {
    const farm = ordinaryHarvestFarm(id, crop);
    const result = harvest(farm, 1, NOW, QUIET_SEASON_MOD, {
      agronomistExtraHarvestChance: 1,
    });
    assert.equal(result.ok, true, id);
    assert.equal(result.extraYield, 0, id);
    assert.equal(result.extraValue, 0, id);
  }
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-smelting-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-25T04:00:00.000Z");
const FARM_HUMAN_KEY = "private-smelting-human-key";
const MATERIAL_IDS = ["ordinary_stone", "dry_branch", "clay_lump"];

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { projectHumanFarmCatalog } = await import(
  "../dist/server/farm-catalog-structured.js"
);
const {
  handleHumanSmeltingAction,
  smeltingActionRevision,
} = await import("../dist/server/smelting-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("熔炼测试农场");
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.materials = Object.fromEntries(MATERIAL_IDS.map((materialId) => [materialId, 2]));
  insertFarm(farm);
  return getFarm(id);
}

function request(farm, revision, key = "019ffb01-49cd-7020-84af-3d04fb1ed03d") {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    material_ids: MATERIAL_IDS,
    expected_smelting_revision: revision,
    idempotency_key: key,
  };
}

test("Human smelting delegates to craft, returns the result, and replays without double consumption", () => {
  const farm = addFarm();
  const catalog = projectHumanFarmCatalog(farm, NOW);
  assert.equal(catalog.data.smelting.write_status, "available");
  assert.equal(catalog.data.smelting.revision, smeltingActionRevision(farm));

  const input = request(farm, catalog.data.smelting.revision);
  const first = handleHumanSmeltingAction(farm, input, NOW);
  assert.equal(first.status, 200);
  assert.equal(first.json.data.result.receipt_id, input.idempotency_key);
  assert.deepEqual(first.json.data.result.material_ids, MATERIAL_IDS);
  assert.equal(typeof first.json.data.result.crop_id, "string");
  assert.equal(typeof first.json.data.result.crop_name, "string");
  assert.match(first.json.data.result.rarity, /^(N|R|SR|SSR|SP|OR)$/);
  assert.equal(first.json.data.resource.smelting.write_status, "available");
  assert.equal(first.json.smelting_revision, smeltingActionRevision(getFarm(farm.id)));
  for (const materialId of MATERIAL_IDS) {
    assert.equal(getFarm(farm.id).materials[materialId], 1);
  }
  assert.equal(getFarm(farm.id).seeds[first.json.data.result.crop_id], 1);

  const saved = structuredClone(getFarm(farm.id));
  const replay = handleHumanSmeltingAction(getFarm(farm.id), input, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), saved);
});

test("stale revision and insufficient materials fail without changing the farm", () => {
  const farm = addFarm("BCDFGH");
  const before = structuredClone(farm);
  const stale = handleHumanSmeltingAction(
    farm,
    request(farm, `farm-smelting-v1:${"0".repeat(64)}`),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(farm.id), before);

  const missing = getFarm(farm.id);
  missing.materials.clay_lump = 0;
  const missingBefore = structuredClone(missing);
  const rejected = handleHumanSmeltingAction(
    missing,
    request(
      missing,
      smeltingActionRevision(missing),
      "119ffb01-49cd-7020-84af-3d04fb1ed03d",
    ),
    NOW,
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(farm.id), missingBefore);
});

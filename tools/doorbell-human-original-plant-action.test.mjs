import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after, beforeEach } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-original-plant-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const FARM_HUMAN_KEY = "private-original-plant-human-key";

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { dumpUgc, loadUgc, registerUgc } = await import("../dist/ugc.js");
const {
  handleHumanOriginalPlantAction,
  originalPlantActionRevision,
} = await import("../dist/server/original-plant-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

beforeEach(() => {
  loadUgc([]);
});

function addFarm(id = "ABC234", coins = 1_000) {
  const farm = makeFarm("原创植物测试农场", 123456, { aiName: "小机", humanName: "我" });
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.coins = coins;
  farm.designCount = 4;
  farm.seeds = { common: 2 };
  farm.titles = ["existing-title"];
  insertFarm(farm);
  return getFarm(id);
}

function payload(overrides = {}) {
  return {
    name: "月光番茄",
    latin: "Solanum luna",
    desc: "在月光里慢慢变甜的番茄。",
    plant: "把一颗月光埋进土里。",
    harvest: "月光从果实里流出来了。",
    ...overrides,
  };
}

function body(farm, revision, idempotencyKey, design = payload()) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: idempotencyKey,
    expected_revision: revision,
    payload: design,
  };
}

test("original plant action delegates designCrop and returns the authoritative receipt", () => {
  const farm = addFarm();
  const revision = originalPlantActionRevision(farm, NOW);
  assert.match(revision, /^farm-original-plant-v1:[0-9a-f]{64}$/);

  const key = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
  const result = handleHumanOriginalPlantAction(farm, body(farm, revision, key), NOW);

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, key);
  assert.equal(result.json.data.result.fee, 200);
  assert.equal(result.json.data.result.seeds, 5);
  assert.equal(result.json.data.result.coins_balance, 800);
  assert.equal(result.json.data.result.crop.name, "月光番茄");
  assert.equal(result.json.data.result.crop.latin, "Solanum luna");
  assert.equal(result.json.data.result.crop.category, "ugc");
  assert.equal(result.json.data.result.crop.rarity, "OR");
  assert.equal(result.json.revision, originalPlantActionRevision(getFarm(farm.id), NOW));

  const saved = getFarm(farm.id);
  assert.equal(saved.coins, 800);
  assert.equal(saved.seeds[result.json.data.result.crop.id], 5);
  assert.equal(saved.designCount, 5);
  assert.deepEqual(saved.titles, ["existing-title"]);
  assert.deepEqual(dumpUgc(), [result.json.data.result.crop]);
});

test("the original plant revision covers the farm economy, seeds, design count, and global UGC", () => {
  const farm = addFarm("BCDFGH");
  const first = originalPlantActionRevision(farm, NOW);
  assert.equal(originalPlantActionRevision(farm, NOW + 60_000), first);

  farm.coins += 1;
  assert.notEqual(originalPlantActionRevision(farm, NOW), first);
  farm.coins -= 1;
  farm.seeds.common += 1;
  assert.notEqual(originalPlantActionRevision(farm, NOW), first);
  farm.seeds.common -= 1;
  farm.designCount += 1;
  assert.notEqual(originalPlantActionRevision(farm, NOW), first);
  farm.designCount -= 1;
  registerUgc({ id: "ugc_existing", name: "既有原创", category: "ugc" });
  assert.notEqual(originalPlantActionRevision(farm, NOW), first);
});

test("same UUID and request replays without a second design; a different request conflicts", () => {
  const farm = addFarm("DEF567");
  const revision = originalPlantActionRevision(farm, NOW);
  const key = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
  const request = body(farm, revision, key);
  const first = handleHumanOriginalPlantAction(farm, request, NOW);
  assert.equal(first.status, 200);
  const savedAfterFirst = structuredClone(getFarm(farm.id));
  const ugcAfterFirst = structuredClone(dumpUgc());

  const replay = handleHumanOriginalPlantAction(getFarm(farm.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
  assert.deepEqual(dumpUgc(), ugcAfterFirst);

  const conflict = handleHumanOriginalPlantAction(
    getFarm(farm.id),
    body(getFarm(farm.id), first.json.revision, key, payload({ name: "另一株" })),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
  assert.deepEqual(dumpUgc(), ugcAfterFirst);
});

test("invalid, stale, and rejected requests are zero-change", () => {
  const farm = addFarm("GHJ789", 199);
  const revision = originalPlantActionRevision(farm, NOW);
  const before = structuredClone(farm);
  const ugcBefore = structuredClone(dumpUgc());

  const invalid = handleHumanOriginalPlantAction(
    farm,
    { ...body(farm, revision, "219ffb01-49cd-7020-84af-3d04fb1ed03d"), extra: true },
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(farm.id), before);
  assert.deepEqual(dumpUgc(), ugcBefore);

  const malformedRevision = handleHumanOriginalPlantAction(
    farm,
    body(farm, "farm-original-plant-v1:stale", "319ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(malformedRevision.status, 400);
  assert.deepEqual(getFarm(farm.id), before);

  farm.seeds.common += 1;
  const staleBefore = structuredClone(farm);
  const stale = handleHumanOriginalPlantAction(
    farm,
    body(farm, revision, "419ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(farm.id), staleBefore);

  const rejected = handleHumanOriginalPlantAction(
    farm,
    body(farm, originalPlantActionRevision(farm, NOW), "519ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(farm.id), staleBefore);
  assert.deepEqual(dumpUgc(), ugcBefore);
});

test("a failure after designCrop registers UGC is rolled back with the farm clone", () => {
  const farm = addFarm("KMPQRS");
  farm.seeds = null;
  const revision = originalPlantActionRevision(farm, NOW);
  const before = structuredClone(farm);
  const ugcBefore = structuredClone(dumpUgc());

  const result = handleHumanOriginalPlantAction(
    farm,
    body(farm, revision, "619ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(farm.id), before);
  assert.deepEqual(dumpUgc(), ugcBefore);
});

test("a save failure after designCrop leaves the farm and global UGC untouched", () => {
  const farm = addFarm("MNPQRS");
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  farm.doorbellHumanOriginalPlantActionReceipts = { old: circularReceipt };
  const revision = originalPlantActionRevision(farm, NOW);
  const before = structuredClone(farm);
  const ugcBefore = structuredClone(dumpUgc());

  const result = handleHumanOriginalPlantAction(
    farm,
    body(farm, revision, "719ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "farm_unavailable");
  assert.equal(getFarm(farm.id), farm);
  assert.deepEqual(getFarm(farm.id), before);
  assert.deepEqual(dumpUgc(), ugcBefore);
});

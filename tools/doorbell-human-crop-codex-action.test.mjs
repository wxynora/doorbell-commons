import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-crop-codex-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-25T04:00:00.000Z");
const FARM_HUMAN_KEY = "private-crop-codex-human-key";

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { projectHumanFarmCatalog } = await import("../dist/server/farm-catalog-structured.js");
const {
  cropCodexActionRevision,
  handleHumanCropCodexAction,
} = await import("../dist/server/crop-codex-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("图鉴收藏测试农场", 123456, { aiName: "小机", humanName: "我" });
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.codex = {
    wheat: { count: 2, bestQuality: 2, firstAt: NOW - 10_000 },
  };
  farm.starred = [];
  insertFarm(farm);
  return getFarm(id);
}

function body(farm, revision, action, cropId = "wheat", idempotencyKey = "019ffb01-49cd-7020-84af-3d04fb1ed03d") {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    crop_id: cropId,
    action,
    expected_codex_revision: revision,
    idempotency_key: idempotencyKey,
  };
}

test("crop codex action delegates star/unstar and returns the complete catalog resource", () => {
  const farm = addFarm();
  const revision = cropCodexActionRevision(farm, NOW);
  assert.match(revision, /^farm-crop-codex-v1:[0-9a-f]{64}$/);

  const result = handleHumanCropCodexAction(farm, body(farm, revision, "star"), NOW);

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, "019ffb01-49cd-7020-84af-3d04fb1ed03d");
  assert.equal(result.json.data.result.crop_id, "wheat");
  assert.equal(result.json.data.result.action, "star");
  assert.equal(result.json.data.result.starred, true);
  assert.equal(result.json.data.resource.farm.farm_doorplate, farm.id);
  assert.equal(result.json.data.resource.codex.entries.find((entry) => entry.crop_id === "wheat").starred, true);
  assert.equal(result.json.data.resource.codex.entries.find((entry) => entry.crop_id === "wheat").discovered, true);
  assert.equal(result.json.codex_revision, cropCodexActionRevision(getFarm(farm.id), NOW));
  assert.equal(result.json.revision, projectHumanFarmCatalog(getFarm(farm.id), NOW).revision);
  assert.deepEqual(getFarm(farm.id).starred, ["wheat"]);

  const afterStarRevision = result.json.codex_revision;
  const unstar = handleHumanCropCodexAction(
    getFarm(farm.id),
    body(getFarm(farm.id), afterStarRevision, "unstar", "wheat", "119ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(unstar.status, 200);
  assert.equal(unstar.json.data.result.action, "unstar");
  assert.equal(unstar.json.data.result.starred, false);
  assert.equal(unstar.json.data.resource.codex.entries.find((entry) => entry.crop_id === "wheat").starred, false);
  assert.deepEqual(getFarm(farm.id).starred, []);
});

test("same UUID replays exactly, while a different action conflicts without another toggle", () => {
  const farm = addFarm("BCDFGH");
  const revision = cropCodexActionRevision(farm, NOW);
  const request = body(farm, revision, "star", "wheat", "219ffb01-49cd-7020-84af-3d04fb1ed03d");
  const first = handleHumanCropCodexAction(farm, request, NOW);
  assert.equal(first.status, 200);
  const saved = structuredClone(getFarm(farm.id));

  const replay = handleHumanCropCodexAction(getFarm(farm.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), saved);

  const conflict = handleHumanCropCodexAction(
    getFarm(farm.id),
    body(getFarm(farm.id), first.json.codex_revision, "unstar", "wheat", request.idempotency_key),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), saved);
});

test("a stale codex revision is rejected without changing the farm", () => {
  const farm = addFarm("DEF567");
  const revision = cropCodexActionRevision(farm, NOW);
  const before = structuredClone(farm);

  const stale = handleHumanCropCodexAction(
    farm,
    body(farm, `farm-crop-codex-v1:${"0".repeat(64)}`, "star", "wheat", "519ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.equal(stale.json.error.current_revision, revision);
  assert.deepEqual(getFarm(farm.id), before);
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-settings-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-settings-human-key";
const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { projectHumanFarmCatalog } = await import("../dist/server/farm-catalog-structured.js");
const {
  farmSettingsActionRevision,
  handleHumanFarmSettingsAction,
} = await import("../dist/server/farm-settings-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = FARM_DOORPLATE) {
  const farm = makeFarm("设置测试农场", 123456, { aiName: "小机", humanName: "我" });
  farm.id = id;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.welcome = "旧欢迎语";
  farm.titles = ["nazhi_wangwang_delivery"];
  farm.titleEquipped = undefined;
  farm.social = { visit: true, steal: true, water: true, message: true };
  insertFarm(farm);
  return getFarm(id);
}

function body(farm, revision, field, value, key = KEY) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_catalog_revision: revision,
    field,
    value,
  };
}

test("settings action delegates supported fields and returns the complete catalog resource", () => {
  const farm = addFarm();
  const revision = farmSettingsActionRevision(farm, NOW);
  const result = handleHumanFarmSettingsAction(
    farm,
    body(farm, revision, "farm_name", "新农场名"),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, KEY);
  assert.equal(result.json.data.result.field, "farm_name");
  assert.equal(result.json.data.resource.farm.farm_name, "新农场名");
  assert.equal(result.json.data.resource.settings.farm_name, "新农场名");
  assert.match(result.json.revision, /^farm-catalog-v1:[0-9a-f]{64}$/);
  assert.equal(getFarm(farm.id).name, "新农场名");

  const welcomeRevision = farmSettingsActionRevision(getFarm(farm.id), NOW);
  const welcome = handleHumanFarmSettingsAction(
    getFarm(farm.id),
    body(getFarm(farm.id), welcomeRevision, "welcome_message", "欢迎来我家", "119ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(welcome.status, 200);
  assert.equal(getFarm(farm.id).welcome, "欢迎来我家");
});

test("title equipment uses the existing title authority and supports idempotent replay", () => {
  const farm = addFarm("BCDFGH");
  const revision = farmSettingsActionRevision(farm, NOW);
  const result = handleHumanFarmSettingsAction(
    farm,
    body(farm, revision, "equip_title", "nazhi_wangwang_delivery"),
    NOW,
  );
  assert.equal(result.status, 200);
  assert.equal(getFarm(farm.id).titleEquipped, "nazhi_wangwang_delivery");

  const saved = structuredClone(getFarm(farm.id));
  const replay = handleHumanFarmSettingsAction(getFarm(farm.id), body(getFarm(farm.id), revision, "equip_title", "nazhi_wangwang_delivery"), NOW);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, result.json);
  assert.deepEqual(getFarm(farm.id), saved);
});

test("stale, idempotency-conflicting, and unsupported settings actions do not mutate the farm", () => {
  const farm = addFarm("DEF567");
  const revision = farmSettingsActionRevision(farm, NOW);
  const before = structuredClone(farm);
  const stale = handleHumanFarmSettingsAction(
    farm,
    body(farm, "farm-catalog-v1:stale", "farm_name", "不应保存"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(farm.id), before);

  const unsupported = handleHumanFarmSettingsAction(
    farm,
    body(farm, revision, "social.visit", false, "219ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(unsupported.status, 409);
  assert.equal(unsupported.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(farm.id), before);

  const first = handleHumanFarmSettingsAction(
    farm,
    body(farm, revision, "farm_name", "第一次", "319ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(first.status, 200);
  const afterFirst = structuredClone(getFarm(farm.id));
  const conflict = handleHumanFarmSettingsAction(
    getFarm(farm.id),
    body(getFarm(farm.id), first.json.revision, "farm_name", "第二次", "319ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), afterFirst);
});

test("settings revision is stable for the same persisted state and changes after a supported write", () => {
  const farm = addFarm("GHJ789");
  const first = farmSettingsActionRevision(farm, NOW);
  assert.equal(farmSettingsActionRevision(farm, NOW + 1000), first);
  const result = handleHumanFarmSettingsAction(
    farm,
    body(farm, first, "welcome_message", "新欢迎", "419ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(result.status, 200);
  assert.notEqual(result.json.revision, first);
  assert.equal(getFarm(farm.id).welcome, "新欢迎");
  assert.equal(projectHumanFarmCatalog(getFarm(farm.id), NOW).data.settings.welcome_message, "新欢迎");
});

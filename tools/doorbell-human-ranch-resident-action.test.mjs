import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-ranch-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const FARM_HUMAN_KEY_PREFIX = "private-ranch-action-human-key-";

const { currentDayIndex } = await import("../dist/time.js");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const {
  handleHumanRanchResidentAction,
  ranchResidentActionRevision,
} = await import("../dist/server/ranch-resident-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("牧场动作测试农场", 123456);
  farm.id = id;
  farm.humanKey = `${FARM_HUMAN_KEY_PREFIX}${id}`;
  farm.humanName = "渡";
  farm.silver = 1000;
  farm.lastTickAt = NOW - 777_000;
  farm.rngState = 987654;
  farm.ranch = {
    coins: 1000,
    animals: [
      {
        kindId: "chicken",
        name: "小鸡",
        level: 1,
        ticksSinceProduce: 7,
        pending: 0,
        pendingMeat: 0,
        feedBoostPending: false,
        pendingBoost: false,
        acc: [],
      },
    ],
    pets: [{ kindId: "cat", name: "咪咪", acc: [] }],
    patrolGoose: { name: "鹅队长", acc: [] },
    wardrobe: ["cap"],
    decor: [],
    decorStore: [],
    raids: [],
    raidDebts: [],
    shop: { day: currentDayIndex(NOW) - 1, acc: ["cap"], decor: [] },
  };
  farm.glimmer = { unlocked: ["chicken_strawberry"] };
  insertFarm(farm);
  return getFarm(id);
}

function actionBody(farm, revision, idempotencyKey, action, residentType, kindId, payload = {}) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: idempotencyKey,
    expected_revision: revision,
    action,
    resident_type: residentType,
    kind_id: kindId,
    payload,
  };
}

function assertActionSuccess(result, action, residentType, kindId, key) {
  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, key);
  assert.equal(result.json.data.result.action, action);
  assert.equal(result.json.data.result.resident_type, residentType);
  assert.equal(result.json.data.result.kind_id, kindId);
  assert.equal(typeof result.json.revision, "string");
}

test("resident-detail actions map stable targets to old authorities and never advance the ranch", () => {
  const farm = addFarm();
  const originalLastTickAt = farm.lastTickAt;
  const originalRngState = farm.rngState;
  const originalShop = structuredClone(farm.ranch.shop);
  const originalRaids = structuredClone(farm.ranch.raids);
  let revision = ranchResidentActionRevision(farm, NOW);
  let result;

  result = handleHumanRanchResidentAction(
    farm,
    actionBody(farm, revision, "019ffb01-49cd-7020-84af-3d04fb1ed03d", "feed", "animal", "chicken"),
    NOW,
  );
  assertActionSuccess(result, "feed", "animal", "chicken", "019ffb01-49cd-7020-84af-3d04fb1ed03d");
  assert.deepEqual(result.json.data.result.outcome, {
    kind: "feed",
    cost_silver: 2,
    bonus_rate: 0.1,
    remaining_today: 2,
    silver_balance: 998,
  });
  revision = result.json.revision;
  assert.equal(getFarm(farm.id).ranch.animals[0].feedBoostPending, true);
  assert.equal(getFarm(farm.id).ranch.feedDaily.n, 1);

  result = handleHumanRanchResidentAction(
    getFarm(farm.id),
    actionBody(getFarm(farm.id), revision, "119ffb01-49cd-7020-84af-3d04fb1ed03d", "upgrade", "animal", "chicken"),
    NOW,
  );
  assertActionSuccess(result, "upgrade", "animal", "chicken", "119ffb01-49cd-7020-84af-3d04fb1ed03d");
  assert.deepEqual(result.json.data.result.outcome, {
    kind: "upgrade",
    level: 2,
    cost_ranch_coins: 90,
    ranch_coin_balance: 910,
  });
  revision = result.json.revision;
  assert.equal(getFarm(farm.id).ranch.animals[0].level, 2);

  const actions = [
    ["rename", "animal", "chicken", { name: "小太阳" }, "219ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["rename", "pet", "cat", { name: "小咪" }, "319ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["rename", "patrol_goose", "patrol_goose", { name: "鹅队长二号" }, "419ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["toggle_pin", "animal", "chicken", {}, "519ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["wear_accessory", "animal", "chicken", { accessory_id: "cap" }, "619ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["takeoff_accessory", "animal", "chicken", { accessory_id: "cap" }, "719ffb01-49cd-7020-84af-3d04fb1ed03d"],
    ["set_variant", "animal", "chicken", { variant_id: "chicken_strawberry" }, "819ffb01-49cd-7020-84af-3d04fb1ed03d"],
  ];
  for (const [action, residentType, kindId, payload, key] of actions) {
    const currentFarm = getFarm(farm.id);
    result = handleHumanRanchResidentAction(
      currentFarm,
      actionBody(currentFarm, revision, key, action, residentType, kindId, payload),
      NOW,
    );
    assertActionSuccess(result, action, residentType, kindId, key);
    assert.equal(result.json.data.result.outcome.kind, action);
    revision = result.json.revision;
  }

  const saved = getFarm(farm.id);
  assert.equal(saved.ranch.animals[0].name, "小太阳");
  assert.equal(saved.ranch.pets[0].name, "小咪");
  assert.equal(saved.ranch.patrolGoose.name, "鹅队长二号");
  assert.deepEqual(saved.ranch.pinned, ["chicken"]);
  assert.deepEqual(saved.ranch.animals[0].acc, []);
  assert.deepEqual(saved.ranch.wardrobe, ["cap"]);
  assert.equal(saved.ranch.animals[0].variantId, "chicken_strawberry");
  assert.equal(saved.lastTickAt, originalLastTickAt, "resident actions must not call advance");
  assert.equal(saved.rngState, originalRngState, "resident actions must not consume random state");
  assert.deepEqual(saved.ranch.shop, originalShop, "resident actions must not refresh the ranch shop");
  assert.deepEqual(saved.ranch.raids, originalRaids, "resident actions must not settle or change dispatches");
});

test("unknown or duplicate resident targets and overlong names reject before authority mutation", () => {
  const unknownFarm = addFarm("YZA456");
  unknownFarm.ranch.animals.push({ kindId: "missing-animal", name: "坏数据" });
  const unknownBefore = structuredClone(unknownFarm);
  const unknown = handleHumanRanchResidentAction(
    unknownFarm,
    actionBody(
      unknownFarm,
      ranchResidentActionRevision(unknownFarm, NOW),
      "D29ffb01-49cd-7020-84af-3d04fb1ed03d",
      "rename",
      "animal",
      "missing-animal",
      { name: "不应该被修改" },
    ),
    NOW,
  );
  assert.equal(unknown.status, 409);
  assert.equal(unknown.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(unknownFarm.id), unknownBefore);

  const duplicateFarm = addFarm("BCD567");
  duplicateFarm.ranch.animals.push({ kindId: "chicken", name: "重复鸡" });
  const duplicateBefore = structuredClone(duplicateFarm);
  const duplicate = handleHumanRanchResidentAction(
    duplicateFarm,
    actionBody(
      duplicateFarm,
      ranchResidentActionRevision(duplicateFarm, NOW),
      "E29ffb01-49cd-7020-84af-3d04fb1ed03d",
      "toggle_pin",
      "animal",
      "chicken",
    ),
    NOW,
  );
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(duplicateFarm.id), duplicateBefore);

  const longNameFarm = addFarm("EFG789");
  const longNameBefore = structuredClone(longNameFarm);
  const longName = handleHumanRanchResidentAction(
    longNameFarm,
    actionBody(
      longNameFarm,
      ranchResidentActionRevision(longNameFarm, NOW),
      "F29ffb01-49cd-7020-84af-3d04fb1ed03d",
      "rename",
      "animal",
      "chicken",
      { name: "这是一个明确超过十二个字长度的动物名字" },
    ),
    NOW,
  );
  assert.equal(longName.status, 400);
  assert.equal(longName.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(longNameFarm.id), longNameBefore);
});

test("same resident action key replays before revision checks and conflicting payloads stay zero-change", () => {
  const farm = addFarm("DEF567");
  const revision = ranchResidentActionRevision(farm, NOW);
  const body = actionBody(
    farm,
    revision,
    "919ffb01-49cd-7020-84af-3d04fb1ed03d",
    "feed",
    "animal",
    "chicken",
  );
  const first = handleHumanRanchResidentAction(farm, body, NOW);
  assertActionSuccess(first, "feed", "animal", "chicken", body.idempotency_key);
  const savedAfterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanRanchResidentAction(getFarm(farm.id), body, NOW + 86_400_000);
  assert.deepEqual(replay.json, first.json, "same key and fingerprint must replay byte-equivalent JSON");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst, "replay must not call the authority again");

  const conflict = handleHumanRanchResidentAction(
    getFarm(farm.id),
    actionBody(
      getFarm(farm.id),
      "stale-but-ignored-on-replay",
      body.idempotency_key,
      "toggle_pin",
      "animal",
      "chicken",
    ),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
});

test("stale revisions, authority rejection, and save failure leave the authoritative farm untouched", () => {
  const staleFarm = addFarm("GHJ789");
  const staleRevision = ranchResidentActionRevision(staleFarm, NOW);
  staleFarm.ranch.coins += 1;
  const staleBefore = structuredClone(staleFarm);
  const stale = handleHumanRanchResidentAction(
    staleFarm,
    actionBody(staleFarm, staleRevision, "A19ffb01-49cd-7020-84af-3d04fb1ed03d", "upgrade", "animal", "chicken"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(staleFarm.id), staleBefore);

  const rejectedFarm = addFarm("KMPQRS");
  rejectedFarm.silver = 0;
  const rejectedBefore = structuredClone(rejectedFarm);
  const rejected = handleHumanRanchResidentAction(
    rejectedFarm,
    actionBody(
      rejectedFarm,
      ranchResidentActionRevision(rejectedFarm, NOW),
      "B19ffb01-49cd-7020-84af-3d04fb1ed03d",
      "feed",
      "animal",
      "chicken",
    ),
    NOW,
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(rejectedFarm.id), rejectedBefore);

  const failedFarm = addFarm("TUV234");
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  failedFarm.doorbellHumanRanchResidentActionReceipts = { old: circularReceipt };
  const failedBefore = structuredClone(failedFarm);
  const failed = handleHumanRanchResidentAction(
    failedFarm,
    actionBody(
      failedFarm,
      ranchResidentActionRevision(failedFarm, NOW),
      "C19ffb01-49cd-7020-84af-3d04fb1ed03d",
      "rename",
      "animal",
      "chicken",
      { name: "不会落盘" },
    ),
    NOW,
  );
  assert.equal(failed.status, 503);
  assert.equal(failed.json.error.code, "farm_unavailable");
  assert.equal(getFarm(failedFarm.id), failedFarm);
  assert.equal(getFarm(failedFarm.id).ranch.animals[0].name, failedBefore.ranch.animals[0].name);
  assert.equal(
    Object.hasOwn(getFarm(failedFarm.id).doorbellHumanRanchResidentActionReceipts, "C19ffb01-49cd-7020-84af-3d04fb1ed03d"),
    false,
  );
  delete failedFarm.doorbellHumanRanchResidentActionReceipts;
});

test("the action boundary excludes global ranch actions and malformed payloads", () => {
  const farm = addFarm("WXYZ23");
  const revision = ranchResidentActionRevision(farm, NOW);
  for (const invalid of [
    { ...actionBody(farm, revision, "D19ffb01-49cd-7020-84af-3d04fb1ed03d", "collect", "animal", "chicken"), payload: {} },
    { ...actionBody(farm, revision, "E19ffb01-49cd-7020-84af-3d04fb1ed03d", "feed", "pet", "cat"), payload: {} },
    { ...actionBody(farm, revision, "F19ffb01-49cd-7020-84af-3d04fb1ed03d", "rename", "animal", "chicken"), payload: { name: "" } },
    { ...actionBody(farm, revision, "019ffb01-49cd-7020-84af-3d04fb1ed03d", "feed", "animal", "chicken"), extra: true },
  ]) {
    const before = structuredClone(getFarm(farm.id));
    const result = handleHumanRanchResidentAction(farm, invalid, NOW);
    assert.equal(result.status, 400);
    assert.equal(result.json.error.code, "invalid_request");
    assert.deepEqual(getFarm(farm.id), before);
  }
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-expedition-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const {
  handleHumanExpeditionAction,
  expeditionActionRevision,
} = await import("../dist/server/expedition-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("探险动作测试农场", 123456, { aiName: "小机", humanName: "我" });
  farm.id = id;
  farm.humanKey = `expedition-human-${id}`;
  farm.rngState = 987654;
  insertFarm(farm);
  return getFarm(id);
}

function body(farm, revision, idempotencyKey, action, payload) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: idempotencyKey,
    expected_revision: revision,
    action,
    payload,
  };
}

function activeExpedition(overrides = {}) {
  return {
    mapId: "mushroom_forest",
    status: "exploring",
    step: 0,
    hp: 5,
    bag: [],
    log: [],
    queue: ["spore_fountain"],
    pending: null,
    charm: null,
    charmEchoed: false,
    buffMod: 0,
    startedAt: NOW,
    ...overrides,
  };
}

test("expedition actions delegate every Human action to the expedition authorities", () => {
  const enterFarm = addFarm();
  const enterKey = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
  const entered = handleHumanExpeditionAction(
    enterFarm,
    body(enterFarm, expeditionActionRevision(enterFarm, NOW), enterKey, "enter", { charges: 1 }),
    NOW,
  );
  assert.equal(entered.status, 200);
  assert.equal(entered.json.data.result.receipt_id, enterKey);
  assert.equal(entered.json.data.result.action, "enter");
  assert.equal(typeof entered.json.data.result.outcome.text, "string");
  assert.equal(entered.json.data.resource.expedition.status, "available");
  assert.equal(entered.json.revision, expeditionActionRevision(getFarm(enterFarm.id), NOW));

  const exploreFarm = addFarm("BCDFGH");
  exploreFarm.expedition = activeExpedition();
  const exploreKey = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
  const explored = handleHumanExpeditionAction(
    exploreFarm,
    body(exploreFarm, expeditionActionRevision(exploreFarm, NOW), exploreKey, "explore", { charges: 1 }),
    NOW,
  );
  assert.equal(explored.status, 200);
  assert.equal(explored.json.data.result.action, "explore");
  assert.equal(explored.json.data.resource.expedition.active, false);

  const chooseFarm = addFarm("DEF567");
  chooseFarm.expedition = activeExpedition({
    queue: ["mushroom_wall"],
    pending: { type: "choice", eventId: "mushroom_wall" },
    status: "awaiting-choice",
  });
  const chooseKey = "219ffb01-49cd-7020-84af-3d04fb1ed03d";
  const chosen = handleHumanExpeditionAction(
    chooseFarm,
    body(chooseFarm, expeditionActionRevision(chooseFarm, NOW), chooseKey, "choose", { option: "A" }),
    NOW,
  );
  assert.equal(chosen.status, 200);
  assert.equal(chosen.json.data.result.action, "choose");
  assert.equal(typeof chosen.json.data.result.outcome.text, "string");

  const rollFarm = addFarm("GHJ789");
  rollFarm.expedition = activeExpedition({
    queue: ["giant_in_the_mist"],
    pending: { type: "combat", eventId: "giant_in_the_mist" },
    status: "awaiting-roll",
  });
  const rollKey = "319ffb01-49cd-7020-84af-3d04fb1ed03d";
  const rolled = handleHumanExpeditionAction(
    rollFarm,
    body(rollFarm, expeditionActionRevision(rollFarm, NOW), rollKey, "roll", {}),
    NOW,
  );
  assert.equal(rolled.status, 200);
  assert.equal(rolled.json.data.result.action, "roll");
  assert.match(rolled.json.data.result.outcome.text, /掷出/);

  const charmFarm = addFarm("KMPQRS");
  const charmKey = "419ffb01-49cd-7020-84af-3d04fb1ed03d";
  const charmed = handleHumanExpeditionAction(
    charmFarm,
    body(charmFarm, expeditionActionRevision(charmFarm, NOW), charmKey, "charm", {
      kind: "check",
      blessing: "平平安安回来。",
    }),
    NOW,
  );
  assert.equal(charmed.status, 200);
  assert.equal(charmed.json.data.result.action, "charm");
  assert.equal(getFarm(charmFarm.id).expCharm.kind, "check");

  const retreatFarm = addFarm("NPQ234");
  retreatFarm.coins = 10;
  retreatFarm.expedition = activeExpedition({ bag: [{ t: "coins", n: 7 }] });
  const retreatKey = "519ffb01-49cd-7020-84af-3d04fb1ed03d";
  const retreated = handleHumanExpeditionAction(
    retreatFarm,
    body(retreatFarm, expeditionActionRevision(retreatFarm, NOW), retreatKey, "retreat", {}),
    NOW,
  );
  assert.equal(retreated.status, 200);
  assert.equal(retreated.json.data.result.action, "retreat");
  assert.equal(getFarm(retreatFarm.id).coins, 17);
  assert.equal(retreated.json.data.resource.expedition.active, false);
});

test("expedition action keys replay exactly, conflict on stale state or UUID reuse, and reject without mutation", () => {
  const farm = addFarm("TUV234");
  farm.expedition = activeExpedition({
    queue: ["mushroom_wall"],
    pending: { type: "choice", eventId: "mushroom_wall" },
    status: "awaiting-choice",
  });
  const key = "619ffb01-49cd-7020-84af-3d04fb1ed03d";
  const request = body(farm, expeditionActionRevision(farm, NOW), key, "choose", { option: "A" });
  const first = handleHumanExpeditionAction(farm, request, NOW);
  assert.equal(first.status, 200);
  const savedAfterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanExpeditionAction(getFarm(farm.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);

  const conflict = handleHumanExpeditionAction(
    getFarm(farm.id),
    body(getFarm(farm.id), first.json.revision, key, "choose", { option: "B" }),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);

  const staleFarm = addFarm("WXYZ23");
  staleFarm.expedition = activeExpedition();
  const staleRevision = expeditionActionRevision(staleFarm, NOW);
  staleFarm.rngState += 1;
  const staleBefore = structuredClone(staleFarm);
  const stale = handleHumanExpeditionAction(
    staleFarm,
    body(staleFarm, staleRevision, "719ffb01-49cd-7020-84af-3d04fb1ed03d", "explore", { charges: 1 }),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(staleFarm.id), staleBefore);

  const rejectedFarm = addFarm("234567");
  rejectedFarm.expedition = activeExpedition({
    queue: ["mushroom_wall"],
    pending: { type: "choice", eventId: "mushroom_wall" },
    status: "awaiting-choice",
  });
  const rejectedBefore = structuredClone(rejectedFarm);
  const rejected = handleHumanExpeditionAction(
    rejectedFarm,
    body(
      rejectedFarm,
      expeditionActionRevision(rejectedFarm, NOW),
      "819ffb01-49cd-7020-84af-3d04fb1ed03d",
      "choose",
      { option: "Z" },
    ),
    NOW,
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(rejectedFarm.id), rejectedBefore);

  const invalid = handleHumanExpeditionAction(
    rejectedFarm,
    {
      ...body(
        rejectedFarm,
        expeditionActionRevision(rejectedFarm, NOW),
        "919ffb01-49cd-84af-8d04-3d04fb1ed03d",
        "roll",
        {},
      ),
      map: "mushroom_forest",
    },
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(rejectedFarm.id), rejectedBefore);
});

test("a save failure after an authoritative expedition leaves the farm untouched", () => {
  const farm = addFarm("345678");
  farm.expedition = activeExpedition();
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  farm.doorbellHumanExpeditionActionReceipts = { old: circularReceipt };
  const before = structuredClone(farm);
  const failed = handleHumanExpeditionAction(
    farm,
    body(
      farm,
      expeditionActionRevision(farm, NOW),
      "a19ffb01-49cd-84af-8d04-3d04fb1ed03d",
      "explore",
      { charges: 1 },
    ),
    NOW,
  );

  assert.equal(failed.status, 503);
  assert.equal(failed.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(farm.id), farm);
  assert.deepEqual(getFarm(farm.id), before);
  assert.equal(
    Object.hasOwn(
      getFarm(farm.id).doorbellHumanExpeditionActionReceipts,
      "a19ffb01-49cd-84af-8d04-3d04fb1ed03d",
    ),
    false,
  );
  delete farm.doorbellHumanExpeditionActionReceipts;
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-ranch-interaction-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const {
  handleHumanRanchInteractionAction,
  ranchInteractionActionRevision,
} = await import("../dist/server/ranch-interaction-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id, humanKey = `interaction-human-${id}`) {
  const farm = makeFarm(`牧场往来${id}`, 123456);
  farm.id = id;
  farm.humanKey = humanKey;
  farm.humanName = "渡";
  farm.coins = 1000;
  farm.lastTickAt = NOW;
  farm.ranch = {
    coins: 1000,
    animals: [
      {
        kindId: "chicken",
        name: "小鸡",
        level: 1,
        ticksSinceProduce: 0,
        pending: 0,
        pendingMeat: 0,
        feedBoostPending: false,
        pendingBoost: false,
        acc: [],
      },
    ],
    pets: [],
    patrolGoose: null,
    raids: [],
    raidDebts: [],
    wardrobe: [],
    decor: [],
    decorStore: [],
    shop: { day: 0, acc: [], decor: [] },
  };
  insertFarm(farm);
  return getFarm(id);
}

function body(farm, action, key, revision, extra = {}) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_revision: revision,
    action,
    ...extra,
  };
}

const keys = {
  dispatch: "019ffb01-49cd-7020-84af-3d04fb1ed03d",
  catch: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
  remit: "219ffb01-49cd-7020-84af-3d04fb1ed03d",
  send: "319ffb01-49cd-7020-84af-3d04fb1ed03d",
  conflict: "419ffb01-49cd-7020-84af-3d04fb1ed03d",
  failed: "519ffb01-49cd-7020-84af-3d04fb1ed03d",
};

test("dispatch, catch, remit and send use the old authorities with strict stable inputs", () => {
  const owner = addFarm("ABC234");
  const target = addFarm("DEF567");
  const dispatch = handleHumanRanchInteractionAction(
    owner,
    body(owner, "dispatch", keys.dispatch, ranchInteractionActionRevision(owner, NOW), {
      target_farm_doorplate: target.id,
      animal_kind_id: "chicken",
      duration_hours: 1,
    }),
    NOW,
  );
  assert.equal(dispatch.status, 200);
  assert.equal(dispatch.json.data.result.outcome.kind, "dispatch");
  assert.equal(dispatch.json.data.result.outcome.animal_kind_id, "chicken");
  assert.equal(dispatch.json.data.resource.farm.farm_doorplate, owner.id);
  assert.equal(getFarm(owner.id).ranch.raids.length, 1);

  const catchBody = body(
    target,
    "catch",
    keys.catch,
    ranchInteractionActionRevision(target, NOW),
    { raid_id: dispatch.json.data.result.outcome.raid_id },
  );
  const caught = handleHumanRanchInteractionAction(target, catchBody, NOW + 30 * 60 * 1000);
  assert.equal(caught.status, 200);
  assert.equal(caught.json.data.result.outcome.kind, "catch");
  assert.equal(getFarm(owner.id).ranch.raids.length, 0);

  const remitFarm = addFarm("GHJ789");
  const remitted = handleHumanRanchInteractionAction(
    remitFarm,
    body(remitFarm, "remit", keys.remit, ranchInteractionActionRevision(remitFarm, NOW), { amount: 25 }),
    NOW,
  );
  assert.equal(remitted.status, 200);
  assert.equal(remitted.json.data.result.outcome.kind, "remit");
  assert.equal(getFarm(remitFarm.id).ranch.coins, 975);
  assert.equal(getFarm(remitFarm.id).coins, 1025);

  const sent = handleHumanRanchInteractionAction(
    getFarm(remitFarm.id),
    body(
      getFarm(remitFarm.id),
      "send",
      keys.send,
      ranchInteractionActionRevision(getFarm(remitFarm.id), NOW),
      { amount: 10 },
    ),
    NOW,
  );
  assert.equal(sent.status, 200);
  assert.equal(sent.json.data.result.outcome.kind, "send");
  assert.equal(getFarm(remitFarm.id).ranch.coins, 985);
  assert.equal(getFarm(remitFarm.id).coins, 1015);
});

test("interaction rejects stale, invalid, unknown and authority-rejected requests without mutation", () => {
  const farm = addFarm("KMPQRS");
  const before = structuredClone(farm);
  const stale = handleHumanRanchInteractionAction(
    farm,
    body(farm, "remit", keys.conflict, "ranch-v1:stale", { amount: 1 }),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(farm.id), before);

  const invalid = handleHumanRanchInteractionAction(
    farm,
    body(farm, "dispatch", keys.failed, ranchInteractionActionRevision(farm, NOW), {
      target_farm_doorplate: "BAD",
      animal_kind_id: "chicken",
      duration_hours: 1,
      extra: true,
    }),
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");

  const rejected = handleHumanRanchInteractionAction(
    farm,
    body(farm, "remit", "619ffb01-49cd-7020-84af-3d04fb1ed03d", ranchInteractionActionRevision(farm, NOW), {
      amount: 5000,
    }),
    NOW,
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(farm.id), before);
});

test("one idempotency key replays byte-equivalent output and conflicts on another action", () => {
  const farm = addFarm("NPQ234");
  const request = body(farm, "remit", keys.remit, ranchInteractionActionRevision(farm, NOW), { amount: 5 });
  const first = handleHumanRanchInteractionAction(farm, request, NOW);
  assert.equal(first.status, 200);
  const saved = structuredClone(getFarm(farm.id));
  const replay = handleHumanRanchInteractionAction(getFarm(farm.id), request, NOW + 86_400_000);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), saved);

  const conflict = handleHumanRanchInteractionAction(
    getFarm(farm.id),
    body(getFarm(farm.id), "send", keys.remit, first.json.revision, { amount: 5 }),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), saved);
});

test("cross-farm save failure restores both farms after a successful catch", () => {
  const owner = addFarm("RST234");
  const target = addFarm("UVW567");
  const dispatch = handleHumanRanchInteractionAction(
    owner,
    body(owner, "dispatch", keys.dispatch, ranchInteractionActionRevision(owner, NOW), {
      target_farm_doorplate: target.id,
      animal_kind_id: "chicken",
      duration_hours: 1,
    }),
    NOW,
  );
  assert.equal(dispatch.status, 200);
  const ownerBefore = structuredClone(getFarm(owner.id));
  const targetLive = getFarm(target.id);
  const cycle = {};
  cycle.self = cycle;
  targetLive.doorbellHumanRanchInteractionActionReceipts = { corrupt: cycle };
  const targetBefore = structuredClone(targetLive);

  const failed = handleHumanRanchInteractionAction(
    targetLive,
    body(targetLive, "catch", keys.failed, ranchInteractionActionRevision(targetLive, NOW), {
      raid_id: dispatch.json.data.result.outcome.raid_id,
    }),
    NOW + 30 * 60 * 1000,
  );
  assert.equal(failed.status, 503);
  assert.equal(failed.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(owner.id), ownerBefore);
  assert.deepEqual(getFarm(target.id), targetBefore);
  delete targetLive.doorbellHumanRanchInteractionActionReceipts;
});

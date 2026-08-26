import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-ranch-decoration-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { projectHumanRanch } = await import("../dist/server/ranch-structured.js");
const {
  handleHumanRanchDecorationAction,
  ranchDecorationActionRevision,
} = await import("../dist/server/ranch-decoration-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id = "ABC234") {
  const farm = makeFarm("装饰动作测试农场", 123456);
  farm.id = id;
  farm.humanKey = `ranch-decoration-human-${id}`;
  farm.humanName = "渡";
  farm.lastTickAt = NOW;
  farm.rngState = 987654;
  farm.ranch = {
    coins: 1000,
    animals: [],
    pets: [],
    patrolGoose: null,
    wardrobe: [],
    decor: [],
    decorStore: ["flowerbed"],
    raids: [],
    raidDebts: [],
    shop: { day: 0, acc: [], decor: [] },
  };
  insertFarm(farm);
  return getFarm(id);
}

function body(farm, revision, idempotencyKey, action, decorationId = "flowerbed") {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: idempotencyKey,
    expected_revision: revision,
    action,
    decoration_id: decorationId,
  };
}

test("ranch decoration action places and unplaces through the authority with a full resource", () => {
  const farm = addFarm();
  const placeKey = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
  const placeRevision = ranchDecorationActionRevision(farm, NOW);

  const placed = handleHumanRanchDecorationAction(
    farm,
    body(farm, placeRevision, placeKey, "place"),
    NOW,
  );

  assert.equal(placed.status, 200);
  assert.deepEqual(placed.json.data.result, {
    receipt_id: placeKey,
    action: "place",
    decoration_id: "flowerbed",
    outcome: {
      kind: "place",
      decoration_id: "flowerbed",
      decoration_name: "花圃",
    },
  });
  assert.equal(placed.json.data.resource.decorations.status, "available");
  assert.deepEqual(placed.json.data.resource.decorations.placed, [
    { status: "known", decoration_id: "flowerbed", name: "花圃" },
  ]);
  assert.deepEqual(placed.json.data.resource.decorations.stored, []);
  assert.equal(typeof placed.json.revision, "string");
  assert.equal(typeof placed.json.server_time, "string");
  assert.deepEqual(getFarm(farm.id).ranch.decor, ["flowerbed"]);
  assert.deepEqual(getFarm(farm.id).ranch.decorStore, []);

  const unplaceKey = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
  const unplaced = handleHumanRanchDecorationAction(
    getFarm(farm.id),
    body(getFarm(farm.id), placed.json.revision, unplaceKey, "unplace"),
    NOW,
  );

  assert.equal(unplaced.status, 200);
  assert.equal(unplaced.json.data.result.outcome.kind, "unplace");
  assert.equal(unplaced.json.data.result.outcome.decoration_name, "花圃");
  assert.deepEqual(unplaced.json.data.resource.decorations.placed, []);
  assert.deepEqual(unplaced.json.data.resource.decorations.stored, [
    { status: "known", decoration_id: "flowerbed", name: "花圃" },
  ]);
  assert.deepEqual(getFarm(farm.id).ranch.decor, []);
  assert.deepEqual(getFarm(farm.id).ranch.decorStore, ["flowerbed"]);
});

test("ranch decoration action replays one key and conflicts on a different payload", () => {
  const farm = addFarm("DEF567");
  const key = "219ffb01-49cd-7020-84af-3d04fb1ed03d";
  const request = body(farm, ranchDecorationActionRevision(farm, NOW), key, "place");
  const first = handleHumanRanchDecorationAction(farm, request, NOW);
  const savedAfterFirst = structuredClone(getFarm(farm.id));

  const replay = handleHumanRanchDecorationAction(getFarm(farm.id), request, NOW + 86_400_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);

  const conflict = handleHumanRanchDecorationAction(
    getFarm(farm.id),
    body(getFarm(farm.id), first.json.revision, key, "unplace"),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), savedAfterFirst);
});

test("ranch decoration action rejects stale or business-field requests without mutation", () => {
  const staleFarm = addFarm("GHJ789");
  const staleRevision = ranchDecorationActionRevision(staleFarm, NOW);
  staleFarm.ranch.coins += 1;
  const staleBefore = structuredClone(staleFarm);
  const stale = handleHumanRanchDecorationAction(
    staleFarm,
    body(staleFarm, staleRevision, "319ffb01-49cd-7020-84af-3d04fb1ed03d", "place"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.deepEqual(getFarm(staleFarm.id), staleBefore);

  const invalidFarm = addFarm("KMPQRS");
  const invalidBefore = structuredClone(invalidFarm);
  const invalid = handleHumanRanchDecorationAction(
    invalidFarm,
    {
      ...body(
        invalidFarm,
        ranchDecorationActionRevision(invalidFarm, NOW),
        "419ffb01-49cd-7020-84af-3d04fb1ed03d",
        "place",
      ),
      price: 80,
      coordinates: { x: 1, y: 2 },
    },
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(invalidFarm.id), invalidBefore);

  const rejectedFarm = addFarm("NPQ234");
  rejectedFarm.ranch.decorStore = [];
  const rejectedBefore = structuredClone(rejectedFarm);
  const rejected = handleHumanRanchDecorationAction(
    rejectedFarm,
    body(
      rejectedFarm,
      ranchDecorationActionRevision(rejectedFarm, NOW),
      "419ffb01-49cd-7020-84af-3d04fb1ed04e",
      "unplace",
    ),
    NOW,
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, "action_rejected");
  assert.deepEqual(getFarm(rejectedFarm.id), rejectedBefore);
});

test("ranch decoration action keeps authority and farm untouched when the save fails", () => {
  const farm = addFarm("TUV234");
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  farm.doorbellHumanRanchDecorationActionReceipts = { old: circularReceipt };
  const before = structuredClone(farm);
  const failed = handleHumanRanchDecorationAction(
    farm,
    body(
      farm,
      ranchDecorationActionRevision(farm, NOW),
      "519ffb01-49cd-7020-84af-3d04fb1ed03d",
      "place",
    ),
    NOW,
  );

  assert.equal(failed.status, 503);
  assert.equal(failed.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(farm.id), farm);
  assert.deepEqual(getFarm(farm.id).ranch, before.ranch);
  assert.equal(
    Object.hasOwn(getFarm(farm.id).doorbellHumanRanchDecorationActionReceipts, "519ffb01-49cd-7020-84af-3d04fb1ed03d"),
    false,
  );
  delete farm.doorbellHumanRanchDecorationActionReceipts;
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-ranch-collection-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { projectHumanRanch } = await import("../dist/server/ranch-structured.js");
const {
  handleHumanRanchCollection,
  ranchCollectionRevision,
} = await import("../dist/server/ranch-collection-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id, animals) {
  const farm = makeFarm("牧场收取测试农场", 123456);
  farm.id = id;
  farm.humanKey = `ranch-collection-human-${id}`;
  farm.humanName = "渡";
  farm.lastTickAt = NOW;
  farm.rngState = 987654;
  farm.ranch = {
    coins: 100,
    animals,
    pets: [],
    patrolGoose: null,
    wardrobe: [],
    decor: [],
    decorStore: [],
    raids: [],
    raidDebts: [],
    shop: { day: 0, acc: [], decor: [] },
  };
  insertFarm(farm);
  return getFarm(id);
}

function animal(kindId, pending = 0, pendingMeat = 0) {
  return {
    kindId,
    name: null,
    level: 1,
    ticksSinceProduce: 0,
    pending,
    pendingMeat,
    feedBoostPending: false,
    pendingBoost: false,
    acc: [],
  };
}

function body(farm, revision, idempotencyKey) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: idempotencyKey,
    expected_revision: revision,
  };
}

test("ranch collection uses the authority on a clone and returns real destinations", () => {
  const farm = addFarm("ABC234", [animal("chicken", 1), animal("rabbit", 1)]);
  const beforeLastTickAt = farm.lastTickAt;
  const beforeRevision = ranchCollectionRevision(farm, NOW);
  const request = body(farm, beforeRevision, "019ffb01-49cd-7020-84af-3d04fb1ed03d");

  const result = handleHumanRanchCollection(farm, request, NOW);

  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.json).sort(), ["data", "revision", "server_time"]);
  assert.equal(result.json.data.result.receipt_id, request.idempotency_key);
  assert.equal(result.json.data.result.gross_value, 115);
  assert.equal(result.json.data.result.ranch_coins_gained, 90);
  assert.equal(result.json.data.result.debt_paid, 0);
  assert.equal(result.json.data.result.stored_count, 1);
  assert.equal(result.json.data.result.non_cookable_count, 1);
  assert.deepEqual(
    result.json.data.result.items.map(({ item_id, quantity, destination }) => ({
      item_id,
      quantity,
      destination,
    })),
    [
      { item_id: "chicken_egg", quantity: 1, destination: "kitchen" },
      { item_id: "rabbit_fur", quantity: 1, destination: "ranch_coins" },
    ],
  );
  assert.equal(result.json.data.resource.collectable.total_pending_count, 0);
  assert.equal(result.json.data.resource.collectable.total_pending_meat_count, 0);
  assert.equal(getFarm(farm.id).lastTickAt, beforeLastTickAt, "collection must not advance time");
  assert.equal(getFarm(farm.id).ranch.animals[0].pending, 0);
  assert.equal(getFarm(farm.id).ranch.animals[1].pending, 0);
  assert.equal(getFarm(farm.id).ranch.kitchen.products.length, 1);
});

test("ranch collection replays by UUID, rejects stale revisions, and rejects extra client business fields", () => {
  const farm = addFarm("DEF567", [animal("chicken", 1)]);
  const revision = ranchCollectionRevision(farm, NOW);
  const request = body(farm, revision, "019ffb01-49cd-7020-84af-3d04fb1ed04e");
  const success = handleHumanRanchCollection(farm, request, NOW);
  assert.equal(success.status, 200);
  const savedAfterSuccess = structuredClone(getFarm(farm.id));

  const replay = handleHumanRanchCollection(getFarm(farm.id), request, NOW);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, success.json);
  assert.deepEqual(getFarm(farm.id), savedAfterSuccess);

  const conflict = handleHumanRanchCollection(
    getFarm(farm.id),
    { ...request, expected_revision: success.json.revision },
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");

  const invalid = handleHumanRanchCollection(
    farm,
    { ...request, idempotency_key: "019ffb01-49cd-7020-84af-3d04fb1ed04f", items: [] },
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");

  const staleFarm = addFarm("GHJ789", [animal("chicken", 1)]);
  const staleRevision = ranchCollectionRevision(staleFarm, NOW);
  staleFarm.ranch.coins += 1;
  const stale = handleHumanRanchCollection(
    staleFarm,
    body(staleFarm, staleRevision, "019ffb01-49cd-7020-84af-3d04fb1ed04f"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.equal(getFarm(staleFarm.id).ranch.animals[0].pending, 1);
});

test("ranch collection keeps no-output and save failures zero-change", () => {
  const empty = addFarm("KMPQRS", [animal("chicken")]);
  const emptyBefore = structuredClone(empty);
  const emptyResult = handleHumanRanchCollection(
    empty,
    body(empty, ranchCollectionRevision(empty, NOW), "019ffb01-49cd-7020-84af-3d04fb1ed050"),
    NOW,
  );
  assert.equal(emptyResult.status, 409);
  assert.equal(emptyResult.json.error.code, "no_collectable");
  assert.deepEqual(getFarm(empty.id), emptyBefore);

  const saveFailure = addFarm("TUV234", [animal("chicken", 1)]);
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  saveFailure.doorbellHumanRanchCollectionReceipts = { old: circularReceipt };
  const saveFailureBefore = structuredClone(saveFailure);
  const failed = handleHumanRanchCollection(
    saveFailure,
    body(
      saveFailure,
      ranchCollectionRevision(saveFailure, NOW),
      "019ffb01-49cd-7020-84af-3d04fb1ed051",
    ),
    NOW,
  );
  assert.equal(failed.status, 503);
  assert.equal(failed.json.error.code, "farm_unavailable");
  assert.equal(getFarm(saveFailure.id), saveFailure);
  assert.equal(getFarm(saveFailure.id).ranch.animals[0].pending, saveFailureBefore.ranch.animals[0].pending);
  assert.equal(Object.hasOwn(getFarm(saveFailure.id).doorbellHumanRanchCollectionReceipts, "019ffb01-49cd-7020-84af-3d04fb1ed051"), false);
  delete saveFailure.doorbellHumanRanchCollectionReceipts;
});

test("ranch collection reports the authority debt destination and exact money deltas", () => {
  const farm = addFarm("WXYZ23", [animal("chicken", 1)]);
  farm.ranch.raidDebts = [{ creditorFarmId: "ABC234", coins: 10 }];
  const result = handleHumanRanchCollection(
    farm,
    body(farm, ranchCollectionRevision(farm, NOW), "019ffb01-49cd-7020-84af-3d04fb1ed052"),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.gross_value, 25);
  assert.equal(result.json.data.result.debt_paid, 10);
  assert.equal(result.json.data.result.ranch_coins_gained, 15);
  assert.deepEqual(result.json.data.result.items, [
    {
      instance_id: result.json.data.result.items[0].instance_id,
      item_id: "chicken_egg",
      name: "鸡蛋",
      quantity: 1,
      unit_value: 25,
      destination: "debt",
    },
  ]);
  assert.equal(getFarm(farm.id).ranch.raidDebts.length, 0);
});

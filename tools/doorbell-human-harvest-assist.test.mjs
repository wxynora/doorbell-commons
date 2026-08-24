import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-harvest-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-human-harvest-test-token";

const originalDateNow = Date.now;
const originalRandom = Math.random;
const NOW = Date.parse("2026-08-24T10:00:00.000Z");
Date.now = () => NOW;
Math.random = () => 0.999999;

const { HUMAN_HARVEST_DAILY_CAP, TICK_MS } = await import("../dist/config.js");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { currentDayIndex } = await import("../dist/time.js");
const { startServer } = await import("../dist/server.js");

const TOKEN = "farm-doorbell-human-harvest-test-token";
const READ_PATH = "/internal/doorbell/human/field/read";
const HARVEST_PATH = "/internal/doorbell/human/field/harvest-assist";

function addFarm(id, humanKey, plots) {
  const farm = makeFarm(`${id} harvest test`);
  farm.id = id;
  farm.humanKey = humanKey;
  farm.humanName = "渡";
  farm.lastTickAt = NOW;
  farm.plots = plots;
  insertFarm(farm);
  return farm;
}

function ripe(seedType, extra = {}) {
  return {
    id: extra.id ?? 1,
    crop: {
      seedType,
      growTicks: extra.growTicks ?? 2,
      progress: extra.progress ?? 2,
      ripe: extra.ripe ?? true,
      waterCount: extra.waterCount ?? 0,
      ...(extra.limitedId ? { limitedId: extra.limitedId } : {}),
    },
  };
}

function growing(seedType, extra = {}) {
  return ripe(seedType, {
    ...extra,
    progress: extra.progress ?? 0,
    ripe: false,
  });
}

async function request(baseUrl, path, body, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers: {
      ...(options.authorization === false ? {} : { authorization: `Bearer ${TOKEN}` }),
      "content-type": "application/json",
    },
    body: options.raw ?? JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

function harvestBody(farm, revision, key) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: key,
    expected_revision: revision,
    payload: {},
  };
}

function assertError(body, code) {
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
}

test("structured Human harvest keeps the old chain, projection, idempotency, and rollback boundaries", async (t) => {
  const projectedFarm = addFarm("ABC234", "human-projected", [
    growing("common", { id: 1, progress: 1 }),
    ripe("fantasy", { id: 2 }),
  ]);
  projectedFarm.lastTickAt = NOW - TICK_MS;
  const staleOriginal = structuredClone(projectedFarm);

  const stateConflictFarm = addFarm("DEF567", "human-state", [ripe("common", { id: 1 })]);
  const noRipeFarm = addFarm("GHJ789", "human-no-ripe", [growing("common", { id: 1 })]);
  const exhaustedFarm = addFarm("KMPQRS", "human-exhausted", [ripe("common", { id: 1 })]);
  exhaustedFarm.humanHarvestDaily = { day: currentDayIndex(NOW), n: HUMAN_HARVEST_DAILY_CAP };
  const badLimitedFarm = addFarm("TUV234", "human-bad-limited", [
    ripe("common", { id: 1 }),
    ripe("limited", { id: 2, limitedId: "missing-limited-id" }),
  ]);
  const saveFailureFarm = addFarm("WXYZ23", "human-save-failure", [ripe("common", { id: 1 })]);

  const server = startServer(0);
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    Date.now = originalDateNow;
    Math.random = originalRandom;
    rmSync(dataDirectory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const readProjected = await request(baseUrl, READ_PATH, {
    farm_human_key: projectedFarm.humanKey,
    expected_farm_doorplate: projectedFarm.id,
  });
  assert.equal(readProjected.response.status, 200);
  assert.equal(readProjected.body.data.plots[0].state, "ripe", "read must project the next mature tick");
  assert.equal(readProjected.body.data.plots[0].identity_state, "hidden");
  assert.equal(readProjected.body.data.plots[0].crop_identity, null);
  assert.equal(readProjected.body.data.plots[1].identity_state, "hidden");
  assert.equal(readProjected.body.data.plots[1].crop_identity, null);
  assert.deepEqual(projectedFarm, staleOriginal, "field read must not advance the authoritative farm");

  const unauthorized = await request(
    baseUrl,
    HARVEST_PATH,
    harvestBody(projectedFarm, readProjected.body.revision, "auth-1"),
    { authorization: false },
  );
  assert.equal(unauthorized.response.status, 401);
  assertError(unauthorized.body, "authentication_required");

  const wrongMethod = await request(baseUrl, HARVEST_PATH, undefined, { method: "GET" });
  assert.equal(wrongMethod.response.status, 405);
  assertError(wrongMethod.body, "invalid_request");

  const extraField = await request(baseUrl, HARVEST_PATH, {
    ...harvestBody(projectedFarm, readProjected.body.revision, "strict-1"),
    extra: true,
  });
  assert.equal(extraField.response.status, 400);
  assertError(extraField.body, "invalid_request");

  const missingHumanBinding = await request(baseUrl, HARVEST_PATH, {
    ...harvestBody(projectedFarm, readProjected.body.revision, "binding-1"),
    farm_human_key: "missing-human-key",
  });
  assert.equal(missingHumanBinding.response.status, 404);
  assertError(missingHumanBinding.body, "farm_credential_not_found");

  const wrongDoorplate = await request(baseUrl, HARVEST_PATH, {
    ...harvestBody(projectedFarm, readProjected.body.revision, "binding-2"),
    expected_farm_doorplate: stateConflictFarm.id,
  });
  assert.equal(wrongDoorplate.response.status, 409);
  assertError(wrongDoorplate.body, "farm_doorplate_mismatch");

  const successBody = harvestBody(projectedFarm, readProjected.body.revision, "success-1");
  const success = await request(baseUrl, HARVEST_PATH, successBody);
  assert.equal(success.response.status, 200);
  assert.deepEqual(Object.keys(success.body).sort(), ["data", "revision", "server_time"]);
  assert.deepEqual(Object.keys(success.body.data.result).sort(), [
    "farm_coins_gained",
    "harvested_count",
    "harvests",
    "new_titles",
    "receipt_id",
    "season_event",
    "silver_gained",
  ]);
  assert.equal(success.body.data.result.receipt_id, "success-1");
  assert.equal(success.body.data.result.harvested_count, 2);
  assert.equal(success.body.data.result.harvests.length, 2);
  assert.ok(success.body.data.result.harvests.every((item) => item.crop.crop_id && item.crop.name));
  assert.deepEqual(success.body.data.resource.plots.map((plot) => plot.state), ["empty", "empty"]);
  const savedAfterSuccess = structuredClone(getFarm(projectedFarm.id));
  assert.equal(savedAfterSuccess.humanHarvestDaily.n, 1);
  assert.equal(savedAfterSuccess.doorbellHumanHarvestReceipts["success-1"].response.data.result.receipt_id, "success-1");
  const readAfterSuccess = await request(baseUrl, READ_PATH, {
    farm_human_key: projectedFarm.humanKey,
    expected_farm_doorplate: projectedFarm.id,
  });
  assert.equal(readAfterSuccess.body.revision, success.body.revision, "receipt ledger is excluded from field revision");

  const replay = await request(baseUrl, HARVEST_PATH, successBody);
  assert.equal(replay.response.status, 200);
  assert.deepEqual(replay.body, success.body, "same key and fingerprint must replay byte-equivalent JSON data");
  assert.deepEqual(getFarm(projectedFarm.id), savedAfterSuccess, "replay must not run the chain again");

  const idempotencyConflict = await request(baseUrl, HARVEST_PATH, {
    ...successBody,
    expected_revision: success.body.revision,
  });
  assert.equal(idempotencyConflict.response.status, 409);
  assertError(idempotencyConflict.body, "idempotency_conflict");
  assert.deepEqual(getFarm(projectedFarm.id), savedAfterSuccess);

  const stateRead = await request(baseUrl, READ_PATH, {
    farm_human_key: stateConflictFarm.humanKey,
    expected_farm_doorplate: stateConflictFarm.id,
  });
  getFarm(stateConflictFarm.id).log.push("concurrent hidden state change");
  const stateAtRequest = structuredClone(getFarm(stateConflictFarm.id));
  const stateConflict = await request(
    baseUrl,
    HARVEST_PATH,
    harvestBody(stateConflictFarm, stateRead.body.revision, "state-1"),
  );
  assert.equal(stateConflict.response.status, 409);
  assertError(stateConflict.body, "state_conflict");
  assert.deepEqual(getFarm(stateConflictFarm.id), stateAtRequest);

  const noRipeRead = await request(baseUrl, READ_PATH, {
    farm_human_key: noRipeFarm.humanKey,
    expected_farm_doorplate: noRipeFarm.id,
  });
  const noRipeOriginal = structuredClone(getFarm(noRipeFarm.id));
  const noRipe = await request(
    baseUrl,
    HARVEST_PATH,
    harvestBody(noRipeFarm, noRipeRead.body.revision, "empty-1"),
  );
  assert.equal(noRipe.response.status, 409);
  assertError(noRipe.body, "no_ripe_plots");
  assert.deepEqual(getFarm(noRipeFarm.id), noRipeOriginal);

  const exhaustedRead = await request(baseUrl, READ_PATH, {
    farm_human_key: exhaustedFarm.humanKey,
    expected_farm_doorplate: exhaustedFarm.id,
  });
  const exhaustedOriginal = structuredClone(getFarm(exhaustedFarm.id));
  const exhausted = await request(
    baseUrl,
    HARVEST_PATH,
    harvestBody(exhaustedFarm, exhaustedRead.body.revision, "cap-1"),
  );
  assert.equal(exhausted.response.status, 409);
  assertError(exhausted.body, "harvest_assist_exhausted");
  assert.deepEqual(getFarm(exhaustedFarm.id), exhaustedOriginal);

  const badLimitedRead = await request(baseUrl, READ_PATH, {
    farm_human_key: badLimitedFarm.humanKey,
    expected_farm_doorplate: badLimitedFarm.id,
  });
  const badLimitedOriginal = structuredClone(getFarm(badLimitedFarm.id));
  const badLimited = await request(
    baseUrl,
    HARVEST_PATH,
    harvestBody(badLimitedFarm, badLimitedRead.body.revision, "bad-limited-1"),
  );
  assert.equal(badLimited.response.status, 503);
  assertError(badLimited.body, "farm_unavailable");
  assert.deepEqual(getFarm(badLimitedFarm.id), badLimitedOriginal, "a failed limited crop must roll back the whole batch");

  const saveFailureRead = await request(baseUrl, READ_PATH, {
    farm_human_key: saveFailureFarm.humanKey,
    expected_farm_doorplate: saveFailureFarm.id,
  });
  const circularReceipt = {};
  circularReceipt.self = circularReceipt;
  saveFailureFarm.doorbellHumanHarvestReceipts = { old: circularReceipt };
  const saveFailure = await request(
    baseUrl,
    HARVEST_PATH,
    harvestBody(saveFailureFarm, saveFailureRead.body.revision, "save-failure-1"),
  );
  assert.equal(saveFailure.response.status, 503);
  assertError(saveFailure.body, "farm_unavailable");
  assert.equal(getFarm(saveFailureFarm.id), saveFailureFarm, "replaceFarm must restore the original map entry after save failure");
  assert.equal(getFarm(saveFailureFarm.id).plots[0].crop.ripe, true);
  assert.equal(getFarm(saveFailureFarm.id).humanHarvestDaily, undefined);
  assert.equal(getFarm(saveFailureFarm.id).doorbellHumanHarvestReceipts.old, circularReceipt);
  assert.equal(Object.hasOwn(getFarm(saveFailureFarm.id).doorbellHumanHarvestReceipts, "save-failure-1"), false);
});

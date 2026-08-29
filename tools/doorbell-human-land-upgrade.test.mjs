import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-land-upgrade-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-human-land-upgrade-test-token";

const originalDateNow = Date.now;
const NOW = Date.parse("2026-08-30T08:00:00.000Z");
Date.now = () => NOW;

const { crops } = await import("../dist/content.js");
const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

const TOKEN = "farm-doorbell-human-land-upgrade-test-token";
const READ_PATH = "/internal/doorbell/human/field/read";
const UPGRADE_PATH = "/internal/doorbell/human/field/upgrade";

function qualifyingCodex() {
  const common = crops.filter((crop) => crop.category === "common").slice(0, 24);
  const fantasy = crops.filter((crop) => crop.category === "fantasy").slice(0, 10);
  return Object.fromEntries(
    [...common, ...fantasy].map((crop) => [
      crop.id,
      { count: 1, bestQuality: 1, firstAt: NOW - 1_000 },
    ]),
  );
}

function addFarm(id, humanKey, { tier = 5, plots = 20, coins = 0, qualified = false } = {}) {
  const farm = makeFarm(`${id} land upgrade test`);
  farm.id = id;
  farm.humanKey = humanKey;
  farm.humanName = "渡";
  farm.lastTickAt = NOW;
  farm.landTier = tier;
  farm.plots = Array.from({ length: plots }, (_, index) => ({ id: index + 1, crop: null }));
  farm.coins = coins;
  farm.codex = qualified ? qualifyingCodex() : {};
  insertFarm(farm);
  return farm;
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

function identity(farm) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
  };
}

function upgradeBody(farm, revision, key) {
  return {
    ...identity(farm),
    idempotency_key: key,
    expected_revision: revision,
    payload: {},
  };
}

function assertError(body, code) {
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
}

test("Human land upgrade projects and executes only the existing upgradeLand authority", async (t) => {
  const eligible = addFarm("ABC234", "eligible-human", {
    coins: 250_000,
    qualified: true,
  });
  const blocked = addFarm("DEF567", "blocked-human", { coins: 10 });
  const maximum = addFarm("GHJ789", "maximum-human", {
    tier: 9,
    plots: 36,
    coins: 999_999,
    qualified: true,
  });
  const stale = addFarm("KMPQRS", "stale-human", {
    coins: 250_000,
    qualified: true,
  });

  const server = startServer(0);
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    Date.now = originalDateNow;
    rmSync(dataDirectory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const eligibleRead = await request(baseUrl, READ_PATH, identity(eligible));
  assert.equal(eligibleRead.response.status, 200);
  assert.deepEqual(eligibleRead.body.data.land, {
    tier: 5,
    name: "丰壤",
    is_max_tier: false,
    next_upgrade: {
      tier: 6,
      name: "广畴",
      plots: 24,
      cost_farm_coins: 200_000,
      can_upgrade: true,
      status_message: null,
    },
  });
  assert.equal(getFarm(eligible.id).landTier, 5, "read preview must not upgrade the farm");

  const blockedRead = await request(baseUrl, READ_PATH, identity(blocked));
  assert.equal(blockedRead.response.status, 200);
  assert.equal(blockedRead.body.data.land.next_upgrade.can_upgrade, false);
  assert.equal(blockedRead.body.data.land.next_upgrade.cost_farm_coins, 200_000);
  assert.match(blockedRead.body.data.land.next_upgrade.status_message, /金币 10\/200000/);
  assert.match(blockedRead.body.data.land.next_upgrade.status_message, /普通图鉴 0\/24 种/);

  const maximumRead = await request(baseUrl, READ_PATH, identity(maximum));
  assert.equal(maximumRead.response.status, 200);
  assert.deepEqual(maximumRead.body.data.land, {
    tier: 9,
    name: "丰原",
    is_max_tier: true,
    next_upgrade: null,
  });

  const unauthorized = await request(
    baseUrl,
    UPGRADE_PATH,
    upgradeBody(eligible, eligibleRead.body.revision, "00000000-0000-4000-8000-000000000001"),
    { authorization: false },
  );
  assert.equal(unauthorized.response.status, 401);
  assertError(unauthorized.body, "authentication_required");

  const extra = await request(baseUrl, UPGRADE_PATH, {
    ...upgradeBody(eligible, eligibleRead.body.revision, "00000000-0000-4000-8000-000000000002"),
    extra: true,
  });
  assert.equal(extra.response.status, 400);
  assertError(extra.body, "invalid_request");

  const blockedBefore = structuredClone(getFarm(blocked.id));
  const rejected = await request(
    baseUrl,
    UPGRADE_PATH,
    upgradeBody(blocked, blockedRead.body.revision, "00000000-0000-4000-8000-000000000003"),
  );
  assert.equal(rejected.response.status, 409);
  assertError(rejected.body, "land_upgrade_rejected");
  assert.match(rejected.body.error.message, /升级到「广畴」还差/);
  assert.deepEqual(getFarm(blocked.id), blockedBefore, "a rejected upgrade must not mutate the farm");

  const staleRead = await request(baseUrl, READ_PATH, identity(stale));
  getFarm(stale.id).log.push("concurrent state change");
  const staleBefore = structuredClone(getFarm(stale.id));
  const stateConflict = await request(
    baseUrl,
    UPGRADE_PATH,
    upgradeBody(stale, staleRead.body.revision, "00000000-0000-4000-8000-000000000004"),
  );
  assert.equal(stateConflict.response.status, 409);
  assertError(stateConflict.body, "state_conflict");
  assert.equal(typeof stateConflict.body.error.current_revision, "string");
  assert.deepEqual(getFarm(stale.id), staleBefore);

  const successBody = upgradeBody(
    eligible,
    eligibleRead.body.revision,
    "00000000-0000-4000-8000-000000000005",
  );
  const success = await request(baseUrl, UPGRADE_PATH, successBody);
  assert.equal(success.response.status, 200);
  assert.deepEqual(success.body.data.result.previous_land, {
    tier: 5,
    name: "丰壤",
    plots: 20,
  });
  assert.deepEqual(success.body.data.result.upgraded_land, {
    tier: 6,
    name: "广畴",
    plots: 24,
  });
  assert.equal(success.body.data.result.farm_coins_spent, 200_000);
  assert.match(success.body.data.result.message, /地块增至 24/);
  assert.equal(success.body.data.resource.balance.farm_coins, 50_000);
  assert.equal(success.body.data.resource.plots.length, 24);
  assert.equal(success.body.data.resource.land.tier, 6);
  assert.equal(success.body.data.resource.land.next_upgrade.cost_farm_coins, 300_000);

  const saved = structuredClone(getFarm(eligible.id));
  assert.equal(saved.landTier, 6);
  assert.equal(saved.plots.length, 24);
  assert.equal(saved.coins, 50_000);
  assert.equal(
    saved.doorbellHumanLandUpgradeReceipts[successBody.idempotency_key].response.data.result.receipt_id,
    successBody.idempotency_key,
  );

  const replay = await request(baseUrl, UPGRADE_PATH, successBody);
  assert.equal(replay.response.status, 200);
  assert.deepEqual(replay.body, success.body);
  assert.deepEqual(getFarm(eligible.id), saved, "idempotent replay must not buy another tier");

  const idempotencyConflict = await request(baseUrl, UPGRADE_PATH, {
    ...successBody,
    expected_revision: success.body.revision,
  });
  assert.equal(idempotencyConflict.response.status, 409);
  assertError(idempotencyConflict.body, "idempotency_conflict");
  assert.deepEqual(getFarm(eligible.id), saved);
});

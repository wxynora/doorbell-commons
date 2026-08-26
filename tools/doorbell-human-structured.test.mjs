import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-field-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-human-field-test-token";

const NOW = Date.parse("2026-08-23T10:00:00.000Z");
const originalDateNow = Date.now;
let clock = NOW;
Date.now = () => clock;

const { HUMAN_HARVEST_DAILY_CAP, TICK_MS } = await import("../dist/config.js");
const { makeFarm } = await import("../dist/game.js");
const {
  activateStoredNatureWorld,
  getNatureWorld,
  insertFarm,
} = await import("../dist/store.js");
const { natureSnapshot } = await import("../dist/nature.js");
const { currentDayIndex, currentSeason } = await import("../dist/time.js");
const { projectHumanField } = await import("../dist/server/human-structured.js");
const { registerUgc } = await import("../dist/ugc.js");
const { startServer } = await import("../dist/server.js");

const FARM = "ABC234";
const OTHER_FARM = "DEF567";
const HUMAN_KEY = "human-field-key";
const FIELD_PATH = "/internal/doorbell/human/field/read";

function strictError(body, code) {
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
}

async function request(baseUrl, body, options = {}) {
  const response = await fetch(`${baseUrl}${FIELD_PATH}`, {
    method: options.method ?? "POST",
    headers: {
      ...(options.authorization === false
        ? {}
        : { authorization: "Bearer farm-doorbell-human-field-test-token" }),
      "content-type": "application/json",
    },
    body: options.raw ?? JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test("Doorbell Human field read is strict, pure, projected, and keeps hidden crops hidden until harvest", async (t) => {
  t.after(() => {
    Date.now = originalDateNow;
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  registerUgc({
    id: "ugc_field_test",
    name: "试验星花",
    category: "ugc",
    rarity: "SR",
    growTicks: 4,
  });

  const farm = makeFarm("Field Test Farm");
  farm.id = FARM;
  farm.humanKey = HUMAN_KEY;
  farm.name = "渡的小农场";
  farm.welcome = "风吹过来时，记得看看麦浪。";
  farm.coins = 1280;
  farm.landTier = 3;
  farm.harvested = 100;
  farm.titles = ["rich_1"];
  farm.titleEquipped = "rich_1";
  farm.lastTickAt = NOW - 2.5 * TICK_MS;
  farm.humanHarvestDaily = { day: currentDayIndex(NOW), n: 1 };
  farm.plots = [
    {
      id: 1,
      crop: {
        seedType: "common",
        growTicks: 6,
        progress: 3,
        ripe: false,
        waterCount: 2,
      },
    },
    {
      id: 2,
      crop: {
        seedType: "fantasy",
        growTicks: 12,
        progress: 11,
        ripe: false,
        waterCount: 1,
      },
    },
    {
      id: 3,
      crop: {
        seedType: "limited",
        limitedId: "christmas_tree",
        growTicks: 20,
        progress: 2,
        ripe: false,
        waterCount: 3,
      },
    },
    {
      id: 4,
      crop: {
        seedType: "limited",
        limitedId: "ugc_field_test",
        growTicks: 4,
        progress: 3,
        ripe: false,
        waterCount: 0,
      },
    },
    {
      id: 5,
      crop: {
        seedType: "limited",
        limitedId: "missing_limited_crop",
        growTicks: 8,
        progress: 1,
        ripe: false,
        waterCount: 0,
      },
    },
    { id: 6, crop: null },
  ];
  insertFarm(farm);
  const originalFarm = structuredClone(farm);

  const brokenFarm = makeFarm("Broken Field Farm");
  brokenFarm.id = OTHER_FARM;
  brokenFarm.humanKey = "broken-human-field-key";
  insertFarm(brokenFarm);
  brokenFarm.landTier = 999;
  const inactiveField = projectHumanField(farm, NOW);
  const expectedLegacySeasonId = {
    春: "spring",
    夏: "summer",
    秋: "autumn",
    冬: "winter",
  }[currentSeason(NOW).name];
  assert.equal(inactiveField.data.season.id, expectedLegacySeasonId);
  assert.equal(inactiveField.data.weather, null);
  activateStoredNatureWorld({ now: NOW, seed: "human-field-weather-test" });
  const expectedNature = natureSnapshot(getNatureWorld(), NOW);
  assert.equal(expectedNature.status, "active");
  assert.ok(expectedNature.season);
  assert.ok(expectedNature.weather);

  const server = startServer(0);
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await request(baseUrl, {
    farm_human_key: HUMAN_KEY,
    expected_farm_doorplate: FARM,
  }, { authorization: false });
  assert.equal(unauthorized.response.status, 401);
  strictError(unauthorized.body, "authentication_required");

  const wrongMethod = await request(baseUrl, undefined, { method: "GET" });
  assert.equal(wrongMethod.response.status, 405);
  strictError(wrongMethod.body, "invalid_request");

  const malformed = await request(baseUrl, undefined, { raw: "{broken" });
  assert.equal(malformed.response.status, 400);
  strictError(malformed.body, "invalid_request");

  const extraField = await request(baseUrl, {
    farm_human_key: HUMAN_KEY,
    expected_farm_doorplate: FARM,
    farm_doorplate: OTHER_FARM,
  });
  assert.equal(extraField.response.status, 400);
  strictError(extraField.body, "invalid_request");

  const missingCredential = await request(baseUrl, {
    farm_human_key: "missing-human-key",
    expected_farm_doorplate: FARM,
  });
  assert.equal(missingCredential.response.status, 404);
  strictError(missingCredential.body, "farm_credential_not_found");
  assert.equal(JSON.stringify(missingCredential.body).includes("missing-human-key"), false);

  const mismatchedDoorplate = await request(baseUrl, {
    farm_human_key: HUMAN_KEY,
    expected_farm_doorplate: OTHER_FARM,
  });
  assert.equal(mismatchedDoorplate.response.status, 409);
  strictError(mismatchedDoorplate.body, "farm_doorplate_mismatch");

  const unavailable = await request(baseUrl, {
    farm_human_key: "broken-human-field-key",
    expected_farm_doorplate: OTHER_FARM,
  });
  assert.equal(unavailable.response.status, 503);
  strictError(unavailable.body, "farm_unavailable");

  const first = await request(baseUrl, {
    farm_human_key: HUMAN_KEY,
    expected_farm_doorplate: FARM,
  });
  assert.equal(first.response.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ["data", "revision", "server_time"]);
  assert.match(first.body.revision, /^field-v1:[0-9a-f]{64}$/);
  assert.equal(first.body.server_time, new Date(NOW).toISOString());
  assert.deepEqual(first.body.data, {
    farm: {
      farm_doorplate: FARM,
      farm_name: "渡的小农场",
      welcome_message: "风吹过来时，记得看看麦浪。",
      equipped_title: { title_id: "rich_1", name: "第一桶金" },
    },
    balance: { farm_coins: 1280 },
    season: {
      id: expectedNature.season.id,
      name: currentSeason(NOW).name,
    },
    weather: { condition: expectedNature.weather.condition },
    land: { tier: 3, name: "沃土" },
    plots: [
      {
        plot_id: 1,
        state: "growing",
        seed_type: "common",
        watered: 2,
        progress: { current: 5, total: 6 },
        matures_at: new Date(farm.lastTickAt + 3 * TICK_MS).toISOString(),
        identity_state: "hidden",
        crop_identity: null,
      },
      {
        plot_id: 2,
        state: "ripe",
        seed_type: "fantasy",
        watered: 1,
        progress: { current: 12, total: 12 },
        matures_at: null,
        identity_state: "hidden",
        crop_identity: null,
      },
      {
        plot_id: 3,
        state: "growing",
        seed_type: "limited",
        watered: 3,
        progress: { current: 4, total: 20 },
        matures_at: new Date(farm.lastTickAt + 18 * TICK_MS).toISOString(),
        identity_state: "known",
        crop_identity: {
          crop_id: "christmas_tree",
          name: "圣诞树",
          category: "limited",
        },
      },
      {
        plot_id: 4,
        state: "ripe",
        seed_type: "limited",
        watered: 0,
        progress: { current: 4, total: 4 },
        matures_at: null,
        identity_state: "known",
        crop_identity: {
          crop_id: "ugc_field_test",
          name: "试验星花",
          category: "ugc",
        },
      },
      {
        plot_id: 5,
        state: "growing",
        seed_type: "limited",
        watered: 0,
        progress: { current: 3, total: 8 },
        matures_at: new Date(farm.lastTickAt + 7 * TICK_MS).toISOString(),
        identity_state: "unavailable",
        crop_identity: null,
      },
      {
        plot_id: 6,
        state: "empty",
        seed_type: null,
        watered: 0,
        progress: null,
        matures_at: null,
        identity_state: "empty",
        crop_identity: null,
      },
    ],
    harvest_assist: {
      daily_limit: HUMAN_HARVEST_DAILY_CAP,
      remaining: 2,
      mature_plot_count: 2,
      can_assist: true,
      reset_at: new Date((currentDayIndex(NOW) + 1) * 86_400_000 - 8 * 3_600_000).toISOString(),
    },
  });
  assert.deepEqual(farm, originalFarm);
  assert.equal(farm.titles.includes("harvest_1"), false);

  clock += 60_000;
  const sameSnapshot = await request(baseUrl, {
    farm_human_key: HUMAN_KEY,
    expected_farm_doorplate: FARM,
  });
  assert.equal(sameSnapshot.response.status, 200);
  assert.equal(sameSnapshot.body.revision, first.body.revision);
  assert.notEqual(sameSnapshot.body.server_time, first.body.server_time);
  assert.deepEqual(farm, originalFarm);

  clock += TICK_MS / 2;
  const nextProjectedTick = await request(baseUrl, {
    farm_human_key: HUMAN_KEY,
    expected_farm_doorplate: FARM,
  });
  assert.equal(nextProjectedTick.response.status, 200);
  assert.notEqual(nextProjectedTick.body.revision, first.body.revision);
  assert.equal(nextProjectedTick.body.data.plots[0].state, "ripe");
  assert.equal(nextProjectedTick.body.data.plots[0].identity_state, "hidden");
  assert.equal(nextProjectedTick.body.data.plots[0].crop_identity, null);
  assert.deepEqual(farm, originalFarm);
});

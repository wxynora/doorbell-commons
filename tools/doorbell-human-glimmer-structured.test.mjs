import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-glimmer-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-human-glimmer-test-token";

const NOW = Date.parse("2026-08-23T13:00:00.000Z");
const originalDateNow = Date.now;
let clock = NOW;
Date.now = () => clock;

const { makeFarm } = await import("../dist/game.js");
const { glimmer } = await import("../dist/content.js");
const { getGlimmerWorld, insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");
const { currentDayIndex } = await import("../dist/time.js");

const TOKEN = "farm-doorbell-human-glimmer-test-token";
const PATH = "/internal/doorbell/human/glimmer/read";
const FARM_ID = "ABC234";
const HUMAN_KEY = "human-glimmer-key";

async function request(baseUrl, body, options = {}) {
  const response = await fetch(`${baseUrl}${PATH}`, {
    method: options.method ?? "POST",
    headers: {
      ...(options.authorization === false ? {} : { authorization: `Bearer ${TOKEN}` }),
      "content-type": "application/json",
    },
    body: options.raw ?? JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

function assertStrictError(body, code) {
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
}

test("Doorbell Human Glimmer read returns a pure strict projection", async (t) => {
  const farm = makeFarm("流光测试农场");
  farm.id = FARM_ID;
  farm.humanKey = HUMAN_KEY;
  farm.glimmer = {
    ticketDay: 0,
    daily: { day: currentDayIndex(NOW), explores: 1, captures: 0, lastCatchAt: NOW - 5 * 60 * 1000 },
    unlocked: ["duck_peach"],
    encounterSeen: ["glimmer_spring"],
    favoriteSeen: [],
    achievementRewards: ["glimmer_encounter_1"],
    stats: { encounters: 2, variants: 1, coops: 3 },
    history: [{ at: NOW, kind: "encounter", refId: "glimmer_spring", text: "流光泉" }],
  };
  insertFarm(farm);
  const world = getGlimmerWorld();
  world.logs = [
    { at: null, farmId: FARM_ID, farmName: farm.name, text: "缺失时间的旧记录" },
    { at: NOW, farmId: FARM_ID, farmName: farm.name, text: "21:00 · 有效公共事件" },
  ];
  const farmBefore = structuredClone(farm);
  const worldBefore = structuredClone(world);

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
  const body = { farm_human_key: HUMAN_KEY, expected_farm_doorplate: FARM_ID };

  assert.equal(glimmer.captureCooldownMs, 20 * 60 * 1000);
  assert.equal(glimmer.ordinaryChance, 0.12);
  assert.equal(glimmer.ordinaryFavoriteChance, 0.35);
  assert.equal(glimmer.fantasyChance, 0.05);
  assert.equal(glimmer.fantasyFavoriteChance, 0.2);

  const unauthorized = await request(baseUrl, body, { authorization: false });
  assert.equal(unauthorized.response.status, 401);
  assertStrictError(unauthorized.body, "authentication_required");

  const extra = await request(baseUrl, { ...body, extra: true });
  assert.equal(extra.response.status, 400);
  assertStrictError(extra.body, "invalid_request");

  const first = await request(baseUrl, body);
  assert.equal(first.response.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ["data", "server_time", "subject"]);
  assert.deepEqual(first.body.subject, { farm_doorplate: FARM_ID });
  assert.deepEqual(Object.keys(first.body.data).sort(), [
    "achievements",
    "capture_cooldown",
    "cooperation",
    "encounters",
    "events",
    "open",
    "season",
    "status",
    "summary",
    "tracks",
    "variants",
  ]);
  assert.deepEqual(first.body.data.capture_cooldown, {
    ready_at: "2026-08-23T13:15:00.000Z",
  });
  assert.equal(first.body.data.tracks.length, 3);
  assert.equal(first.body.data.variants.length, 57);
  assert.equal(first.body.data.encounters.length, 20);
  assert.equal(first.body.data.achievements.length, 12);
  assert.deepEqual(first.body.data.events, [
    { at: "2026-08-23T13:00:00.000Z", text: "有效公共事件" },
  ]);
  assert.equal(first.body.data.tracks.every((track) => track.revealed === true && track.variant), true);
  const trackIds = first.body.data.tracks.map((track) => track.variant.id);
  assert.deepEqual(Object.keys(first.body.data.tracks[0].variant).sort(), [
    "atlas",
    "id",
    "name",
    "set",
    "sprite_index",
  ]);
  assert.equal(JSON.stringify(first.body).includes("farm_human_key"), false);
  assert.equal(JSON.stringify(first.body).includes("human-glimmer-key"), false);
  assert.equal(JSON.stringify(first.body).includes("farmId"), false);
  assert.deepEqual(farm, farmBefore);
  assert.deepEqual(getGlimmerWorld(), worldBefore);

  clock = Date.parse("2026-08-23T13:16:00.000Z");
  const expired = await request(baseUrl, body);
  assert.equal(expired.response.status, 200);
  assert.equal(expired.body.data.capture_cooldown, null);

  clock = Date.parse("2026-08-23T14:01:00.000Z");
  const closed = await request(baseUrl, body);
  assert.equal(closed.response.status, 200);
  assert.equal(closed.body.data.open, false);
  assert.deepEqual(closed.body.data.tracks.map((track) => track.variant.id), trackIds);
  assert.equal(closed.body.data.tracks.every((track) => track.revealed === true && track.variant), true);
  assert.equal(JSON.stringify(closed.body.data.tracks).includes("mystery"), false);
  assert.equal(closed.body.data.tracks.every((track) => Number.isInteger(track.variant.sprite_index)), true);
});

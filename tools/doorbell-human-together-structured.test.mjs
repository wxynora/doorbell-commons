import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-together-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-human-together-test-token";

const NOW = Date.parse("2026-08-23T13:00:00.000Z");
const originalDateNow = Date.now;
Date.now = () => NOW;

const { makeFarm } = await import("../dist/game.js");
const { getPublicExpeditionWorld, insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

const TOKEN = "farm-doorbell-human-together-test-token";
const PATH = "/internal/doorbell/human/together/read";
const FARM_ID = "ABC234";
const HUMAN_KEY = "human-together-key";

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

test("Doorbell Human Together read uses the authoritative advance/save path and a safe projection", async (t) => {
  const farm = makeFarm("共行测试农场");
  farm.id = FARM_ID;
  farm.humanKey = HUMAN_KEY;
  insertFarm(farm);

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

  const unauthorized = await request(baseUrl, body, { authorization: false });
  assert.equal(unauthorized.response.status, 401);
  assertStrictError(unauthorized.body, "authentication_required");

  const wrongMethod = await request(baseUrl, undefined, { method: "GET" });
  assert.equal(wrongMethod.response.status, 405);
  assertStrictError(wrongMethod.body, "invalid_request");

  const extra = await request(baseUrl, { ...body, extra: true });
  assert.equal(extra.response.status, 400);
  assertStrictError(extra.body, "invalid_request");

  const first = await request(baseUrl, body);
  assert.equal(first.response.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ["data", "server_time", "subject"]);
  assert.deepEqual(first.body.subject, { farm_doorplate: FARM_ID });
  assert.deepEqual(Object.keys(first.body.data).sort(), [
    "art_asset_key",
    "clues",
    "cooldown",
    "current_choice",
    "current_task",
    "ending",
    "history",
    "phase",
    "round",
    "stage",
    "status",
    "story_id",
    "title",
  ]);
  assert.equal(first.body.data.story_id, "same_kitchen");
  assert.equal(typeof first.body.data.title, "string");
  assert.match(first.body.data.art_asset_key, /^together\./);
  assert.equal(Array.isArray(first.body.data.history), true);
  assert.equal(JSON.stringify(first.body).includes("farm_human_key"), false);
  assert.equal(JSON.stringify(first.body).includes("human-together-key"), false);
  assert.equal(JSON.stringify(first.body).includes("farmId"), false);
  assert.equal(JSON.stringify(first.body).includes("correct"), false);
  assert.equal(JSON.stringify(first.body).includes("wrongCooldownHours"), false);
  assert.equal(JSON.stringify(first.body).includes("rewards"), false);
  assert.equal(JSON.stringify(first.body).includes("archives"), false);

  const worldAfter = getPublicExpeditionWorld();
  assert.equal(worldAfter.storyId, "same_kitchen");
  assert.equal(typeof worldAfter.startedAt, "number");

  worldAfter.phase = "vote";
  worldAfter.history.push({ kind: "choice", step: null, option: "Z", label: "损坏的旧选择" });
  worldAfter.vote = {
    day: Math.floor((NOW + 8 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000)),
    votes: {},
  };
  const vote = await request(baseUrl, body);
  assert.equal(vote.response.status, 200);
  assert.equal(vote.body.data.phase, "vote");
  assert.deepEqual(vote.body.data.current_choice, {
    index: null,
    title: "是否重新开启《同一间厨房》？",
    options: [
      { key: "A", label: "开启新一轮" },
      { key: "B", label: "保留本轮结局" },
    ],
    counts: null,
  });
  assert.equal(JSON.stringify(vote.body.data.history).includes("损坏的旧选择"), false);
});

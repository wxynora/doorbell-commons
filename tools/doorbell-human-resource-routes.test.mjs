import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-human-resources-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-human-resource-test-token";

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const originalDateNow = Date.now;
Date.now = () => NOW;

const { makeFarm } = await import("../dist/game.js");
const { insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-resource-human-key";
const PATHS = [
  "/internal/doorbell/human/catalog/read",
  "/internal/doorbell/human/kitchen/read",
  "/internal/doorbell/human/ranch/read",
];

async function readResource(baseUrl, path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer farm-doorbell-human-resource-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

test("Doorbell Human catalog, kitchen, and ranch reads are registered and keep credentials private", async (t) => {
  t.after(() => {
    Date.now = originalDateNow;
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  const farm = makeFarm("资源接线测试农场");
  farm.id = FARM_DOORPLATE;
  farm.humanKey = FARM_HUMAN_KEY;
  farm.coins = 123;
  farm.silver = 456;
  farm.ranch = {
    coins: 789,
    animals: [],
    pets: [],
    patrolGoose: null,
    pinned: [],
    wardrobe: [],
    decor: [],
    decorStore: [],
    raidDebts: [],
    raids: [],
  };
  insertFarm(farm);

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
  const payload = {
    farm_human_key: FARM_HUMAN_KEY,
    expected_farm_doorplate: FARM_DOORPLATE,
  };

  for (const path of PATHS) {
    const result = await readResource(baseUrl, path, payload);
    assert.equal(result.response.status, 200, path);
    assert.match(String(result.response.headers.get("cache-control")), /no-store/);
    assert.equal(result.body.data.farm.farm_doorplate, FARM_DOORPLATE);
    assert.equal(JSON.stringify(result.body).includes(FARM_HUMAN_KEY), false);
  }

  const extraField = await readResource(baseUrl, PATHS[0], {
    ...payload,
    farm_doorplate: "DEF567",
  });
  assert.equal(extraField.response.status, 400);
  assert.equal(extraField.body.error.code, "invalid_request");

  const wrongBinding = await readResource(baseUrl, PATHS[1], {
    ...payload,
    expected_farm_doorplate: "DEF567",
  });
  assert.equal(wrongBinding.response.status, 409);
  assert.equal(wrongBinding.body.error.code, "farm_doorplate_mismatch");

  const missingCredential = await readResource(baseUrl, PATHS[2], {
    ...payload,
    farm_human_key: "missing-resource-human-key",
  });
  assert.equal(missingCredential.response.status, 404);
  assert.equal(missingCredential.body.error.code, "farm_credential_not_found");
  assert.equal(JSON.stringify(missingCredential.body).includes("missing-resource-human-key"), false);
});

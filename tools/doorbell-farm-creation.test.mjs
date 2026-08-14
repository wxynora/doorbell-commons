import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-creation-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-creation-test-token";

const { allFarms, load } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

const CREATION_ID = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const OTHER_CREATION_ID = "019ffb01-49cd-7020-94af-3d04fb1ed03d";

function createRequest(baseUrl, body, authorization = true) {
  return fetch(`${baseUrl}/internal/doorbell/farm-creation`, {
    method: "POST",
    headers: {
      ...(authorization
        ? { authorization: "Bearer farm-doorbell-creation-test-token" }
        : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(async (response) => ({ response, text: await response.text() }));
}

test("Doorbell farm creation is service-authenticated, atomic, persistent, and idempotent", async (t) => {
  const server = startServer(0);
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(dataDirectory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = {
    creation_id: CREATION_ID,
    farm_name: "辛玥的小农场",
    ai_name: "小渡",
    human_name: "辛玥",
  };

  const unauthorized = await createRequest(baseUrl, request, false);
  assert.equal(unauthorized.response.status, 401);
  assert.equal(allFarms().length, 0);

  const invalid = await createRequest(baseUrl, { ...request, ai_name: "   " });
  assert.equal(invalid.response.status, 400);
  assert.equal(allFarms().length, 0);

  const [first, repeated] = await Promise.all([
    createRequest(baseUrl, request),
    createRequest(baseUrl, request),
  ]);
  assert.deepEqual([first.response.status, repeated.response.status].sort(), [200, 201]);
  const firstBody = JSON.parse(first.response.status === 201 ? first.text : repeated.text);
  const replayBody = JSON.parse(first.response.status === 200 ? first.text : repeated.text);
  assert.deepEqual(Object.keys(firstBody).sort(), [
    "ai_name",
    "created",
    "created_at",
    "creation_id",
    "farm_doorplate",
    "farm_human_key",
    "farm_name",
    "human_name",
  ]);
  assert.equal(firstBody.created, true);
  assert.equal(replayBody.created, false);
  assert.equal(firstBody.creation_id, CREATION_ID);
  assert.equal(firstBody.farm_doorplate, replayBody.farm_doorplate);
  assert.equal(firstBody.farm_human_key, replayBody.farm_human_key);
  assert.equal(firstBody.farm_name, "辛玥的小农场");
  assert.equal(firstBody.ai_name, "小渡");
  assert.equal(firstBody.human_name, "辛玥");
  assert.equal(typeof firstBody.farm_human_key, "string");
  assert.ok(firstBody.farm_human_key.length > 0);
  assert.equal("token" in firstBody, false);
  assert.equal("agent_key" in firstBody, false);
  assert.equal("human_url" in firstBody, false);
  assert.equal(allFarms().length, 1);

  const conflict = await createRequest(baseUrl, { ...request, farm_name: "另一座农场" });
  assert.equal(conflict.response.status, 409);
  assert.equal(JSON.parse(conflict.text).error.code, "creation_conflict");
  assert.equal(allFarms().length, 1);

  const secondCreation = await createRequest(baseUrl, {
    ...request,
    creation_id: OTHER_CREATION_ID,
  });
  assert.equal(secondCreation.response.status, 201);
  assert.equal(allFarms().length, 2);

  const persisted = JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8"));
  assert.equal(persisted.doorbellFarmCreations.length, 2);
  assert.equal(JSON.stringify(persisted).includes("farm-doorbell-creation-test-token"), false);
  assert.equal(persisted.farms.some((farm) => farm.agentKey !== undefined), false);

  load();
  const afterRestart = await createRequest(baseUrl, request);
  assert.equal(afterRestart.response.status, 200);
  assert.equal(JSON.parse(afterRestart.text).created, false);
  assert.equal(JSON.parse(afterRestart.text).farm_doorplate, firstBody.farm_doorplate);
});

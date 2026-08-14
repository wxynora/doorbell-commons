import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-reward-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-test-service-token";

const { getFarm, grantDoorbellWelcomeReward, insertFarm, load } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

function addFarm(id, humanKey) {
  insertFarm({ id, name: `Farm ${id}`, humanKey, seeds: {}, silver: 0 });
}

test("Doorbell service grant is authenticated, persistent, and globally idempotent", async (t) => {
  addFarm("ABC234", "human-key-a");
  addFarm("DEF567", "human-key-b");
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
  const endpoint = `http://127.0.0.1:${address.port}/internal/doorbell/welcome-reward`;

  const unauthorized = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_id: "welcome:home-a", human_key: "human-key-a" }),
  });
  assert.equal(unauthorized.status, 401);

  const grant = async (grantId, humanKey) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer farm-doorbell-test-service-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ grant_id: grantId, human_key: humanKey }),
    });
    return { response, text: await response.text() };
  };

  const first = await grant("welcome:home-a", "human-key-a");
  assert.equal(first.response.status, 200);
  const firstBody = JSON.parse(first.text);
  assert.equal(firstBody.applied, true);
  assert.equal(firstBody.farm_doorplate, "ABC234");
  assert.equal(firstBody.reward.seed.rarity, "SSR");
  assert.equal(firstBody.reward.seed.quantity, 1);
  assert.equal(firstBody.reward.silver, 200);
  assert.equal(first.text.includes("human-key-a"), false);
  assert.equal(getFarm("ABC234").silver, 200);
  assert.equal(getFarm("ABC234").seeds[firstBody.reward.seed.id], 1);

  const repeated = await grant("welcome:home-a", "human-key-a");
  assert.equal(repeated.response.status, 200);
  assert.equal(JSON.parse(repeated.text).applied, false);
  assert.equal(getFarm("ABC234").silver, 200);
  assert.equal(getFarm("ABC234").seeds[firstBody.reward.seed.id], 1);

  const wrongTarget = await grant("welcome:home-a", "human-key-b");
  assert.equal(wrongTarget.response.status, 409);
  assert.equal(getFarm("DEF567").silver, 0);

  const invalidCredential = await grant("welcome:home-c", "missing-human-key");
  assert.equal(invalidCredential.response.status, 404);
  assert.equal(invalidCredential.text.includes("missing-human-key"), false);

  const persisted = JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8"));
  assert.deepEqual(
    persisted.doorbellWelcomeRewardGrants.map((entry) => ({
      grantId: entry.grantId,
      farmId: entry.farmId,
      seedId: entry.seedId,
    })),
    [{ grantId: "welcome:home-a", farmId: "ABC234", seedId: firstBody.reward.seed.id }],
  );
  assert.equal(JSON.stringify(persisted).includes("farm-doorbell-test-service-token"), false);

  getFarm("ABC234").silver = 0;
  delete getFarm("ABC234").seeds[firstBody.reward.seed.id];
  load();
  const restoredSilver = getFarm("ABC234").silver;
  assert.ok(restoredSilver >= 200);
  assert.equal(getFarm("ABC234").seeds[firstBody.reward.seed.id], 1);
  assert.equal(
    grantDoorbellWelcomeReward("human-key-a", "welcome:home-a").applied,
    false,
  );
  assert.equal(getFarm("ABC234").silver, restoredSilver);
  assert.equal(getFarm("ABC234").seeds[firstBody.reward.seed.id], 1);
});

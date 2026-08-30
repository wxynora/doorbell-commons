import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-farm-shop-open-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-shop-open-service-token";

const NOW = Date.parse("2026-08-30T04:00:00.000Z");
const FOUR_HOURS = 4 * 60 * 60 * 1_000;
const originalDateNow = Date.now;
Date.now = () => NOW;

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");
const { projectHumanFarmCatalog } = await import("../dist/server/farm-catalog-structured.js");
const { handleHumanFarmShopOpen } = await import(
  "../dist/server/farm-shop-open-action.js"
);

after(() => {
  Date.now = originalDateNow;
  rmSync(dataDirectory, { recursive: true, force: true });
});

function addFarm(id, refreshAt) {
  const farm = makeFarm("今日商店测试农场", 987654);
  farm.id = id;
  farm.humanKey = `private-${id}-human-key`;
  farm.rngState = 123456789;
  farm.shop = {
    refreshAt,
    recipe: null,
    potionSet: null,
    npcSeed: null,
  };
  insertFarm(farm);
  return getFarm(id);
}

function shopRevision(farm, now = NOW) {
  const shop = projectHumanFarmCatalog(farm, now).data.shop;
  return shop.status === "available" ? shop.revision : null;
}

function request(farm, expectedShopRevision, idempotencyKey) {
  return {
    farm_human_key: farm.humanKey,
    expected_farm_doorplate: farm.id,
    idempotency_key: idempotencyKey,
    expected_shop_revision: expectedShopRevision,
  };
}

test("opening a current shelf is idempotent and never rerolls it", () => {
  const farm = addFarm("ABC234", NOW - 60 * 60 * 1_000);
  const beforeShop = structuredClone(farm.shop);
  const beforeRng = farm.rngState;
  const body = request(
    farm,
    shopRevision(farm),
    "019ffc01-49cd-7020-84af-3d04fb1ed03d",
  );

  const first = handleHumanFarmShopOpen(farm, body, NOW);

  assert.equal(first.status, 200);
  assert.equal(first.json.data.result.refreshed, false);
  assert.deepEqual(getFarm(farm.id).shop, beforeShop);
  assert.equal(getFarm(farm.id).rngState, beforeRng);
  assert.equal(first.json.shop_revision, shopRevision(getFarm(farm.id)));

  const saved = structuredClone(getFarm(farm.id));
  const replay = handleHumanFarmShopOpen(getFarm(farm.id), body, NOW + 30_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(farm.id), saved);
});

test("opening an expired shelf advances the existing authority exactly once", () => {
  const farm = addFarm("BCDFGH", NOW - FOUR_HOURS - 1);
  const before = structuredClone(farm);
  const body = request(
    farm,
    shopRevision(farm),
    "119ffc01-49cd-7020-84af-3d04fb1ed03d",
  );

  const result = handleHumanFarmShopOpen(farm, body, NOW);

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.refreshed, true);
  assert.equal(result.json.data.resource.status, "available");
  assert.equal(result.json.data.resource.refreshed_at, new Date(NOW).toISOString());
  assert.equal(getFarm(farm.id).shop.refreshAt, NOW);
  assert.notEqual(getFarm(farm.id).rngState, before.rngState);
  assert.equal(result.json.shop_revision, result.json.data.resource.revision);
  assert.equal(result.json.shop_revision, shopRevision(getFarm(farm.id)));
  assert.deepEqual(farm, before);

  const saved = structuredClone(getFarm(farm.id));
  const replay = handleHumanFarmShopOpen(getFarm(farm.id), body, NOW + 60_000);
  assert.deepEqual(replay.json, result.json);
  assert.deepEqual(getFarm(farm.id), saved);
});

test("stale revisions, invalid bodies, and reused keys never change shop state", () => {
  const farm = addFarm("CDEFGH", NOW - FOUR_HOURS - 1);
  const before = structuredClone(farm);
  const stale = handleHumanFarmShopOpen(
    farm,
    request(farm, `farm-catalog-v1:${"a".repeat(64)}`, "219ffc01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "state_conflict");
  assert.equal(stale.json.error.current_shop_revision, shopRevision(farm));
  assert.deepEqual(getFarm(farm.id), before);

  const invalid = handleHumanFarmShopOpen(
    farm,
    { ...request(farm, shopRevision(farm), "319ffc01-49cd-7020-84af-3d04fb1ed03d"), extra: true },
    NOW,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(farm.id), before);

  const key = "419ffc01-49cd-7020-84af-3d04fb1ed03d";
  const firstBody = request(farm, shopRevision(farm), key);
  const first = handleHumanFarmShopOpen(farm, firstBody, NOW);
  assert.equal(first.status, 200);
  const saved = structuredClone(getFarm(farm.id));
  const conflict = handleHumanFarmShopOpen(
    getFarm(farm.id),
    request(getFarm(farm.id), first.json.shop_revision, key),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(farm.id), saved);
});

test("the authenticated Human route exposes the same strict action", async (t) => {
  const farm = addFarm("DEFGHJ", NOW - FOUR_HOURS - 1);
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
  const response = await fetch(
    `http://127.0.0.1:${address.port}/internal/doorbell/human/catalog/shop/open`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer farm-shop-open-service-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(
        request(farm, shopRevision(farm), "519ffc01-49cd-7020-84af-3d04fb1ed03d"),
      ),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(String(response.headers.get("cache-control")), /no-store/);
  assert.equal(body.data.result.refreshed, true);
  assert.equal(body.data.resource.status, "available");
  assert.equal(body.shop_revision, body.data.resource.revision);
  assert.equal(JSON.stringify(body).includes(farm.humanKey), false);
});

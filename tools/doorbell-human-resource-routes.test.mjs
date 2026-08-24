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
const { getFarm, insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");
const { currentDayIndex } = await import("../dist/time.js");

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
    animals: [
      {
        kindId: "chicken",
        name: "小鸡",
        level: 1,
        ticksSinceProduce: 0,
        pending: 0,
        pendingMeat: 0,
        feedBoostPending: false,
        pendingBoost: false,
        acc: [],
      },
    ],
    pets: [],
    patrolGoose: null,
    pinned: [],
    wardrobe: [],
    decor: [],
    decorStore: [],
    raidDebts: [],
    raids: [],
    kitchen: {
      products: [],
      ingredients: {},
      dishes: [],
      knownRecipes: [],
      shop: {
        day: currentDayIndex(NOW),
        ingredientIds: [],
        recipeIds: [],
        bought: {},
      },
    },
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
    if (path.endsWith("/kitchen/read")) {
      assert.match(result.body.shop_revision, /^kitchen-v1:[0-9a-f]{64}$/);
    }
  }

  const catalogRead = await readResource(baseUrl, PATHS[0], payload);
  assert.match(catalogRead.body.revision, /^farm-catalog-v1:[0-9a-f]{64}$/);
  const settingsAction = await readResource(
    baseUrl,
    "/internal/doorbell/human/settings/action",
    {
      ...payload,
      idempotency_key: "519ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_catalog_revision: catalogRead.body.revision,
      field: "farm_name",
      value: "新的资源测试农场",
    },
  );
  assert.equal(settingsAction.response.status, 200);
  assert.equal(settingsAction.body.data.result.field, "farm_name");
  assert.equal(settingsAction.body.data.resource.farm.farm_name, "新的资源测试农场");
  assert.equal(settingsAction.body.data.resource.settings.farm_name, "新的资源测试农场");
  assert.equal(JSON.stringify(settingsAction.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).name, "新的资源测试农场");

  const kitchenRead = await readResource(baseUrl, PATHS[1], payload);
  const purchase = await readResource(baseUrl, "/internal/doorbell/human/kitchen/purchase", {
    ...payload,
    idempotency_key: "019ffb01-49cd-7020-84af-3d04fb1ed03d",
    expected_shop_revision: kitchenRead.body.shop_revision,
    kind: "ingredient",
    item_id: "salt",
    quantity: 1,
  });
  assert.equal(purchase.response.status, 200);
  assert.equal(purchase.body.data.result.item_id, "salt");
  assert.equal(purchase.body.data.result.quantity, 1);
  assert.equal(purchase.body.data.resource.balance.silver.value < 456, true);
  assert.equal(JSON.stringify(purchase.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).ranch.kitchen.ingredients.salt, 1);

  const ranchRead = await readResource(baseUrl, PATHS[2], payload);
  const ranchCollection = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      idempotency_key: "619ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
    },
  );
  assert.equal(ranchCollection.response.status, 409);
  assert.equal(ranchCollection.body.error.code, "no_collectable");

  const ranchCollectionInvalidUuid = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      idempotency_key: "not-a-uuid",
      expected_revision: ranchRead.body.revision,
    },
  );
  assert.equal(ranchCollectionInvalidUuid.response.status, 400);
  assert.equal(ranchCollectionInvalidUuid.body.error.code, "invalid_request");

  const ranchCollectionExtraField = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      idempotency_key: "719ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
      items: [],
    },
  );
  assert.equal(ranchCollectionExtraField.response.status, 400);
  assert.equal(ranchCollectionExtraField.body.error.code, "invalid_request");

  const ranchCollectionSpoofedBinding = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/collect",
    {
      ...payload,
      farm_human_key: "spoofed-human-key",
      idempotency_key: "819ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
    },
  );
  assert.equal(ranchCollectionSpoofedBinding.response.status, 404);
  assert.equal(ranchCollectionSpoofedBinding.body.error.code, "farm_credential_not_found");

  const ranchAction = await readResource(
    baseUrl,
    "/internal/doorbell/human/ranch/resident-action",
    {
      ...payload,
      idempotency_key: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
      expected_revision: ranchRead.body.revision,
      action: "rename",
      resident_type: "animal",
      kind_id: "chicken",
      payload: { name: "小太阳" },
    },
  );
  assert.equal(ranchAction.response.status, 200);
  assert.equal(ranchAction.body.data.result.action, "rename");
  assert.equal(ranchAction.body.data.result.kind_id, "chicken");
  assert.equal(JSON.stringify(ranchAction.body).includes(FARM_HUMAN_KEY), false);
  assert.equal(getFarm(FARM_DOORPLATE).ranch.animals[0].name, "小太阳");

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

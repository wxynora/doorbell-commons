import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanKitchenPurchaseClient,
  FarmHumanKitchenPurchaseContractUnavailableError,
  FarmHumanKitchenPurchaseCredentialInvalidError,
  FarmHumanKitchenPurchaseIdempotencyConflictError,
  FarmHumanKitchenPurchaseRejectedError,
  FarmHumanKitchenPurchaseShopUnavailableError,
  FarmHumanKitchenPurchaseStateConflictError,
  FarmHumanKitchenPurchaseUnavailableError,
} from "./farm-kitchen-purchase-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-kitchen-purchase-human-key";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const SHOP_REVISION = `kitchen-v1:${"a".repeat(64)}`;

const KITCHEN_DATA = {
  farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "渡的小农场" },
  balance: {
    silver: { status: "available", value: 321, reason: null },
    ranch_coins: { status: "available", value: 654, reason: null },
  },
  tools: { status: "unavailable", items: [], reason: "not_persisted" },
  stacked_ingredients: { status: "available", items: [], reason: null },
  product_instances: { status: "available", items: [], reason: null },
  fish_instances: { status: "available", items: [], reason: null },
  treasure_items: { status: "available", items: [], reason: null },
  dish_instances: { status: "available", items: [], reason: null },
  known_recipes: { status: "available", items: [], reason: null },
  daily_shop: {
    status: "available",
    stored_day_index: 20700,
    current_day_index: 20700,
    is_current_day: true,
    refresh_at: "2026-08-25T00:00:00.000Z",
    ingredients: [],
    recipes: [],
    reason: null,
  },
} as const;

const PURCHASE_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      kind: "ingredient",
      item_id: "salt",
      quantity: 2,
      total_price_silver: 20,
      silver_balance: 301,
    },
    resource: KITCHEN_DATA,
  },
  shop_revision: `kitchen-v1:${"b".repeat(64)}`,
  server_time: "2026-08-24T04:00:00.000Z",
};

const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
  expectedShopRevision: SHOP_REVISION,
  idempotencyKey: IDEMPOTENCY_KEY,
  kind: "ingredient" as const,
  itemId: "salt",
  quantity: 2,
};

function createClient(fetchImplementation: typeof fetch): FarmHumanKitchenPurchaseClient {
  return new FarmHumanKitchenPurchaseClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm kitchen purchase client posts one stable item with server-only binding", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(PURCHASE_RESULT);
  });

  assert.deepEqual(await client.purchaseKitchen(INPUT), PURCHASE_RESULT);
  assert.deepEqual(
    calls.map(({ body, headers, method, url }) => ({
      body,
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      method,
      url,
    })),
    [
      {
        body: JSON.stringify({
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
          idempotency_key: IDEMPOTENCY_KEY,
          expected_shop_revision: SHOP_REVISION,
          kind: "ingredient",
          item_id: "salt",
          quantity: 2,
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/kitchen/purchase",
      },
    ],
  );
  assert.equal(calls[0]?.body.includes("silver"), false);
  assert.equal(calls[0]?.body.includes("price"), false);
});

test("farm kitchen purchase client rejects malformed receipts and binding mismatches", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...PURCHASE_RESULT, unexpected: true }),
    ).purchaseKitchen(INPUT),
    FarmHumanKitchenPurchaseContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...PURCHASE_RESULT,
        data: {
          ...PURCHASE_RESULT.data,
          resource: {
            ...KITCHEN_DATA,
            farm: { ...KITCHEN_DATA.farm, farm_doorplate: "DEF567" },
          },
        },
      }),
    ).purchaseKitchen(INPUT),
    FarmHumanKitchenPurchaseContractUnavailableError,
  );
});

test("farm kitchen purchase client maps state, shelf, rejection, idempotency, and service errors", async () => {
  const createClientFor = (payload: unknown, status = 409) =>
    createClient(async () =>
      payload instanceof Response ? payload : Response.json(payload, { status }),
    );

  await assert.rejects(
    createClientFor({
      error: {
        code: "state_conflict",
        message: "changed",
        current_shop_revision: `kitchen-v1:${"c".repeat(64)}`,
      },
    }).purchaseKitchen(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanKitchenPurchaseStateConflictError);
      assert.equal(error.currentShopRevision, `kitchen-v1:${"c".repeat(64)}`);
      return true;
    },
  );
  await assert.rejects(
    createClientFor({ error: { code: "shop_unavailable", message: "stale" } }).purchaseKitchen(
      INPUT,
    ),
    FarmHumanKitchenPurchaseShopUnavailableError,
  );
  await assert.rejects(
    createClientFor({ error: { code: "purchase_rejected", message: "银币不足" } }).purchaseKitchen(
      INPUT,
    ),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanKitchenPurchaseRejectedError);
      assert.equal(error.message, "银币不足");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "idempotency_conflict", message: "duplicate" },
    }).purchaseKitchen(INPUT),
    FarmHumanKitchenPurchaseIdempotencyConflictError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_credential_not_found", message: "bad" } },
      404,
    ).purchaseKitchen(INPUT),
    FarmHumanKitchenPurchaseCredentialInvalidError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_unavailable", message: "offline" } },
      503,
    ).purchaseKitchen(INPUT),
    FarmHumanKitchenPurchaseUnavailableError,
  );
  await assert.rejects(
    createClientFor(new Response("bad contract", { status: 502 }), 502).purchaseKitchen(INPUT),
    FarmHumanKitchenPurchaseContractUnavailableError,
  );
});

test("farm kitchen purchase client validates request identity and quantity before sending", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(PURCHASE_RESULT);
  });

  await assert.rejects(client.purchaseKitchen({ ...INPUT, farmDoorplate: "not-a-doorplate" }));
  await assert.rejects(client.purchaseKitchen({ ...INPUT, idempotencyKey: "not-a-uuid" }));
  await assert.rejects(client.purchaseKitchen({ ...INPUT, kind: "recipe", quantity: 2 }));
  assert.equal(calls, 0);
});

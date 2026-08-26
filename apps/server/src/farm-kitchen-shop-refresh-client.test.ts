import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanKitchenShopRefreshClient,
  FarmHumanKitchenShopRefreshContractUnavailableError,
  FarmHumanKitchenShopRefreshCredentialInvalidError,
  FarmHumanKitchenShopRefreshIdempotencyConflictError,
  FarmHumanKitchenShopRefreshNotFoundError,
  FarmHumanKitchenShopRefreshRejectedError,
  FarmHumanKitchenShopRefreshShopUnavailableError,
  FarmHumanKitchenShopRefreshStateConflictError,
  FarmHumanKitchenShopRefreshUnavailableError,
} from "./farm-kitchen-shop-refresh-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-kitchen-shop-refresh-human-key";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const SHOP_REVISION = `kitchen-v1:${"a".repeat(64)}`;
const NEXT_SHOP_REVISION = `kitchen-v1:${"b".repeat(64)}`;

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
    refresh_window_id: 20700,
    refresh_used_count: 1,
    refresh_remaining_count: 9,
    refresh_limit: 10,
    next_cost_coins: 200,
    can_refresh: true,
    refresh_reset_at: "2026-08-25T00:00:00.000Z",
    ingredients: [],
    recipes: [],
    reason: null,
  },
} as const;

const REFRESH_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      cost_coins: 100,
      coins_balance: 4_900,
      refresh_window_id: 20700,
      refresh_used_count: 1,
      refresh_remaining_count: 9,
      refresh_limit: 10,
      next_cost_coins: 200,
      can_refresh: true,
    },
    resource: KITCHEN_DATA,
  },
  shop_revision: NEXT_SHOP_REVISION,
  server_time: "2026-08-24T04:00:00.000Z",
} as const;

const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
  expectedShopRevision: SHOP_REVISION,
  idempotencyKey: IDEMPOTENCY_KEY,
};

function createClient(fetchImplementation: typeof fetch): FarmHumanKitchenShopRefreshClient {
  return new FarmHumanKitchenShopRefreshClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm kitchen shop refresh client posts the fixed URL and server-only refresh contract", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(REFRESH_RESULT);
  });

  assert.deepEqual(await client.refreshKitchenShop(INPUT), REFRESH_RESULT);
  assert.deepEqual(
    calls.map(({ body, headers, method, url }) => ({
      body,
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      idempotencyKeyHeader: headers.get("idempotency-key"),
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
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        idempotencyKeyHeader: null,
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/kitchen/shop/refresh",
      },
    ],
  );
  assert.equal(calls[0]?.body.includes("price"), false);
  assert.equal(calls[0]?.body.includes("refresh_used_count"), false);
  assert.equal(calls[0]?.body.includes("coins_balance"), false);
});

test("farm kitchen shop refresh client verifies subject, receipt, revision, and resource consistency", async () => {
  const clientFor = (payload: unknown) => createClient(async () => Response.json(payload));

  await assert.rejects(
    clientFor({ ...REFRESH_RESULT, unexpected: true }).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshContractUnavailableError,
  );
  await assert.rejects(
    clientFor({
      ...REFRESH_RESULT,
      data: {
        ...REFRESH_RESULT.data,
        result: {
          ...REFRESH_RESULT.data.result,
          receipt_id: "019ffb01-49cd-7020-84af-3d04fb1ed03e",
        },
      },
    }).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshContractUnavailableError,
  );
  await assert.rejects(
    clientFor({
      ...REFRESH_RESULT,
      data: {
        ...REFRESH_RESULT.data,
        resource: {
          ...KITCHEN_DATA,
          farm: { ...KITCHEN_DATA.farm, farm_doorplate: "DEF567" },
        },
      },
    }).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshContractUnavailableError,
  );
  await assert.rejects(
    clientFor({ ...REFRESH_RESULT, shop_revision: SHOP_REVISION }).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshContractUnavailableError,
  );
  await assert.rejects(
    clientFor({
      ...REFRESH_RESULT,
      data: {
        ...REFRESH_RESULT.data,
        result: { ...REFRESH_RESULT.data.result, refresh_used_count: 2 },
      },
    }).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshContractUnavailableError,
  );
});

test("farm kitchen shop refresh client maps structured errors, 502, 503, and network failures", async () => {
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
    }).refreshKitchenShop(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanKitchenShopRefreshStateConflictError);
      assert.equal(error.currentShopRevision, `kitchen-v1:${"c".repeat(64)}`);
      return true;
    },
  );
  await assert.rejects(
    createClientFor({ error: { code: "shop_unavailable", message: "stale" } }).refreshKitchenShop(
      INPUT,
    ),
    FarmHumanKitchenShopRefreshShopUnavailableError,
  );
  await assert.rejects(
    createClientFor({
      error: { code: "insufficient_coins", message: "金币不足" },
    }).refreshKitchenShop(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanKitchenShopRefreshRejectedError);
      assert.equal(error.code, "insufficient_coins");
      assert.equal(error.message, "金币不足");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "idempotency_conflict", message: "duplicate" },
    }).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshIdempotencyConflictError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_credential_not_found", message: "bad" } },
      404,
    ).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshCredentialInvalidError,
  );
  await assert.rejects(
    createClientFor({ error: { code: "farm_not_found", message: "gone" } }, 404).refreshKitchenShop(
      INPUT,
    ),
    FarmHumanKitchenShopRefreshNotFoundError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_unavailable", message: "offline" } },
      503,
    ).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshUnavailableError,
  );
  await assert.rejects(
    createClientFor(new Response("bad gateway", { status: 502 }), 502).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshContractUnavailableError,
  );
  await assert.rejects(
    createClientFor(new Response("offline", { status: 503 }), 503).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshUnavailableError,
  );
  await assert.rejects(
    createClient(async () => {
      throw new Error("network");
    }).refreshKitchenShop(INPUT),
    FarmHumanKitchenShopRefreshUnavailableError,
  );
});

test("farm kitchen shop refresh client validates identity and revision before sending", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(REFRESH_RESULT);
  });

  await assert.rejects(client.refreshKitchenShop({ ...INPUT, farmDoorplate: "not-a-doorplate" }));
  await assert.rejects(client.refreshKitchenShop({ ...INPUT, idempotencyKey: "not-a-uuid" }));
  await assert.rejects(
    client.refreshKitchenShop({ ...INPUT, expectedShopRevision: `kitchen-v1:${"A".repeat(64)}` }),
  );
  assert.equal(calls, 0);
});

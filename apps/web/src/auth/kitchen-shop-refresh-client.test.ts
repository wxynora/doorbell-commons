/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { refreshBoundKitchenShop } from "./kitchen-shop-refresh-client";

const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const SHOP_REVISION = `kitchen-v1:${"a".repeat(64)}`;
const NEXT_SHOP_REVISION = `kitchen-v1:${"b".repeat(64)}`;

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
    resource: {
      farm: { farm_doorplate: "ABC234", farm_name: "渡的小农场" },
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
    },
  },
  shop_revision: NEXT_SHOP_REVISION,
  server_time: "2026-08-24T04:00:00.000Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const INPUT = {
  idempotencyKey: IDEMPOTENCY_KEY,
  expectedShopRevision: SHOP_REVISION,
};

test("kitchen shop refresh browser client sends same-origin body and idempotency header without server fields", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(REFRESH_RESULT);
  };

  const result = await refreshBoundKitchenShop({ fetcher, ...INPUT });

  assert.deepEqual(result, { ok: true, data: REFRESH_RESULT });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "/api/farm/kitchen/shop/refreshes");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(headers.get("authorization"), null);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_shop_revision: SHOP_REVISION,
  });
  const body = String(requests[0]?.init?.body);
  for (const forbidden of [
    "farm_human_key",
    "farm_doorplate",
    "idempotency_key",
    "price",
    "refresh_used_count",
    "coins_balance",
  ]) {
    assert.equal(body.includes(forbidden), false, forbidden);
  }
});

test("kitchen shop refresh browser client requires matching receipt, revision, and resource state", async () => {
  const call = (payload: unknown) =>
    refreshBoundKitchenShop({ fetcher: async () => jsonResponse(payload), ...INPUT });

  assert.deepEqual(await call({ ...REFRESH_RESULT, unexpected: true }), {
    ok: false,
    issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
  });
  assert.deepEqual(
    await call({
      ...REFRESH_RESULT,
      data: {
        ...REFRESH_RESULT.data,
        result: {
          ...REFRESH_RESULT.data.result,
          receipt_id: "019ffb01-49cd-7020-84af-3d04fb1ed03e",
        },
      },
    }),
    {
      ok: false,
      issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
    },
  );
  assert.deepEqual(await call({ ...REFRESH_RESULT, shop_revision: SHOP_REVISION }), {
    ok: false,
    issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
  });
  assert.deepEqual(
    await call({
      ...REFRESH_RESULT,
      data: {
        ...REFRESH_RESULT.data,
        result: { ...REFRESH_RESULT.data.result, refresh_remaining_count: 8 },
      },
    }),
    {
      ok: false,
      issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
    },
  );
});

test("kitchen shop refresh browser client preserves structured errors and separates 502, 503, and network failures", async () => {
  const structured = await refreshBoundKitchenShop({
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "state_conflict",
            message: "changed",
            current_shop_revision: `kitchen-v1:${"c".repeat(64)}`,
          },
        },
        409,
      ),
    ...INPUT,
  });
  assert.deepEqual(structured, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentShopRevision: `kitchen-v1:${"c".repeat(64)}`,
      serverMessage: "changed",
    },
  });

  const rejected = await refreshBoundKitchenShop({
    fetcher: async () =>
      jsonResponse({ error: { code: "refresh_exhausted", message: "用完了" } }, 409),
    ...INPUT,
  });
  assert.deepEqual(rejected, {
    ok: false,
    issue: { code: "refresh_exhausted", currentShopRevision: null, serverMessage: "用完了" },
  });

  const badGateway = await refreshBoundKitchenShop({
    fetcher: async () => new Response("bad gateway", { status: 502 }),
    ...INPUT,
  });
  assert.deepEqual(badGateway, {
    ok: false,
    issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
  });

  const unavailable = await refreshBoundKitchenShop({
    fetcher: async () =>
      jsonResponse({ error: { code: "farm_unavailable", message: "offline" } }, 503),
    ...INPUT,
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "farm_unavailable", currentShopRevision: null, serverMessage: "offline" },
  });

  const network = await refreshBoundKitchenShop({
    fetcher: async () => {
      throw new Error("offline");
    },
    ...INPUT,
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentShopRevision: null, serverMessage: null },
  });
});

test("kitchen shop refresh browser client validates UUID and revision before network", async () => {
  let calls = 0;
  const fetcher: FrontendFetcher = async () => {
    calls += 1;
    return jsonResponse(REFRESH_RESULT);
  };

  await assert.rejects(
    refreshBoundKitchenShop({ fetcher, ...INPUT, idempotencyKey: "not-a-uuid" }),
  );
  await assert.rejects(
    refreshBoundKitchenShop({
      fetcher,
      ...INPUT,
      expectedShopRevision: `kitchen-v1:${"A".repeat(64)}`,
    }),
  );
  assert.equal(calls, 0);
});

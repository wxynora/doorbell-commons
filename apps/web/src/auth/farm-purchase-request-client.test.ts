/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  createBoundFarmPurchaseRequest,
  farmPurchaseRequestIssueMessage,
} from "./farm-purchase-request-client";

const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const EXPIRES_AT = "2026-08-26T04:00:00.000Z";
const SERVER_TIME = "2026-08-25T04:00:00.000Z";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const CREATE_RESULT = {
  data: {
    shop: "field",
    shop_revision: "field-shop-v1:test",
    items: [{ kind: "seed", item_id: "common", qty: 2 }],
    status: "requested",
    expires_at: EXPIRES_AT,
  },
  server_time: SERVER_TIME,
};

test("purchase-request client creates one cart without browser identity or prices", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push(init ? { url, init } : { url });
    return jsonResponse(CREATE_RESULT);
  };

  const result = await createBoundFarmPurchaseRequest({
    fetcher,
    idempotencyKey: KEY,
    shop: "field",
    shopRevision: "field-shop-v1:test",
    items: [{ kind: "seed", itemId: "common", quantity: 2 }],
  });

  assert.deepEqual(result, { ok: true, data: CREATE_RESULT });
  assert.equal(requests[0]?.url, "/api/farm/purchase-requests");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("idempotency-key"), KEY);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    shop: "field",
    shop_revision: "field-shop-v1:test",
    items: [{ kind: "seed", item_id: "common", qty: 2 }],
  });
  assert.doesNotMatch(String(requests[0]?.init?.body), /price|human|doorplate|credential/u);
});

test("purchase-request client accepts canonical response order for a non-canonical cart", async () => {
  const result = await createBoundFarmPurchaseRequest({
    fetcher: async () =>
      jsonResponse({
        ...CREATE_RESULT,
        data: {
          ...CREATE_RESULT.data,
          items: [
            { kind: "potion", item_id: "speed_potion", qty: 1 },
            { kind: "seed", item_id: "common", qty: 2 },
          ],
        },
      }),
    idempotencyKey: KEY,
    shop: "field",
    shopRevision: "field-shop-v1:test",
    items: [
      { kind: "seed", itemId: "common", quantity: 2 },
      { kind: "potion", itemId: "speed_potion", quantity: 1 },
    ],
  });

  assert.equal(result.ok, true);
});

test("purchase-request client exposes expired and failed replays as terminal outcomes", async () => {
  for (const [status, code, message] of [
    ["expired", "purchase_request_expired", "之前的购物请求已过期，请重新发送。"],
    ["failed", "purchase_request_failed", "TA 没能处理之前的请求，请重新发送。"],
  ] as const) {
    const result = await createBoundFarmPurchaseRequest({
      fetcher: async () =>
        jsonResponse({
          ...CREATE_RESULT,
          data: { ...CREATE_RESULT.data, status },
        }),
      idempotencyKey: KEY,
      shop: "field",
      shopRevision: "field-shop-v1:test",
      items: [{ kind: "seed", itemId: "common", quantity: 2 }],
    });

    assert.deepEqual(result, {
      ok: false,
      issue: { code, currentShopRevision: null, serverMessage: null },
    });
    assert.equal(
      farmPurchaseRequestIssueMessage({
        code,
        currentShopRevision: null,
        serverMessage: null,
      }),
      message,
    );
  }
});

test("purchase-request client preserves structured and network failures", async () => {
  const changed = await createBoundFarmPurchaseRequest({
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "shop_changed",
            message: "changed",
            current_shop_revision: "field-shop-v1:new",
          },
        },
        409,
      ),
    idempotencyKey: KEY,
    shop: "field",
    shopRevision: "field-shop-v1:test",
    items: [{ kind: "seed", itemId: "common", quantity: 2 }],
  });
  assert.deepEqual(changed, {
    ok: false,
    issue: {
      code: "shop_changed",
      currentShopRevision: "field-shop-v1:new",
      serverMessage: "changed",
    },
  });

  const network = await createBoundFarmPurchaseRequest({
    fetcher: async () => {
      throw new Error("offline");
    },
    idempotencyKey: KEY,
    shop: "field",
    shopRevision: "field-shop-v1:test",
    items: [{ kind: "seed", itemId: "common", quantity: 2 }],
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentShopRevision: null, serverMessage: null },
  });
  assert.equal(
    farmPurchaseRequestIssueMessage({
      code: "operation_not_allowed",
      currentShopRevision: null,
      serverMessage: null,
    }),
    "当前商品不能由 TA 购买。",
  );
});

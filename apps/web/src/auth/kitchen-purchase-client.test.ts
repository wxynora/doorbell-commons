/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { boundFarmKitchenPurchaseErrorSchema } from "@doorbell/protocol";
import type { FrontendFetcher } from "./auth-client";
import { kitchenPurchaseIssueMessage, purchaseBoundKitchenItem } from "./kitchen-purchase-client";

const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const SHOP_REVISION = `kitchen-v1:${"a".repeat(64)}`;

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
    resource: {
      farm: { farm_doorplate: "ABC234", farm_name: "渡的小农场" },
      balance: {
        silver: { status: "available", value: 301, reason: null },
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
    },
  },
  shop_revision: `kitchen-v1:${"b".repeat(64)}`,
  server_time: "2026-08-24T04:00:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("kitchen purchase browser error schema accepts community session failures", () => {
  const payload = {
    error: {
      code: "qq_not_group_member",
      message: "The session QQ number is no longer a current member of the community group",
    },
  };
  assert.deepEqual(boundFarmKitchenPurchaseErrorSchema.parse(payload), payload);
});

test("kitchen purchase browser client sends same-origin POST with idempotency header and no identity", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(PURCHASE_RESULT);
  };

  const result = await purchaseBoundKitchenItem({
    fetcher,
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedShopRevision: SHOP_REVISION,
    kind: "ingredient",
    itemId: "salt",
    quantity: 2,
  });

  assert.deepEqual(result, { ok: true, data: PURCHASE_RESULT });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "/api/farm/kitchen/purchases");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_shop_revision: SHOP_REVISION,
    kind: "ingredient",
    item_id: "salt",
    quantity: 2,
  });
  assert.equal(String(requests[0]?.init?.body).includes("farm_human_key"), false);
  assert.equal(String(requests[0]?.init?.body).includes("farm_doorplate"), false);
  assert.equal(String(requests[0]?.init?.body).includes("price"), false);
});

test("kitchen purchase browser client keeps malformed, network, and structured conflicts honest", async () => {
  const malformed = await purchaseBoundKitchenItem({
    fetcher: async () => jsonResponse({ ...PURCHASE_RESULT, extra: true }),
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedShopRevision: SHOP_REVISION,
    kind: "ingredient",
    itemId: "salt",
    quantity: 2,
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
  });

  const stateConflict = await purchaseBoundKitchenItem({
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
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedShopRevision: SHOP_REVISION,
    kind: "ingredient",
    itemId: "salt",
    quantity: 2,
  });
  assert.deepEqual(stateConflict, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentShopRevision: `kitchen-v1:${"c".repeat(64)}`,
      serverMessage: "changed",
    },
  });

  const rejected = await purchaseBoundKitchenItem({
    fetcher: async () =>
      jsonResponse({ error: { code: "purchase_rejected", message: "银币不足" } }, 409),
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedShopRevision: SHOP_REVISION,
    kind: "ingredient",
    itemId: "salt",
    quantity: 2,
  });
  assert.deepEqual(rejected, {
    ok: false,
    issue: { code: "purchase_rejected", currentShopRevision: null, serverMessage: "银币不足" },
  });

  const network = await purchaseBoundKitchenItem({
    fetcher: async () => {
      throw new Error("offline");
    },
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedShopRevision: SHOP_REVISION,
    kind: "ingredient",
    itemId: "salt",
    quantity: 2,
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentShopRevision: null, serverMessage: null },
  });
  assert.equal(
    kitchenPurchaseIssueMessage({
      code: "shop_unavailable",
      currentShopRevision: null,
      serverMessage: "stale",
    }),
    "stale",
  );
});

test("kitchen purchase browser client validates idempotency and recipe quantity before sending", async () => {
  let calls = 0;
  const fetcher: FrontendFetcher = async () => {
    calls += 1;
    return jsonResponse(PURCHASE_RESULT);
  };

  for (const input of [
    {
      fetcher,
      idempotencyKey: "not-a-uuid",
      expectedShopRevision: SHOP_REVISION,
      kind: "ingredient" as const,
      itemId: "salt",
      quantity: 1,
    },
    {
      fetcher,
      idempotencyKey: IDEMPOTENCY_KEY,
      expectedShopRevision: SHOP_REVISION,
      kind: "recipe" as const,
      itemId: "honey_tea",
      quantity: 2,
    },
  ]) {
    await assert.rejects(purchaseBoundKitchenItem(input));
  }
  assert.equal(calls, 0);
});

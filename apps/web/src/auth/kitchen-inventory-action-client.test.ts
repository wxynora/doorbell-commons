/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundKitchenInventoryAction,
  kitchenInventoryActionIssueMessage,
} from "./kitchen-inventory-action-client";

const FARM_DOORPLATE = "ABC234";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INVENTORY_REVISION = `kitchen-inventory-v1:${"a".repeat(64)}`;
const NEXT_INVENTORY_REVISION = `kitchen-inventory-v1:${"b".repeat(64)}`;

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

const RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      action: "recycle",
      outcome: {
        kind: "recycle",
        item_kind: "product",
        name: "蜂蜜",
        quantity: 1,
        value: 10,
        silver: 10,
      },
    },
    resource: KITCHEN_DATA,
  },
  kitchen_inventory_revision: NEXT_INVENTORY_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const INPUT = {
  expectedFarmDoorplate: FARM_DOORPLATE,
  idempotencyKey: IDEMPOTENCY_KEY,
  expectedInventoryRevision: INVENTORY_REVISION,
  action: "recycle" as const,
  itemKind: "product" as const,
  itemInstanceIds: ["product-1"],
  quantity: 1,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("kitchen inventory browser client posts the fixed route without identity", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(RESULT);
  };

  const result = await executeBoundKitchenInventoryAction({ fetcher, ...INPUT });

  assert.deepEqual(result, { ok: true, data: RESULT });
  assert.equal(requests[0]?.url, "/api/farm/kitchen/inventory/actions");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(headers.get("authorization"), null);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_kitchen_inventory_revision: INVENTORY_REVISION,
    action: "recycle",
    item_kind: "product",
    item_instance_ids: ["product-1"],
    quantity: 1,
  });
  const body = String(requests[0]?.init?.body);
  for (const forbidden of ["farm_human_key", "farm_doorplate", "idempotency_key", "price"]) {
    assert.equal(body.includes(forbidden), false, forbidden);
  }
});

test("kitchen inventory browser client rejects stale revision and cross-house subject", async () => {
  const call = (payload: unknown) =>
    executeBoundKitchenInventoryAction({
      ...INPUT,
      fetcher: async () => jsonResponse(payload),
    });

  assert.deepEqual(await call({ ...RESULT, kitchen_inventory_revision: INVENTORY_REVISION }), {
    ok: false,
    issue: { code: "unexpected_response", currentInventoryRevision: null, serverMessage: null },
  });
  assert.deepEqual(
    await call({
      ...RESULT,
      data: {
        ...RESULT.data,
        resource: {
          ...KITCHEN_DATA,
          farm: { ...KITCHEN_DATA.farm, farm_doorplate: "DEF567" },
        },
      },
    }),
    {
      ok: false,
      issue: { code: "unexpected_response", currentInventoryRevision: null, serverMessage: null },
    },
  );
});

test("kitchen inventory browser client preserves state errors and unknown results", async () => {
  const conflict = await executeBoundKitchenInventoryAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "state_conflict",
            message: "changed",
            current_kitchen_inventory_revision: NEXT_INVENTORY_REVISION,
          },
        },
        409,
      ),
  });
  assert.deepEqual(conflict, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentInventoryRevision: NEXT_INVENTORY_REVISION,
      serverMessage: "changed",
    },
  });

  const badGateway = await executeBoundKitchenInventoryAction({
    ...INPUT,
    fetcher: async () => new Response("bad gateway", { status: 502 }),
  });
  assert.deepEqual(badGateway, {
    ok: false,
    issue: { code: "unexpected_response", currentInventoryRevision: null, serverMessage: null },
  });
  const network = await executeBoundKitchenInventoryAction({
    ...INPUT,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentInventoryRevision: null, serverMessage: null },
  });
  assert.equal(
    kitchenInventoryActionIssueMessage({
      code: "state_conflict",
      currentInventoryRevision: NEXT_INVENTORY_REVISION,
      serverMessage: "changed",
    }),
    "changed",
  );
});

test("kitchen inventory browser client validates UUID and revision before network", async () => {
  let calls = 0;
  const fetcher: FrontendFetcher = async () => {
    calls += 1;
    return jsonResponse(RESULT);
  };

  await assert.rejects(
    executeBoundKitchenInventoryAction({
      ...INPUT,
      idempotencyKey: "not-a-uuid",
      fetcher,
    }),
  );
  await assert.rejects(
    executeBoundKitchenInventoryAction({
      ...INPUT,
      expectedInventoryRevision: `kitchen-inventory-v1:${"A".repeat(64)}`,
      fetcher,
    }),
  );
  assert.equal(calls, 0);
});

/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { executeBoundKitchenCook } from "./kitchen-cook-client";

const FARM_DOORPLATE = "ABC234";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INVENTORY_REVISION = `kitchen-inventory-v1:${"a".repeat(64)}`;
const ITEMS = ["egg", "salt"];

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
    refresh_used_count: 0,
    refresh_remaining_count: 10,
    refresh_limit: 10,
    next_cost_coins: 100,
    can_refresh: true,
    refresh_reset_at: "2026-08-25T00:00:00.000Z",
    ingredients: [],
    recipes: [],
    reason: null,
  },
} as const;

const COOK_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      outcome: {
        kind: "cook",
        item_refs: ITEMS,
        dish_instance_id: "dish-1",
        recipe_id: "fried_egg",
        name: "香煎蛋",
        rarity: "N",
        value_gold: 82,
        recycle_silver: 2,
        odd: false,
        discovered: true,
        qixi: null,
      },
    },
    resource: KITCHEN_DATA,
  },
  kitchen_inventory_revision: `kitchen-inventory-v1:${"b".repeat(64)}`,
  server_time: "2026-08-25T04:00:00.000Z",
};

const INPUT = {
  expectedFarmDoorplate: FARM_DOORPLATE,
  idempotencyKey: IDEMPOTENCY_KEY,
  items: ITEMS,
  expectedKitchenInventoryRevision: INVENTORY_REVISION,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("kitchen cook browser client sends only raw refs, revision, and UUID header", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(COOK_RESULT);
  };

  const result = await executeBoundKitchenCook({ fetcher, ...INPUT });

  assert.deepEqual(result, { ok: true, data: COOK_RESULT });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "/api/farm/kitchen/cooks");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_kitchen_inventory_revision: INVENTORY_REVISION,
    items: ITEMS,
  });
  assert.equal(String(requests[0]?.init?.body).includes("farm_human_key"), false);
  assert.equal(String(requests[0]?.init?.body).includes("farm_doorplate"), false);
  assert.equal(String(requests[0]?.init?.body).includes("idempotency_key"), false);
});

test("kitchen cook browser client sends one known recipe id without material refs", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(COOK_RESULT);
  };
  const result = await executeBoundKitchenCook({
    expectedFarmDoorplate: FARM_DOORPLATE,
    expectedKitchenInventoryRevision: INVENTORY_REVISION,
    fetcher,
    idempotencyKey: IDEMPOTENCY_KEY,
    recipeId: "fried_egg",
  });
  assert.deepEqual(result, { ok: true, data: COOK_RESULT });
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_kitchen_inventory_revision: INVENTORY_REVISION,
    recipe_id: "fried_egg",
  });
});

test("kitchen cook browser client rejects a wrong receipt or subject doorplate", async () => {
  const wrongReceipt = await executeBoundKitchenCook({
    fetcher: async () =>
      jsonResponse({
        ...COOK_RESULT,
        data: {
          ...COOK_RESULT.data,
          result: {
            ...COOK_RESULT.data.result,
            receipt_id: "019ffb01-49cd-7020-84af-3d04fb1ed03e",
          },
        },
      }),
    ...INPUT,
  });
  assert.deepEqual(wrongReceipt, {
    ok: false,
    issue: {
      code: "unexpected_response",
      currentKitchenInventoryRevision: null,
      serverMessage: null,
    },
  });

  const wrongDoorplate = await executeBoundKitchenCook({
    fetcher: async () =>
      jsonResponse({
        ...COOK_RESULT,
        data: {
          ...COOK_RESULT.data,
          resource: {
            ...KITCHEN_DATA,
            farm: { ...KITCHEN_DATA.farm, farm_doorplate: "DEF567" },
          },
        },
      }),
    ...INPUT,
  });
  assert.deepEqual(wrongDoorplate, {
    ok: false,
    issue: {
      code: "unexpected_response",
      currentKitchenInventoryRevision: null,
      serverMessage: null,
    },
  });
});

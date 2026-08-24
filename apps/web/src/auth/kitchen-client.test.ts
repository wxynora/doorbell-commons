/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { boundFarmKitchenReadErrorSchema } from "@doorbell/protocol";
import type { FrontendFetcher } from "./auth-client";
import { getBoundKitchen, kitchenIssueMessage } from "./kitchen-client";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const KITCHEN_RESULT = {
  data: {
    farm: { farm_doorplate: "ABC234", farm_name: "渡的小农场" },
    balance: {
      silver: { status: "available", value: 321, reason: null },
      ranch_coins: { status: "unavailable", value: null, reason: "not_initialized" },
    },
    tools: { status: "unavailable", items: [], reason: "not_persisted" },
    stacked_ingredients: { status: "unavailable", items: [], reason: "not_initialized" },
    product_instances: { status: "unavailable", items: [], reason: "not_initialized" },
    fish_instances: { status: "unavailable", items: [], reason: "not_initialized" },
    treasure_items: { status: "unavailable", items: [], reason: "not_initialized" },
    dish_instances: { status: "unavailable", items: [], reason: "not_initialized" },
    known_recipes: { status: "unavailable", items: [], reason: "not_initialized" },
    daily_shop: {
      status: "unavailable",
      stored_day_index: null,
      current_day_index: 20700,
      is_current_day: false,
      refresh_at: "2026-08-25T00:00:00.000Z",
      ingredients: [],
      recipes: [],
      reason: "not_initialized",
    },
  },
  server_time: "2026-08-24T04:00:00.000Z",
};

test("kitchen browser error contract accepts Doorbell community failures", () => {
  const payload = {
    error: {
      code: "qq_not_group_member",
      message: "The session QQ number is no longer a current member of the community group",
    },
  };
  assert.deepEqual(boundFarmKitchenReadErrorSchema.parse(payload), payload);
});

test("kitchen browser client uses a fixed same-origin GET without credentials in the URL", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(KITCHEN_RESULT);
  };

  const result = await getBoundKitchen({ fetcher });
  assert.deepEqual(result, { ok: true, data: KITCHEN_RESULT });
  assert.deepEqual(requests, [
    {
      url: "/api/farm/kitchen",
      init: { credentials: "same-origin", method: "GET" },
    },
  ]);
});

test("kitchen browser client keeps malformed and network responses honest", async () => {
  const malformed = await getBoundKitchen({
    fetcher: async () => jsonResponse({ ...KITCHEN_RESULT, unexpected: true }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });

  const serverError = await getBoundKitchen({
    fetcher: async () =>
      jsonResponse({ error: { code: "farm_unavailable", message: "offline" } }, 503),
  });
  assert.deepEqual(serverError, {
    ok: false,
    issue: { code: "farm_unavailable", serverMessage: "offline" },
  });

  const networkError = await getBoundKitchen({
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(networkError, {
    ok: false,
    issue: { code: "network_unavailable", serverMessage: null },
  });
  assert.equal(
    kitchenIssueMessage({ code: "unexpected_response", serverMessage: null }),
    "料理台数据返回了无法识别的数据，请稍后再试。",
  );
});

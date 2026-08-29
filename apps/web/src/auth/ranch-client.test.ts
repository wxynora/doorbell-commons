/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { getBoundRanch, ranchIssueMessage } from "./ranch-client";

const RANCH_RESULT = {
  data: {
    farm: { farm_doorplate: "3ET3FE" },
    balance: { status: "available", ranch_coins: 321, debt_status: "available", debt_coins: 0 },
    residents: { status: "available", animals: [], pets: [], patrol_goose: null },
    collectable: {
      status: "available",
      total_pending_count: 0,
      total_pending_meat_count: 0,
      entries: [],
    },
    wardrobe: { status: "available", items: [] },
    decorations: { status: "available", placed: [], stored: [] },
    dispatch: { status: "available", active: [] },
    shop: {
      animals: { status: "available", shop_day: null, items: [] },
      pets: { status: "available", shop_day: null, items: [] },
      skins: { status: "available", shop_day: null, items: [] },
      accessories: { status: "unavailable", shop_day: null, items: [] },
      decorations: { status: "unavailable", shop_day: null, items: [] },
    },
  },
  revision: "ranch-v1:test",
  server_time: "2026-08-24T04:00:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("Ranch reads use the fixed same-origin GET route", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(RANCH_RESULT);
  };

  const result = await getBoundRanch({ fetcher });
  assert.deepEqual(requests, [
    {
      url: "/api/farm/ranch",
      init: { credentials: "same-origin", method: "GET" },
    },
  ]);
  assert.deepEqual(result, { ok: true, data: RANCH_RESULT });
});

test("Ranch client keeps network and malformed responses honest", async () => {
  const unavailable = await getBoundRanch({
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "network_unavailable", serverMessage: null },
  });

  const malformed = await getBoundRanch({
    fetcher: async () => jsonResponse({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });

  const communityError = await getBoundRanch({
    fetcher: async () =>
      jsonResponse({ error: { code: "qq_not_group_member", message: "已不在指定群" } }, 403),
  });
  assert.deepEqual(communityError, {
    ok: false,
    issue: { code: "qq_not_group_member", serverMessage: "已不在指定群" },
  });
  assert.equal(
    ranchIssueMessage({ code: "unexpected_response", serverMessage: null }),
    "牧场数据返回了无法识别的数据，请稍后再试。",
  );
});

/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { collectBoundRanch, ranchCollectionIssueMessage } from "./ranch-collection-client";

const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INPUT = {
  idempotencyKey: IDEMPOTENCY_KEY,
  expectedRevision: "ranch-v1:before",
};

const RESOURCE = {
  farm: { farm_doorplate: "3ET3FE" },
  balance: {
    status: "available",
    ranch_coins: 321,
    debt_status: "available",
    debt_coins: 0,
  },
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
    accessories: { status: "unavailable", shop_day: null, items: [] },
    decorations: { status: "unavailable", shop_day: null, items: [] },
  },
} as const;

const COLLECTION_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      items: [
        {
          instance_id: "instance-egg-1",
          item_id: "chicken_egg",
          name: "鸡蛋",
          quantity: 1,
          unit_value: 25,
          destination: "kitchen",
        },
      ],
      gross_value: 25,
      ranch_coins_gained: 0,
      debt_paid: 0,
      stored_count: 1,
      non_cookable_count: 0,
      non_cookable_gain: 0,
      potion_count: 0,
      detail: { 鸡蛋: 1 },
      non_cookable_detail: {},
    },
    resource: RESOURCE,
  },
  revision: "ranch-v1:after",
  server_time: "2026-08-24T04:00:00.000Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("ranch collection browser action posts an empty business body to the fixed route", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(COLLECTION_RESULT);
  };

  const result = await collectBoundRanch({ ...INPUT, fetcher });
  assert.deepEqual(result, { ok: true, data: COLLECTION_RESULT });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "/api/farm/ranch/collect");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(headers.get("if-match"), '"ranch-v1:before"');
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {});
});

test("ranch collection browser action keeps malformed, network, and structured conflicts honest", async () => {
  const malformed = await collectBoundRanch({
    ...INPUT,
    fetcher: async () => jsonResponse({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const network = await collectBoundRanch({
    ...INPUT,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });

  const stateConflict = await collectBoundRanch({
    ...INPUT,
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "state_conflict",
            message: "changed",
            current_revision: "ranch-v1:current",
          },
        },
        409,
      ),
  });
  assert.deepEqual(stateConflict, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentRevision: "ranch-v1:current",
      serverMessage: "changed",
    },
  });

  const noOutput = await collectBoundRanch({
    ...INPUT,
    fetcher: async () => jsonResponse({ error: { code: "no_collectable", message: "empty" } }, 409),
  });
  assert.deepEqual(noOutput, {
    ok: false,
    issue: { code: "no_collectable", currentRevision: null, serverMessage: "empty" },
  });
  assert.equal(
    ranchCollectionIssueMessage({
      code: "unexpected_response",
      currentRevision: null,
      serverMessage: null,
    }),
    "牧场收取结果返回了无法识别的数据，请稍后再试。",
  );
});

test("ranch collection browser action validates UUID before network", async () => {
  let calls = 0;
  const fetcher: FrontendFetcher = async () => {
    calls += 1;
    return jsonResponse(COLLECTION_RESULT);
  };

  await assert.rejects(collectBoundRanch({ ...INPUT, idempotencyKey: "not-a-uuid", fetcher }));
  assert.equal(calls, 0);
});

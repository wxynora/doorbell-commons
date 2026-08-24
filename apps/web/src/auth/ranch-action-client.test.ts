/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundRanchResidentAction,
  ranchResidentActionIssueMessage,
} from "./ranch-action-client";

const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INPUT = {
  idempotencyKey: IDEMPOTENCY_KEY,
  expectedRevision: "ranch-v1:before",
  action: "feed" as const,
  residentType: "animal" as const,
  kindId: "chicken",
  payload: {},
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

const ACTION_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      action: "feed",
      resident_type: "animal",
      kind_id: "chicken",
      outcome: {
        kind: "feed",
        cost_silver: 2,
        bonus_rate: 0.1,
        remaining_today: 2,
        silver_balance: 998,
      },
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

test("ranch resident browser actions use the fixed same-origin route and headers", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(ACTION_RESULT);
  };

  const result = await executeBoundRanchResidentAction({ ...INPUT, fetcher });
  assert.deepEqual(result, { ok: true, data: ACTION_RESULT });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "/api/farm/ranch/resident-actions");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_revision: "ranch-v1:before",
    action: "feed",
    resident_type: "animal",
    kind_id: "chicken",
    payload: {},
  });
});

test("ranch resident browser actions keep malformed success and binding errors honest", async () => {
  const malformed = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () => jsonResponse({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const extraKey = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () => jsonResponse({ ...ACTION_RESULT, unexpected: true }),
  });
  assert.deepEqual(extraKey, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const missingOutcome = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () => {
      const { outcome: _outcome, ...result } = ACTION_RESULT.data.result;
      return jsonResponse({
        ...ACTION_RESULT,
        data: { ...ACTION_RESULT.data, result },
      });
    },
  });
  assert.deepEqual(missingOutcome, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const wrongOutcomeBranch = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse({
        ...ACTION_RESULT,
        data: {
          ...ACTION_RESULT.data,
          result: {
            ...ACTION_RESULT.data.result,
            outcome: { kind: "upgrade", level: 2, cost_ranch_coins: 90, ranch_coin_balance: 910 },
          },
        },
      }),
  });
  assert.deepEqual(wrongOutcomeBranch, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const network = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });

  const unavailable = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse({ error: { code: "farm_unavailable", message: "暂时不可用" } }, 503),
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "farm_unavailable", currentRevision: null, serverMessage: "暂时不可用" },
  });
  assert.equal(
    ranchResidentActionIssueMessage({
      code: "unexpected_response",
      currentRevision: null,
      serverMessage: null,
    }),
    "牧场动作返回了无法识别的数据，请稍后再试。",
  );
});

test("ranch resident browser actions expose structured conflict and business rejection", async () => {
  const stateConflict = await executeBoundRanchResidentAction({
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

  const rejected = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse({ error: { code: "action_rejected", message: "银币不足" } }, 409),
  });
  assert.deepEqual(rejected, {
    ok: false,
    issue: { code: "action_rejected", currentRevision: null, serverMessage: "银币不足" },
  });

  const replayConflict = await executeBoundRanchResidentAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse({ error: { code: "idempotency_conflict", message: "duplicate" } }, 409),
  });
  assert.deepEqual(replayConflict, {
    ok: false,
    issue: { code: "idempotency_conflict", currentRevision: null, serverMessage: "duplicate" },
  });
});

test("ranch resident browser actions validate action and target before network", async () => {
  let calls = 0;
  const fetcher: FrontendFetcher = async () => {
    calls += 1;
    return jsonResponse(ACTION_RESULT);
  };

  await assert.rejects(
    executeBoundRanchResidentAction({ ...INPUT, idempotencyKey: "not-a-uuid", fetcher }),
  );
  await assert.rejects(
    executeBoundRanchResidentAction({
      ...INPUT,
      residentType: "pet",
      kindId: "cat",
      payload: {},
      fetcher,
    }),
  );
  await assert.rejects(
    executeBoundRanchResidentAction({
      ...INPUT,
      action: "rename",
      payload: {},
      fetcher,
    }),
  );
  await assert.rejects(
    executeBoundRanchResidentAction({
      ...INPUT,
      action: "rename",
      payload: { name: "一二三四五六七八九十一二三" },
      fetcher,
    }),
  );
  assert.equal(calls, 0);
});

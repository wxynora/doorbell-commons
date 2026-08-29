/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundRanchDecorationAction,
  ranchDecorationActionIssueMessage,
} from "./ranch-decoration-action-client";

const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INPUT = {
  idempotencyKey: IDEMPOTENCY_KEY,
  expectedRevision: "ranch-v1:before",
  action: "place" as const,
  decorationId: "lantern_warm",
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
  decorations: {
    status: "available",
    placed: [{ status: "known", decoration_id: "lantern_warm", name: "暖灯" }],
    stored: [],
  },
  dispatch: { status: "available", active: [] },
  shop: {
    animals: { status: "available", shop_day: null, items: [] },
    pets: { status: "available", shop_day: null, items: [] },
    skins: { status: "available", shop_day: null, items: [] },
    accessories: { status: "unavailable", shop_day: null, items: [] },
    decorations: { status: "unavailable", shop_day: null, items: [] },
  },
} as const;

const ACTION_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      action: "place",
      decoration_id: "lantern_warm",
      outcome: {
        kind: "place",
        decoration_id: "lantern_warm",
        decoration_name: "暖灯",
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

test("ranch decoration browser actions use the fixed route and header-only idempotency", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(ACTION_RESULT);
  };

  const result = await executeBoundRanchDecorationAction({ ...INPUT, fetcher });
  assert.deepEqual(result, { ok: true, data: ACTION_RESULT });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "/api/farm/ranch/decorations/actions");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_revision: "ranch-v1:before",
    action: "place",
    decoration_id: "lantern_warm",
  });
  assert.equal(String(requests[0]?.init?.body).includes("idempotency"), false);
});

test("ranch decoration browser actions reject malformed receipts and separate network/502 failures", async () => {
  const malformedResponses = [
    { data: {} },
    { ...ACTION_RESULT, unexpected: true },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: { ...ACTION_RESULT.data.result, receipt_id: "other" },
      },
    },
    {
      ...ACTION_RESULT,
      data: { ...ACTION_RESULT.data, result: { ...ACTION_RESULT.data.result, action: "unplace" } },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: { ...ACTION_RESULT.data.result, decoration_id: "other_decoration" },
      },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: {
          ...ACTION_RESULT.data.result,
          outcome: { ...ACTION_RESULT.data.result.outcome, kind: "unplace" },
        },
      },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: {
          ...ACTION_RESULT.data.result,
          outcome: { ...ACTION_RESULT.data.result.outcome, decoration_id: "other_decoration" },
        },
      },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        resource: { ...ACTION_RESULT.data.resource, farm: { farm_doorplate: null } },
      },
    },
  ];

  for (const payload of malformedResponses) {
    const result = await executeBoundRanchDecorationAction({
      ...INPUT,
      fetcher: async () => jsonResponse(payload),
    });
    assert.deepEqual(result, {
      ok: false,
      issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
    });
  }

  const network = await executeBoundRanchDecorationAction({
    ...INPUT,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });

  const contractUnavailable = await executeBoundRanchDecorationAction({
    ...INPUT,
    fetcher: async () => new Response("bad gateway", { status: 502 }),
  });
  assert.deepEqual(contractUnavailable, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const unavailable = await executeBoundRanchDecorationAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse({ error: { code: "farm_unavailable", message: "暂时不可用" } }, 503),
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "farm_unavailable", currentRevision: null, serverMessage: "暂时不可用" },
  });
  assert.equal(
    ranchDecorationActionIssueMessage({
      code: "unexpected_response",
      currentRevision: null,
      serverMessage: null,
    }),
    "牧场装饰动作返回了无法识别的数据，请稍后再试。",
  );
});

test("ranch decoration browser actions expose structured conflict, rejection, and replay errors", async () => {
  const stateConflict = await executeBoundRanchDecorationAction({
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

  const rejected = await executeBoundRanchDecorationAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse({ error: { code: "action_rejected", message: "not stored" } }, 409),
  });
  assert.deepEqual(rejected, {
    ok: false,
    issue: { code: "action_rejected", currentRevision: null, serverMessage: "not stored" },
  });

  const replayConflict = await executeBoundRanchDecorationAction({
    ...INPUT,
    fetcher: async () =>
      jsonResponse({ error: { code: "idempotency_conflict", message: "duplicate" } }, 409),
  });
  assert.deepEqual(replayConflict, {
    ok: false,
    issue: { code: "idempotency_conflict", currentRevision: null, serverMessage: "duplicate" },
  });
});

test("ranch decoration browser actions validate action and target before network", async () => {
  let calls = 0;
  const fetcher: FrontendFetcher = async () => {
    calls += 1;
    return jsonResponse(ACTION_RESULT);
  };

  await assert.rejects(
    executeBoundRanchDecorationAction({ ...INPUT, idempotencyKey: "not-a-uuid", fetcher }),
  );
  await assert.rejects(
    executeBoundRanchDecorationAction({ ...INPUT, expectedRevision: "", fetcher }),
  );
  await assert.rejects(
    executeBoundRanchDecorationAction({ ...INPUT, action: "remove" as never, fetcher }),
  );
  await assert.rejects(
    executeBoundRanchDecorationAction({ ...INPUT, decorationId: "not valid", fetcher }),
  );
  assert.equal(calls, 0);
});

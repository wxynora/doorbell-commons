/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundNeighborhoodMessage,
  neighborhoodMessageActionIssueMessage,
} from "./neighborhood-message-action-client";

const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE = `farm-neighborhood-v1:${"a".repeat(64)}`;
const AFTER = `farm-neighborhood-v1:${"b".repeat(64)}`;
const MESSAGE = {
  id: "abc123",
  author_farm_doorplate: "ABC234",
  author_name: "发送方",
  text: "你好，邻居！",
  at: "2026-08-25T04:00:00.000Z",
} as const;
const RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      target_farm_doorplate: "BCDFGH",
      message_id: MESSAGE.id,
      message: MESSAGE,
    },
    resource: {
      status: "available",
      rankings: {},
      messages: [MESSAGE],
      original_crops: [],
    },
  },
  revision: AFTER,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: KEY,
    expectedRevision: BEFORE,
    targetFarmDoorplate: "BCDFGH",
    body: "  你好，邻居！  ",
    ...overrides,
  };
}

test("neighborhood browser client sends only target, body, and revision", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return response(RESULT);
  };

  const result = await executeBoundNeighborhoodMessage({ ...input(), fetcher });
  assert.deepEqual(result, { ok: true, data: RESULT });
  assert.equal(requests[0]?.url, "/api/farm/neighborhood/messages");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("idempotency-key"), KEY);
  const body = String(requests[0]?.init?.body);
  assert.deepEqual(JSON.parse(body), {
    target_farm_doorplate: "BCDFGH",
    body: "  你好，邻居！  ",
    expected_revision: BEFORE,
  });
  assert.equal(body.includes("farm_human_key"), false);
  assert.equal(body.includes("idempotency_key"), false);
});

test("neighborhood browser client rejects malformed or mismatched receipts without retrying", async () => {
  let calls = 0;
  const malformed = await executeBoundNeighborhoodMessage({
    ...input(),
    fetcher: async () => {
      calls += 1;
      return response({ data: {} });
    },
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const mismatchedReceipt = await executeBoundNeighborhoodMessage({
    ...input(),
    fetcher: async () => {
      calls += 1;
      return response({
        ...RESULT,
        data: {
          ...RESULT.data,
          result: { ...RESULT.data.result, receipt_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d" },
        },
      });
    },
  });
  assert.deepEqual(mismatchedReceipt, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const mismatchedTarget = await executeBoundNeighborhoodMessage({
    ...input(),
    fetcher: async () => {
      calls += 1;
      return response({
        ...RESULT,
        data: {
          ...RESULT.data,
          result: { ...RESULT.data.result, target_farm_doorplate: "DEF567" },
        },
      });
    },
  });
  assert.deepEqual(mismatchedTarget, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
  assert.equal(calls, 3);
});

test("neighborhood browser client preserves network and structured action errors", async () => {
  const base = input();
  const network = await executeBoundNeighborhoodMessage({
    ...base,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });

  const conflict = await executeBoundNeighborhoodMessage({
    ...base,
    fetcher: async () =>
      response(
        { error: { code: "state_conflict", message: "changed", current_revision: AFTER } },
        409,
      ),
  });
  assert.deepEqual(conflict, {
    ok: false,
    issue: { code: "state_conflict", currentRevision: AFTER, serverMessage: "changed" },
  });

  const closed = await executeBoundNeighborhoodMessage({
    ...base,
    fetcher: async () =>
      response({ error: { code: "guestbook_closed", message: "留言板关闭" } }, 409),
  });
  assert.deepEqual(closed, {
    ok: false,
    issue: { code: "guestbook_closed", currentRevision: null, serverMessage: "留言板关闭" },
  });

  assert.equal(
    neighborhoodMessageActionIssueMessage({
      code: "message_closed",
      currentRevision: null,
      serverMessage: "不可用",
    }),
    "不可用",
  );
});

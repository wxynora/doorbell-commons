/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundExpeditionAction,
  expeditionActionIssueMessage,
} from "./expedition-action-client";

const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE_REVISION = `farm-expedition-v1:${"a".repeat(64)}`;
const AFTER_REVISION = `farm-expedition-v1:${"b".repeat(64)}`;

const RESULT = {
  data: {
    result: { receipt_id: KEY, action: "enter", outcome: { text: "你踏入雾岭。" } },
    resource: {
      farm: { farm_doorplate: "3ET3FE", farm_name: "渡的小农场" },
      shop: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      backpack: { status: "available", items: [] },
      codex: { status: "available", entries: [] },
      settings: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      expedition: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      smelting: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      bulletin: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      neighborhood: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      market: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
    },
  },
  revision: AFTER_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const input = {
  idempotencyKey: KEY,
  expectedRevision: BEFORE_REVISION,
  action: "enter" as const,
  payload: { charges: 2 },
};

test("farm expedition browser client sends no identity and uses the fixed action route", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(RESULT);
  };

  const result = await executeBoundExpeditionAction({ ...input, fetcher });
  assert.deepEqual(result, { ok: true, data: RESULT });
  assert.equal(requests[0]?.url, "/api/farm/expedition/actions");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("idempotency-key"), KEY);
  const body = String(requests[0]?.init?.body);
  assert.deepEqual(JSON.parse(body), {
    expected_revision: BEFORE_REVISION,
    action: "enter",
    payload: { charges: 2 },
  });
  assert.equal(body.includes("farm_human_key"), false);
  assert.equal(body.includes("farm_doorplate"), false);
  assert.equal(body.includes("idempotency_key"), false);
});

test("farm expedition browser client rejects malformed or stale success responses", async () => {
  const malformed = await executeBoundExpeditionAction({
    ...input,
    fetcher: async () => jsonResponse({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const stale = await executeBoundExpeditionAction({
    ...input,
    fetcher: async () => jsonResponse({ ...RESULT, revision: BEFORE_REVISION }),
  });
  assert.deepEqual(stale, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const wrongAction = await executeBoundExpeditionAction({
    ...input,
    fetcher: async () =>
      jsonResponse({
        ...RESULT,
        data: {
          ...RESULT.data,
          result: { ...RESULT.data.result, action: "explore" },
        },
      }),
  });
  assert.deepEqual(wrongAction, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
});

test("farm expedition browser network failures remain unknown and can retry with the same key", async () => {
  let attempts = 0;
  const requestKeys: string[] = [];
  const fetcher: FrontendFetcher = async (_url, init) => {
    attempts += 1;
    requestKeys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
    if (attempts === 1) {
      throw new Error("offline after request");
    }
    return jsonResponse(RESULT);
  };

  const first = await executeBoundExpeditionAction({ ...input, fetcher });
  assert.deepEqual(first, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });
  const second = await executeBoundExpeditionAction({ ...input, fetcher });
  assert.deepEqual(second, { ok: true, data: RESULT });
  assert.deepEqual(requestKeys, [KEY, KEY]);
});

test("farm expedition browser client exposes structured community errors", async () => {
  const result = await executeBoundExpeditionAction({
    ...input,
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "state_conflict",
            message: "探险状态已变化",
            current_revision: AFTER_REVISION,
          },
        },
        409,
      ),
  });
  assert.deepEqual(result, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentRevision: AFTER_REVISION,
      serverMessage: "探险状态已变化",
    },
  });
  assert.equal(
    expeditionActionIssueMessage({
      code: "unexpected_response",
      currentRevision: null,
      serverMessage: null,
    }),
    "探险动作返回了无法识别的数据，请稍后再试。",
  );
});

/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundOriginalPlantAction,
  originalPlantActionIssueMessage,
} from "./original-plant-action-client";

const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE = `farm-original-plant-v1:${"a".repeat(64)}`;
const AFTER = `farm-original-plant-v1:${"b".repeat(64)}`;
const CROP = {
  id: "ugc_1234abcd",
  name: "月光番茄",
  latin: "Solanum luna",
  desc: "在月光里慢慢变甜的番茄。",
  category: "ugc",
  rarity: "OR",
  growTicks: 4,
  water: null,
  seedPrice: 20,
  sellPrice: 80,
  family: null,
  unlockTier: null,
  mechanicText: null,
  mechanicStatus: "active",
  mechanicSystem: null,
  unlockType: "craft",
  unlockCond: "自创作物",
  produce: null,
  designer: "小机",
  designerId: "ABC234",
  plantLine: "把一颗月光埋进土里。",
  lore: "月光从果实里流出来了。",
} as const;
const RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      crop: CROP,
      fee: 200,
      seeds: 5,
      coins_balance: 800,
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
    name: "月光番茄",
    latin: "Solanum luna",
    desc: "在月光里慢慢变甜的番茄。",
    plant: "把一颗月光埋进土里。",
    harvest: "月光从果实里流出来了。",
    ...overrides,
  };
}

test("original plant browser client sends only revision and five design fields", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return response(RESULT);
  };

  const result = await executeBoundOriginalPlantAction({ ...input(), fetcher });
  assert.deepEqual(result, { ok: true, data: RESULT });
  assert.equal(requests[0]?.url, "/api/farm/original-plant/actions");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("idempotency-key"), KEY);
  const body = String(requests[0]?.init?.body);
  assert.deepEqual(JSON.parse(body), {
    expected_revision: BEFORE,
    name: "月光番茄",
    latin: "Solanum luna",
    desc: "在月光里慢慢变甜的番茄。",
    plant: "把一颗月光埋进土里。",
    harvest: "月光从果实里流出来了。",
  });
  assert.equal(body.includes("farm_human_key"), false);
  assert.equal(body.includes("farm_doorplate"), false);
  assert.equal(body.includes("idempotency_key"), false);
});

test("original plant browser client rejects malformed or mismatched receipts without retrying", async () => {
  let calls = 0;
  const malformed = await executeBoundOriginalPlantAction({
    ...input(),
    fetcher: async () => {
      calls += 1;
      return response({ ...RESULT, data: { ...RESULT.data, resource: {} } });
    },
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
  const mismatched = await executeBoundOriginalPlantAction({
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
  assert.deepEqual(mismatched, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
  const unchangedRevision = await executeBoundOriginalPlantAction({
    ...input(),
    fetcher: async () => {
      calls += 1;
      return response({ ...RESULT, revision: BEFORE });
    },
  });
  assert.deepEqual(unchangedRevision, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
  assert.equal(calls, 3);
});

test("original plant browser client preserves network and structured action errors", async () => {
  const base = input();
  const network = await executeBoundOriginalPlantAction({
    ...base,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });
  const conflict = await executeBoundOriginalPlantAction({
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
  const idempotency = await executeBoundOriginalPlantAction({
    ...base,
    fetcher: async () =>
      response({ error: { code: "idempotency_conflict", message: "conflict" } }, 409),
  });
  assert.deepEqual(idempotency, {
    ok: false,
    issue: { code: "idempotency_conflict", currentRevision: null, serverMessage: "conflict" },
  });
  const rejected = await executeBoundOriginalPlantAction({
    ...base,
    fetcher: async () => response({ error: { code: "action_rejected", message: "金币不足" } }, 409),
  });
  assert.deepEqual(rejected, {
    ok: false,
    issue: { code: "action_rejected", currentRevision: null, serverMessage: "金币不足" },
  });
  assert.equal(
    originalPlantActionIssueMessage({
      code: "action_rejected",
      currentRevision: null,
      serverMessage: "金币不足",
    }),
    "金币不足",
  );
});

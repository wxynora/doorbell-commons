/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  cropCodexActionIssueMessage,
  executeBoundCropCodexAction,
} from "./crop-codex-action-client";

const FARM_DOORPLATE = "3ET3FE";
const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE = `farm-crop-codex-v1:${"a".repeat(64)}`;
const AFTER = `farm-crop-codex-v1:${"b".repeat(64)}`;

const CATALOG_DATA = {
  farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "图鉴收藏测试农场" },
  shop: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  backpack: { status: "available", items: [] },
  codex: {
    status: "available",
    entries: [
      {
        crop_id: "wheat",
        identity_state: "known",
        name: "小麦",
        latin_name: null,
        description: null,
        category: "common",
        rarity: "N",
        grow_ticks: 2,
        seed_price: 1,
        sell_price: 2,
        unlock_condition: null,
        discovered: true,
        discovery_count: 1,
        best_quality: 1,
        first_discovered_at: "2026-08-25T04:00:00.000Z",
        starred: true,
      },
    ],
  },
  settings: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  expedition: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  smelting: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  bulletin: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  neighborhood: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  market: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
} as const;

const RESULT = {
  data: {
    result: { receipt_id: KEY, crop_id: "wheat", action: "star", starred: true },
    resource: CATALOG_DATA,
  },
  revision: `farm-catalog-v1:${"c".repeat(64)}`,
  codex_revision: AFTER,
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
    expectedFarmDoorplate: FARM_DOORPLATE,
    idempotencyKey: KEY,
    cropId: "wheat",
    action: "star" as const,
    expectedCodexRevision: BEFORE,
    ...overrides,
  };
}

test("crop codex browser client posts only bound action fields", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return response(RESULT);
  };

  const result = await executeBoundCropCodexAction({ ...input(), fetcher });
  assert.deepEqual(result, { ok: true, data: RESULT });
  assert.equal(requests[0]?.url, "/api/farm/codex/actions");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("idempotency-key"), KEY);
  const body = String(requests[0]?.init?.body);
  assert.deepEqual(JSON.parse(body), {
    crop_id: "wheat",
    action: "star",
    expected_codex_revision: BEFORE,
  });
  assert.equal(body.includes("farm_human_key"), false);
  assert.equal(body.includes("farm_doorplate"), false);
  assert.equal(body.includes("idempotency_key"), false);
});

test("crop codex browser client rejects malformed and cross-house success payloads", async () => {
  const crossHouse = await executeBoundCropCodexAction({
    ...input(),
    fetcher: async () =>
      response({
        ...RESULT,
        data: {
          ...RESULT.data,
          resource: {
            ...RESULT.data.resource,
            farm: { ...RESULT.data.resource.farm, farm_doorplate: "BCDFGH" },
          },
        },
      }),
  });
  assert.deepEqual(crossHouse, {
    ok: false,
    issue: { code: "unexpected_response", currentCodexRevision: null, serverMessage: null },
  });

  const malformed = await executeBoundCropCodexAction({
    ...input(),
    fetcher: async () => response({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentCodexRevision: null, serverMessage: null },
  });
});

test("crop codex browser client exposes state and upstream contract errors", async () => {
  const conflict = await executeBoundCropCodexAction({
    ...input(),
    fetcher: async () =>
      response(
        {
          error: {
            code: "state_conflict",
            message: "The crop codex has changed",
            current_revision: AFTER,
          },
        },
        409,
      ),
  });
  assert.deepEqual(conflict, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentCodexRevision: AFTER,
      serverMessage: "The crop codex has changed",
    },
  });

  const contract = await executeBoundCropCodexAction({
    ...input(),
    fetcher: async () =>
      response({ error: { code: "upstream_contract_unavailable", message: "bad gateway" } }, 502),
  });
  assert.deepEqual(contract, {
    ok: false,
    issue: {
      code: "upstream_contract_unavailable",
      currentCodexRevision: null,
      serverMessage: "bad gateway",
    },
  });
  assert.equal(
    cropCodexActionIssueMessage({
      code: "unexpected_response",
      currentCodexRevision: null,
      serverMessage: null,
    }),
    "图鉴动作返回了无法识别的数据，请稍后再试。",
  );
});

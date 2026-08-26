/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { executeBoundMarketAction, marketActionIssueMessage } from "./market-action-client";

const FARM_DOORPLATE = "3ET3FE";
const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE_REVISION = `farm-market-v1:${"a".repeat(64)}`;
const AFTER_REVISION = `farm-market-v1:${"b".repeat(64)}`;

const CATALOG_RESOURCE = {
  farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "渡的小农场" },
  shop: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  backpack: { status: "available", items: [] },
  codex: { status: "available", entries: [] },
  settings: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  expedition: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  smelting: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  bulletin: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  neighborhood: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  market: { status: "available", listings: [], barter_listings: [] },
} as const;

const BROWSE_RESULT = {
  data: {
    result: { receipt_id: KEY, action: "browse", outcome: null },
    resource: CATALOG_RESOURCE,
  },
  revision: BEFORE_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const LIST_RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      action: "list",
      outcome: {
        kind: "material",
        item_id: "ordinary_stone",
        quantity: 1,
        price: 10,
        name: "普通石头",
      },
    },
    resource: CATALOG_RESOURCE,
  },
  revision: AFTER_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const CROSS_BUY_RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      action: "buy",
      outcome: {
        seller_doorplate: "ABC234",
        kind: "material",
        item_id: "ordinary_stone",
        quantity: 1,
        name: "普通石头",
        cost: 10,
        fee: 1,
        price: 10,
      },
    },
    buyer_doorplate: FARM_DOORPLATE,
    seller_doorplate: "ABC234",
  },
  revision: AFTER_REVISION,
  seller_revision: `farm-market-v1:${"c".repeat(64)}`,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const CROSS_BARTER_ACCEPT_RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      action: "barter-accept",
      outcome: {
        seller_doorplate: "ABC234",
        listing_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
        give: {
          kind: "material",
          item_id: "ordinary_stone",
          quantity: 1,
          name: "普通石头",
        },
        want: {
          kind: "material",
          item_id: "dry_branch",
          quantity: 1,
          name: "枯树枝",
        },
      },
    },
    buyer_doorplate: FARM_DOORPLATE,
    seller_doorplate: "ABC234",
  },
  revision: AFTER_REVISION,
  seller_revision: `farm-market-v1:${"c".repeat(64)}`,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    expectedFarmDoorplate: FARM_DOORPLATE,
    idempotencyKey: KEY,
    expectedRevision: BEFORE_REVISION,
    action: "browse" as const,
    ...overrides,
  };
}

test("farm market browser client sends no identity and uses the fixed action route", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(BROWSE_RESULT);
  };

  const result = await executeBoundMarketAction({ ...input(), fetcher });
  assert.deepEqual(result, { ok: true, data: BROWSE_RESULT });
  assert.equal(requests[0]?.url, "/api/farm/market/actions");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("idempotency-key"), KEY);
  const body = String(requests[0]?.init?.body);
  assert.deepEqual(JSON.parse(body), {
    expected_revision: BEFORE_REVISION,
    action: "browse",
  });
  assert.equal(body.includes("farm_human_key"), false);
  assert.equal(body.includes("farm_doorplate"), false);
  assert.equal(body.includes("idempotency_key"), false);
});

test("farm market browser client maps strict listing fields and verifies action receipt", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(LIST_RESULT);
  };

  const result = await executeBoundMarketAction({
    ...input(),
    action: "list",
    kind: "material",
    itemId: "ordinary_stone",
    quantity: 1,
    fetcher,
  });
  assert.deepEqual(result, { ok: true, data: LIST_RESULT });
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_revision: BEFORE_REVISION,
    action: "list",
    kind: "material",
    item_id: "ordinary_stone",
    qty: 1,
  });

  const wrongDoorplate = await executeBoundMarketAction({
    ...input(),
    expectedFarmDoorplate: "ABC234",
    fetcher: async () => jsonResponse(BROWSE_RESULT),
  });
  assert.deepEqual(wrongDoorplate, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
});

test("farm market browser client rejects malformed, stale, mismatched and unsupported success", async () => {
  const malformed = await executeBoundMarketAction({
    ...input(),
    fetcher: async () => jsonResponse({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const stale = await executeBoundMarketAction({
    ...input(),
    action: "list",
    kind: "material",
    itemId: "ordinary_stone",
    quantity: 1,
    fetcher: async () => jsonResponse({ ...LIST_RESULT, revision: BEFORE_REVISION }),
  });
  assert.deepEqual(stale, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const wrongReceipt = await executeBoundMarketAction({
    ...input(),
    fetcher: async () =>
      jsonResponse({
        ...BROWSE_RESULT,
        data: {
          ...BROWSE_RESULT.data,
          result: {
            ...BROWSE_RESULT.data.result,
            receipt_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
          },
        },
      }),
  });
  assert.deepEqual(wrongReceipt, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const wrongAction = await executeBoundMarketAction({
    ...input(),
    fetcher: async () =>
      jsonResponse({
        ...BROWSE_RESULT,
        data: {
          ...BROWSE_RESULT.data,
          result: {
            receipt_id: KEY,
            action: "list",
            outcome: {
              kind: "material",
              item_id: "ordinary_stone",
              quantity: 1,
              price: 10,
              name: "普通石头",
            },
          },
        },
      }),
  });
  assert.deepEqual(wrongAction, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const unsupportedSuccess = await executeBoundMarketAction({
    ...input(),
    action: "buy",
    sellerDoorplate: "ABC234",
    kind: "material",
    itemId: "ordinary_stone",
    quantity: 1,
    fetcher: async () => jsonResponse(BROWSE_RESULT),
  });
  assert.deepEqual(unsupportedSuccess, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
});

test("farm market browser network failures remain unknown and can retry with the same key", async () => {
  let attempts = 0;
  const requestKeys: string[] = [];
  const fetcher: FrontendFetcher = async (_url, init) => {
    attempts += 1;
    requestKeys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
    if (attempts === 1) throw new Error("offline after request");
    return jsonResponse(BROWSE_RESULT);
  };

  const first = await executeBoundMarketAction({ ...input(), fetcher });
  assert.deepEqual(first, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });
  const second = await executeBoundMarketAction({ ...input(), fetcher });
  assert.deepEqual(second, { ok: true, data: BROWSE_RESULT });
  assert.deepEqual(requestKeys, [KEY, KEY]);
});

test("farm market browser client accepts and verifies cross-farm buy and barter receipts", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(CROSS_BUY_RESULT);
  };

  const buy = await executeBoundMarketAction({
    ...input(),
    action: "buy",
    sellerDoorplate: "ABC234",
    kind: "material",
    itemId: "ordinary_stone",
    quantity: 1,
    fetcher,
  });
  assert.deepEqual(buy, { ok: true, data: CROSS_BUY_RESULT });
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expected_revision: BEFORE_REVISION,
    action: "buy",
    seller_doorplate: "ABC234",
    kind: "material",
    item_id: "ordinary_stone",
    qty: 1,
  });

  const barter = await executeBoundMarketAction({
    ...input(),
    action: "barter-accept",
    sellerDoorplate: "ABC234",
    listingId: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
    fetcher: async () => jsonResponse(CROSS_BARTER_ACCEPT_RESULT),
  });
  assert.deepEqual(barter, { ok: true, data: CROSS_BARTER_ACCEPT_RESULT });
});

test("farm market browser client exposes structured cross-farm and state errors", async () => {
  const crossFarm = await executeBoundMarketAction({
    ...input(),
    action: "buy",
    sellerDoorplate: "ABC234",
    kind: "material",
    itemId: "ordinary_stone",
    quantity: 1,
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "cross_farm_atomicity_unavailable",
            message: "跨农场结算暂不可用",
            current_revision: AFTER_REVISION,
          },
        },
        503,
      ),
  });
  assert.deepEqual(crossFarm, {
    ok: false,
    issue: {
      code: "cross_farm_atomicity_unavailable",
      currentRevision: AFTER_REVISION,
      serverMessage: "跨农场结算暂不可用",
    },
  });

  const conflict = await executeBoundMarketAction({
    ...input(),
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "state_conflict",
            message: "集市状态已变化",
            current_revision: AFTER_REVISION,
          },
        },
        409,
      ),
  });
  assert.deepEqual(conflict, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentRevision: AFTER_REVISION,
      serverMessage: "集市状态已变化",
    },
  });
  assert.equal(
    marketActionIssueMessage({
      code: "unexpected_response",
      currentRevision: null,
      serverMessage: null,
    }),
    "集市动作返回了无法识别的数据，请稍后再试。",
  );
});

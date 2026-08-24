/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundFarmSettingsAction,
  farmSettingsActionIssueMessage,
} from "./farm-settings-action-client";

const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const RESULT = {
  data: {
    result: { receipt_id: KEY, field: "farm_name" },
    resource: {
      farm: { farm_doorplate: "ABC234", farm_name: "新农场" },
      shop: { status: "unavailable", reason: "not_initialized", message: "暂无" },
      backpack: { status: "unavailable", reason: "not_initialized", message: "暂无" },
      codex: { status: "unavailable", reason: "not_initialized", message: "暂无" },
      settings: {
        status: "available",
        farm_name: "新农场",
        ai_name: null,
        human_name: null,
        welcome_message: null,
        equipped_title: null,
        unlocked_titles: [],
        social: { visit: null, steal: null, water: null, message: null },
      },
      expedition: { status: "unavailable", reason: "not_initialized", message: "暂无" },
      smelting: { status: "unavailable", reason: "not_initialized", message: "暂无" },
      bulletin: { status: "unavailable", reason: "not_initialized", message: "暂无" },
      neighborhood: { status: "unavailable", reason: "not_initialized", message: "暂无" },
      market: { status: "unavailable", reason: "not_initialized", message: "暂无" },
    },
  },
  revision: "farm-catalog-v1:after",
  server_time: "2026-08-24T04:00:00.000Z",
} as const;

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("farm settings browser client uses same-origin route and sends no identity", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return response(RESULT);
  };
  const result = await executeBoundFarmSettingsAction({
    fetcher,
    idempotencyKey: KEY,
    expectedCatalogRevision: "farm-catalog-v1:before",
    field: "farm_name",
    value: "新农场",
  });
  assert.deepEqual(result, { ok: true, data: RESULT });
  assert.equal(requests[0]?.url, "/api/farm/settings/actions");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("idempotency-key"), KEY);
  const body = String(requests[0]?.init?.body);
  assert.deepEqual(JSON.parse(body), {
    expected_catalog_revision: "farm-catalog-v1:before",
    field: "farm_name",
    value: "新农场",
  });
  assert.equal(body.includes("farm_human_key"), false);
  assert.equal(body.includes("farm_doorplate"), false);
});

test("farm settings browser client keeps malformed, network, and structured errors honest", async () => {
  const input = {
    idempotencyKey: KEY,
    expectedCatalogRevision: "farm-catalog-v1:before",
    field: "social.visit" as const,
    value: false,
  };
  const malformed = await executeBoundFarmSettingsAction({
    ...input,
    fetcher: async () => response({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentCatalogRevision: null, serverMessage: null },
  });
  const network = await executeBoundFarmSettingsAction({
    ...input,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentCatalogRevision: null, serverMessage: null },
  });
  const conflict = await executeBoundFarmSettingsAction({
    ...input,
    fetcher: async () =>
      response(
        { error: { code: "state_conflict", message: "changed", current_revision: "now" } },
        409,
      ),
  });
  assert.deepEqual(conflict, {
    ok: false,
    issue: { code: "state_conflict", currentCatalogRevision: "now", serverMessage: "changed" },
  });
  assert.equal(
    farmSettingsActionIssueMessage({
      code: "action_rejected",
      currentCatalogRevision: null,
      serverMessage: "不可用",
    }),
    "不可用",
  );
});

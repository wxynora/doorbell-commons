/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanFarmSettingsActionClient,
  FarmHumanFarmSettingsActionContractUnavailableError,
  FarmHumanFarmSettingsActionIdempotencyConflictError,
  FarmHumanFarmSettingsActionRejectedError,
  FarmHumanFarmSettingsActionStateConflictError,
  FarmHumanFarmSettingsActionUnavailableError,
} from "./farm-settings-action-client.js";

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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchImplementation: typeof fetch) {
  return new FarmHumanFarmSettingsActionClient({
    apiBaseUrl: "http://farm.test/",
    requestTimeoutMs: 1000,
    serviceToken: "service-token",
    fetchImplementation,
  });
}

test("farm settings client sends server-bound identity and exact single field", async () => {
  const requests: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return jsonResponse(RESULT);
  };
  const result = await client(fetcher).updateFarmSettings({
    farmDoorplate: "ABC234",
    farmHumanKey: "private-key",
    expectedCatalogRevision: "farm-catalog-v1:before",
    idempotencyKey: KEY,
    field: "farm_name",
    value: "新农场",
  });
  assert.deepEqual(result, RESULT);
  assert.equal(requests[0]?.url.pathname, "/internal/doorbell/human/settings/action");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer service-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    farm_human_key: "private-key",
    expected_farm_doorplate: "ABC234",
    idempotency_key: KEY,
    expected_catalog_revision: "farm-catalog-v1:before",
    field: "farm_name",
    value: "新农场",
  });
});

test("farm settings client maps structured failures and malformed success", async () => {
  await assert.rejects(
    client(async () => {
      throw new Error("offline");
    }).updateFarmSettings({
      farmDoorplate: "ABC234",
      farmHumanKey: "key",
      expectedCatalogRevision: "rev",
      idempotencyKey: KEY,
      field: "farm_name",
      value: "新农场",
    }),
    FarmHumanFarmSettingsActionUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse(
        { error: { code: "state_conflict", message: "changed", current_revision: "now" } },
        409,
      ),
    ).updateFarmSettings({
      farmDoorplate: "ABC234",
      farmHumanKey: "key",
      expectedCatalogRevision: "rev",
      idempotencyKey: KEY,
      field: "farm_name",
      value: "新农场",
    }),
    (error: unknown) =>
      error instanceof FarmHumanFarmSettingsActionStateConflictError &&
      error.currentRevision === "now",
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "action_rejected", message: "unsupported" } }, 409),
    ).updateFarmSettings({
      farmDoorplate: "ABC234",
      farmHumanKey: "key",
      expectedCatalogRevision: "rev",
      idempotencyKey: KEY,
      field: "farm_name",
      value: "新农场",
    }),
    FarmHumanFarmSettingsActionRejectedError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "idempotency_conflict", message: "conflict" } }, 409),
    ).updateFarmSettings({
      farmDoorplate: "ABC234",
      farmHumanKey: "key",
      expectedCatalogRevision: "rev",
      idempotencyKey: KEY,
      field: "farm_name",
      value: "新农场",
    }),
    FarmHumanFarmSettingsActionIdempotencyConflictError,
  );
  await assert.rejects(
    client(async () => jsonResponse({ ...RESULT, revision: 2 })).updateFarmSettings({
      farmDoorplate: "ABC234",
      farmHumanKey: "key",
      expectedCatalogRevision: "rev",
      idempotencyKey: KEY,
      field: "farm_name",
      value: "新农场",
    }),
    FarmHumanFarmSettingsActionContractUnavailableError,
  );
});

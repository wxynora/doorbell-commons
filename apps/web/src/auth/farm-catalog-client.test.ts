/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { boundFarmCatalogReadErrorSchema } from "@doorbell/protocol";
import type { FrontendFetcher } from "./auth-client";
import { farmCatalogIssueMessage, getBoundFarmCatalog } from "./farm-catalog-client";

const CATALOG_RESULT = {
  data: {
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
  revision: `farm-catalog-v1:${"a".repeat(64)}`,
  codex_revision: `farm-crop-codex-v1:${"f".repeat(64)}`,
  original_plant_revision: `farm-original-plant-v1:${"b".repeat(64)}`,
  expedition_revision: `farm-expedition-v1:${"c".repeat(64)}`,
  market_revision: `farm-market-v1:${"d".repeat(64)}`,
  neighborhood_revision: `farm-neighborhood-v1:${"e".repeat(64)}`,
  server_time: "2026-08-24T04:00:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("farm catalog reads use the fixed same-origin GET route", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(CATALOG_RESULT);
  };

  const result = await getBoundFarmCatalog({ fetcher });
  assert.deepEqual(requests, [
    {
      url: "/api/farm/catalog",
      init: { credentials: "same-origin", method: "GET" },
    },
  ]);
  assert.deepEqual(result, { ok: true, data: CATALOG_RESULT });
});

test("farm catalog client keeps network and malformed responses honest", async () => {
  const unavailable = await getBoundFarmCatalog({
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "network_unavailable", serverMessage: null },
  });

  const malformed = await getBoundFarmCatalog({
    fetcher: async () => jsonResponse({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });

  const extraKey = await getBoundFarmCatalog({
    fetcher: async () => jsonResponse({ ...CATALOG_RESULT, human_key: "must-not-exist" }),
  });
  assert.deepEqual(extraKey, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });

  const serviceError = await getBoundFarmCatalog({
    fetcher: async () =>
      jsonResponse({ error: { code: "farm_unavailable", message: "暂时不可用" } }, 503),
  });
  assert.deepEqual(serviceError, {
    ok: false,
    issue: { code: "farm_unavailable", serverMessage: "暂时不可用" },
  });
  assert.equal(
    farmCatalogIssueMessage({ code: "unexpected_response", serverMessage: null }),
    "农场目录返回了无法识别的数据，请稍后再试。",
  );
});

test("farm catalog browser errors use the community-facing error contract", async () => {
  const communityError = {
    error: { code: "qq_not_group_member", message: "当前账号已不在指定群中" },
  };
  assert.equal(boundFarmCatalogReadErrorSchema.safeParse(communityError).success, true);
  assert.equal(
    boundFarmCatalogReadErrorSchema.safeParse({
      error: { code: "farm_credential_not_found", message: "internal only" },
    }).success,
    false,
  );

  const result = await getBoundFarmCatalog({
    fetcher: async () => jsonResponse(communityError, 403),
  });
  assert.deepEqual(result, {
    ok: false,
    issue: {
      code: "qq_not_group_member",
      serverMessage: "当前账号已不在指定群中",
    },
  });
});

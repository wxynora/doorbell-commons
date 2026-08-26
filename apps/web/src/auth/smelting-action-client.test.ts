/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { executeBoundSmeltingAction } from "./smelting-action-client";

const FARM_DOORPLATE = "3ET3FE";
const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE = `farm-smelting-v1:${"a".repeat(64)}`;
const AFTER = `farm-smelting-v1:${"b".repeat(64)}`;
const MATERIAL_IDS = ["ordinary_stone", "dry_branch", "clay_lump"];

const RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      material_ids: MATERIAL_IDS,
      crop_id: "moon_wheat",
      crop_name: "月光麦",
      rarity: "SR",
      by_recipe: false,
    },
    resource: {
      farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "熔炼测试农场" },
      shop: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      backpack: { status: "available", items: [] },
      codex: { status: "available", entries: [] },
      settings: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      expedition: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      smelting: {
        status: "available",
        write_status: "available",
        revision: AFTER,
        materials: [],
        recipes: [],
      },
      bulletin: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      neighborhood: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
      market: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
    },
  },
  revision: `farm-catalog-v1:${"c".repeat(64)}`,
  smelting_revision: AFTER,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

test("smelting browser client sends only materials and the authority revision", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return Response.json(RESULT);
  };
  const result = await executeBoundSmeltingAction({
    expectedFarmDoorplate: FARM_DOORPLATE,
    idempotencyKey: KEY,
    materialIds: MATERIAL_IDS,
    expectedSmeltingRevision: BEFORE,
    fetcher,
  });

  assert.deepEqual(result, { ok: true, data: RESULT });
  assert.equal(requests[0]?.url, "/api/farm/smelting/actions");
  assert.equal(new Headers(requests[0]?.init?.headers).get("idempotency-key"), KEY);
  const body = String(requests[0]?.init?.body);
  assert.deepEqual(JSON.parse(body), {
    material_ids: MATERIAL_IDS,
    expected_smelting_revision: BEFORE,
  });
  assert.equal(body.includes("farm_human_key"), false);
  assert.equal(body.includes("idempotency_key"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { FarmHumanSmeltingActionClient } from "./farm-smelting-action-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-smelting-human-key";
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

test("farm smelting client forwards the existing Human craft request", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const client = new FarmHumanSmeltingActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation: async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body) });
      return Response.json(RESULT);
    },
  });

  assert.deepEqual(
    await client.executeSmeltingAction({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      materialIds: MATERIAL_IDS,
      expectedSmeltingRevision: BEFORE,
      idempotencyKey: KEY,
    }),
    RESULT,
  );
  assert.deepEqual(calls, [
    {
      url: "https://farm.example/farm/internal/doorbell/human/smelting/action",
      body: JSON.stringify({
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
        material_ids: MATERIAL_IDS,
        expected_smelting_revision: BEFORE,
        idempotency_key: KEY,
      }),
    },
  ]);
});

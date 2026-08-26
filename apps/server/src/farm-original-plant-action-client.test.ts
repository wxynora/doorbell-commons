/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanOriginalPlantActionClient,
  FarmHumanOriginalPlantActionContractUnavailableError,
  FarmHumanOriginalPlantActionCredentialInvalidError,
  FarmHumanOriginalPlantActionIdempotencyConflictError,
  FarmHumanOriginalPlantActionRejectedError,
  FarmHumanOriginalPlantActionStateConflictError,
  FarmHumanOriginalPlantActionUnavailableError,
} from "./farm-original-plant-action-client.js";

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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchImplementation: typeof fetch) {
  return new FarmHumanOriginalPlantActionClient({
    apiBaseUrl: "http://farm.test/",
    requestTimeoutMs: 1000,
    serviceToken: "service-token",
    fetchImplementation,
  });
}

function input(
  overrides: Partial<Parameters<FarmHumanOriginalPlantActionClient["designOriginalPlant"]>[0]> = {},
) {
  return {
    farmDoorplate: "ABC234",
    farmHumanKey: "private-key",
    expectedRevision: BEFORE,
    idempotencyKey: KEY,
    name: "月光番茄",
    latin: "Solanum luna",
    desc: "在月光里慢慢变甜的番茄。",
    plant: "把一颗月光埋进土里。",
    harvest: "月光从果实里流出来了。",
    ...overrides,
  };
}

test("original plant client sends internal identity and the farm action payload", async () => {
  const requests: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return jsonResponse(RESULT);
  };

  const result = await client(fetcher).designOriginalPlant(input());
  assert.deepEqual(result, RESULT);
  assert.equal(requests[0]?.url.pathname, "/internal/doorbell/human/original-plant/action");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer service-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    farm_human_key: "private-key",
    expected_farm_doorplate: "ABC234",
    idempotency_key: KEY,
    expected_revision: BEFORE,
    payload: {
      name: "月光番茄",
      latin: "Solanum luna",
      desc: "在月光里慢慢变甜的番茄。",
      plant: "把一颗月光埋进土里。",
      harvest: "月光从果实里流出来了。",
    },
  });
});

test("original plant client rejects malformed or mismatched receipts", async () => {
  await assert.rejects(
    client(async () => jsonResponse({ ...RESULT, revision: 2 })).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({
        ...RESULT,
        data: {
          ...RESULT.data,
          result: { ...RESULT.data.result, receipt_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d" },
        },
      }),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({
        ...RESULT,
        data: {
          ...RESULT.data,
          result: {
            ...RESULT.data.result,
            crop: { ...RESULT.data.result.crop, designerId: "BCDFGH" },
          },
        },
      }),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({
        ...RESULT,
        data: { ...RESULT.data, resource: { farm: { farm_doorplate: "ABC234" } } },
      }),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionContractUnavailableError,
  );
});

test("original plant client preserves network, 502/503, and structured error mapping", async () => {
  await assert.rejects(
    client(async () => {
      throw new Error("offline");
    }).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "upstream_contract_unavailable", message: "bad" } }, 502),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "farm_unavailable", message: "down" } }, 503),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse(
        { error: { code: "state_conflict", message: "changed", current_revision: AFTER } },
        409,
      ),
    ).designOriginalPlant(input()),
    (error: unknown) =>
      error instanceof FarmHumanOriginalPlantActionStateConflictError &&
      error.currentRevision === AFTER,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "idempotency_conflict", message: "conflict" } }, 409),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionIdempotencyConflictError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "action_rejected", message: "金币不足" } }, 409),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionRejectedError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "farm_doorplate_mismatch", message: "wrong farm" } }, 409),
    ).designOriginalPlant(input()),
    FarmHumanOriginalPlantActionCredentialInvalidError,
  );
});

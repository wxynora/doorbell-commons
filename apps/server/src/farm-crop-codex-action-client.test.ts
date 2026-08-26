import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanCropCodexActionClient,
  FarmHumanCropCodexActionContractUnavailableError,
  FarmHumanCropCodexActionStateConflictError,
  FarmHumanCropCodexActionUnavailableError,
} from "./farm-crop-codex-action-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-crop-codex-human-key";
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

const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
  cropId: "wheat",
  action: "star" as const,
  expectedCodexRevision: BEFORE,
  idempotencyKey: KEY,
};

function createClient(fetchImplementation: typeof fetch): FarmHumanCropCodexActionClient {
  return new FarmHumanCropCodexActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm crop codex client maps the strict internal action request", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(RESULT);
  });

  assert.deepEqual(await client.executeCropCodexAction(INPUT), RESULT);
  assert.deepEqual(calls, [
    {
      body: JSON.stringify({
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
        crop_id: "wheat",
        action: "star",
        expected_codex_revision: BEFORE,
        idempotency_key: KEY,
      }),
      headers: new Headers({
        authorization: "Bearer service-secret",
        "content-type": "application/json",
      }),
      method: "POST",
      url: "https://farm.example/farm/internal/doorbell/human/codex/action",
    },
  ]);
});

test("farm crop codex client rejects malformed and cross-house success payloads", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...RESULT,
        data: {
          ...RESULT.data,
          resource: {
            ...RESULT.data.resource,
            farm: { ...RESULT.data.resource.farm, farm_doorplate: "BCDFGH" },
          },
        },
      }),
    ).executeCropCodexAction(INPUT),
    FarmHumanCropCodexActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => Response.json({ ...RESULT, unexpected: true })).executeCropCodexAction(
      INPUT,
    ),
    FarmHumanCropCodexActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("bad gateway", { status: 502 })).executeCropCodexAction(
      INPUT,
    ),
    FarmHumanCropCodexActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("unavailable", { status: 503 })).executeCropCodexAction(
      INPUT,
    ),
    FarmHumanCropCodexActionUnavailableError,
  );
});

test("farm crop codex client maps a stale revision conflict", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json(
        {
          error: {
            code: "state_conflict",
            message: "The crop codex has changed",
            current_revision: AFTER,
          },
        },
        { status: 409 },
      ),
    ).executeCropCodexAction(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanCropCodexActionStateConflictError);
      assert.equal(error.currentCodexRevision, AFTER);
      return true;
    },
  );
});

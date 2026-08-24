import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanRanchClient,
  FarmHumanRanchContractUnavailableError,
  FarmHumanRanchCredentialInvalidError,
  FarmHumanRanchNotFoundError,
  FarmHumanRanchUnavailableError,
} from "./farm-ranch-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-ranch-human-key";
const INPUT = { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY };

const RANCH_RESULT = {
  data: {
    farm: { farm_doorplate: FARM_DOORPLATE },
    balance: {
      status: "available",
      ranch_coins: 321,
      debt_status: "available",
      debt_coins: 0,
    },
    residents: {
      status: "available",
      animals: [],
      pets: [],
      patrol_goose: null,
    },
    collectable: {
      status: "available",
      total_pending_count: 0,
      total_pending_meat_count: 0,
      entries: [],
    },
    wardrobe: { status: "available", items: [] },
    decorations: { status: "available", placed: [], stored: [] },
    dispatch: { status: "available", active: [] },
    shop: {
      animals: { status: "available", shop_day: null, items: [] },
      pets: { status: "available", shop_day: null, items: [] },
      accessories: { status: "unavailable", shop_day: null, items: [] },
      decorations: { status: "unavailable", shop_day: null, items: [] },
    },
  },
  revision: "ranch-v1:test",
  server_time: "2026-08-24T04:00:00.000Z",
};

function createClient(fetchImplementation: typeof fetch): FarmHumanRanchClient {
  return new FarmHumanRanchClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm Ranch client posts a fixed internal read contract with server-only binding", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(RANCH_RESULT);
  });

  assert.deepEqual(await client.readRanch(INPUT), RANCH_RESULT);
  assert.deepEqual(
    calls.map(({ body, headers, method, url }) => ({
      body,
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      method,
      url,
    })),
    [
      {
        body: JSON.stringify({
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/read",
      },
    ],
  );
});

test("farm Ranch client rejects malformed or mismatched structured reads", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...RANCH_RESULT, data: { ...RANCH_RESULT.data, extra: true } }),
    ).readRanch(INPUT),
    FarmHumanRanchContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...RANCH_RESULT,
        data: { ...RANCH_RESULT.data, farm: { farm_doorplate: "DEF567" } },
      }),
    ).readRanch(INPUT),
    FarmHumanRanchContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("<html>bad gateway</html>", { status: 502 })).readRanch(
      INPUT,
    ),
    FarmHumanRanchContractUnavailableError,
  );
});

test("farm Ranch client keeps transport and upstream error classes distinct", async () => {
  const errorResponse = (code: string, status: number) =>
    Response.json({ error: { code, message: "upstream error" } }, { status });

  for (const code of ["farm_credential_not_found", "farm_doorplate_mismatch"]) {
    await assert.rejects(
      createClient(async () => errorResponse(code, 409)).readRanch(INPUT),
      FarmHumanRanchCredentialInvalidError,
    );
  }
  await assert.rejects(
    createClient(async () => errorResponse("farm_not_found", 404)).readRanch(INPUT),
    FarmHumanRanchNotFoundError,
  );
  await assert.rejects(
    createClient(async () => errorResponse("farm_unavailable", 503)).readRanch(INPUT),
    FarmHumanRanchUnavailableError,
  );
  await assert.rejects(
    createClient(async () => {
      throw new Error("offline");
    }).readRanch(INPUT),
    FarmHumanRanchUnavailableError,
  );
});

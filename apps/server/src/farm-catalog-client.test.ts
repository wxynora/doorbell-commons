import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanCatalogClient,
  FarmHumanCatalogContractUnavailableError,
  FarmHumanCatalogCredentialInvalidError,
  FarmHumanCatalogNotFoundError,
  FarmHumanCatalogUnavailableError,
} from "./farm-catalog-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-farm-human-key";

const CATALOG_RESULT = {
  data: {
    farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "渡的小农场" },
    shop: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
    backpack: { status: "available", items: [] },
    codex: { status: "available", entries: [] },
    settings: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
    expedition: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
    smelting: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
    bulletin: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
    neighborhood: {
      status: "available",
      rankings: {},
      messages: [],
      message_boards: [
        {
          farm_doorplate: FARM_DOORPLATE,
          farm_name: "渡的小农场",
          is_own: true,
          status: "open",
          messages: [],
        },
      ],
      original_crops: [],
    },
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

const INPUT = { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY };

function serviceError(code: string, status = 409): Response {
  return Response.json({ error: { code, message: "upstream error" } }, { status });
}

test("farm catalog client posts the strict binding request to the fixed endpoint", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = new FarmHumanCatalogClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation: async (input, init) => {
      calls.push({
        body: String(init?.body),
        headers: new Headers(init?.headers),
        method: init?.method,
        url: String(input),
      });
      return Response.json(CATALOG_RESULT);
    },
  });

  assert.deepEqual(await client.readCatalog(INPUT), CATALOG_RESULT);
  assert.deepEqual(
    calls.map(({ body, headers, method, url }) => ({
      body,
      headers,
      method,
      url,
    })),
    [
      {
        body: JSON.stringify({
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
        }),
        headers: calls[0]?.headers,
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/catalog/read",
      },
    ],
  );
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer service-secret");
  assert.equal(calls[0]?.headers.get("content-type"), "application/json");
  assert.equal(JSON.stringify(CATALOG_RESULT).includes(FARM_HUMAN_KEY), false);
});

test("farm catalog client rejects malformed, extra-key, and mismatched success payloads", async () => {
  const readInvalid = async (payload: unknown) =>
    await new FarmHumanCatalogClient({
      apiBaseUrl: "https://farm.example/",
      requestTimeoutMs: 1_000,
      serviceToken: "service-secret",
      fetchImplementation: async () => Response.json(payload),
    }).readCatalog(INPUT);

  await assert.rejects(
    readInvalid({ ...CATALOG_RESULT, unexpected: true }),
    FarmHumanCatalogContractUnavailableError,
  );
  await assert.rejects(
    readInvalid({
      ...CATALOG_RESULT,
      data: {
        ...CATALOG_RESULT.data,
        farm: { ...CATALOG_RESULT.data.farm, farm_doorplate: "ABC234" },
      },
    }),
    FarmHumanCatalogContractUnavailableError,
  );
  await assert.rejects(readInvalid({ data: {} }), FarmHumanCatalogContractUnavailableError);
  await assert.rejects(
    new FarmHumanCatalogClient({
      apiBaseUrl: "https://farm.example/",
      requestTimeoutMs: 1_000,
      serviceToken: "service-secret",
      fetchImplementation: async () => new Response("not json", { status: 200 }),
    }).readCatalog(INPUT),
    FarmHumanCatalogContractUnavailableError,
  );
});

test("farm catalog client maps credential, missing farm, contract, and availability failures", async () => {
  const createClient = (response: () => Promise<Response>) =>
    new FarmHumanCatalogClient({
      apiBaseUrl: "https://farm.example/",
      requestTimeoutMs: 1_000,
      serviceToken: "service-secret",
      fetchImplementation: response,
    });

  for (const code of ["farm_credential_not_found", "farm_doorplate_mismatch"]) {
    await assert.rejects(
      createClient(async () => serviceError(code)).readCatalog(INPUT),
      FarmHumanCatalogCredentialInvalidError,
    );
  }
  await assert.rejects(
    createClient(async () => serviceError("farm_not_found", 404)).readCatalog(INPUT),
    FarmHumanCatalogNotFoundError,
  );
  await assert.rejects(
    createClient(async () => serviceError("invalid_request", 400)).readCatalog(INPUT),
    FarmHumanCatalogContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("not json", { status: 502 })).readCatalog(INPUT),
    FarmHumanCatalogContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("not json", { status: 503 })).readCatalog(INPUT),
    FarmHumanCatalogUnavailableError,
  );
  await assert.rejects(
    createClient(async () => {
      throw new Error("offline");
    }).readCatalog(INPUT),
    FarmHumanCatalogUnavailableError,
  );
});

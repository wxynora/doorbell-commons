import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanRanchCollectionClient,
  FarmHumanRanchCollectionContractUnavailableError,
  FarmHumanRanchCollectionCredentialInvalidError,
  FarmHumanRanchCollectionIdempotencyConflictError,
  FarmHumanRanchCollectionNoCollectableError,
  FarmHumanRanchCollectionNotFoundError,
  FarmHumanRanchCollectionRejectedError,
  FarmHumanRanchCollectionStateConflictError,
  FarmHumanRanchCollectionUnavailableError,
} from "./farm-ranch-collection-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-ranch-collection-human-key";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";

const RANCH_RESOURCE = {
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
} as const;

const COLLECTION_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      items: [
        {
          instance_id: "instance-egg-1",
          item_id: "chicken_egg",
          name: "鸡蛋",
          quantity: 1,
          unit_value: 25,
          destination: "kitchen",
        },
      ],
      gross_value: 25,
      ranch_coins_gained: 0,
      debt_paid: 0,
      stored_count: 1,
      non_cookable_count: 0,
      non_cookable_gain: 0,
      potion_count: 0,
      detail: { 鸡蛋: 1 },
      non_cookable_detail: {},
    },
    resource: RANCH_RESOURCE,
  },
  revision: "ranch-v1:after",
  server_time: "2026-08-24T04:00:00.000Z",
} as const;

const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
  expectedRevision: "ranch-v1:before",
  idempotencyKey: IDEMPOTENCY_KEY,
};

function createClient(fetchImplementation: typeof fetch): FarmHumanRanchCollectionClient {
  return new FarmHumanRanchCollectionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm ranch collection client posts only binding, revision, and UUID idempotency", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(COLLECTION_RESULT);
  });

  assert.deepEqual(await client.collectRanch(INPUT), COLLECTION_RESULT);
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
          idempotency_key: IDEMPOTENCY_KEY,
          expected_revision: "ranch-v1:before",
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/collect",
      },
    ],
  );
  assert.equal(calls[0]?.body.includes("items"), false);
  assert.equal(calls[0]?.body.includes("destination"), false);
  assert.equal(calls[0]?.body.includes("coins"), false);
});

test("farm ranch collection client rejects malformed receipts and maps service errors", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...COLLECTION_RESULT, unexpected: true }),
    ).collectRanch(INPUT),
    FarmHumanRanchCollectionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...COLLECTION_RESULT,
        data: {
          ...COLLECTION_RESULT.data,
          result: { ...COLLECTION_RESULT.data.result, receipt_id: "other" },
        },
      }),
    ).collectRanch(INPUT),
    FarmHumanRanchCollectionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("bad gateway", { status: 502 })).collectRanch(INPUT),
    FarmHumanRanchCollectionContractUnavailableError,
  );

  const createClientFor = (payload: unknown, status = 409) =>
    createClient(async () => Response.json(payload, { status }));
  await assert.rejects(
    createClientFor({
      error: { code: "state_conflict", message: "changed", current_revision: "ranch-v1:current" },
    }).collectRanch(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchCollectionStateConflictError);
      assert.equal(error.currentRevision, "ranch-v1:current");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({ error: { code: "no_collectable", message: "empty" } }).collectRanch(INPUT),
    FarmHumanRanchCollectionNoCollectableError,
  );
  await assert.rejects(
    createClientFor({ error: { code: "collection_rejected", message: "拒绝" } }).collectRanch(
      INPUT,
    ),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchCollectionRejectedError);
      assert.equal(error.message, "拒绝");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({ error: { code: "idempotency_conflict", message: "duplicate" } }).collectRanch(
      INPUT,
    ),
    FarmHumanRanchCollectionIdempotencyConflictError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_credential_not_found", message: "bad" } },
      404,
    ).collectRanch(INPUT),
    FarmHumanRanchCollectionCredentialInvalidError,
  );
  await assert.rejects(
    createClientFor({ error: { code: "farm_not_found", message: "missing" } }, 404).collectRanch(
      INPUT,
    ),
    FarmHumanRanchCollectionNotFoundError,
  );
  await assert.rejects(
    createClientFor({ error: { code: "farm_unavailable", message: "offline" } }, 503).collectRanch(
      INPUT,
    ),
    FarmHumanRanchCollectionUnavailableError,
  );
});

test("farm ranch collection client validates request identity before sending", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(COLLECTION_RESULT);
  });

  await assert.rejects(client.collectRanch({ ...INPUT, farmDoorplate: "invalid" }));
  await assert.rejects(client.collectRanch({ ...INPUT, idempotencyKey: "not-a-uuid" }));
  await assert.rejects(client.collectRanch({ ...INPUT, expectedRevision: "" }));
  assert.equal(calls, 0);
});

test("farm ranch collection receipts do not impose an invented item-count limit", async () => {
  const items = Array.from({ length: 257 }, (_, index) => ({
    instance_id: `instance-${index}`,
    item_id: "chicken_egg",
    name: "鸡蛋",
    quantity: 1,
    unit_value: 1,
    destination: "kitchen" as const,
  }));
  const result = await createClient(async () =>
    Response.json({
      ...COLLECTION_RESULT,
      data: {
        ...COLLECTION_RESULT.data,
        result: {
          ...COLLECTION_RESULT.data.result,
          items,
          gross_value: items.length,
          stored_count: items.length,
          detail: { 鸡蛋: items.length },
        },
      },
    }),
  ).collectRanch(INPUT);

  assert.equal(result.data.result.items.length, items.length);
});

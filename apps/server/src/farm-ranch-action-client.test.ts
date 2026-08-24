import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanRanchResidentActionClient,
  FarmHumanRanchResidentActionContractUnavailableError,
  FarmHumanRanchResidentActionCredentialInvalidError,
  FarmHumanRanchResidentActionIdempotencyConflictError,
  FarmHumanRanchResidentActionNotFoundError,
  FarmHumanRanchResidentActionRejectedError,
  FarmHumanRanchResidentActionStateConflictError,
  FarmHumanRanchResidentActionUnavailableError,
} from "./farm-ranch-action-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-ranch-action-human-key";
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

const ACTION_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      action: "feed",
      resident_type: "animal",
      kind_id: "chicken",
      outcome: {
        kind: "feed",
        cost_silver: 2,
        bonus_rate: 0.1,
        remaining_today: 2,
        silver_balance: 998,
      },
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
  action: "feed" as const,
  residentType: "animal" as const,
  kindId: "chicken",
  payload: {},
};

function createClient(fetchImplementation: typeof fetch): FarmHumanRanchResidentActionClient {
  return new FarmHumanRanchResidentActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm Ranch action client posts one strict resident action with server-only binding", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(ACTION_RESULT);
  });

  assert.deepEqual(await client.executeRanchResidentAction(INPUT), ACTION_RESULT);
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
          action: "feed",
          resident_type: "animal",
          kind_id: "chicken",
          payload: {},
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/resident-action",
      },
    ],
  );
  assert.equal(calls[0]?.body.includes("humanKey"), false);
  assert.equal(calls[0]?.body.includes("farmId"), false);
});

test("farm Ranch action client rejects malformed receipts and mismatched targets", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...ACTION_RESULT, unexpected: true }),
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...ACTION_RESULT,
        data: {
          ...ACTION_RESULT.data,
          result: { ...ACTION_RESULT.data.result, kind_id: "duck" },
        },
      }),
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...ACTION_RESULT,
        data: {
          ...ACTION_RESULT.data,
          result: (() => {
            const { outcome: _outcome, ...result } = ACTION_RESULT.data.result;
            return result;
          })(),
        },
      }),
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...ACTION_RESULT,
        data: {
          ...ACTION_RESULT.data,
          result: {
            ...ACTION_RESULT.data.result,
            outcome: { kind: "upgrade", level: 2, cost_ranch_coins: 90, ranch_coin_balance: 910 },
          },
        },
      }),
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(
      async () => new Response("bad gateway", { status: 502 }),
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionContractUnavailableError,
  );
});

test("farm Ranch action client maps concurrency, business, credential, and service errors", async () => {
  const createClientFor = (payload: unknown, status = 409) =>
    createClient(async () =>
      payload instanceof Response ? payload : Response.json(payload, { status }),
    );

  await assert.rejects(
    createClientFor({
      error: {
        code: "state_conflict",
        message: "changed",
        current_revision: "ranch-v1:current",
      },
    }).executeRanchResidentAction(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchResidentActionStateConflictError);
      assert.equal(error.currentRevision, "ranch-v1:current");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "action_rejected", message: "银币不足" },
    }).executeRanchResidentAction(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchResidentActionRejectedError);
      assert.equal(error.message, "银币不足");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "idempotency_conflict", message: "duplicate" },
    }).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionIdempotencyConflictError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_credential_not_found", message: "bad" } },
      404,
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionCredentialInvalidError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_not_found", message: "missing" } },
      404,
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionNotFoundError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_unavailable", message: "offline" } },
      503,
    ).executeRanchResidentAction(INPUT),
    FarmHumanRanchResidentActionUnavailableError,
  );
  await assert.rejects(
    createClientFor(new Response("bad contract", { status: 502 })).executeRanchResidentAction(
      INPUT,
    ),
    FarmHumanRanchResidentActionContractUnavailableError,
  );
});

test("farm Ranch action client validates stable target and action payload before sending", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(ACTION_RESULT);
  });

  await assert.rejects(client.executeRanchResidentAction({ ...INPUT, farmDoorplate: "invalid" }));
  await assert.rejects(
    client.executeRanchResidentAction({ ...INPUT, idempotencyKey: "not-a-uuid" }),
  );
  await assert.rejects(
    client.executeRanchResidentAction({
      ...INPUT,
      residentType: "pet",
      kindId: "cat",
      payload: {},
    }),
  );
  await assert.rejects(
    client.executeRanchResidentAction({
      ...INPUT,
      action: "rename",
      payload: {},
    }),
  );
  await assert.rejects(
    client.executeRanchResidentAction({
      ...INPUT,
      action: "rename",
      payload: { name: "一二三四五六七八九十一二三" },
    }),
  );
  assert.equal(calls, 0);
});

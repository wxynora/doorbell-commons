import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanRanchDecorationActionClient,
  FarmHumanRanchDecorationActionContractUnavailableError,
  FarmHumanRanchDecorationActionCredentialInvalidError,
  FarmHumanRanchDecorationActionIdempotencyConflictError,
  FarmHumanRanchDecorationActionNotFoundError,
  FarmHumanRanchDecorationActionRejectedError,
  FarmHumanRanchDecorationActionStateConflictError,
  FarmHumanRanchDecorationActionUnavailableError,
} from "./farm-ranch-decoration-action-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-ranch-decoration-human-key";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
  expectedRevision: "ranch-v1:before",
  idempotencyKey: IDEMPOTENCY_KEY,
  action: "place" as const,
  decorationId: "lantern_warm",
};

const RANCH_RESOURCE = {
  farm: { farm_doorplate: FARM_DOORPLATE },
  balance: {
    status: "available",
    ranch_coins: 321,
    debt_status: "available",
    debt_coins: 0,
  },
  residents: { status: "available", animals: [], pets: [], patrol_goose: null },
  collectable: {
    status: "available",
    total_pending_count: 0,
    total_pending_meat_count: 0,
    entries: [],
  },
  wardrobe: { status: "available", items: [] },
  decorations: {
    status: "available",
    placed: [{ status: "known", decoration_id: "lantern_warm", name: "暖灯" }],
    stored: [],
  },
  dispatch: { status: "available", active: [] },
  shop: {
    animals: { status: "available", shop_day: null, items: [] },
    pets: { status: "available", shop_day: null, items: [] },
    skins: { status: "available", shop_day: null, items: [] },
    accessories: { status: "unavailable", shop_day: null, items: [] },
    decorations: { status: "unavailable", shop_day: null, items: [] },
  },
} as const;

const ACTION_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      action: "place",
      decoration_id: "lantern_warm",
      outcome: {
        kind: "place",
        decoration_id: "lantern_warm",
        decoration_name: "暖灯",
      },
    },
    resource: RANCH_RESOURCE,
  },
  revision: "ranch-v1:after",
  server_time: "2026-08-24T04:00:00.000Z",
} as const;

function createClient(fetchImplementation: typeof fetch): FarmHumanRanchDecorationActionClient {
  return new FarmHumanRanchDecorationActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm ranch decoration action client maps the strict internal request", async () => {
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

  assert.deepEqual(await client.executeRanchDecorationAction(INPUT), ACTION_RESULT);
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
          action: "place",
          decoration_id: "lantern_warm",
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/decoration-action",
      },
    ],
  );
  assert.equal(calls[0]?.body.includes("price"), false);
  assert.equal(calls[0]?.body.includes("balance"), false);
  assert.equal(calls[0]?.body.includes("coordinates"), false);
});

test("farm ranch decoration action client verifies receipt, action/id, outcome, and doorplate", async () => {
  const malformedResponses = [
    { ...ACTION_RESULT, unexpected: true },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: { ...ACTION_RESULT.data.result, receipt_id: "other" },
      },
    },
    {
      ...ACTION_RESULT,
      data: { ...ACTION_RESULT.data, result: { ...ACTION_RESULT.data.result, action: "unplace" } },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: { ...ACTION_RESULT.data.result, decoration_id: "other_decoration" },
      },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: {
          ...ACTION_RESULT.data.result,
          outcome: { ...ACTION_RESULT.data.result.outcome, kind: "unplace" },
        },
      },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        result: {
          ...ACTION_RESULT.data.result,
          outcome: { ...ACTION_RESULT.data.result.outcome, decoration_id: "other_decoration" },
        },
      },
    },
    {
      ...ACTION_RESULT,
      data: {
        ...ACTION_RESULT.data,
        resource: { ...ACTION_RESULT.data.resource, farm: { farm_doorplate: "4N4N4N" } },
      },
    },
  ];

  for (const payload of malformedResponses) {
    await assert.rejects(
      createClient(async () => Response.json(payload)).executeRanchDecorationAction(INPUT),
      FarmHumanRanchDecorationActionContractUnavailableError,
    );
  }

  await assert.rejects(
    createClient(
      async () => new Response("bad gateway", { status: 502 }),
    ).executeRanchDecorationAction(INPUT),
    FarmHumanRanchDecorationActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("offline", { status: 503 })).executeRanchDecorationAction(
      INPUT,
    ),
    FarmHumanRanchDecorationActionUnavailableError,
  );
  await assert.rejects(
    createClient(async () => {
      throw new Error("offline");
    }).executeRanchDecorationAction(INPUT),
    FarmHumanRanchDecorationActionUnavailableError,
  );
});

test("farm ranch decoration action client maps credential, state, rejection, and replay errors", async () => {
  const createClientFor = (payload: unknown, status = 409) =>
    createClient(async () => Response.json(payload, { status }));

  await assert.rejects(
    createClientFor({
      error: { code: "state_conflict", message: "changed", current_revision: "ranch-v1:current" },
    }).executeRanchDecorationAction(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchDecorationActionStateConflictError);
      assert.equal(error.currentRevision, "ranch-v1:current");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "action_rejected", message: "not stored" },
    }).executeRanchDecorationAction(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchDecorationActionRejectedError);
      assert.equal(error.message, "not stored");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "idempotency_conflict", message: "duplicate" },
    }).executeRanchDecorationAction(INPUT),
    FarmHumanRanchDecorationActionIdempotencyConflictError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_credential_not_found", message: "bad" } },
      404,
    ).executeRanchDecorationAction(INPUT),
    FarmHumanRanchDecorationActionCredentialInvalidError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_not_found", message: "missing" } },
      404,
    ).executeRanchDecorationAction(INPUT),
    FarmHumanRanchDecorationActionNotFoundError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_unavailable", message: "offline" } },
      503,
    ).executeRanchDecorationAction(INPUT),
    FarmHumanRanchDecorationActionUnavailableError,
  );
});

test("farm ranch decoration action client validates binding and action before sending", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(ACTION_RESULT);
  });

  await assert.rejects(client.executeRanchDecorationAction({ ...INPUT, farmDoorplate: "invalid" }));
  await assert.rejects(
    client.executeRanchDecorationAction({ ...INPUT, idempotencyKey: "not-a-uuid" }),
  );
  await assert.rejects(client.executeRanchDecorationAction({ ...INPUT, expectedRevision: "" }));
  await assert.rejects(
    client.executeRanchDecorationAction({ ...INPUT, decorationId: "not valid" }),
  );
  assert.equal(calls, 0);
});

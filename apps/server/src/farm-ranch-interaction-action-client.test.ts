import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanRanchInteractionActionClient,
  FarmHumanRanchInteractionActionContractUnavailableError,
  FarmHumanRanchInteractionActionCredentialInvalidError,
  FarmHumanRanchInteractionActionIdempotencyConflictError,
  FarmHumanRanchInteractionActionNotFoundError,
  FarmHumanRanchInteractionActionRejectedError,
  FarmHumanRanchInteractionActionStateConflictError,
  FarmHumanRanchInteractionActionUnavailableError,
} from "./farm-ranch-interaction-action-client.js";

const FARM_DOORPLATE = "3ET3FE";
const TARGET_DOORPLATE = "7HJK89";
const FARM_HUMAN_KEY = "private-ranch-interaction-human-key";
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

const INPUTS = {
  dispatch: {
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: "ranch-v1:before",
    idempotencyKey: IDEMPOTENCY_KEY,
    action: "dispatch" as const,
    targetFarmDoorplate: TARGET_DOORPLATE,
    animalKindId: "chicken",
    durationHours: 1,
  },
  catch: {
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: "ranch-v1:before",
    idempotencyKey: IDEMPOTENCY_KEY,
    action: "catch" as const,
    raidId: "raid-1",
  },
  remit: {
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: "ranch-v1:before",
    idempotencyKey: IDEMPOTENCY_KEY,
    action: "remit" as const,
    amount: 25,
  },
  send: {
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: "ranch-v1:before",
    idempotencyKey: IDEMPOTENCY_KEY,
    action: "send" as const,
    amount: 10,
  },
} as const;

function successFor(input: (typeof INPUTS)[keyof typeof INPUTS]) {
  const outcome =
    input.action === "dispatch"
      ? {
          kind: "dispatch" as const,
          raid_id: "raid-1",
          animal_kind_id: input.animalKindId,
          animal_name: "小鸡",
          target_farm_doorplate: input.targetFarmDoorplate,
          reserved_coins: 10,
          started_at: 1_724_460_000_000,
          ends_at: 1_724_463_600_000,
        }
      : input.action === "catch"
        ? {
            kind: "catch" as const,
            raid_id: input.raidId,
            owner: "渡",
            animal_name: "小鸡",
            compensation: 9,
          }
        : input.action === "remit"
          ? {
              kind: "remit" as const,
              amount: input.amount,
              ranch_coins_remaining: 296,
            }
          : {
              kind: "send" as const,
              amount: input.amount,
              farm_coins_remaining: 311,
              ranch_coins: 331,
            };
  return {
    data: {
      result: {
        receipt_id: input.idempotencyKey,
        action: input.action,
        outcome,
      },
      resource: RANCH_RESOURCE,
    },
    revision: "ranch-v1:after",
    server_time: "2026-08-24T04:00:00.000Z",
  } as const;
}

function createClient(fetchImplementation: typeof fetch): FarmHumanRanchInteractionActionClient {
  return new FarmHumanRanchInteractionActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm ranch interaction client posts all four strict identity-bound actions", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    const request = JSON.parse(String(init?.body));
    return Response.json(successFor(INPUTS[request.action as keyof typeof INPUTS]));
  });

  for (const input of Object.values(INPUTS)) {
    assert.deepEqual(await client.executeRanchInteractionAction(input), successFor(input));
  }

  assert.deepEqual(
    calls.map(({ body, headers, method, url }) => ({
      body: JSON.parse(body),
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      method,
      url,
    })),
    [
      {
        body: {
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
          idempotency_key: IDEMPOTENCY_KEY,
          expected_revision: "ranch-v1:before",
          action: "dispatch",
          target_farm_doorplate: TARGET_DOORPLATE,
          animal_kind_id: "chicken",
          duration_hours: 1,
        },
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/interaction/action",
      },
      {
        body: {
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
          idempotency_key: IDEMPOTENCY_KEY,
          expected_revision: "ranch-v1:before",
          action: "catch",
          raid_id: "raid-1",
        },
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/interaction/action",
      },
      {
        body: {
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
          idempotency_key: IDEMPOTENCY_KEY,
          expected_revision: "ranch-v1:before",
          action: "remit",
          amount: 25,
        },
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/interaction/action",
      },
      {
        body: {
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
          idempotency_key: IDEMPOTENCY_KEY,
          expected_revision: "ranch-v1:before",
          action: "send",
          amount: 10,
        },
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/ranch/interaction/action",
      },
    ],
  );
  assert.equal(
    calls.every(({ body }) => !body.includes("balance")),
    true,
  );
  assert.equal(
    calls.every(({ body }) => !body.includes("outcome")),
    true,
  );
});

test("farm ranch interaction client rejects malformed receipts and a wrong farm subject", async () => {
  const input = INPUTS.remit;
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...successFor(input), unexpected: true }),
    ).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...successFor(input),
        data: {
          ...successFor(input).data,
          resource: {
            ...RANCH_RESOURCE,
            farm: { farm_doorplate: TARGET_DOORPLATE },
          },
        },
      }),
    ).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...successFor(input),
        data: {
          ...successFor(input).data,
          result: { ...successFor(input).data.result, action: "send" },
        },
      }),
    ).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...successFor(input), revision: input.expectedRevision }),
    ).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionContractUnavailableError,
  );
});

test("farm ranch interaction client maps concurrency, business, credential, and service errors", async () => {
  const input = INPUTS.remit;
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
    }).executeRanchInteractionAction(input),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchInteractionActionStateConflictError);
      assert.equal(error.currentRevision, "ranch-v1:current");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "action_rejected", message: "金币不足" },
    }).executeRanchInteractionAction(input),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanRanchInteractionActionRejectedError);
      assert.equal(error.message, "金币不足");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({
      error: { code: "idempotency_conflict", message: "duplicate" },
    }).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionIdempotencyConflictError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_credential_invalid", message: "bad" } },
      403,
    ).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionCredentialInvalidError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_not_found", message: "missing" } },
      404,
    ).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionNotFoundError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "farm_unavailable", message: "offline" } },
      503,
    ).executeRanchInteractionAction(input),
    FarmHumanRanchInteractionActionUnavailableError,
  );
  await assert.rejects(
    createClientFor(new Response("bad contract", { status: 502 })).executeRanchInteractionAction(
      input,
    ),
    FarmHumanRanchInteractionActionContractUnavailableError,
  );
});

test("farm ranch interaction client validates action fields and UUID before sending", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(successFor(INPUTS.remit));
  });

  await assert.rejects(
    client.executeRanchInteractionAction({ ...INPUTS.remit, farmDoorplate: "invalid" }),
  );
  await assert.rejects(
    client.executeRanchInteractionAction({ ...INPUTS.remit, idempotencyKey: "not-a-uuid" }),
  );
  await assert.rejects(
    client.executeRanchInteractionAction({
      ...INPUTS.dispatch,
      targetFarmDoorplate: "invalid",
    }),
  );
  await assert.rejects(client.executeRanchInteractionAction({ ...INPUTS.catch, raidId: "" }));
  await assert.rejects(client.executeRanchInteractionAction({ ...INPUTS.send, amount: 0 }));
  assert.equal(calls, 0);
});

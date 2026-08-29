/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  executeBoundRanchInteractionAction,
  ranchInteractionActionIssueMessage,
} from "./ranch-interaction-action-client";

const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const RESOURCE = {
  farm: { farm_doorplate: "3ET3FE" },
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
  decorations: { status: "available", placed: [], stored: [] },
  dispatch: { status: "available", active: [] },
  shop: {
    animals: { status: "available", shop_day: null, items: [] },
    pets: { status: "available", shop_day: null, items: [] },
    skins: { status: "available", shop_day: null, items: [] },
    accessories: { status: "unavailable", shop_day: null, items: [] },
    decorations: { status: "unavailable", shop_day: null, items: [] },
  },
} as const;

const INPUTS = {
  dispatch: {
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedRevision: "ranch-v1:before",
    action: "dispatch" as const,
    targetFarmDoorplate: "7HJK89",
    animalKindId: "chicken",
    durationHours: 1,
  },
  catch: {
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedRevision: "ranch-v1:before",
    action: "catch" as const,
    raidId: "raid-1",
  },
  remit: {
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedRevision: "ranch-v1:before",
    action: "remit" as const,
    amount: 25,
  },
  send: {
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedRevision: "ranch-v1:before",
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
      resource: RESOURCE,
    },
    revision: "ranch-v1:after",
    server_time: "2026-08-24T04:00:00.000Z",
  } as const;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("ranch interaction browser actions use the fixed route, UUID header, and no identity/result/balance body", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    const request = JSON.parse(String(init?.body));
    return jsonResponse(successFor(INPUTS[request.action as keyof typeof INPUTS]));
  };

  for (const input of Object.values(INPUTS)) {
    assert.deepEqual(await executeBoundRanchInteractionAction({ ...input, fetcher }), {
      ok: true,
      data: successFor(input),
    });
  }

  assert.deepEqual(
    requests.map(({ url, init }) => ({
      url,
      credentials: init?.credentials,
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body)),
    })),
    [
      {
        url: "/api/farm/ranch/interaction/actions",
        credentials: "same-origin",
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": IDEMPOTENCY_KEY },
        body: {
          expected_revision: "ranch-v1:before",
          action: "dispatch",
          target_farm_doorplate: "7HJK89",
          animal_kind_id: "chicken",
          duration_hours: 1,
        },
      },
      {
        url: "/api/farm/ranch/interaction/actions",
        credentials: "same-origin",
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": IDEMPOTENCY_KEY },
        body: { expected_revision: "ranch-v1:before", action: "catch", raid_id: "raid-1" },
      },
      {
        url: "/api/farm/ranch/interaction/actions",
        credentials: "same-origin",
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": IDEMPOTENCY_KEY },
        body: { expected_revision: "ranch-v1:before", action: "remit", amount: 25 },
      },
      {
        url: "/api/farm/ranch/interaction/actions",
        credentials: "same-origin",
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": IDEMPOTENCY_KEY },
        body: { expected_revision: "ranch-v1:before", action: "send", amount: 10 },
      },
    ],
  );
  for (const request of requests) {
    const body = String(request.init?.body);
    assert.equal(body.includes("farm_human_key"), false);
    assert.equal(body.includes("expected_farm_doorplate"), false);
    assert.equal(body.includes("idempotency_key"), false);
    assert.equal(body.includes("balance"), false);
    assert.equal(body.includes("outcome"), false);
  }
});

test("ranch interaction browser actions keep malformed success and subject conflicts honest", async () => {
  const input = INPUTS.remit;
  const malformed = await executeBoundRanchInteractionAction({
    ...input,
    fetcher: async () => jsonResponse({ data: {} }),
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const wrongAction = await executeBoundRanchInteractionAction({
    ...input,
    fetcher: async () =>
      jsonResponse({
        ...successFor(input),
        data: {
          ...successFor(input).data,
          result: { ...successFor(input).data.result, action: "send" },
        },
      }),
  });
  assert.deepEqual(wrongAction, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const wrongSubject = await executeBoundRanchInteractionAction({
    ...input,
    fetcher: async () =>
      jsonResponse({
        ...successFor(input),
        data: {
          ...successFor(input).data,
          resource: { ...RESOURCE, farm: { farm_doorplate: null } },
        },
      }),
  });
  assert.deepEqual(wrongSubject, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });

  const staleRevision = await executeBoundRanchInteractionAction({
    ...input,
    fetcher: async () => jsonResponse({ ...successFor(input), revision: input.expectedRevision }),
  });
  assert.deepEqual(staleRevision, {
    ok: false,
    issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
  });
});

test("ranch interaction browser actions expose structured conflicts and network errors", async () => {
  const input = INPUTS.remit;
  const stateConflict = await executeBoundRanchInteractionAction({
    ...input,
    fetcher: async () =>
      jsonResponse(
        {
          error: {
            code: "state_conflict",
            message: "changed",
            current_revision: "ranch-v1:current",
          },
        },
        409,
      ),
  });
  assert.deepEqual(stateConflict, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentRevision: "ranch-v1:current",
      serverMessage: "changed",
    },
  });

  const rejected = await executeBoundRanchInteractionAction({
    ...input,
    fetcher: async () =>
      jsonResponse({ error: { code: "action_rejected", message: "金币不足" } }, 409),
  });
  assert.deepEqual(rejected, {
    ok: false,
    issue: { code: "action_rejected", currentRevision: null, serverMessage: "金币不足" },
  });

  const network = await executeBoundRanchInteractionAction({
    ...input,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, {
    ok: false,
    issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
  });
  assert.equal(
    ranchInteractionActionIssueMessage({
      code: "unexpected_response",
      currentRevision: null,
      serverMessage: null,
    }),
    "牧场往来动作返回了无法识别的数据，请稍后再试。",
  );
});

test("ranch interaction browser actions validate strict branches before network", async () => {
  let calls = 0;
  const fetcher: FrontendFetcher = async () => {
    calls += 1;
    return jsonResponse(successFor(INPUTS.remit));
  };

  await assert.rejects(
    executeBoundRanchInteractionAction({ ...INPUTS.remit, idempotencyKey: "not-a-uuid", fetcher }),
  );
  await assert.rejects(
    executeBoundRanchInteractionAction({
      ...INPUTS.dispatch,
      targetFarmDoorplate: "invalid",
      fetcher,
    }),
  );
  await assert.rejects(
    executeBoundRanchInteractionAction({ ...INPUTS.catch, raidId: "", fetcher }),
  );
  await assert.rejects(executeBoundRanchInteractionAction({ ...INPUTS.send, amount: 0, fetcher }));
  assert.equal(calls, 0);
});

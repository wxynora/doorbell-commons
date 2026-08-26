import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanExpeditionActionClient,
  FarmHumanExpeditionActionContractUnavailableError,
  FarmHumanExpeditionActionCredentialInvalidError,
  FarmHumanExpeditionActionIdempotencyConflictError,
  FarmHumanExpeditionActionNotFoundError,
  FarmHumanExpeditionActionRejectedError,
  FarmHumanExpeditionActionStateConflictError,
  FarmHumanExpeditionActionUnavailableError,
} from "./farm-expedition-action-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-farm-human-key";
const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE_REVISION = `farm-expedition-v1:${"a".repeat(64)}`;
const AFTER_REVISION = `farm-expedition-v1:${"b".repeat(64)}`;

const CATALOG_RESOURCE = {
  farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "渡的小农场" },
  shop: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  backpack: { status: "available", items: [] },
  codex: { status: "available", entries: [] },
  settings: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  expedition: {
    status: "available",
    daily_limit: 3,
    used_today: 1,
    remaining_today: 2,
    active: true,
    map_id: "mist-map",
    map_name: "雾岭",
    step: 1,
    hp: 3,
    pending: null,
    bag: [],
    seen_event_ids: [],
    log: [],
    journeys: [],
  },
  smelting: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  bulletin: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  neighborhood: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  market: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
} as const;

const RESULT = {
  data: {
    result: { receipt_id: KEY, action: "enter", outcome: { text: "你踏入雾岭。" } },
    resource: CATALOG_RESOURCE,
  },
  revision: AFTER_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function input() {
  return {
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: BEFORE_REVISION,
    idempotencyKey: KEY,
    action: "enter" as const,
    payload: { charges: 2 },
  };
}

function client(fetchImplementation: typeof fetch) {
  return new FarmHumanExpeditionActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm expedition action client posts the strict identity-bound request", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(url),
    });
    return jsonResponse(RESULT);
  };

  assert.deepEqual(await client(fetcher).executeExpeditionAction(input()), RESULT);
  assert.deepEqual(calls, [
    {
      body: JSON.stringify({
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
        idempotency_key: KEY,
        expected_revision: BEFORE_REVISION,
        action: "enter",
        payload: { charges: 2 },
      }),
      headers: calls[0]?.headers,
      method: "POST",
      url: "https://farm.example/farm/internal/doorbell/human/expedition/action",
    },
  ]);
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer service-secret");
  assert.equal(calls[0]?.headers.get("content-type"), "application/json");
});

test("farm expedition action client accepts every action payload shape and rejects mismatches", async () => {
  const actions = [
    ["enter", { charges: 1 }],
    ["explore", { charges: 2 }],
    ["roll", {}],
    ["choose", { option: "left" }],
    ["charm", { kind: "check", blessing: "月光" }],
    ["retreat", {}],
  ] as const;
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    const request = JSON.parse(String(init?.body)) as { action: string };
    return jsonResponse({
      ...RESULT,
      data: {
        ...RESULT.data,
        result: { ...RESULT.data.result, action: request.action },
      },
    });
  };

  for (const [action, payload] of actions) {
    await client(fetcher).executeExpeditionAction({ ...input(), action, payload });
  }
  assert.equal(calls, actions.length);
  await assert.rejects(
    client(async () => jsonResponse(RESULT)).executeExpeditionAction({
      ...input(),
      action: "roll",
      payload: { charges: 1 },
    }),
  );
  assert.equal(calls, actions.length);
});

test("farm expedition action client rejects malformed or mismatched success", async () => {
  const run = async (payload: unknown) =>
    await client(async () => jsonResponse(payload)).executeExpeditionAction(input());

  await assert.rejects(
    run({
      ...RESULT,
      data: { ...RESULT.data, result: { ...RESULT.data.result, receipt_id: "not-a-uuid" } },
    }),
    FarmHumanExpeditionActionContractUnavailableError,
  );
  await assert.rejects(
    run({ ...RESULT, revision: BEFORE_REVISION }),
    FarmHumanExpeditionActionContractUnavailableError,
  );
  await assert.rejects(
    run({
      ...RESULT,
      data: {
        ...RESULT.data,
        result: { ...RESULT.data.result, action: "explore" },
      },
    }),
    FarmHumanExpeditionActionContractUnavailableError,
  );
  await assert.rejects(
    run({
      ...RESULT,
      data: {
        ...RESULT.data,
        resource: {
          ...RESULT.data.resource,
          farm: { ...RESULT.data.resource.farm, farm_doorplate: "ABC234" },
        },
      },
    }),
    FarmHumanExpeditionActionContractUnavailableError,
  );
  await assert.rejects(run({ data: {} }), FarmHumanExpeditionActionContractUnavailableError);
  await assert.rejects(
    client(async () => new Response("not json")).executeExpeditionAction(input()),
    FarmHumanExpeditionActionContractUnavailableError,
  );
});

test("farm expedition action client keeps 502 contract and 503/network availability separate", async () => {
  await assert.rejects(
    client(async () => new Response("not json", { status: 502 })).executeExpeditionAction(input()),
    FarmHumanExpeditionActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () => new Response("not json", { status: 503 })).executeExpeditionAction(input()),
    FarmHumanExpeditionActionUnavailableError,
  );
  await assert.rejects(
    client(async () => {
      throw new Error("offline");
    }).executeExpeditionAction(input()),
    FarmHumanExpeditionActionUnavailableError,
  );
});

test("farm expedition action client maps structured failures", async () => {
  const run = async (code: string, status = 409, currentRevision?: string) =>
    await client(async () =>
      jsonResponse(
        {
          error: {
            code,
            message: "upstream error",
            ...(currentRevision ? { current_revision: currentRevision } : {}),
          },
        },
        status,
      ),
    ).executeExpeditionAction(input());

  for (const code of [
    "farm_credential_not_found",
    "farm_doorplate_mismatch",
    "farm_credential_invalid",
  ]) {
    await assert.rejects(run(code), FarmHumanExpeditionActionCredentialInvalidError);
  }
  await assert.rejects(run("farm_not_found", 404), FarmHumanExpeditionActionNotFoundError);
  await assert.rejects(
    run("state_conflict", 409, AFTER_REVISION),
    (error: unknown) =>
      error instanceof FarmHumanExpeditionActionStateConflictError &&
      error.currentRevision === AFTER_REVISION,
  );
  await assert.rejects(
    run("idempotency_conflict"),
    FarmHumanExpeditionActionIdempotencyConflictError,
  );
  await assert.rejects(run("action_rejected"), FarmHumanExpeditionActionRejectedError);
  await assert.rejects(run("farm_unavailable", 503), FarmHumanExpeditionActionUnavailableError);
  await assert.rejects(
    run("upstream_contract_unavailable", 502),
    FarmHumanExpeditionActionContractUnavailableError,
  );
  await assert.rejects(
    run("invalid_request", 400),
    FarmHumanExpeditionActionContractUnavailableError,
  );
});

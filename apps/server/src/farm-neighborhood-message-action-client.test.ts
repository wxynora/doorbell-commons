/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanNeighborhoodMessageActionClient,
  FarmHumanNeighborhoodMessageActionContractUnavailableError,
  FarmHumanNeighborhoodMessageActionCredentialInvalidError,
  FarmHumanNeighborhoodMessageActionIdempotencyConflictError,
  FarmHumanNeighborhoodMessageActionRejectedError,
  FarmHumanNeighborhoodMessageActionStateConflictError,
  FarmHumanNeighborhoodMessageActionUnavailableError,
} from "./farm-neighborhood-message-action-client.js";

const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE = `farm-neighborhood-v1:${"a".repeat(64)}`;
const AFTER = `farm-neighborhood-v1:${"b".repeat(64)}`;
const MESSAGE = {
  id: "abc123",
  author_farm_doorplate: "ABC234",
  author_name: "发送方",
  text: "你好，邻居！",
  at: "2026-08-25T04:00:00.000Z",
} as const;
const RESOURCE = {
  status: "available",
  rankings: {},
  messages: [MESSAGE],
  original_crops: [],
} as const;
const RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      target_farm_doorplate: "BCDFGH",
      message_id: MESSAGE.id,
      message: MESSAGE,
    },
    resource: RESOURCE,
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
  return new FarmHumanNeighborhoodMessageActionClient({
    apiBaseUrl: "http://farm.test/",
    requestTimeoutMs: 1000,
    serviceToken: "service-token",
    fetchImplementation,
  });
}

function input(
  overrides: Partial<
    Parameters<FarmHumanNeighborhoodMessageActionClient["sendNeighborhoodMessage"]>[0]
  > = {},
) {
  return {
    farmDoorplate: "ABC234",
    farmHumanKey: "private-key",
    targetFarmDoorplate: "BCDFGH",
    message: "  你好，邻居！  ",
    expectedRevision: BEFORE,
    idempotencyKey: KEY,
    ...overrides,
  };
}

test("neighborhood message client sends internal identity and exact target/message", async () => {
  const requests: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return jsonResponse(RESULT);
  };

  const result = await client(fetcher).sendNeighborhoodMessage(input());
  assert.deepEqual(result, RESULT);
  assert.equal(requests[0]?.url.pathname, "/internal/doorbell/human/neighborhood/message/action");
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer service-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    farm_human_key: "private-key",
    expected_farm_doorplate: "ABC234",
    target_farm_doorplate: "BCDFGH",
    message: "  你好，邻居！  ",
    expected_neighborhood_revision: BEFORE,
    idempotency_key: KEY,
  });
});

test("neighborhood message client rejects malformed or mismatched subject, target, and receipt", async () => {
  await assert.rejects(
    client(async () => jsonResponse({ ...RESULT, revision: 2 })).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionContractUnavailableError,
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
    ).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({
        ...RESULT,
        data: {
          ...RESULT.data,
          result: {
            ...RESULT.data.result,
            target_farm_doorplate: "DEF567",
          },
        },
      }),
    ).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({
        ...RESULT,
        data: {
          ...RESULT.data,
          result: {
            ...RESULT.data.result,
            message: { ...RESULT.data.result.message, author_farm_doorplate: "DEF567" },
          },
        },
      }),
    ).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionContractUnavailableError,
  );
});

test("neighborhood message client preserves network, 502/503, and structured error mapping", async () => {
  await assert.rejects(
    client(async () => {
      throw new Error("offline");
    }).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "upstream_contract_unavailable", message: "bad" } }, 502),
    ).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "farm_unavailable", message: "down" } }, 503),
    ).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionUnavailableError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse(
        { error: { code: "state_conflict", message: "changed", current_revision: AFTER } },
        409,
      ),
    ).sendNeighborhoodMessage(input()),
    (error: unknown) =>
      error instanceof FarmHumanNeighborhoodMessageActionStateConflictError &&
      error.currentRevision === AFTER,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "idempotency_conflict", message: "conflict" } }, 409),
    ).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionIdempotencyConflictError,
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "message_closed", message: "留言关闭" } }, 409),
    ).sendNeighborhoodMessage(input()),
    (error: unknown) =>
      error instanceof FarmHumanNeighborhoodMessageActionRejectedError &&
      error.code === "message_closed",
  );
  await assert.rejects(
    client(async () =>
      jsonResponse({ error: { code: "farm_doorplate_mismatch", message: "wrong farm" } }, 409),
    ).sendNeighborhoodMessage(input()),
    FarmHumanNeighborhoodMessageActionCredentialInvalidError,
  );
});

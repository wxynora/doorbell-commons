import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanMarketActionClient,
  FarmHumanMarketActionContractUnavailableError,
  FarmHumanMarketActionCredentialInvalidError,
  FarmHumanMarketActionCrossFarmAtomicityUnavailableError,
  FarmHumanMarketActionIdempotencyConflictError,
  FarmHumanMarketActionNotFoundError,
  FarmHumanMarketActionRejectedError,
  FarmHumanMarketActionStateConflictError,
  FarmHumanMarketActionUnavailableError,
} from "./farm-market-action-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-farm-human-key";
const KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const BEFORE_REVISION = `farm-market-v1:${"a".repeat(64)}`;
const AFTER_REVISION = `farm-market-v1:${"b".repeat(64)}`;
const SELLER_AFTER_REVISION = `farm-market-v1:${"c".repeat(64)}`;

const CATALOG_RESOURCE = {
  farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "渡的小农场" },
  shop: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  backpack: { status: "available", items: [] },
  codex: { status: "available", entries: [] },
  settings: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  expedition: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  smelting: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  bulletin: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  neighborhood: { status: "unavailable", reason: "no_authoritative_data", message: "暂不可用" },
  market: {
    status: "available",
    listings: [],
    barter_listings: [
      {
        seller_farm_doorplate: "ABC234",
        listing_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
        give: {
          kind: "material",
          item_id: "ordinary_stone",
          identity_state: "known",
          name: "普通石头",
          rarity: null,
          quantity: 1,
        },
        want: {
          kind: "material",
          item_id: "dry_branch",
          identity_state: "known",
          name: "枯树枝",
          rarity: null,
          quantity: 1,
        },
      },
    ],
  },
} as const;

const BROWSE_RESULT = {
  data: {
    result: { receipt_id: KEY, action: "browse", outcome: null },
    resource: CATALOG_RESOURCE,
  },
  revision: BEFORE_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const LIST_RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      action: "list",
      outcome: {
        kind: "material",
        item_id: "ordinary_stone",
        quantity: 1,
        price: 10,
        name: "普通石头",
      },
    },
    resource: CATALOG_RESOURCE,
  },
  revision: AFTER_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const CROSS_BUY_RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      action: "buy",
      outcome: {
        seller_doorplate: "ABC234",
        kind: "material",
        item_id: "ordinary_stone",
        quantity: 1,
        name: "普通石头",
        cost: 10,
        fee: 1,
        price: 10,
      },
    },
    buyer_doorplate: FARM_DOORPLATE,
    seller_doorplate: "ABC234",
  },
  revision: AFTER_REVISION,
  seller_revision: SELLER_AFTER_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const CROSS_BARTER_ACCEPT_RESULT = {
  data: {
    result: {
      receipt_id: KEY,
      action: "barter-accept",
      outcome: {
        seller_doorplate: "ABC234",
        listing_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
        give: {
          kind: "material",
          item_id: "ordinary_stone",
          quantity: 1,
          name: "普通石头",
        },
        want: {
          kind: "material",
          item_id: "dry_branch",
          quantity: 1,
          name: "枯树枝",
        },
      },
    },
    buyer_doorplate: FARM_DOORPLATE,
    seller_doorplate: "ABC234",
  },
  revision: AFTER_REVISION,
  seller_revision: SELLER_AFTER_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: BEFORE_REVISION,
    idempotencyKey: KEY,
    action: "browse" as const,
    ...overrides,
  };
}

function client(fetchImplementation: typeof fetch) {
  return new FarmHumanMarketActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm market action client posts strict identity-bound requests", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(url),
    });
    const request = JSON.parse(String(init?.body)) as { action: string };
    return jsonResponse(request.action === "browse" ? BROWSE_RESULT : LIST_RESULT);
  };

  await client(fetcher).executeMarketAction(input());
  await client(fetcher).executeMarketAction(
    input({
      action: "list",
      expectedRevision: BEFORE_REVISION,
      kind: "material",
      itemId: "ordinary_stone",
      quantity: 1,
    }),
  );

  assert.equal(calls[0]?.url, "https://farm.example/farm/internal/doorbell/human/market/action");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer service-secret");
  assert.equal(calls[0]?.headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? ""), {
    farm_human_key: FARM_HUMAN_KEY,
    expected_farm_doorplate: FARM_DOORPLATE,
    idempotency_key: KEY,
    expected_revision: BEFORE_REVISION,
    action: "browse",
  });
  assert.deepEqual(JSON.parse(calls[1]?.body ?? ""), {
    farm_human_key: FARM_HUMAN_KEY,
    expected_farm_doorplate: FARM_DOORPLATE,
    idempotency_key: KEY,
    expected_revision: BEFORE_REVISION,
    action: "list",
    kind: "material",
    item_id: "ordinary_stone",
    qty: 1,
  });
});

test("farm market action client verifies catalog, doorplate, receipt, action and revision", async () => {
  assert.deepEqual(
    await client(async () => jsonResponse(BROWSE_RESULT)).executeMarketAction(input()),
    BROWSE_RESULT,
  );
  assert.deepEqual(
    await client(async () => jsonResponse(LIST_RESULT)).executeMarketAction(
      input({
        action: "list",
        kind: "material",
        itemId: "ordinary_stone",
        quantity: 1,
      }),
    ),
    LIST_RESULT,
  );

  const run = async (payload: unknown, overrides: Record<string, unknown> = {}) =>
    await client(async () => jsonResponse(payload)).executeMarketAction(input(overrides));

  await assert.rejects(
    run({
      ...BROWSE_RESULT,
      data: {
        ...BROWSE_RESULT.data,
        result: {
          ...BROWSE_RESULT.data.result,
          receipt_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
        },
      },
    }),
    FarmHumanMarketActionContractUnavailableError,
  );
  await assert.rejects(
    run({
      ...BROWSE_RESULT,
      data: {
        ...BROWSE_RESULT.data,
        resource: {
          ...BROWSE_RESULT.data.resource,
          farm: { ...BROWSE_RESULT.data.resource.farm, farm_doorplate: "ABC234" },
        },
      },
    }),
    FarmHumanMarketActionContractUnavailableError,
  );
  await assert.rejects(
    run({
      ...BROWSE_RESULT,
      data: {
        ...BROWSE_RESULT.data,
        result: {
          ...BROWSE_RESULT.data.result,
          action: "list",
          outcome: {
            kind: "material",
            item_id: "ordinary_stone",
            quantity: 1,
            price: 10,
            name: "普通石头",
          },
        },
      },
    }),
    FarmHumanMarketActionContractUnavailableError,
  );
  await assert.rejects(
    run(
      { ...LIST_RESULT, revision: BEFORE_REVISION },
      { action: "list", kind: "material", itemId: "ordinary_stone", quantity: 1 },
    ),
    FarmHumanMarketActionContractUnavailableError,
  );
  await assert.rejects(
    run(
      {
        ...LIST_RESULT,
        data: {
          ...LIST_RESULT.data,
          result: { ...LIST_RESULT.data.result, action: "browse", outcome: null },
        },
      },
      { action: "list", kind: "material", itemId: "ordinary_stone", quantity: 1 },
    ),
    FarmHumanMarketActionContractUnavailableError,
  );
});

test("farm market action client accepts and verifies cross-farm buy and barter receipts", async () => {
  assert.deepEqual(
    await client(async () => jsonResponse(CROSS_BUY_RESULT)).executeMarketAction(
      input({
        action: "buy",
        sellerDoorplate: "ABC234",
        kind: "material",
        itemId: "ordinary_stone",
        quantity: 1,
      }),
    ),
    CROSS_BUY_RESULT,
  );
  assert.deepEqual(
    await client(async () => jsonResponse(CROSS_BARTER_ACCEPT_RESULT)).executeMarketAction(
      input({
        action: "barter-accept",
        sellerDoorplate: "ABC234",
        listingId: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
      }),
    ),
    CROSS_BARTER_ACCEPT_RESULT,
  );

  const buyInput = input({
    action: "buy",
    sellerDoorplate: "ABC234",
    kind: "material",
    itemId: "ordinary_stone",
    quantity: 1,
  });
  const runBuy = async (payload: unknown) =>
    await client(async () => jsonResponse(payload)).executeMarketAction(buyInput);

  for (const payload of [
    {
      ...CROSS_BUY_RESULT,
      data: {
        ...CROSS_BUY_RESULT.data,
        buyer_doorplate: "ABC234",
      },
    },
    {
      ...CROSS_BUY_RESULT,
      data: {
        ...CROSS_BUY_RESULT.data,
        seller_doorplate: "DEF567",
      },
    },
    {
      ...CROSS_BUY_RESULT,
      data: {
        ...CROSS_BUY_RESULT.data,
        result: {
          ...CROSS_BUY_RESULT.data.result,
          outcome: {
            ...CROSS_BUY_RESULT.data.result.outcome,
            seller_doorplate: "DEF567",
          },
        },
      },
    },
    { ...CROSS_BUY_RESULT, revision: BEFORE_REVISION },
  ]) {
    await assert.rejects(runBuy(payload), FarmHumanMarketActionContractUnavailableError);
  }

  await assert.rejects(
    client(async () => jsonResponse(CROSS_BARTER_ACCEPT_RESULT)).executeMarketAction(
      input({
        action: "barter-accept",
        sellerDoorplate: "ABC234",
        listingId: "219ffb01-49cd-7020-84af-3d04fb1ed03d",
      }),
    ),
    FarmHumanMarketActionContractUnavailableError,
  );
});

test("farm market action client refuses unsupported settlement success and keeps 502/network availability distinct", async () => {
  await assert.rejects(
    client(async () =>
      jsonResponse(
        {
          error: {
            code: "cross_farm_atomicity_unavailable",
            message: "Cross-farm market settlement is unavailable",
            current_revision: BEFORE_REVISION,
          },
        },
        503,
      ),
    ).executeMarketAction(
      input({
        action: "buy",
        sellerDoorplate: "ABC234",
        kind: "material",
        itemId: "ordinary_stone",
        quantity: 1,
      }),
    ),
    (error: unknown) =>
      error instanceof FarmHumanMarketActionCrossFarmAtomicityUnavailableError &&
      error.currentRevision === BEFORE_REVISION,
  );
  await assert.rejects(
    client(async () => new Response("not json", { status: 502 })).executeMarketAction(input()),
    FarmHumanMarketActionContractUnavailableError,
  );
  await assert.rejects(
    client(async () => new Response("not json", { status: 503 })).executeMarketAction(input()),
    FarmHumanMarketActionUnavailableError,
  );
  await assert.rejects(
    client(async () => {
      throw new Error("offline");
    }).executeMarketAction(input()),
    FarmHumanMarketActionUnavailableError,
  );
});

test("farm market action client maps structured farm errors", async () => {
  const run = async (code: string, status = 409, currentRevision?: string) =>
    await client(async () =>
      jsonResponse(
        {
          error: {
            code,
            message: "market error",
            ...(currentRevision ? { current_revision: currentRevision } : {}),
          },
        },
        status,
      ),
    ).executeMarketAction(input());

  for (const code of [
    "farm_credential_not_found",
    "farm_doorplate_mismatch",
    "farm_credential_invalid",
  ]) {
    await assert.rejects(run(code), FarmHumanMarketActionCredentialInvalidError);
  }
  await assert.rejects(run("farm_not_found", 404), FarmHumanMarketActionNotFoundError);
  await assert.rejects(
    run("state_conflict", 409, AFTER_REVISION),
    (error: unknown) =>
      error instanceof FarmHumanMarketActionStateConflictError &&
      error.currentRevision === AFTER_REVISION,
  );
  await assert.rejects(run("idempotency_conflict"), FarmHumanMarketActionIdempotencyConflictError);
  await assert.rejects(run("action_rejected"), FarmHumanMarketActionRejectedError);
  await assert.rejects(run("farm_unavailable", 503), FarmHumanMarketActionUnavailableError);
  await assert.rejects(
    run("upstream_contract_unavailable", 502),
    FarmHumanMarketActionContractUnavailableError,
  );
  await assert.rejects(run("invalid_request", 400), FarmHumanMarketActionContractUnavailableError);
});

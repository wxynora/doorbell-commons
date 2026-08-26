import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanKitchenInventoryActionClient,
  FarmHumanKitchenInventoryActionContractUnavailableError,
  FarmHumanKitchenInventoryActionStateConflictError,
  FarmHumanKitchenInventoryActionUnavailableError,
} from "./farm-kitchen-inventory-action-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-kitchen-inventory-human-key";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INVENTORY_REVISION = `kitchen-inventory-v1:${"a".repeat(64)}`;
const NEXT_INVENTORY_REVISION = `kitchen-inventory-v1:${"b".repeat(64)}`;

const KITCHEN_DATA = {
  farm: { farm_doorplate: FARM_DOORPLATE, farm_name: "渡的小农场" },
  balance: {
    silver: { status: "available", value: 321, reason: null },
    ranch_coins: { status: "available", value: 654, reason: null },
  },
  tools: { status: "unavailable", items: [], reason: "not_persisted" },
  stacked_ingredients: { status: "available", items: [], reason: null },
  product_instances: { status: "available", items: [], reason: null },
  fish_instances: { status: "available", items: [], reason: null },
  treasure_items: { status: "available", items: [], reason: null },
  dish_instances: { status: "available", items: [], reason: null },
  known_recipes: { status: "available", items: [], reason: null },
  daily_shop: {
    status: "available",
    stored_day_index: 20700,
    current_day_index: 20700,
    is_current_day: true,
    refresh_at: "2026-08-25T00:00:00.000Z",
    refresh_window_id: 20700,
    refresh_used_count: 1,
    refresh_remaining_count: 9,
    refresh_limit: 10,
    next_cost_coins: 200,
    can_refresh: true,
    refresh_reset_at: "2026-08-25T00:00:00.000Z",
    ingredients: [],
    recipes: [],
    reason: null,
  },
} as const;

const RECYCLE_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      action: "recycle",
      outcome: {
        kind: "recycle",
        item_kind: "product",
        name: "蜂蜜",
        quantity: 1,
        value: 10,
        silver: 10,
      },
    },
    resource: KITCHEN_DATA,
  },
  kitchen_inventory_revision: NEXT_INVENTORY_REVISION,
  server_time: "2026-08-25T04:00:00.000Z",
} as const;

const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
  expectedInventoryRevision: INVENTORY_REVISION,
  idempotencyKey: IDEMPOTENCY_KEY,
  action: "recycle" as const,
  itemKind: "product" as const,
  itemInstanceIds: ["product-1"],
  quantity: 1,
};

function createClient(fetchImplementation: typeof fetch): FarmHumanKitchenInventoryActionClient {
  return new FarmHumanKitchenInventoryActionClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm kitchen inventory action client posts the strict identity-bound action", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(RECYCLE_RESULT);
  });

  assert.deepEqual(await client.executeKitchenInventoryAction(INPUT), RECYCLE_RESULT);
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
          expected_kitchen_inventory_revision: INVENTORY_REVISION,
          action: "recycle",
          item_kind: "product",
          item_instance_ids: ["product-1"],
          quantity: 1,
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/kitchen/inventory/action",
      },
    ],
  );
});

test("farm kitchen inventory action client rejects stale revisions and cross-house resources", async () => {
  const run = (payload: unknown) =>
    createClient(async () => Response.json(payload)).executeKitchenInventoryAction(INPUT);

  await assert.rejects(
    run({
      ...RECYCLE_RESULT,
      kitchen_inventory_revision: INVENTORY_REVISION,
    }),
    FarmHumanKitchenInventoryActionContractUnavailableError,
  );
  await assert.rejects(
    run({
      ...RECYCLE_RESULT,
      data: {
        ...RECYCLE_RESULT.data,
        resource: {
          ...KITCHEN_DATA,
          farm: { ...KITCHEN_DATA.farm, farm_doorplate: "DEF567" },
        },
      },
    }),
    FarmHumanKitchenInventoryActionContractUnavailableError,
  );
  await assert.rejects(
    run({
      ...RECYCLE_RESULT,
      data: {
        ...RECYCLE_RESULT.data,
        result: {
          ...RECYCLE_RESULT.data.result,
          receipt_id: "119ffb01-49cd-7020-84af-3d04fb1ed03d",
        },
      },
    }),
    FarmHumanKitchenInventoryActionContractUnavailableError,
  );
});

test("farm kitchen inventory action client maps conflict and keeps 502 distinct from 503", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json(
        {
          error: {
            code: "state_conflict",
            message: "changed",
            current_kitchen_inventory_revision: NEXT_INVENTORY_REVISION,
          },
        },
        { status: 409 },
      ),
    ).executeKitchenInventoryAction(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanKitchenInventoryActionStateConflictError);
      assert.equal(error.currentInventoryRevision, NEXT_INVENTORY_REVISION);
      return true;
    },
  );
  await assert.rejects(
    createClient(
      async () => new Response("bad gateway", { status: 502 }),
    ).executeKitchenInventoryAction(INPUT),
    FarmHumanKitchenInventoryActionContractUnavailableError,
  );
  await assert.rejects(
    createClient(
      async () => new Response("offline", { status: 503 }),
    ).executeKitchenInventoryAction(INPUT),
    FarmHumanKitchenInventoryActionUnavailableError,
  );
});

test("farm kitchen inventory action client validates UUID, doorplate, and revision before sending", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(RECYCLE_RESULT);
  });

  await assert.rejects(
    client.executeKitchenInventoryAction({ ...INPUT, idempotencyKey: "not-a-uuid" }),
  );
  await assert.rejects(
    client.executeKitchenInventoryAction({ ...INPUT, farmDoorplate: "not-a-doorplate" }),
  );
  await assert.rejects(
    client.executeKitchenInventoryAction({
      ...INPUT,
      expectedInventoryRevision: `kitchen-inventory-v1:${"A".repeat(64)}`,
    }),
  );
  assert.equal(calls, 0);
});

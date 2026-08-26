import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanKitchenCookClient,
  FarmHumanKitchenCookContractUnavailableError,
  FarmHumanKitchenCookCredentialInvalidError,
  FarmHumanKitchenCookIdempotencyConflictError,
  FarmHumanKitchenCookNotFoundError,
  FarmHumanKitchenCookRejectedError,
  FarmHumanKitchenCookStateConflictError,
  FarmHumanKitchenCookUnavailableError,
} from "./farm-kitchen-cook-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-kitchen-cook-human-key";
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const INVENTORY_REVISION = `kitchen-inventory-v1:${"a".repeat(64)}`;
const ITEMS = ["egg", "salt"];

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
    refresh_used_count: 0,
    refresh_remaining_count: 10,
    refresh_limit: 10,
    next_cost_coins: 100,
    can_refresh: true,
    refresh_reset_at: "2026-08-25T00:00:00.000Z",
    ingredients: [],
    recipes: [],
    reason: null,
  },
} as const;

const COOK_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      outcome: {
        kind: "cook",
        item_refs: ITEMS,
        dish_instance_id: "dish-1",
        recipe_id: "fried_egg",
        name: "香煎蛋",
        rarity: "N",
        value_gold: 82,
        recycle_silver: 2,
        odd: false,
        discovered: true,
        qixi: null,
      },
    },
    resource: KITCHEN_DATA,
  },
  kitchen_inventory_revision: `kitchen-inventory-v1:${"b".repeat(64)}`,
  server_time: "2026-08-25T04:00:00.000Z",
};

const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
  items: ITEMS,
  expectedKitchenInventoryRevision: INVENTORY_REVISION,
  idempotencyKey: IDEMPOTENCY_KEY,
};

function createClient(fetchImplementation: typeof fetch): FarmHumanKitchenCookClient {
  return new FarmHumanKitchenCookClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm kitchen cook client posts raw refs with server-only identity binding", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(COOK_RESULT);
  });

  assert.deepEqual(await client.cookKitchen(INPUT), COOK_RESULT);
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
          items: ITEMS,
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/kitchen/cook",
      },
    ],
  );
});

test("farm kitchen cook client rejects a wrong receipt or subject doorplate", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...COOK_RESULT,
        data: {
          ...COOK_RESULT.data,
          result: {
            ...COOK_RESULT.data.result,
            receipt_id: "019ffb01-49cd-7020-84af-3d04fb1ed03e",
          },
        },
      }),
    ).cookKitchen(INPUT),
    FarmHumanKitchenCookContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...COOK_RESULT,
        data: {
          ...COOK_RESULT.data,
          resource: {
            ...KITCHEN_DATA,
            farm: { ...KITCHEN_DATA.farm, farm_doorplate: "DEF567" },
          },
        },
      }),
    ).cookKitchen(INPUT),
    FarmHumanKitchenCookContractUnavailableError,
  );
});

test("farm kitchen cook client maps every upstream error family", async () => {
  const createClientFor = (payload: unknown, status = 409) =>
    createClient(async () =>
      payload instanceof Response ? payload : Response.json(payload, { status }),
    );

  await assert.rejects(
    createClientFor({
      error: {
        code: "state_conflict",
        message: "changed",
        current_kitchen_inventory_revision: `kitchen-inventory-v1:${"c".repeat(64)}`,
      },
    }).cookKitchen(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanKitchenCookStateConflictError);
      assert.equal(error.currentKitchenInventoryRevision, `kitchen-inventory-v1:${"c".repeat(64)}`);
      return true;
    },
  );
  await assert.rejects(
    createClientFor({ error: { code: "cook_rejected", message: "食材不足" } }).cookKitchen(INPUT),
    (error: unknown) => {
      assert.ok(error instanceof FarmHumanKitchenCookRejectedError);
      assert.equal(error.message, "食材不足");
      return true;
    },
  );
  await assert.rejects(
    createClientFor({ error: { code: "idempotency_conflict", message: "duplicate" } }).cookKitchen(
      INPUT,
    ),
    FarmHumanKitchenCookIdempotencyConflictError,
  );
  for (const code of [
    "farm_credential_not_found",
    "farm_doorplate_mismatch",
    "farm_credential_invalid",
  ] as const) {
    await assert.rejects(
      createClientFor({ error: { code, message: "bad" } }).cookKitchen(INPUT),
      FarmHumanKitchenCookCredentialInvalidError,
    );
  }
  await assert.rejects(
    createClientFor({ error: { code: "farm_not_found", message: "missing" } }, 404).cookKitchen(
      INPUT,
    ),
    FarmHumanKitchenCookNotFoundError,
  );
  await assert.rejects(
    createClientFor({ error: { code: "farm_unavailable", message: "offline" } }, 503).cookKitchen(
      INPUT,
    ),
    FarmHumanKitchenCookUnavailableError,
  );
  await assert.rejects(
    createClientFor(new Response("bad contract", { status: 502 }), 502).cookKitchen(INPUT),
    FarmHumanKitchenCookContractUnavailableError,
  );
  await assert.rejects(
    createClientFor({ error: { code: "invalid_request", message: "bad" } }, 400).cookKitchen(INPUT),
    FarmHumanKitchenCookContractUnavailableError,
  );
  await assert.rejects(
    createClientFor(
      { error: { code: "authentication_required", message: "auth" } },
      401,
    ).cookKitchen(INPUT),
    FarmHumanKitchenCookContractUnavailableError,
  );
});

test("farm kitchen cook client validates identity and the two-to-five item request", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return Response.json(COOK_RESULT);
  });

  await assert.rejects(client.cookKitchen({ ...INPUT, farmDoorplate: "not-a-doorplate" }));
  await assert.rejects(client.cookKitchen({ ...INPUT, idempotencyKey: "not-a-uuid" }));
  await assert.rejects(client.cookKitchen({ ...INPUT, items: ["egg"] }));
  await assert.rejects(
    client.cookKitchen({ ...INPUT, items: ["egg", "salt", "sugar", "oil", "milk", "tea"] }),
  );
  await assert.rejects(client.cookKitchen({ ...INPUT, items: ["egg", ""] }));
  assert.equal(calls, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanKitchenClient,
  FarmHumanKitchenContractUnavailableError,
  FarmHumanKitchenCredentialInvalidError,
  FarmHumanKitchenNotFoundError,
  FarmHumanKitchenUnavailableError,
} from "./farm-kitchen-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-kitchen-human-key";

const UNAVAILABLE_METHOD = {
  status: "unavailable",
  id: null,
  name: null,
  reason: "not_persisted",
} as const;

const KITCHEN_RESULT = {
  data: {
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
    known_recipes: {
      status: "available",
      items: [
        {
          status: "available",
          recipe_id: "honey_tea",
          name: "蜂蜜茶",
          rarity: "R",
          category: "饮品",
          ingredients: [
            {
              status: "available",
              ingredient_id: "honey",
              name: "蜂蜜",
              quantity: 1,
              reason: null,
            },
            { status: "available", ingredient_id: "tea", name: "茶叶", quantity: 1, reason: null },
          ],
          method: UNAVAILABLE_METHOD,
          tool: UNAVAILABLE_METHOD,
          reason: null,
        },
      ],
      reason: null,
    },
    daily_shop: {
      status: "available",
      stored_day_index: 20700,
      current_day_index: 20700,
      is_current_day: true,
      refresh_at: "2026-08-25T00:00:00.000Z",
      ingredients: [
        {
          status: "available",
          ingredient_id: "tea",
          name: "茶叶",
          price_silver: 18,
          daily_buy_limit: 3,
          bought_quantity: 0,
          reason: null,
        },
      ],
      recipes: [],
      reason: null,
    },
  },
  server_time: "2026-08-24T04:00:00.000Z",
};

const INPUT = { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY };

function createClient(fetchImplementation: typeof fetch): FarmHumanKitchenClient {
  return new FarmHumanKitchenClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm kitchen client posts the fixed internal read contract with server-only credentials", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(KITCHEN_RESULT);
  });

  assert.deepEqual(await client.readKitchen(INPUT), KITCHEN_RESULT);
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
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/kitchen/read",
      },
    ],
  );
});

test("farm kitchen client rejects malformed data and maps binding or availability failures", async () => {
  await assert.rejects(
    createClient(async () => Response.json({ ...KITCHEN_RESULT, unexpected: true })).readKitchen(
      INPUT,
    ),
    FarmHumanKitchenContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...KITCHEN_RESULT,
        data: {
          ...KITCHEN_RESULT.data,
          farm: { ...KITCHEN_RESULT.data.farm, farm_doorplate: "DEF567" },
        },
      }),
    ).readKitchen(INPUT),
    FarmHumanKitchenContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json(
        { error: { code: "farm_credential_not_found", message: "bad" } },
        { status: 404 },
      ),
    ).readKitchen(INPUT),
    FarmHumanKitchenCredentialInvalidError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({ error: { code: "farm_not_found", message: "gone" } }, { status: 404 }),
    ).readKitchen(INPUT),
    FarmHumanKitchenNotFoundError,
  );
  await assert.rejects(
    createClient(async () => new Response("offline", { status: 503 })).readKitchen(INPUT),
    FarmHumanKitchenUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("bad contract", { status: 502 })).readKitchen(INPUT),
    FarmHumanKitchenContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => {
      throw new Error("network");
    }).readKitchen(INPUT),
    FarmHumanKitchenUnavailableError,
  );
});

test("farm kitchen client validates the binding before sending", async () => {
  const client = createClient(async () => Response.json(KITCHEN_RESULT));
  await assert.rejects(client.readKitchen({ ...INPUT, farmDoorplate: "not-a-doorplate" }));
});

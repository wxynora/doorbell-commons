import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanClient,
  FarmHumanFieldContractUnavailableError,
  FarmHumanFieldCredentialInvalidError,
  FarmHumanFieldIdempotencyConflictError,
  FarmHumanFieldNotFoundError,
  FarmHumanFieldStateConflictError,
  FarmHumanFieldUnavailableError,
  FarmHumanHarvestAssistExhaustedError,
  FarmHumanNoRipePlotsError,
} from "./farm-human-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-farm-human-key";
const FIELD_RESULT = {
  data: {
    farm: {
      farm_doorplate: FARM_DOORPLATE,
      farm_name: "渡的小农场",
      welcome_message: null,
      equipped_title: { title_id: "spring-helper", name: "春日帮手" },
    },
    balance: { farm_coins: 1280 },
    season: { id: "summer", name: "夏" },
    weather: { condition: "light_rain" },
    land: { tier: 3, name: "沃野" },
    plots: [
      {
        plot_id: 1,
        state: "ripe",
        seed_type: "common",
        watered: 2,
        progress: { current: 6, total: 6 },
        matures_at: null,
        identity_state: "hidden",
        crop_identity: null,
      },
      {
        plot_id: 2,
        state: "growing",
        seed_type: "limited",
        watered: 1,
        progress: { current: 2, total: 5 },
        matures_at: "2026-08-23T12:30:00.000Z",
        identity_state: "known",
        crop_identity: {
          crop_id: "star-shuttle-wheat",
          name: "星梭麦",
          category: "limited",
        },
      },
      {
        plot_id: 3,
        state: "growing",
        seed_type: "limited",
        watered: 0,
        progress: { current: 1, total: 4 },
        matures_at: "2026-08-23T13:30:00.000Z",
        identity_state: "unavailable",
        crop_identity: null,
      },
      {
        plot_id: 4,
        state: "empty",
        seed_type: null,
        watered: 0,
        progress: null,
        matures_at: null,
        identity_state: "empty",
        crop_identity: null,
      },
    ],
    harvest_assist: {
      daily_limit: 3,
      remaining: 2,
      mature_plot_count: 1,
      can_assist: true,
      reset_at: "2026-08-24T00:00:00.000Z",
    },
  },
  revision: "field:opaque-version",
  server_time: "2026-08-23T10:00:00.000Z",
};

const INPUT = {
  farmDoorplate: FARM_DOORPLATE,
  farmHumanKey: FARM_HUMAN_KEY,
};
const IDEMPOTENCY_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const HARVEST_RESULT = {
  data: {
    result: {
      receipt_id: IDEMPOTENCY_KEY,
      harvested_count: 1,
      farm_coins_gained: 100,
      silver_gained: 0,
      harvests: [
        {
          plot_id: 1,
          crop: {
            crop_id: "common-wheat",
            name: "小麦",
            category: "common",
            rarity: "N",
          },
          quality: { name: "常品" },
          value: 100,
          currency: "gold",
          is_new: false,
          material_drop: null,
          potion_drop: null,
          bonus_value: 0,
        },
      ],
      season_event: null,
      new_titles: [],
    },
    resource: FIELD_RESULT.data,
  },
  revision: "field:new-version",
  server_time: "2026-08-23T10:01:00.000Z",
};

test("farm Human client calls the fixed field endpoint with server-only binding credentials", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = new FarmHumanClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation: async (input, init) => {
      calls.push({
        body: String(init?.body),
        headers: new Headers(init?.headers),
        method: init?.method,
        url: String(input),
      });
      return Response.json(FIELD_RESULT);
    },
  });

  assert.deepEqual(await client.readField(INPUT), FIELD_RESULT);
  assert.deepEqual(calls, [
    {
      body: JSON.stringify({
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
      }),
      headers: calls[0]?.headers,
      method: "POST",
      url: "https://farm.example/farm/internal/doorbell/human/field/read",
    },
  ]);
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer service-secret");
  assert.equal(calls[0]?.headers.get("content-type"), "application/json");
});

test("farm Human client keeps unrevealed crops hidden and rejects unverified success payloads", async () => {
  const readInvalid = async (payload: unknown) =>
    await new FarmHumanClient({
      apiBaseUrl: "https://farm.example/",
      requestTimeoutMs: 1_000,
      serviceToken: "service-secret",
      fetchImplementation: async () => Response.json(payload),
    }).readField(INPUT);

  for (const seedType of ["common", "fantasy"] as const) {
    await assert.rejects(
      readInvalid({
        ...FIELD_RESULT,
        data: {
          ...FIELD_RESULT.data,
          plots: [
            {
              ...FIELD_RESULT.data.plots[0],
              seed_type: seedType,
              identity_state: "known",
              crop_identity: { crop_id: "guessed", name: "猜测作物", category: seedType },
            },
          ],
        },
      }),
      FarmHumanFieldContractUnavailableError,
    );
  }
  await assert.rejects(
    readInvalid({
      ...FIELD_RESULT,
      data: {
        ...FIELD_RESULT.data,
        plots: [
          {
            ...FIELD_RESULT.data.plots[0],
            matures_at: "2026-08-23T10:01:00.000Z",
          },
        ],
      },
    }),
    FarmHumanFieldContractUnavailableError,
  );
  await assert.rejects(
    readInvalid({
      ...FIELD_RESULT,
      data: {
        ...FIELD_RESULT.data,
        farm: { ...FIELD_RESULT.data.farm, farm_doorplate: "ABC234" },
      },
    }),
    FarmHumanFieldContractUnavailableError,
  );
  await assert.rejects(
    readInvalid({ ...FIELD_RESULT, unexpected: true }),
    FarmHumanFieldContractUnavailableError,
  );
});

test("farm Human client maps credential, missing farm, contract, and availability failures", async () => {
  const createClient = (response: () => Promise<Response>) =>
    new FarmHumanClient({
      apiBaseUrl: "https://farm.example/",
      requestTimeoutMs: 1_000,
      serviceToken: "service-secret",
      fetchImplementation: response,
    });
  const serviceError = (code: string, status: number) =>
    Response.json({ error: { code, message: "upstream error" } }, { status });

  for (const code of ["farm_credential_not_found", "farm_doorplate_mismatch"]) {
    await assert.rejects(
      createClient(async () => serviceError(code, 409)).readField(INPUT),
      FarmHumanFieldCredentialInvalidError,
    );
  }
  await assert.rejects(
    createClient(async () => serviceError("farm_not_found", 404)).readField(INPUT),
    FarmHumanFieldNotFoundError,
  );
  await assert.rejects(
    createClient(async () => serviceError("invalid_request", 400)).readField(INPUT),
    FarmHumanFieldContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("not json", { status: 502 })).readField(INPUT),
    FarmHumanFieldContractUnavailableError,
  );
  await assert.rejects(
    createClient(() =>
      Promise.resolve(
        Response.json(
          { error: { code: "upstream_contract_unavailable", message: "bad contract" } },
          { status: 502 },
        ),
      ),
    ).readField(INPUT),
    FarmHumanFieldContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () => new Response("not json", { status: 503 })).readField(INPUT),
    FarmHumanFieldUnavailableError,
  );
  await assert.rejects(
    createClient(async () => {
      throw new Error("offline");
    }).readField(INPUT),
    FarmHumanFieldUnavailableError,
  );
});

test("farm Human client posts the strict five-key harvest contract", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = new FarmHumanClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation: async (input, init) => {
      calls.push({
        body: String(init?.body),
        headers: new Headers(init?.headers),
        method: init?.method,
        url: String(input),
      });
      return Response.json(HARVEST_RESULT);
    },
  });

  assert.deepEqual(
    await client.harvestAssist({
      ...INPUT,
      expectedRevision: FIELD_RESULT.revision,
      idempotencyKey: IDEMPOTENCY_KEY,
    }),
    HARVEST_RESULT,
  );
  assert.deepEqual(calls, [
    {
      body: JSON.stringify({
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
        idempotency_key: IDEMPOTENCY_KEY,
        expected_revision: FIELD_RESULT.revision,
        payload: {},
      }),
      headers: calls[0]?.headers,
      method: "POST",
      url: "https://farm.example/farm/internal/doorbell/human/field/harvest-assist",
    },
  ]);
  assert.equal(calls[0]?.body.includes("plot_id"), false);
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer service-secret");
  assert.equal(calls[0]?.headers.get("content-type"), "application/json");
});

test("farm Human client rejects malformed harvest receipts and maps structured conflicts", async () => {
  const createClient = (payload: unknown, status = 409) =>
    new FarmHumanClient({
      apiBaseUrl: "https://farm.example/",
      requestTimeoutMs: 1_000,
      serviceToken: "service-secret",
      fetchImplementation: async () => Response.json(payload, { status }),
    });
  const request = {
    ...INPUT,
    expectedRevision: FIELD_RESULT.revision,
    idempotencyKey: IDEMPOTENCY_KEY,
  };

  await assert.rejects(
    createClient({
      ...HARVEST_RESULT,
      data: { ...HARVEST_RESULT.data, result: { ...HARVEST_RESULT.data.result, extra: true } },
    }).harvestAssist(request),
    FarmHumanFieldContractUnavailableError,
  );
  const errors = [
    ["harvest_assist_exhausted", FarmHumanHarvestAssistExhaustedError],
    ["no_ripe_plots", FarmHumanNoRipePlotsError],
    ["state_conflict", FarmHumanFieldStateConflictError],
    ["idempotency_conflict", FarmHumanFieldIdempotencyConflictError],
  ] as const;
  for (const [code, errorClass] of errors) {
    await assert.rejects(
      createClient({
        error: { code, message: "harvest error", current_revision: "field:current" },
      }).harvestAssist(request),
      (error: unknown) => {
        assert.ok(error instanceof errorClass);
        if (error instanceof FarmHumanFieldStateConflictError) {
          assert.equal(error.currentRevision, "field:current");
        }
        return true;
      },
    );
  }
  await assert.rejects(
    createClient(
      { error: { code: "upstream_contract_unavailable", message: "bad contract" } },
      502,
    ).harvestAssist(request),
    FarmHumanFieldContractUnavailableError,
  );
  await assert.rejects(
    createClient({ error: { code: "farm_unavailable", message: "offline" } }, 503).harvestAssist(
      request,
    ),
    FarmHumanFieldUnavailableError,
  );
  await assert.rejects(
    createClient({
      ...HARVEST_RESULT,
      data: { ...HARVEST_RESULT.data, resource: { bad: true } },
    }).harvestAssist(request),
    FarmHumanFieldContractUnavailableError,
  );
});

test("farm Human client validates the harvest idempotency key before sending", async () => {
  const client = new FarmHumanClient({
    apiBaseUrl: "https://farm.example/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation: async () => Response.json(HARVEST_RESULT),
  });

  await assert.rejects(
    client.harvestAssist({
      ...INPUT,
      expectedRevision: FIELD_RESULT.revision,
      idempotencyKey: "not-a-uuid",
    }),
  );
});

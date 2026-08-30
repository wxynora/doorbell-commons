import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanBulletinClient,
  FarmHumanBulletinContractUnavailableError,
} from "./farm-bulletin-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-bulletin-human-key";
const IDEMPOTENCY_KEY = "219ffb01-49cd-7020-84af-3d04fb1ed03d";

const BULLETIN_RESULT = {
  subject: { farm_doorplate: FARM_DOORPLATE },
  data: {
    available: {
      tasks: [
        {
          kind: "craft",
          description: "熔炼 1 次",
          progress: 0,
          target: 1,
          reward: 60,
          currency: "coin",
        },
      ],
      mature_plots: [{ plot_id: 1, seed_type: "common", watered: 1 }],
      messages: [],
      ranch_notifications: [],
    },
    unavailable: {},
    trail: {
      status: "available",
      entries: [
        {
          event_id: "trail-watered-1",
          kind: "watered",
          actor_name: "访客",
          actor_farm_doorplate: null,
          plot_id: 2,
          crop_name: null,
          at: "2026-08-25T03:58:00.000Z",
        },
      ],
      has_unread: true,
    },
  },
  revision: `farm-bulletin-v1:${"a".repeat(64)}`,
  server_time: "2026-08-25T04:00:00.000Z",
};

const BULLETIN_ACK_RESULT = {
  subject: BULLETIN_RESULT.subject,
  data: {
    result: { receipt_id: IDEMPOTENCY_KEY, acknowledged_count: 2 },
    resource: {
      available: { tasks: [], mature_plots: [], messages: [], ranch_notifications: [] },
      unavailable: {},
      trail: { ...BULLETIN_RESULT.data.trail, has_unread: false },
    },
  },
  revision: BULLETIN_RESULT.revision,
  server_time: BULLETIN_RESULT.server_time,
};

function createClient(fetchImplementation: typeof fetch): FarmHumanBulletinClient {
  return new FarmHumanBulletinClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm bulletin client posts the fixed internal read contract", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(BULLETIN_RESULT);
  });

  assert.deepEqual(
    await client.readBulletin({ farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY }),
    BULLETIN_RESULT,
  );
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
        url: "https://farm.example/farm/internal/doorbell/human/bulletin/read",
      },
    ],
  );
});

test("farm bulletin client posts a revision-bound idempotent acknowledgement", async () => {
  const calls: Array<{ body: string; url: string }> = [];
  const client = createClient(async (input, init) => {
    calls.push({ body: String(init?.body), url: String(input) });
    return Response.json(BULLETIN_ACK_RESULT);
  });

  const result = await client.acknowledgeBulletin({
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: BULLETIN_RESULT.revision,
    idempotencyKey: IDEMPOTENCY_KEY,
    acknowledge: "trail",
  });
  assert.deepEqual(result, BULLETIN_ACK_RESULT);
  assert.deepEqual(calls, [
    {
      body: JSON.stringify({
        farm_human_key: FARM_HUMAN_KEY,
        expected_farm_doorplate: FARM_DOORPLATE,
        expected_bulletin_revision: BULLETIN_RESULT.revision,
        idempotency_key: IDEMPOTENCY_KEY,
        acknowledge: "trail",
      }),
      url: "https://farm.example/farm/internal/doorbell/human/bulletin/ack",
    },
  ]);
});

test("main can deploy before Farm by accepting legacy reads and omitting the default system scope", async () => {
  const legacyData = {
    available: BULLETIN_RESULT.data.available,
    unavailable: BULLETIN_RESULT.data.unavailable,
  };
  const calls: string[] = [];
  const client = createClient(async (_input, init) => {
    calls.push(String(init?.body));
    return calls.length === 1
      ? Response.json({ ...BULLETIN_RESULT, data: legacyData })
      : Response.json(BULLETIN_ACK_RESULT);
  });
  const read = await client.readBulletin({
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
  });
  assert.deepEqual(read.data.trail, {
    status: "available",
    entries: [],
    has_unread: false,
  });
  await client.acknowledgeBulletin({
    acknowledge: "system_notifications",
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    expectedRevision: BULLETIN_RESULT.revision,
    idempotencyKey: IDEMPOTENCY_KEY,
  });
  assert.deepEqual(JSON.parse(calls[1] ?? "{}"), {
    farm_human_key: FARM_HUMAN_KEY,
    expected_farm_doorplate: FARM_DOORPLATE,
    expected_bulletin_revision: BULLETIN_RESULT.revision,
    idempotency_key: IDEMPOTENCY_KEY,
  });
});

test("farm bulletin client rejects a response bound to another doorplate", async () => {
  const client = createClient(async () =>
    Response.json({
      ...BULLETIN_RESULT,
      subject: { farm_doorplate: "DEF567" },
    }),
  );

  await assert.rejects(
    client.readBulletin({ farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY }),
    FarmHumanBulletinContractUnavailableError,
  );
});

test("farm bulletin client accepts a structured unavailable projection section", async () => {
  const client = createClient(async () =>
    Response.json({
      ...BULLETIN_RESULT,
      data: {
        available: {
          tasks: [],
          messages: [],
          ranch_notifications: [],
        },
        unavailable: {
          mature_plots: {
            reason: "invalid_projection",
            message: "地块纯投影没有可供叮咚播报读取的成熟状态。",
          },
        },
        trail: BULLETIN_RESULT.data.trail,
      },
    }),
  );

  const result = await client.readBulletin({
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
  });
  assert.equal(result.data.unavailable.mature_plots?.reason, "invalid_projection");
});

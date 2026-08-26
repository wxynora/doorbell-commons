import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmHumanBulletinClient,
  FarmHumanBulletinContractUnavailableError,
} from "./farm-bulletin-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-bulletin-human-key";

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
  },
  revision: `farm-bulletin-v1:${"a".repeat(64)}`,
  server_time: "2026-08-25T04:00:00.000Z",
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
      },
    }),
  );

  const result = await client.readBulletin({
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
  });
  assert.equal(result.data.unavailable.mature_plots?.reason, "invalid_projection");
});

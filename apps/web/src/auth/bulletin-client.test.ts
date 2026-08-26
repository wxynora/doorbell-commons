/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { getBoundBulletin } from "./bulletin-client";

const BULLETIN_RESULT = {
  subject: { farm_doorplate: "ABC234" },
  data: {
    available: {
      tasks: [],
      mature_plots: [{ plot_id: 2, seed_type: "fantasy", watered: 0 }],
      messages: [
        {
          id: "message-1",
          author_farm_doorplate: "DEF567",
          author_name: "访客",
          text: "来看看吧",
          at: "2026-08-25T03:59:00.000Z",
        },
      ],
      ranch_notifications: [],
    },
    unavailable: {},
  },
  revision: `farm-bulletin-v1:${"b".repeat(64)}`,
  server_time: "2026-08-25T04:00:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("browser bulletin client uses a same-origin GET and verifies the bound doorplate", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(BULLETIN_RESULT);
  };

  const result = await getBoundBulletin({ expectedFarmDoorplate: "ABC234", fetcher });
  assert.deepEqual(result, { ok: true, data: BULLETIN_RESULT });
  assert.deepEqual(requests, [
    {
      url: "/api/farm/bulletin",
      init: { credentials: "same-origin", method: "GET" },
    },
  ]);
});

test("browser bulletin client rejects a mismatched subject without exposing it as data", async () => {
  const result = await getBoundBulletin({
    expectedFarmDoorplate: "ABC234",
    fetcher: async () =>
      jsonResponse({
        ...BULLETIN_RESULT,
        subject: { farm_doorplate: "DEF567" },
      }),
  });

  assert.deepEqual(result, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
});

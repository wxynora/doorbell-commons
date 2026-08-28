/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import { getBoundGlimmer, getBoundTogether, lingyeIssueMessage } from "./lingye-client";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("Lingye reads use fixed same-origin GET routes without a query", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse({});
  };

  const glimmer = await getBoundGlimmer({ fetcher });
  const together = await getBoundTogether({ fetcher });

  assert.deepEqual(requests, [
    {
      url: "/api/lingye/glimmer",
      init: { credentials: "same-origin", method: "GET" },
    },
    {
      url: "/api/lingye/together",
      init: { credentials: "same-origin", method: "GET" },
    },
  ]);
  assert.deepEqual(glimmer, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
  assert.deepEqual(together, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
});

test("Lingye client keeps transport and malformed responses honest", async () => {
  const unavailable = await getBoundGlimmer({
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "network_unavailable", serverMessage: null },
  });

  const malformedError = await getBoundTogether({
    fetcher: async () => jsonResponse({ error: { code: "not-a-contract", message: "bad" } }, 503),
  });
  assert.deepEqual(malformedError, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
  assert.equal(
    lingyeIssueMessage({ code: "unexpected_response", serverMessage: null }),
    "铃野数据返回了无法识别的数据，请稍后再试。",
  );
});

test("Together read accepts narrative-only authoritative archives", async () => {
  const payload = {
    subject: { farm_doorplate: "3ET3FE" },
    data: {
      story_id: "same_kitchen",
      title: "同一间厨房",
      round: 3,
      phase: "closed",
      status: "本轮已归档",
      stage: { index: 5, total: 5, name: "厨房之后" },
      art_asset_key: "together.same-kitchen-ending-next-door",
      history: [],
      archives: [
        {
          story_id: "same_kitchen",
          title: "同一间厨房",
          round: 2,
          art_asset_key: "together.same-kitchen-ending-next-door",
          history: [
            {
              kind: "story",
              title: "两把一样的钥匙",
              text: "桥下厨房重新开门。",
              art_asset_key: "together.same-kitchen-opening",
            },
            {
              kind: "ending",
              title: "隔壁开门",
              text: "两边都按自己的时间开门。",
              art_asset_key: "together.same-kitchen-ending-next-door",
            },
          ],
        },
      ],
      current_task: null,
      current_choice: null,
      cooldown: null,
      ending: null,
      clues: [],
    },
    server_time: "2026-08-26T14:00:00.000Z",
  };

  assert.deepEqual(await getBoundTogether({ fetcher: async () => jsonResponse(payload) }), {
    ok: true,
    data: payload,
  });
});

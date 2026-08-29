import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmLingyeClient,
  FarmLingyeContractUnavailableError,
  FarmLingyeCredentialInvalidError,
  FarmLingyeNotFoundError,
  FarmLingyeUnavailableError,
} from "./farm-lingye-client.js";

const FARM_DOORPLATE = "3ET3FE";
const FARM_HUMAN_KEY = "private-farm-human-key";
const INPUT = { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY };

const GLIMMER_RESULT = {
  subject: { farm_doorplate: FARM_DOORPLATE },
  data: {
    open: true,
    status: "流光原野开放中",
    season: "夏",
    capture_cooldown: null,
    tracks: [
      {
        revealed: true,
        variant: {
          id: "duck_peach",
          name: "蜜桃鸭",
          atlas: "glimmer.variants",
          set: 2,
          sprite_index: 1,
        },
      },
      { revealed: false, variant: null },
    ],
    cooperation: {
      event: { id: "star_lamp", name: "点亮旧星灯", requirement: "一份食材" },
      progress: { current: 2, target: 3 },
      completed: false,
    },
    events: [{ at: "2026-08-24T13:00:00.000Z", text: "第二家农场补上了一份食材" }],
    variants: [
      {
        id: "duck_peach",
        name: "蜜桃鸭",
        atlas: "glimmer.variants",
        set: 2,
        sprite_index: 1,
        unlocked: true,
      },
    ],
    encounters: [{ id: "glimmer_spring", name: "流光泉", seen: true }],
    summary: { encounters: 1, variants: 1, cooperations: 0 },
    achievements: [
      {
        id: "glimmer-encounters-1",
        name: "门票不能白买",
        progress: { current: 1, target: 1 },
        rewarded: true,
        reward: { coins: 100, silver: 20 },
      },
    ],
  },
  server_time: "2026-08-24T13:00:00.000Z",
};

const TOGETHER_RESULT = {
  subject: { farm_doorplate: FARM_DOORPLATE },
  data: {
    story_id: "river_from_tomorrow",
    title: "河从明天流来",
    round: 1,
    phase: "choice",
    status: "等待第 1/6 次全服选择",
    stage: { index: 1, total: 6, name: "逆流而来的船" },
    art_asset_key: "together.river-from-tomorrow-opening",
    history: [{ kind: "story", title: "逆流而来的船", text: "旧沟里出现了逆流。" }],
    archives: [],
    current_task: null,
    current_choice: {
      index: 1,
      title: "先处理眼前的船",
      options: [
        { key: "A", label: "先把小水獭救上岸" },
        { key: "B", label: "先拆开湿信查看内容" },
        { key: "C", label: "先系住船，记录河水变化" },
      ],
      counts: { A: 1, B: 0, C: 0 },
    },
    cooldown: null,
    ending: null,
    clues: [
      {
        id: "same_kitchen:1:letter_encounter",
        title: "两封信为什么没有送到",
        text: "两封信分别去了错误的旧址和码头。",
      },
    ],
  },
  server_time: "2026-08-24T13:00:00.000Z",
};

function createClient(fetchImplementation: typeof fetch): FarmLingyeClient {
  return new FarmLingyeClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("farm Lingye client posts fixed Glimmer and Together contracts with server-only binding", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(calls.length === 1 ? GLIMMER_RESULT : TOGETHER_RESULT);
  });

  assert.deepEqual(await client.readGlimmer(INPUT), GLIMMER_RESULT);
  assert.deepEqual(await client.readTogether(INPUT), TOGETHER_RESULT);
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
        url: "https://farm.example/farm/internal/doorbell/human/glimmer/read",
      },
      {
        body: JSON.stringify({
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/together/read",
      },
    ],
  );
});

test("farm Lingye client rejects an invalid round-scoped Together clue id", async () => {
  const invalid = {
    ...TOGETHER_RESULT,
    data: {
      ...TOGETHER_RESULT.data,
      clues: [
        {
          ...TOGETHER_RESULT.data.clues[0],
          id: "same_kitchen:0:letter_encounter",
        },
      ],
    },
  };

  await assert.rejects(
    createClient(async () => Response.json(invalid)).readTogether(INPUT),
    FarmLingyeContractUnavailableError,
  );
});

test("farm Lingye client rejects malformed or unsafe structured payloads", async () => {
  const readInvalid = async (payload: unknown) =>
    await createClient(async () => Response.json(payload)).readTogether(INPUT);

  await assert.rejects(
    readInvalid({
      ...TOGETHER_RESULT,
      data: { ...TOGETHER_RESULT.data, art_asset_key: "https://evil.example/story.html" },
    }),
    FarmLingyeContractUnavailableError,
  );
  await assert.rejects(
    readInvalid({
      ...TOGETHER_RESULT,
      data: {
        ...TOGETHER_RESULT.data,
        history: [{ kind: "story", title: "<img src=x>", text: "旧沟" }],
      },
    }),
    FarmLingyeContractUnavailableError,
  );
  await assert.rejects(
    readInvalid({
      ...TOGETHER_RESULT,
      data: {
        ...TOGETHER_RESULT.data,
        current_task: {
          id: "task-1",
          title: "公开任务",
          text: "不能泄漏 farm id",
          progress: 1,
          target: 3,
          farm_id: "private-farm-id",
        },
      },
    }),
    FarmLingyeContractUnavailableError,
  );
  await assert.rejects(
    readInvalid({ ...TOGETHER_RESULT, unexpected: true }),
    FarmLingyeContractUnavailableError,
  );
});

test("farm Lingye client requires the authoritative Glimmer capture cooldown fact", async () => {
  const coolingDown = {
    ...GLIMMER_RESULT,
    data: {
      ...GLIMMER_RESULT.data,
      capture_cooldown: { ready_at: "2026-08-24T13:10:00.000Z" },
    },
  };
  assert.deepEqual(
    await createClient(async () => Response.json(coolingDown)).readGlimmer(INPUT),
    coolingDown,
  );

  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...GLIMMER_RESULT,
        data: { ...GLIMMER_RESULT.data, capture_cooldown: undefined },
      }),
    ).readGlimmer(INPUT),
    FarmLingyeContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({
        ...GLIMMER_RESULT,
        data: { ...GLIMMER_RESULT.data, capture_cooldown: { ready_at: "soon" } },
      }),
    ).readGlimmer(INPUT),
    FarmLingyeContractUnavailableError,
  );
});

test("farm Lingye client rejects a success response for another farm", async () => {
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...GLIMMER_RESULT, subject: { farm_doorplate: "OTHER1" } }),
    ).readGlimmer(INPUT),
    FarmLingyeContractUnavailableError,
  );
  await assert.rejects(
    createClient(async () =>
      Response.json({ ...TOGETHER_RESULT, subject: { farm_doorplate: "OTHER1" } }),
    ).readTogether(INPUT),
    FarmLingyeContractUnavailableError,
  );
});

test("farm Lingye client accepts the real reopen vote without a story-stage index", async () => {
  const voteResult = {
    ...TOGETHER_RESULT,
    data: {
      ...TOGETHER_RESULT.data,
      phase: "vote",
      status: "等待全服决定是否重新开启",
      current_choice: {
        index: null,
        title: "是否重新开启《河从明天流来》？",
        options: [
          { key: "A", label: "开启新一轮" },
          { key: "B", label: "保留本轮结局" },
        ],
        counts: null,
      },
    },
  };
  const client = createClient(async () => Response.json(voteResult));

  assert.deepEqual(await client.readTogether(INPUT), voteResult);
});

test("farm Lingye client maps credential, missing-farm, contract, timeout, network, and 5xx failures", async () => {
  const serviceError = (code: string, status: number) =>
    Response.json({ error: { code, message: "upstream error" } }, { status });
  const readGlimmer = (response: () => Promise<Response>) =>
    createClient(response).readGlimmer(INPUT);

  for (const code of ["farm_credential_not_found", "farm_doorplate_mismatch"]) {
    await assert.rejects(
      readGlimmer(async () => serviceError(code, 409)),
      FarmLingyeCredentialInvalidError,
    );
  }
  await assert.rejects(
    readGlimmer(async () => serviceError("farm_not_found", 404)),
    FarmLingyeNotFoundError,
  );
  await assert.rejects(
    readGlimmer(async () => new Response("<html>bad gateway</html>", { status: 502 })),
    FarmLingyeContractUnavailableError,
  );
  await assert.rejects(
    readGlimmer(async () => serviceError("farm_unavailable", 503)),
    FarmLingyeUnavailableError,
  );
  await assert.rejects(
    readGlimmer(async () => new Response("upstream timeout", { status: 504 })),
    FarmLingyeUnavailableError,
  );
  await assert.rejects(
    readGlimmer(async () => {
      throw new Error("offline");
    }),
    FarmLingyeUnavailableError,
  );
});

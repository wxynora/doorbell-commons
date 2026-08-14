import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  FarmDirectoryClient,
  FarmDirectoryUnavailableError,
  FarmHumanCredentialInvalidError,
  FarmNotFoundError,
  FarmNotPubliclyReadableError,
  FarmUpstreamContractUnavailableError,
} from "./farm-directory-client.js";

interface FakeFarmServer {
  baseUrl: string;
  paths: string[];
  requests: Array<{ body: string; method: string; path: string }>;
  close(): Promise<void>;
}

async function startFakeFarmServer(
  responseForRequest: (request: { body: string; method: string; path: string }) => {
    statusCode: number;
    body: unknown;
    contentType?: string;
    delayMs?: number;
    headers?: Record<string, string>;
  },
): Promise<FakeFarmServer> {
  const paths: string[] = [];
  const requests: Array<{ body: string; method: string; path: string }> = [];
  const server = createServer(async (request, response) => {
    const path = request.url ?? "";
    paths.push(path);
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const received = {
      body: Buffer.concat(chunks).toString("utf8"),
      method: request.method ?? "GET",
      path,
    };
    requests.push(received);
    const result = responseForRequest(received);
    if (result.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    }
    const contentType = result.contentType ?? "application/json";
    response.writeHead(result.statusCode, {
      "content-type": contentType,
      ...result.headers,
    });
    response.end(contentType === "application/json" ? JSON.stringify(result.body) : result.body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    baseUrl: `http://127.0.0.1:${address.port}/farm/`,
    paths,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

function createFarmDirectoryClient(baseUrl: string, requestTimeoutMs = 1_000) {
  return new FarmDirectoryClient({ apiBaseUrl: baseUrl, requestTimeoutMs });
}

test("farm directory uses the existing read-only visit contract and returns id and name", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 200,
    body: {
      ok: true,
      text: "public visit",
      farm: { id: "3ET3FE", name: "渡的小农场", plots: [] },
    },
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    assert.deepEqual(await client.lookupFarm("3ET3FE"), {
      farmDoorplate: "3ET3FE",
      farmName: "渡的小农场",
    });
    assert.deepEqual(fakeFarm.paths, ["/farm/c?a=visit&farm=3ET3FE&detail=true"]);
  } finally {
    await fakeFarm.close();
  }
});

const FARM_HUMAN_KEY = "private-farm-human-key";

function farmIdentityHtml(
  farmDoorplate = "3ET3FE",
  farmName = "渡&amp;小农场",
  aiName = "小渡",
  humanName = "辛玥",
): string {
  return `<!doctype html>
    <html><head><title>farm</title></head><body>
      <div class="plaque">
        <h1>✍️ TA的农场</h1>
        <div class="tags"><span class="tag">🏠 门牌号 <b>${farmDoorplate}</b></span></div>
      </div>
      <form method="post" action="/farm/ui/${FARM_HUMAN_KEY}/ta/names">
        <label>农场名 <input name="farmName" value="${farmName}" required></label>
        <label>AI 昵称 <input name="aiName" value="${aiName}"></label>
        <label>你的昵称 <input name="humanName" value="${humanName}"></label>
      </form>
    </body></html>`;
}

test("farm human credential lookup parses the exact TA identity contract", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 200,
    body: farmIdentityHtml(),
    contentType: "text/html; charset=utf-8",
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    assert.deepEqual(await client.lookupFarmByHumanKey(FARM_HUMAN_KEY), {
      aiName: "小渡",
      farmDoorplate: "3ET3FE",
      farmName: "渡&小农场",
      humanName: "辛玥",
    });
    assert.deepEqual(fakeFarm.paths, [`/farm/ui/${FARM_HUMAN_KEY}/ta`]);
  } finally {
    await fakeFarm.close();
  }
});

test("farm human credential lookup separates invalid keys from a broken HTML contract", async () => {
  let mode: "invalid" | "broken" = "invalid";
  const fakeFarm = await startFakeFarmServer(() =>
    mode === "invalid"
      ? { statusCode: 404, body: "invalid", contentType: "text/html" }
      : {
          statusCode: 200,
          body: farmIdentityHtml().replace("🏠 门牌号", "门牌号说明"),
          contentType: "text/html",
        },
  );
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    await assert.rejects(
      client.lookupFarmByHumanKey(FARM_HUMAN_KEY),
      FarmHumanCredentialInvalidError,
    );
    mode = "broken";
    await assert.rejects(
      client.lookupFarmByHumanKey(FARM_HUMAN_KEY),
      FarmUpstreamContractUnavailableError,
    );
  } finally {
    await fakeFarm.close();
  }
});

test("farm human page proxy removes the key and separates Glimmer and Together navigation", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 200,
    body: `<a href="/farm/ui/${FARM_HUMAN_KEY}/market?tab=sell">集市</a>
      <a href="/farm/ui/${FARM_HUMAN_KEY}/glimmer">流光原野</a>
      <a href="/farm/ui/${FARM_HUMAN_KEY}/together">铃野共行</a>
      <form method="post" action="/farm/ui/${FARM_HUMAN_KEY}/harvest"></form>`,
    contentType: "text/html",
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    const page = await client.readFarmHumanPage(FARM_HUMAN_KEY, "", new URLSearchParams());
    assert.match(page.html, /href="\/api\/farm\/ui\/market\?tab=sell"/);
    assert.match(page.html, /href="\/api\/lingye-glimmer"/);
    assert.match(page.html, /href="\/api\/lingye-together"/);
    assert.match(page.html, /action="\/api\/farm\/ui\/harvest"/);
    assert.doesNotMatch(page.html, new RegExp(FARM_HUMAN_KEY));
  } finally {
    await fakeFarm.close();
  }
});

test("farm human action forwards only the supplied form and rewrites its 303 location", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 303,
    body: "",
    contentType: "text/html",
    headers: { location: `/farm/ui/${FARM_HUMAN_KEY}/ranch?flash=done` },
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    const redirect = await client.submitFarmHumanAction(
      FARM_HUMAN_KEY,
      "ranch/feed",
      new URLSearchParams({ animal: "cow" }),
    );
    assert.deepEqual(redirect, { location: "/api/farm/ui/ranch?flash=done" });
    assert.deepEqual(fakeFarm.requests, [
      {
        method: "POST",
        path: `/farm/ui/${FARM_HUMAN_KEY}/ranch/feed`,
        body: "animal=cow",
      },
    ]);
  } finally {
    await fakeFarm.close();
  }
});

test("farm overview maps only the existing public visit-detail fields", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 200,
    body: {
      ok: true,
      text: "public visit",
      farm: {
        id: "3ET3FE",
        name: "渡的小农场",
        plots: [
          { id: 1, state: "ripe", seedType: "common", watered: 2 },
          { id: 2, state: "empty", seedType: null, watered: 0 },
        ],
      },
    },
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    assert.deepEqual(await client.readFarmOverview("3ET3FE"), {
      farmDoorplate: "3ET3FE",
      farmName: "渡的小农场",
      plots: [
        { plotId: 1, state: "ripe", seedType: "common", watered: 2 },
        { plotId: 2, state: "empty", seedType: null, watered: 0 },
      ],
    });
    assert.deepEqual(fakeFarm.paths, ["/farm/c?a=visit&farm=3ET3FE&detail=true"]);
  } finally {
    await fakeFarm.close();
  }
});

test("farm overview distinguishes a closed public farm from an unavailable or malformed upstream", async () => {
  let mode: "closed" | "malformed" = "closed";
  const fakeFarm = await startFakeFarmServer(() =>
    mode === "closed"
      ? { statusCode: 403, body: { ok: false, text: "closed" } }
      : {
          statusCode: 200,
          body: {
            ok: true,
            farm: {
              id: "3ET3FE",
              name: "渡的小农场",
              plots: [{ id: 1, state: "unknown", seedType: null, watered: 0 }],
            },
          },
        },
  );
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    await assert.rejects(client.readFarmOverview("3ET3FE"), FarmNotPubliclyReadableError);
    mode = "malformed";
    await assert.rejects(client.readFarmOverview("3ET3FE"), FarmDirectoryUnavailableError);
  } finally {
    await fakeFarm.close();
  }
});

test("farm directory recognizes only the visit contract's exact missing-farm response", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 400,
    body: { ok: false, text: "找不到农场 3ET3FE" },
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmNotFoundError);
  } finally {
    await fakeFarm.close();
  }
});

test("farm directory does not guess missing-farm semantics from similar Chinese text", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 400,
    body: { ok: false, text: "找不到农场：3ET3FE" },
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmDirectoryUnavailableError);
  } finally {
    await fakeFarm.close();
  }
});

test("a stalled farm directory request is aborted as unavailable", async () => {
  const fakeFarm = await startFakeFarmServer(() => ({
    statusCode: 200,
    delayMs: 100,
    body: {
      ok: true,
      farm: { id: "3ET3FE", name: "渡的小农场", plots: [] },
    },
  }));
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl, 20);
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmDirectoryUnavailableError);
  } finally {
    await fakeFarm.close();
  }
});

test("farm directory treats upstream failures and malformed farm records as unavailable", async () => {
  let mode: "failure" | "malformed" = "failure";
  const fakeFarm = await startFakeFarmServer(() =>
    mode === "failure"
      ? { statusCode: 500, body: { ok: false, text: "upstream failure" } }
      : { statusCode: 200, body: { ok: true, farm: { id: "OTHER", name: 123 } } },
  );
  try {
    const client = createFarmDirectoryClient(fakeFarm.baseUrl);
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmDirectoryUnavailableError);
    mode = "malformed";
    await assert.rejects(client.lookupFarm("3ET3FE"), FarmDirectoryUnavailableError);
  } finally {
    await fakeFarm.close();
  }
});

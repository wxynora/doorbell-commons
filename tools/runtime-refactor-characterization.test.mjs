import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-runtime-refactor-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "runtime-refactor-test-token";
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const distDirectory = fileURLToPath(new URL("../dist/", import.meta.url));

function runtimeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeFiles(path);
    if (!entry.isFile() || !entry.name.endsWith(".js")) return [];
    // index.js is the executable entrypoint: importing it would intentionally
    // load a world and bind a real port. Reusable runtime modules stay covered.
    return path === join(distDirectory, "index.js") ? [] : [path];
  });
}

const game = await import("../dist/game.js");
const engine = await import("../dist/engine.js");
const store = await import("../dist/store.js");
const server = await import("../dist/server.js");
const web = await import("../dist/web.js");

const NOW = Date.parse("2026-08-21T12:00:00+08:00");

test("all reusable runtime modules remain importable", async () => {
  const files = runtimeFiles(distDirectory).sort();
  assert.ok(files.length >= 20, "expected the farm runtime module set");
  for (const file of files) {
    const module = await import(pathToFileURL(file).href);
    assert.equal(typeof module, "object", file);
  }
});

test("Human page facade keeps representative exports and page landmarks", () => {
  for (const name of [
    "uiHome",
    "uiMessages",
    "uiMarket",
    "uiGlimmer",
    "uiRanch",
    "uiCooking",
    "uiTa",
    "uiTogether",
    "uiExpedition",
    "uiCodex",
    "uiLeaderboard",
    "uiInvalid",
  ]) {
    assert.equal(typeof web[name], "function", name);
  }

  const farm = game.makeFarm("拆分测试农场", 123456, {
    aiName: "测试小机",
    humanName: "测试伴侣",
  });
  farm.id = "WEB234";
  farm.humanKey = "human-web-test";
  store.insertFarm(farm);

  const home = web.uiHome(farm, NOW, farm.humanKey);
  assert.match(home, /<title>拆分测试农场 · 田园标本馆<\/title>/);
  assert.match(home, /class="brand">🌾 田园标本馆/);
  assert.match(home, /\/ui\/human-web-test\/ranch/);
  assert.match(home, /<div class="ring">/);
  assert.match(home, /<div class="plots"/);
  assert.match(home, /action="[^\"]*\/ui\/human-web-test\/harvest"/);
  assert.match(home, /href="[^\"]*\/ui\/human-web-test\/leaderboard"/);

  const market = web.uiMarket(farm, [farm], NOW, farm.humanKey);
  assert.match(market, /<div id="marketPage">/);
  assert.match(market, /<h1>🧺 铃野集市<\/h1>/);
  assert.match(market, /data-market-async/);

  engine.ensureRanch(farm).animals.push({
    kindId: "chicken",
    ticksSinceProduce: 0,
    pending: 0,
    level: 1,
  });
  const ranch = web.uiRanch(farm, NOW, farm.humanKey);
  assert.match(ranch, /<div id="ranchPage">/);
  assert.match(ranch, /<h1>🐮 我的牧场<\/h1>/);
  assert.match(ranch, /可收产出值/);
  assert.match(ranch, /action="[^\"]*\/ui\/human-web-test\/ranch\/collect"/);
  assert.match(ranch, /action="[^\"]*\/ui\/human-web-test\/ranch\/remit"/);
  assert.match(ranch, /window\.__farmRanchAsync/);
  assert.match(ranch, /fetch\(form\.action,\{method:"POST"/);

  const cooking = web.uiCooking(farm, NOW, farm.humanKey);
  assert.match(cooking, /<h1>🍳 料理台<\/h1>/);
  assert.match(cooking, /data-open-recipes/);
  assert.match(cooking, /cookingSilverBalance/);
  assert.match(cooking, /<div class="cook-stage" id="cookStage"/);
  assert.match(cooking, /action="[^\"]*\/ui\/human-web-test\/cooking\/cook" id="cookForm"/);
  assert.match(cooking, /data-cooking-async/);
  assert.match(cooking, /id="cookingPantry"/);
  assert.match(cooking, /id="cookingDishes"/);

  const expedition = web.uiExpedition(farm, NOW, farm.humanKey);
  assert.match(expedition, /<title>拆分测试农场 · 探险<\/title>/);
  assert.match(expedition, /<h1>🗺️ 探险<\/h1>/);
  assert.match(expedition, /action="[^\"]*\/ui\/human-web-test\/expedition\/charm"/);
  assert.match(expedition, /name="kind" value="check"/);
  assert.match(expedition, /<h2 style="margin:6px 0">📔 秘境图鉴<\/h2>/);

  farm.codex.wheat = { bestQuality: 1, count: 1, firstAt: NOW };
  const codex = web.uiCodex(farm, NOW, farm.humanKey);
  assert.match(codex, /<title>拆分测试农场 · 图鉴册<\/title>/);
  assert.match(codex, /<h1>📖 图鉴册<\/h1>/);
  assert.match(codex, /<div class="codexnav">/);
  for (const section of ["favorites", "common", "fantasy", "limited", "originals", "mine"]) {
    assert.match(codex, new RegExp(`<section id="${section}">`), section);
  }
  assert.match(codex, /action="[^\"]*\/ui\/human-web-test\/codex\/star"/);
  assert.match(codex, /data-detail[^>]*data-name="小麦"/);
  assert.match(codex, /<div class="mback" id="mb">/);

  const leaderboard = web.uiLeaderboard(farm, NOW, farm.humanKey);
  assert.match(leaderboard, /<title>拆分测试农场 · 全服排行榜<\/title>/);
  assert.match(leaderboard, /<h1>🏆 全服排行榜<\/h1>/);
  assert.match(leaderboard, /💰 财富榜/);
  assert.match(leaderboard, /📖 收集榜/);
  assert.match(leaderboard, /<h1>📅 今日榜<\/h1>/);
  assert.match(leaderboard, /data-copy="WEB234"/);
  assert.match(leaderboard, /<div id="ugcDisc"/);
  assert.match(leaderboard, /id="ugcReroll"/);
  assert.match(leaderboard, /id="farmProfile"/);
});

test("representative dispatch actions preserve result shape and core state", () => {
  const farm = game.makeFarm("动作测试农场", 654321, {
    aiName: "动作小机",
    humanName: "动作伴侣",
  });
  farm.id = "ACT234";

  const status = game.dispatch(farm, { action: "status" }, NOW);
  assert.equal(status.ok, true);
  assert.equal(typeof status.text, "string");
  assert.match(status.text, /动作测试农场/);

  const coinsBeforePlant = farm.coins;
  const planted = game.dispatch(farm, { action: "plant", common: 1 }, NOW);
  assert.equal(planted.ok, true);
  assert.equal(typeof planted.text, "string");
  assert.equal(farm.plots.filter((plot) => plot.crop).length, 1);
  assert.ok(farm.coins < coinsBeforePlant);

  const growingPlot = farm.plots.find((plot) => plot.crop);
  const watered = game.dispatch(farm, { action: "water" }, NOW);
  assert.equal(watered.ok, true);
  assert.match(watered.text, /浇/);
  assert.equal(growingPlot.crop.waterCount, 1);

  growingPlot.crop.ripe = true;
  const coinsBeforeHarvest = farm.coins;
  const harvested = game.dispatch(farm, { action: "harvest" }, NOW);
  assert.equal(harvested.ok, true);
  assert.match(harvested.text, /收获 1 株/);
  assert.equal(growingPlot.crop, null);
  assert.ok(farm.coins > coinsBeforeHarvest);
  assert.equal(farm.harvested, 1);
  assert.equal(Object.keys(farm.codex).length, 1);

  const market = game.dispatch(farm, { action: "market" }, NOW);
  assert.deepEqual(Object.keys(market).sort(), ["ok", "text"]);
  assert.equal(market.ok, true);
  assert.match(market.text, /摊位/);

  const kitchen = game.dispatch(farm, { action: "kitchen" }, NOW);
  assert.deepEqual(Object.keys(kitchen).sort(), ["ok", "text"]);
  assert.equal(kitchen.ok, true);
  assert.match(kitchen.text, /料理台/);
  assert.ok(farm.ranch?.kitchen);

  const ranch = engine.ensureRanch(farm);
  ranch.animals.push({ kindId: "chicken", ticksSinceProduce: 0, pending: 0, level: 1 });
  farm.silver = 100;
  const silverBeforeFeed = farm.silver;
  const fed = game.dispatch(farm, { action: "ranch-feed", animal: 0 }, NOW);
  assert.deepEqual(Object.keys(fed).sort(), ["ok", "text"]);
  assert.equal(fed.ok, true);
  assert.match(fed.text, /投喂成功/);
  assert.ok(farm.silver < silverBeforeFeed);
  assert.equal(ranch.animals[0].feedBoostPending, true);
  assert.equal(ranch.feedDaily.n, 1);
});

test("server facade keeps representative Human and legacy Agent routes", async (t) => {
  const realDateNow = Date.now;
  let requestNow = NOW;
  Date.now = () => requestNow;
  t.after(() => {
    Date.now = realDateNow;
  });

  const farm = game.makeFarm("路由测试农场", 246810, {
    aiName: "路由小机",
    humanName: "路由伴侣",
  });
  farm.id = "HTTP23";
  farm.humanKey = "human-route-test";
  farm.agentKey = "agent-route-test";
  store.insertFarm(farm);

  const httpServer = server.startServer(0);
  await once(httpServer, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const publicAsset = await fetch(`${baseUrl}/assets/animal-codex-atlas.png`);
  assert.equal(publicAsset.status, 200);
  assert.equal(publicAsset.headers.get("content-type"), "image/png");
  assert.equal(publicAsset.headers.get("cache-control"), "public, max-age=86400");
  assert.ok((await publicAsset.arrayBuffer()).byteLength > 0);

  const cookingAsset = await fetch(`${baseUrl}/assets/cooking/cooking-pot.webp`);
  assert.equal(cookingAsset.status, 200);
  assert.equal(cookingAsset.headers.get("content-type"), "image/webp");
  assert.equal(cookingAsset.headers.get("cache-control"), "public, max-age=86400");
  assert.ok((await cookingAsset.arrayBuffer()).byteLength > 0);

  const missingAsset = await fetch(`${baseUrl}/assets/unknown-runtime-asset.png`);
  assert.equal(missingAsset.status, 400);
  assert.match(missingAsset.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await missingAsset.json(), {
    ok: false,
    text: "这条路走不通：/assets/unknown-runtime-asset.png（GET / 看玩法）",
  });

  const syncPage = await fetch(`${baseUrl}/sync`);
  assert.equal(syncPage.status, 200);
  assert.match(syncPage.headers.get("content-type") ?? "", /^text\/html/);
  const syncHtml = await syncPage.text();
  assert.match(syncHtml, /<title>把农场带来<\/title>/);
  assert.match(syncHtml, /<form id="form">/);
  assert.match(syncHtml, /fetch\('\.\/sync\/register'/);

  const home = await fetch(`${baseUrl}/ui/${farm.humanKey}`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /路由测试农场 · 田园标本馆/);

  const market = await fetch(`${baseUrl}/ui/${farm.humanKey}/market`);
  assert.equal(market.status, 200);
  assert.match(await market.text(), /<h1>🧺 铃野集市<\/h1>/);

  const status = await fetch(`${baseUrl}/a/${farm.agentKey}/status`);
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.ok, true);
  assert.equal(typeof statusBody.text, "string");
  assert.match(statusBody.text, /路由测试农场/);

  const toolsList = await fetch(`${baseUrl}/mcp/${farm.agentKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "tools", method: "tools/list" }),
  });
  assert.equal(toolsList.status, 200);
  const toolsEnvelope = await toolsList.json();
  assert.equal(toolsEnvelope.jsonrpc, "2.0");
  assert.equal(toolsEnvelope.id, "tools");
  assert.equal(toolsEnvelope.error, undefined);
  assert.equal(toolsEnvelope.result.tools.length, 1);
  assert.equal(toolsEnvelope.result.tools[0].name, "farm");
  assert.deepEqual(toolsEnvelope.result.tools[0].inputSchema.required, ["action"]);

  const callFarm = async (id, action) => {
    const response = await fetch(`${baseUrl}/mcp/${farm.agentKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "farm", arguments: { action } },
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };

  const firstHelp = await callFarm("first-help", "help");
  assert.equal(firstHelp.jsonrpc, "2.0");
  assert.equal(firstHelp.id, "first-help");
  assert.equal(firstHelp.result.isError, false);
  assert.equal(firstHelp.result.content[0].type, "text");
  assert.match(firstHelp.result.content[0].text, /🌾 完整动作表/);
  assert.match(firstHelp.result.content[0].text, /路由测试农场/);

  const immediateHelp = await callFarm("immediate-help", "help");
  assert.match(immediateHelp.result.content[0].text, /🌾 完整动作表/);
  assert.doesNotMatch(immediateHelp.result.content[0].text, /路由测试农场/);

  requestNow += 10 * 60 * 1000;
  const idleHelp = await callFarm("idle-help", "help");
  assert.match(idleHelp.result.content[0].text, /🌾 完整动作表/);
  assert.match(idleHelp.result.content[0].text, /路由测试农场/);

  const mcpStatus = await callFarm("farm-status", "status");
  assert.equal(mcpStatus.jsonrpc, "2.0");
  assert.equal(mcpStatus.id, "farm-status");
  assert.equal(mcpStatus.error, undefined);
  assert.equal(mcpStatus.result.isError, false);
  assert.deepEqual(Object.keys(mcpStatus.result.content[0]).sort(), ["text", "type"]);
  assert.equal(mcpStatus.result.content[0].type, "text");
  assert.match(mcpStatus.result.content[0].text, /路由测试农场/);
  assert.equal(mcpStatus.result.content[0].text.match(/路由测试农场/g)?.length, 1);

  const notification = await fetch(`${baseUrl}/mcp/${farm.agentKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");

  const unauthorizedDoorbell = await fetch(
    `${baseUrl}/internal/doorbell/farm-actions/execute`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(unauthorizedDoorbell.status, 401);
  const unauthorizedBody = await unauthorizedDoorbell.json();
  assert.equal(unauthorizedBody.ok, false);
  assert.equal(unauthorizedBody.error.code, "authentication_required");

  const leaderboard = await fetch(`${baseUrl}/leaderboard`);
  assert.equal(leaderboard.status, 200);
  const leaderboardBody = await leaderboard.json();
  assert.equal(leaderboardBody.ok, true);
  assert.equal(typeof leaderboardBody.text, "string");
});

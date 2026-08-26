import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-server-execution-refactor-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const { makeFarm } = await import("../dist/game.js");
const { insertFarm } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

const NOW = Date.parse("2026-07-15T12:00:00+08:00");

function addFarm(id, agentKey, name = `执行护栏-${id}`) {
  const farm = makeFarm(name, 13579, {
    aiName: `${name}小机`,
    humanName: `${name}伴侣`,
  });
  farm.id = id;
  farm.agentKey = agentKey;
  farm.lastTickAt = NOW;
  insertFarm(farm);
  return farm;
}

async function requestJson(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() };
}

function postJson(baseUrl, path, body) {
  return requestJson(baseUrl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("server execution keeps public ordering, authentication, route parity, run flags, and cross-farm notice settlement", async (t) => {
  const realDateNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => NOW;
  Math.random = () => 0.99;
  t.after(() => {
    Date.now = realDateNow;
    Math.random = realRandom;
  });

  const owner = addFarm("EXEC23", "execution-owner-key", "执行主人");
  const target = addFarm("CROSS4", "execution-target-key", "执行邻居");
  const routeA = addFarm("ROUTE5", "execution-route-a", "同路由农场");
  const routeB = addFarm("ROUTE6", "execution-route-b", "同路由农场");
  const runFarm = addFarm("RUN789", "execution-run-key", "显式开关农场");

  const server = startServer(0);
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Public actions settle before the private-owner token gate.
  const help = await requestJson(baseUrl, `/farms/${target.id}/help`);
  assert.equal(help.response.status, 200);
  assert.equal(help.body.ok, true);
  assert.match(help.body.text, /🌾 你的农场/);

  const visit = await requestJson(baseUrl, `/farms/${target.id}/visit?by=${owner.id}`);
  assert.equal(visit.response.status, 200);
  assert.equal(visit.body.ok, true);
  assert.match(visit.body.text, /执行邻居/);
  assert.deepEqual(owner.visitedIds, [target.id]);

  const ownerOnly = await requestJson(baseUrl, `/farms/${owner.id}/status`);
  assert.equal(ownerOnly.response.status, 401);
  assert.deepEqual(ownerOnly.body, {
    ok: false,
    text: "这是私有操作，需要你农场的 token。串门看公开页用 visit（GET /c?a=visit&farm=对方id）。",
  });

  const rejectedCross = await postJson(baseUrl, `/farms/${target.id}/message`, {
    by: owner.id,
    token: target.token,
    text: "不该写入",
  });
  assert.equal(rejectedCross.response.status, 403);
  assert.equal(rejectedCross.body.ok, false);
  assert.equal(target.messages.length, 0);

  const selfWater = await postJson(baseUrl, `/farms/${owner.id}/water`, {
    by: owner.id,
    token: owner.token,
  });
  assert.equal(selfWater.response.status, 400);
  assert.equal(selfWater.body.ok, false);
  assert.match(selfWater.body.text, /不能把串门动作对自己使用/);

  // The key-bound /a route and old /farms token route execute the same action.
  const viaKey = await postJson(baseUrl, `/a/${routeA.agentKey}/guestbook`, { on: false });
  const viaToken = await postJson(baseUrl, `/farms/${routeB.id}/guestbook`, {
    token: routeB.token,
    on: false,
  });
  assert.equal(viaKey.response.status, 200);
  assert.equal(viaToken.response.status, 200);
  assert.deepEqual(Object.keys(viaKey.body).sort(), ["ok", "text"]);
  assert.deepEqual(Object.keys(viaToken.body).sort(), ["ok", "text"]);
  assert.equal(viaKey.body.ok, true);
  assert.equal(viaToken.body.ok, true);
  assert.match(viaKey.body.text, /^留言板已关闭\n/);
  assert.match(viaToken.body.text, /^留言板已关闭\n/);
  assert.equal(routeA.guestbook, false);
  assert.equal(routeB.guestbook, false);

  // HTTP defaults must not overwrite explicit false values.
  const explicitFalse = await postJson(baseUrl, `/a/${runFarm.agentKey}/run`, {
    plant: { common: 1 },
    water: false,
    harvest: false,
    harvestAfter: false,
  });
  assert.equal(explicitFalse.response.status, 200);
  assert.equal(explicitFalse.body.ok, true);
  assert.match(explicitFalse.body.text, /【补种】/);
  assert.doesNotMatch(explicitFalse.body.text, /【浇水】|【加速】|【收获/);
  const planted = runFarm.plots.filter((plot) => plot.crop);
  assert.equal(planted.length, 1);
  assert.equal(planted[0].crop.waterCount, 0);
  assert.equal(planted[0].crop.ripe, false);

  // A real cross-farm write persists the target notice; public reads do not consume it.
  const message = await postJson(baseUrl, `/farms/${target.id}/message`, {
    by: owner.id,
    token: owner.token,
    text: "拆完也要记得浇水",
  });
  assert.equal(message.response.status, 200);
  assert.deepEqual(message.body, {
    ok: true,
    text: `💬 已在「${target.name}」的留言板留言。`,
  });
  assert.equal(target.messages.at(-1)?.by, owner.id);
  assert.equal(target.messages.at(-1)?.text, "拆完也要记得浇水");
  assert.equal(target.inbox?.length, 1);

  const publicHelpAfterMessage = await requestJson(baseUrl, `/farms/${target.id}/help`);
  assert.equal(publicHelpAfterMessage.response.status, 200);
  assert.equal(target.inbox?.length, 1);
  assert.doesNotMatch(publicHelpAfterMessage.body.text, /拆完也要记得浇水/);

  const firstStatus = await requestJson(
    baseUrl,
    `/farms/${target.id}/status?token=${target.token}`,
  );
  assert.equal(firstStatus.response.status, 200);
  assert.match(firstStatus.body.text, /拆完也要记得浇水/);
  assert.deepEqual(target.inbox, []);

  const secondStatus = await requestJson(
    baseUrl,
    `/farms/${target.id}/status?token=${target.token}`,
  );
  assert.equal(secondStatus.response.status, 200);
  assert.doesNotMatch(secondStatus.body.text, /拆完也要记得浇水/);
});

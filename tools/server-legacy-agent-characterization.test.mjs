import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-server-legacy-agent-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const { mintNonce } = await import("../dist/agent.js");
const { makeFarm } = await import("../dist/game.js");
const { insertFarm, save } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

const START = Date.parse("2026-07-16T09:30:00+08:00");
const KEY = "legacy-agent-refactor-key";

function assertAgentHeaders(response) {
  assert.match(response.headers.get("content-type") ?? "", /^text\/html; charset=utf-8$/);
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
}

function actionUrl(baseUrl, key, nonce) {
  return `${baseUrl}/agent/${key}/do?n=${nonce}`;
}

async function executeNonce(baseUrl, key, nonce) {
  return fetch(actionUrl(baseUrl, key, nonce), { redirect: "manual" });
}

test("legacy Agent keeps redirects, one-shot action/flash semantics, TTL boundaries, and migration revocation", async (t) => {
  const realDateNow = Date.now;
  const realRandom = Math.random;
  let requestNow = START;
  Date.now = () => requestNow;
  Math.random = () => 0.99;
  t.after(() => {
    Date.now = realDateNow;
    Math.random = realRandom;
  });

  const farm = makeFarm("旧 Agent 护栏农场", 24680, {
    aiName: "旧页小机",
    humanName: "旧页伴侣",
  });
  farm.id = "AGENT2";
  farm.agentKey = KEY;
  farm.lastTickAt = START;
  insertFarm(farm);

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

  const entry = await fetch(`${baseUrl}/agent/${KEY}`, { redirect: "manual" });
  assert.equal(entry.status, 302);
  assertAgentHeaders(entry);
  const entryLocation = entry.headers.get("location") ?? "";
  assert.match(entryLocation, new RegExp(`^/agent/${KEY}/view\\?v=[0-9a-f-]{8}$`));

  const view = await fetch(new URL(entryLocation, baseUrl));
  assert.equal(view.status, 200);
  assertAgentHeaders(view);
  const viewHtml = await view.text();
  assert.match(viewHtml, /<title>AI 农场 · Agent<\/title>/);
  assert.match(viewHtml, /🔄 刷新 \/ 下次从这里继续/);
  assert.match(viewHtml, new RegExp(`/agent/${KEY}/do\\?n=[0-9a-f]{12}`));

  // Compose mints a real action nonce. Executing it redirects to the target page,
  // exposes the result through one flash, and replay cannot execute again.
  const compose = await fetch(
    `${baseUrl}/agent/${KEY}/compose?a=rename&name=${encodeURIComponent("一次改名农场")}`,
  );
  assert.equal(compose.status, 200);
  const composeHtml = await compose.text();
  const renameNonce = composeHtml.match(
    new RegExp(`/agent/${KEY}/do\\?n=([0-9a-f]{12})`),
  )?.[1];
  assert.ok(renameNonce);

  const renamed = await executeNonce(baseUrl, KEY, renameNonce);
  assert.equal(renamed.status, 303);
  assertAgentHeaders(renamed);
  const renamedLocation = renamed.headers.get("location") ?? "";
  assert.match(
    renamedLocation,
    new RegExp(`^/agent/${KEY}/view\\?flash=[0-9a-f]{16}&v=[0-9a-f]{8}$`),
  );
  assert.equal(farm.name, "一次改名农场");

  const firstFlash = await fetch(new URL(renamedLocation, baseUrl));
  assert.equal(firstFlash.status, 200);
  const firstFlashHtml = await firstFlash.text();
  assert.match(firstFlashHtml, /<pre style="background:#eef[^>]*>/);
  assert.match(firstFlashHtml, /农场已改名为「一次改名农场」/);

  const secondFlash = await fetch(new URL(renamedLocation, baseUrl));
  assert.equal(secondFlash.status, 200);
  const secondFlashHtml = await secondFlash.text();
  assert.doesNotMatch(secondFlashHtml, /<pre style="background:#eef[^>]*>/);
  assert.doesNotMatch(secondFlashHtml, /农场已改名为「一次改名农场」/);

  const replay = await executeNonce(baseUrl, KEY, renameNonce);
  assert.equal(replay.status, 200);
  assertAgentHeaders(replay);
  assert.match(await replay.text(), /此操作已执行（或链接已过期）/);
  assert.equal(farm.name, "一次改名农场");

  // A nonce is valid at exactly 30 minutes and expired one millisecond later.
  const nonceStart = START + 60 * 60 * 1000;
  const boundaryNonce = mintNonce(KEY, "rename", { name: "三十分钟边界内" }, nonceStart);
  requestNow = nonceStart + 30 * 60 * 1000;
  const boundaryResult = await executeNonce(baseUrl, KEY, boundaryNonce);
  assert.equal(boundaryResult.status, 303);
  assert.equal(farm.name, "三十分钟边界内");

  const expiredNonce = mintNonce(KEY, "rename", { name: "不该执行的过期改名" }, nonceStart);
  requestNow = nonceStart + 30 * 60 * 1000 + 1;
  const expiredResult = await executeNonce(baseUrl, KEY, expiredNonce);
  assert.equal(expiredResult.status, 200);
  assert.match(await expiredResult.text(), /此操作已执行（或链接已过期）/);
  assert.equal(farm.name, "三十分钟边界内");

  // The redirect flash is available at exactly five minutes, then consumed.
  const flashStart = START + 2 * 60 * 60 * 1000;
  requestNow = flashStart;
  const boundaryFlashNonce = mintNonce(KEY, "shop", {}, flashStart);
  const boundaryFlashAction = await executeNonce(baseUrl, KEY, boundaryFlashNonce);
  assert.equal(boundaryFlashAction.status, 303);
  const boundaryFlashLocation = boundaryFlashAction.headers.get("location") ?? "";
  requestNow = flashStart + 5 * 60 * 1000;
  const boundaryFlash = await fetch(new URL(boundaryFlashLocation, baseUrl));
  assert.equal(boundaryFlash.status, 200);
  assert.match(
    await boundaryFlash.text(),
    /<pre style="background:#eef[^>]*>🏪 商店<\/pre>/,
  );
  const consumedBoundaryFlash = await fetch(new URL(boundaryFlashLocation, baseUrl));
  assert.equal(consumedBoundaryFlash.status, 200);
  assert.doesNotMatch(
    await consumedBoundaryFlash.text(),
    /<pre style="background:#eef[^>]*>🏪 商店<\/pre>/,
  );

  const expiredFlashStart = START + 3 * 60 * 60 * 1000;
  requestNow = expiredFlashStart;
  const expiredFlashNonce = mintNonce(KEY, "shop", {}, expiredFlashStart);
  const expiredFlashAction = await executeNonce(baseUrl, KEY, expiredFlashNonce);
  assert.equal(expiredFlashAction.status, 303);
  const expiredFlashLocation = expiredFlashAction.headers.get("location") ?? "";
  requestNow = expiredFlashStart + 5 * 60 * 1000 + 1;
  const expiredFlash = await fetch(new URL(expiredFlashLocation, baseUrl));
  assert.equal(expiredFlash.status, 200);
  assert.doesNotMatch(
    await expiredFlash.text(),
    /<pre style="background:#eef[^>]*>🏪 商店<\/pre>/,
  );

  // Once Doorbell migration revokes the legacy channel, root and view stop resolving.
  farm.doorbellMcpMigration = {
    migrationId: "legacy-agent-refactor-migration",
    confirmationId: "legacy-agent-refactor-confirmation",
    revokedAt: new Date(requestNow).toISOString(),
    legacyMcpRevoked: true,
  };
  save();

  const migratedEntry = await fetch(`${baseUrl}/agent/${KEY}`, { redirect: "manual" });
  assert.equal(migratedEntry.status, 404);
  assertAgentHeaders(migratedEntry);
  assert.match(await migratedEntry.text(), /这个 Agent 链接无效或已被撤销/);

  const migratedView = await fetch(`${baseUrl}/agent/${KEY}/view?v=after-migration`);
  assert.equal(migratedView.status, 404);
  assertAgentHeaders(migratedView);
  assert.match(await migratedView.text(), /这个 Agent 链接无效或已被撤销/);
});

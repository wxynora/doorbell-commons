import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-mcp-internal-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-mcp-test-service-token";

const { makeFarm } = await import("../dist/game.js");
const { ensureKitchen } = await import("../dist/engine.js");
const { claimSyncedFarm, syncFarm } = await import("../dist/public-sync.js");
const { getFarm, insertFarm, load } = await import("../dist/store.js");
const { startServer } = await import("../dist/server.js");

const FARM_A = "ABC234";
const FARM_B = "DEF567";
const HUMAN_A = "human-key-a";
const HUMAN_B = "human-key-b";
const LEGACY_AGENT_KEY = "legacyA1";
const MIGRATION_ID = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const OTHER_MIGRATION_ID = "019ffb01-49cd-7020-94af-3d04fb1ed03d";
const RESIDENT_ID = "10000000-0000-4000-8000-000000000001";

function addFarm(id, humanKey, agentKey) {
  const farm = makeFarm(`Farm ${id}`);
  farm.id = id;
  farm.humanKey = humanKey;
  farm.agentKey = agentKey;
  insertFarm(farm);
  return farm;
}

function requestJson(baseUrl, path, body, authorization = true) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...(authorization
        ? { authorization: "Bearer farm-doorbell-mcp-test-service-token" }
        : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(async (response) => ({
    response,
    text: await response.text(),
  }));
}

test("Doorbell migration revokes legacy agent access durably and internal execution reuses runFarm", async (t) => {
  const farmA = addFarm(FARM_A, HUMAN_A, LEGACY_AGENT_KEY);
  farmA.silver = 2_000;
  ensureKitchen(farmA).ingredients.salt = 1;
  ensureKitchen(farmA).ingredients.spice = 1;
  const farmB = addFarm(FARM_B, HUMAN_B, "legacyB1");
  const originalToken = farmA.token;
  const originalHumanKey = farmA.humanKey;
  const originalCoins = farmA.coins;
  const stalePreMigrationSnapshot = JSON.parse(JSON.stringify(farmA));
  const server = startServer(0);
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(dataDirectory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const migrationPath = "/internal/doorbell/mcp-migrations/revoke-farm-access";
  const executionPath = "/internal/doorbell/farm-actions/execute";
  const readinessPath = "/internal/doorbell/lingye-actions/readiness";
  const migrationBody = {
    migration_id: MIGRATION_ID,
    resident_id: RESIDENT_ID,
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
  };

  const readiness = await fetch(`${baseUrl}${readinessPath}`, {
    headers: { authorization: "Bearer farm-doorbell-mcp-test-service-token" },
  });
  assert.equal(readiness.status, 200);
  const readinessBody = await readiness.json();
  assert.equal(readinessBody.schema_version, 1);
  assert.equal(readinessBody.operations.length, 8);
  assert.equal(readinessBody.ready, false);
  assert.equal(readinessBody.missing.includes("private_exam_bank"), true);
  assert.equal(readinessBody.missing.includes("nature_runtime"), true);

  const legacyBefore = await fetch(`${baseUrl}/a/${LEGACY_AGENT_KEY}/status`);
  assert.equal(legacyBefore.status, 200);

  const executionBeforeMigration = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_B,
    expected_farm_doorplate: FARM_B,
    action: "status",
    params: {},
  });
  assert.equal(executionBeforeMigration.response.status, 409);
  assert.equal(JSON.parse(executionBeforeMigration.text).error.code, "farm_migration_required");

  const unauthorized = await requestJson(baseUrl, migrationPath, migrationBody, false);
  assert.equal(unauthorized.response.status, 401);
  assert.equal(JSON.parse(unauthorized.text).error.code, "authentication_required");

  const missingCredential = await requestJson(baseUrl, migrationPath, {
    ...migrationBody,
    farm_human_key: "missing-human-key",
  });
  assert.equal(missingCredential.response.status, 404);
  assert.equal(JSON.parse(missingCredential.text).error.code, "farm_credential_not_found");
  assert.equal(missingCredential.text.includes("missing-human-key"), false);

  const mismatchedDoorplate = await requestJson(baseUrl, migrationPath, {
    ...migrationBody,
    expected_farm_doorplate: FARM_B,
  });
  assert.equal(mismatchedDoorplate.response.status, 409);
  assert.equal(JSON.parse(mismatchedDoorplate.text).error.code, "farm_doorplate_mismatch");

  const circular = {};
  circular.self = circular;
  farmA.migrationSaveFailure = circular;
  const failedSave = await requestJson(baseUrl, migrationPath, migrationBody);
  assert.equal(failedSave.response.status, 503);
  assert.equal(JSON.parse(failedSave.text).error.code, "migration_unavailable");
  assert.equal(getFarm(FARM_A).agentKey, LEGACY_AGENT_KEY);
  assert.equal(getFarm(FARM_A).doorbellMcpMigration, undefined);
  const failedLedger = new DatabaseSync(join(dataDirectory, "lingye-world.sqlite"), { readOnly: true });
  assert.equal(failedLedger.prepare("SELECT COUNT(*) AS count FROM residents").get().count, 0);
  assert.equal(failedLedger.prepare("SELECT COUNT(*) AS count FROM economy_accounts").get().count, 0);
  failedLedger.close();
  delete farmA.migrationSaveFailure;

  const first = await requestJson(baseUrl, migrationPath, migrationBody);
  assert.equal(first.response.status, 200);
  const receipt = JSON.parse(first.text);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "confirmation_id",
    "farm_doorplate",
    "legacy_mcp_revoked",
    "migration_id",
    "revoked_at",
  ]);
  assert.equal(receipt.migration_id, MIGRATION_ID);
  assert.match(receipt.confirmation_id, /^[0-9a-f-]{36}$/i);
  assert.equal(receipt.farm_doorplate, FARM_A);
  assert.equal(receipt.legacy_mcp_revoked, true);
  assert.equal(new Date(receipt.revoked_at).toISOString(), receipt.revoked_at);
  assert.equal(getFarm(FARM_A).agentKey, undefined);
  assert.equal(getFarm(FARM_A).token, originalToken);
  assert.equal(getFarm(FARM_A).humanKey, originalHumanKey);
  assert.equal(getFarm(FARM_A).coins, originalCoins);
  const ledger = new DatabaseSync(join(dataDirectory, "lingye-world.sqlite"), { readOnly: true });
  t.after(() => ledger.close());
  assert.deepEqual({ ...ledger.prepare(`
    SELECT available_gold, available_silver FROM economy_accounts WHERE resident_id = ?
  `).get(RESIDENT_ID) }, {
    available_gold: originalCoins,
    available_silver: 2_000,
  });
  const syncRegistration = claimSyncedFarm(FARM_A, originalToken);

  const repeated = await requestJson(baseUrl, migrationPath, migrationBody);
  assert.equal(repeated.response.status, 200);
  assert.deepEqual(JSON.parse(repeated.text), receipt);

  const conflict = await requestJson(baseUrl, migrationPath, {
    ...migrationBody,
    migration_id: OTHER_MIGRATION_ID,
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(JSON.parse(conflict.text).error.code, "migration_conflict");

  for (const path of [
    `/a/${LEGACY_AGENT_KEY}/status`,
    `/agent/${LEGACY_AGENT_KEY}`,
    `/mcp/${LEGACY_AGENT_KEY}`,
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: path.startsWith("/mcp/") ? "POST" : "GET",
      headers: path.startsWith("/mcp/") ? { "content-type": "application/json" } : {},
      body: path.startsWith("/mcp/")
        ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
        : undefined,
    });
    assert.equal(response.status, 404, path);
  }

  const reservedIdentity = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "rename",
    params: { name: "Nope", token: originalToken },
  });
  assert.equal(reservedIdentity.response.status, 400);
  assert.equal(JSON.parse(reservedIdentity.text).error.code, "invalid_request");

  const reservedDetail = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "rename",
    params: { name: "Nope", detail: true },
  });
  assert.equal(reservedDetail.response.status, 400);

  const blockedLegacyAction = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "new-token",
    params: {},
  });
  assert.equal(blockedLegacyAction.response.status, 400);
  assert.equal(JSON.parse(blockedLegacyAction.text).error.code, "unsupported_action");
  assert.equal(getFarm(FARM_A).token, originalToken);

  const boughtTool = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "kitchen",
    params: { op: "buy", kind: "tool", id: "steam" },
  });
  assert.equal(boughtTool.response.status, 200, boughtTool.text);
  assert.equal(JSON.parse(boughtTool.text).ok, true);
  assert.equal(getFarm(FARM_A).silver, 800);
  assert.equal(getFarm(FARM_A).ranch.kitchen.ownedTools.includes("steam"), true);
  assert.equal(ledger.prepare(`
    SELECT available_silver FROM economy_accounts WHERE resident_id = ?
  `).get(RESIDENT_ID).available_silver, 800);

  const methodCook = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "kitchen",
    params: { op: "cook", items: ["salt", "spice"], method: "steam" },
  });
  assert.equal(methodCook.response.status, 200, methodCook.text);
  assert.equal(JSON.parse(methodCook.text).ok, true);
  assert.equal(getFarm(FARM_A).ranch.kitchen.ingredients.salt, undefined);
  assert.equal(getFarm(FARM_A).ranch.kitchen.ingredients.spice, undefined);

  const planted = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "plant",
    params: { common: 1 },
  });
  assert.equal(planted.response.status, 200, planted.text);
  assert.equal(JSON.parse(planted.text).ok, true);
  assert.equal(getFarm(FARM_A).coins, originalCoins - 8);
  assert.equal(ledger.prepare(`
    SELECT available_gold FROM economy_accounts WHERE resident_id = ?
  `).get(RESIDENT_ID).available_gold, originalCoins - 8);

  const renamed = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "rename",
    params: { name: "New Farm" },
    detail: true,
  });
  assert.equal(renamed.response.status, 200);
  const renamedBody = JSON.parse(renamed.text);
  assert.equal(renamedBody.ok, true);
  assert.equal(renamedBody.farm.id, FARM_A);
  assert.equal(renamedBody.farm.name, "New Farm");
  assert.equal(renamed.text.includes(originalToken), false);
  assert.equal(renamed.text.includes(HUMAN_A), false);

  const visitList = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "visit",
    params: {},
  });
  assert.equal(visitList.response.status, 200);
  const visitListBody = JSON.parse(visitList.text);
  assert.deepEqual(Object.keys(visitListBody).sort(), ["ok", "text"]);
  assert.equal(visitListBody.ok, true);
  assert.match(visitListBody.text, /可以串门的农场/);

  const detailedVisitList = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "visit",
    params: {},
    detail: true,
  });
  assert.equal(detailedVisitList.response.status, 200);
  const detailedVisitListBody = JSON.parse(detailedVisitList.text);
  assert.deepEqual(Object.keys(detailedVisitListBody).sort(), ["farm", "ok", "text"]);
  assert.equal("farms" in detailedVisitListBody, false);

  const messaged = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "message",
    params: { to: "2", text: "hello from Doorbell" },
  });
  assert.equal(messaged.response.status, 200);
  assert.equal(JSON.parse(messaged.text).ok, true);
  assert.equal(farmB.messages.length, 1);
  assert.equal(farmB.messages[0].by, FARM_A);
  assert.equal(farmB.messages[0].text, "hello from Doorbell");

  const blocked = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "block",
    params: { to: "2" },
  });
  assert.equal(blocked.response.status, 200);
  assert.equal(JSON.parse(blocked.text).ok, true);
  assert.deepEqual(getFarm(FARM_A).blocked, [FARM_B]);
  assert.deepEqual(getFarm(FARM_B).blocked ?? [], []);

  const unblocked = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "unblock",
    params: { to: "2" },
  });
  assert.equal(unblocked.response.status, 200);
  assert.equal(JSON.parse(unblocked.text).ok, true);
  assert.deepEqual(getFarm(FARM_A).blocked, []);
  assert.deepEqual(getFarm(FARM_B).blocked ?? [], []);

  const guardDogBribe = await requestJson(baseUrl, executionPath, {
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
    action: "kitchen",
    params: {
      op: "use",
      target: "guard-dog",
      dishId: "missing-dish",
      to: "2",
    },
  });
  assert.equal(guardDogBribe.response.status, 400);
  const guardDogBribeBody = JSON.parse(guardDogBribe.text);
  assert.equal(guardDogBribeBody.ok, false);
  assert.equal(typeof guardDogBribeBody.text, "string", guardDogBribe.text);
  assert.equal("error" in guardDogBribeBody, false);

  const tamperedSyncSnapshot = structuredClone(stalePreMigrationSnapshot);
  tamperedSyncSnapshot.agentKey = LEGACY_AGENT_KEY;
  tamperedSyncSnapshot.doorbellMcpMigration = {
    migrationId: OTHER_MIGRATION_ID,
    confirmationId: OTHER_MIGRATION_ID,
    revokedAt: "2026-08-13T00:00:00.000Z",
    legacyMcpRevoked: false,
  };
  const syncResult = syncFarm(FARM_A, syncRegistration.syncKey, {
    clientSeq: 1,
    snapshot: tamperedSyncSnapshot,
    ugc: [],
  });
  assert.equal(syncResult.idempotent, false);
  assert.equal(getFarm(FARM_A).agentKey, undefined);
  assert.deepEqual({
    ...getFarm(FARM_A).doorbellMcpMigration,
    balanceProjection: undefined,
  }, {
    migrationId: MIGRATION_ID,
    residentId: RESIDENT_ID,
    legacyGold: originalCoins,
    legacySilver: 2_000,
    confirmationId: receipt.confirmation_id,
    revokedAt: receipt.revoked_at,
    legacyMcpRevoked: true,
    balanceProjection: undefined,
  });
  assert.equal(getFarm(FARM_A).doorbellMcpMigration.balanceProjection.authority, "farm");

  const persisted = JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8"));
  const persistedFarm = persisted.farms.find((farm) => farm.id === FARM_A);
  assert.ok(persistedFarm);
  assert.equal(persistedFarm.agentKey, undefined);
  assert.equal(persistedFarm.humanKey, originalHumanKey);
  assert.equal(persistedFarm.token, originalToken);
  assert.deepEqual({
    ...persistedFarm.doorbellMcpMigration,
    balanceProjection: undefined,
  }, {
    migrationId: MIGRATION_ID,
    residentId: RESIDENT_ID,
    legacyGold: originalCoins,
    legacySilver: 2_000,
    confirmationId: receipt.confirmation_id,
    revokedAt: receipt.revoked_at,
    legacyMcpRevoked: true,
    balanceProjection: undefined,
  });
  assert.equal(persistedFarm.doorbellMcpMigration.balanceProjection.authority, "farm");
  assert.equal(JSON.stringify(persisted).includes("farm-doorbell-mcp-test-service-token"), false);

  getFarm(FARM_A).agentKey = "memory-only-resurrection";
  load();
  assert.equal(getFarm(FARM_A).agentKey, undefined);
  assert.equal(getFarm(FARM_A).doorbellMcpMigration.migrationId, MIGRATION_ID);

  const makeAgent = await fetch(
    `${baseUrl}/c?a=make-agent&farm=${FARM_A}&token=${originalToken}`,
  );
  assert.equal(makeAgent.status, 409);
  assert.equal(JSON.parse(await makeAgent.text()).error.code, "legacy_agent_access_revoked");
  assert.equal(getFarm(FARM_A).agentKey, undefined);
  assert.equal(getFarm(FARM_A).token, originalToken);

  const retryAfterReload = await requestJson(baseUrl, migrationPath, migrationBody);
  assert.equal(retryAfterReload.response.status, 200);
  assert.deepEqual(JSON.parse(retryAfterReload.text), receipt);

  const humanPage = await fetch(`${baseUrl}/ui/${HUMAN_A}`);
  assert.equal(humanPage.status, 200);
});

import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-mcp-internal-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "farm-doorbell-mcp-test-service-token";

const { makeFarm } = await import("../dist/game.js");
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
  const migrationBody = {
    migration_id: MIGRATION_ID,
    farm_human_key: HUMAN_A,
    expected_farm_doorplate: FARM_A,
  };

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
  assert.deepEqual(getFarm(FARM_A).doorbellMcpMigration, {
    migrationId: MIGRATION_ID,
    confirmationId: receipt.confirmation_id,
    revokedAt: receipt.revoked_at,
    legacyMcpRevoked: true,
  });

  const persisted = JSON.parse(readFileSync(join(dataDirectory, "world.json"), "utf8"));
  const persistedFarm = persisted.farms.find((farm) => farm.id === FARM_A);
  assert.ok(persistedFarm);
  assert.equal(persistedFarm.agentKey, undefined);
  assert.equal(persistedFarm.humanKey, originalHumanKey);
  assert.equal(persistedFarm.token, originalToken);
  assert.deepEqual(persistedFarm.doorbellMcpMigration, {
    migrationId: MIGRATION_ID,
    confirmationId: receipt.confirmation_id,
    revokedAt: receipt.revoked_at,
    legacyMcpRevoked: true,
  });
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

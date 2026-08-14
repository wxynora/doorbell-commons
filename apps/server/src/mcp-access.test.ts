import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type FarmMcpMigrationReceipt,
  mcpAccessErrorSchema,
  mcpAccessStatusResponseSchema,
  mcpCredentialIssueResponseSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID, readMcpEndpoint, readMcpRuntimeReady } from "./config.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { hashMcpCredential, McpAccessService } from "./mcp-access-service.js";
import {
  FarmMcpMigrationBindingMismatchError,
  FarmMcpMigrationClient,
  FarmMcpMigrationConflictError,
  FarmMcpMigrationContractUnavailableError,
  FarmMcpMigrationCredentialInvalidError,
  type FarmMcpMigrationInput,
  type FarmMcpMigrationRevoker,
  FarmMcpMigrationUnavailableError,
} from "./mcp-farm-migration-client.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const NOW = Date.UTC(2026, 7, 13, 5, 0, 0);
const FARM_REVOKED_AT = "2026-08-13T05:01:00.000Z";
const HUMAN_SESSION_TOKEN = "human-session-token-for-mcp-access-tests";
const MIGRATION_ID = "10000000-0000-4000-8000-000000000001";
const CONFIRMATION_ID = "20000000-0000-4000-8000-000000000001";
const CREDENTIAL_IDS = [
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
];
const MCP_CREDENTIALS = [`dbm_${"A".repeat(43)}`, `dbm_${"B".repeat(43)}`, `dbm_${"C".repeat(43)}`];

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();
  unavailable = false;

  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    if (this.unavailable) {
      throw new OneBotUnavailableError("fake OneBot unavailable");
    }
    return this.members.has(qqNumber);
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(): Promise<FarmDirectoryEntry> {
    throw new Error("MCP access tests must not use the public farm directory");
  }
  async lookupFarmByHumanKey(): Promise<FarmDirectoryEntry> {
    throw new Error("MCP access tests must not verify a registration farm credential");
  }
  async readFarmOverview(): Promise<BoundFarmOverview> {
    throw new Error("MCP access tests must not read a farm overview");
  }
  async readFarmHumanPage(): Promise<FarmHumanPage> {
    throw new Error("MCP access tests must not proxy a farm page");
  }
  async submitFarmHumanAction(): Promise<FarmHumanActionRedirect> {
    throw new Error("MCP access tests must not submit a farm action");
  }
}

class FakeFarmMigration implements FarmMcpMigrationRevoker {
  readonly calls: FarmMcpMigrationInput[] = [];
  failure: Error | undefined;

  async revokeLegacyMcpAccess(input: FarmMcpMigrationInput): Promise<FarmMcpMigrationReceipt> {
    this.calls.push(input);
    if (this.failure) {
      throw this.failure;
    }
    return {
      migration_id: input.migrationId,
      confirmation_id: CONFIRMATION_ID,
      farm_doorplate: input.farmDoorplate,
      legacy_mcp_revoked: true,
      revoked_at: FARM_REVOKED_AT,
    };
  }
}

interface McpAccessHarness {
  app: ReturnType<typeof buildApp>;
  database: CommunityDatabase;
  membership: FakeGroupMembership;
  migration: FakeFarmMigration;
  runtime: { ready: boolean };
  close(): Promise<void>;
}

function openHarness(
  databasePath: string,
  options: { runtimeReady?: boolean; credentialValues?: string[]; credentialIds?: string[] } = {},
): McpAccessHarness {
  const credentialValues = [...(options.credentialValues ?? MCP_CREDENTIALS)];
  const credentialIds = [...(options.credentialIds ?? CREDENTIAL_IDS)];
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => HUMAN_SESSION_TOKEN,
  });
  const membership = new FakeGroupMembership();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => NOW,
  });
  const migration = new FakeFarmMigration();
  const runtime = { ready: options.runtimeReady ?? true };
  const mcpAccessService = new McpAccessService({
    database,
    registrationAuth,
    farmMigration: migration,
    mcpEndpoint: "https://doorbell.example/mcp",
    isRuntimeReady: () => runtime.ready,
    now: () => NOW,
    generateMigrationId: () => MIGRATION_ID,
    generateCredentialId: () => credentialIds.shift() ?? "30000000-0000-4000-8000-000000000099",
    generateCredential: () => credentialValues.shift() ?? `dbm_${"Z".repeat(43)}`,
  });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    mcpAccessService,
    secureCookies: false,
    logger: false,
  });
  return {
    app,
    database,
    membership,
    migration,
    runtime,
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

function createCommunity(harness: McpAccessHarness) {
  const created = harness.database.createHumanSession("10001", NOW, {
    residentName: "小一",
    homeName: "门铃小屋",
    farmDoorplate: "ABC234",
    farmHumanKey: "private-farm-human-key",
  });
  harness.membership.members.add("10001");
  return created;
}

function sessionCookie(): string {
  return `doorbell_session=${HUMAN_SESSION_TOKEN}`;
}

async function claim(harness: McpAccessHarness) {
  return harness.app.inject({
    method: "POST",
    url: "/api/mcp-access/claim",
    headers: { cookie: sessionCookie() },
    payload: {},
  });
}

async function issue(harness: McpAccessHarness) {
  return harness.app.inject({
    method: "POST",
    url: "/api/mcp-access/credential",
    headers: { cookie: sessionCookie() },
    payload: {},
  });
}

test("MCP access status and method errors are strict, no-store, and target-free", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-access-http-"));
  const harness = openHarness(join(directory, "doorbell.sqlite"));
  try {
    createCommunity(harness);
    const unauthenticated = await harness.app.inject({
      method: "GET",
      url: "/api/mcp-access",
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(unauthenticated.headers["cache-control"], "no-store");
    assert.equal(
      mcpAccessErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );
    const initial = await harness.app.inject({
      method: "GET",
      url: "/api/mcp-access",
      headers: { cookie: sessionCookie() },
    });
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.headers["cache-control"], "no-store");
    assert.deepEqual(mcpAccessStatusResponseSchema.parse(initial.json()), {
      mcp_endpoint: "https://doorbell.example/mcp",
      authorization_scheme: "Bearer",
      migration_status: "not_started",
      credential_status: "not_issued",
      migration_id: null,
      migration_requested_at: null,
      farm_revoked_at: null,
      credential_id: null,
      credential_issued_at: null,
      credential_revoked_at: null,
    });
    assert.doesNotMatch(initial.body, /private-farm-human-key|ABC234|dbc_/u);

    const neverIssued = await harness.app.inject({
      method: "DELETE",
      url: "/api/mcp-access/credential",
      headers: { cookie: sessionCookie() },
      payload: {},
    });
    assert.equal(neverIssued.statusCode, 404);
    assert.equal(
      mcpAccessErrorSchema.parse(neverIssued.json()).error.message,
      "No active MCP credential is configured",
    );

    const targetSwitch = await harness.app.inject({
      method: "POST",
      url: "/api/mcp-access/claim?farm_doorplate=DEF567",
      headers: { cookie: sessionCookie() },
      payload: { farm_human_key: "another-key" },
    });
    assert.equal(targetSwitch.statusCode, 400);
    assert.deepEqual(mcpAccessErrorSchema.parse(targetSwitch.json()), {
      error: {
        code: "invalid_request",
        message: "The request body or query parameters are invalid",
      },
    });
    assert.equal(targetSwitch.headers["cache-control"], "no-store");
    assert.equal(harness.migration.calls.length, 0);

    const malformed = await harness.app.inject({
      method: "POST",
      url: "/api/mcp-access/claim",
      headers: { cookie: sessionCookie(), "content-type": "application/json" },
      payload: "{",
    });
    assert.equal(malformed.statusCode, 400);
    mcpAccessErrorSchema.parse(malformed.json());
    assert.equal(malformed.headers["cache-control"], "no-store");

    const wrongMethods = [
      { method: "POST" as const, url: "/api/mcp-access", allow: "GET" },
      { method: "GET" as const, url: "/api/mcp-access/claim", allow: "POST" },
      {
        method: "GET" as const,
        url: "/api/mcp-access/credential",
        allow: "POST, DELETE",
      },
    ];
    for (const request of wrongMethods) {
      const response = await harness.app.inject(request);
      assert.equal(response.statusCode, 405);
      assert.equal(response.headers.allow, request.allow);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(mcpAccessErrorSchema.parse(response.json()).error.code, "method_not_allowed");
    }
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("farm migration failures keep one pending migration and map to the approved public errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-farm-errors-"));
  const harness = openHarness(join(directory, "doorbell.sqlite"));
  try {
    createCommunity(harness);
    const cases = [
      {
        failure: new FarmMcpMigrationCredentialInvalidError(),
        status: 409,
        code: "farm_credential_invalid",
      },
      {
        failure: new FarmMcpMigrationBindingMismatchError(),
        status: 409,
        code: "farm_binding_mismatch",
      },
      {
        failure: new FarmMcpMigrationConflictError(),
        status: 409,
        code: "farm_migration_conflict",
      },
      {
        failure: new FarmMcpMigrationContractUnavailableError(),
        status: 502,
        code: "upstream_contract_unavailable",
      },
    ] as const;
    for (const scenario of cases) {
      harness.migration.failure = scenario.failure;
      const response = await claim(harness);
      assert.equal(response.statusCode, scenario.status);
      assert.equal(mcpAccessErrorSchema.parse(response.json()).error.code, scenario.code);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.doesNotMatch(response.body, /private-farm-human-key|ABC234/u);
    }
    assert.equal(new Set(harness.migration.calls.map((call) => call.migrationId)).size, 1);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("claim persists one migration id, resumes the same farm operation, and never replays confirmed work", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-access-claim-"));
  const harness = openHarness(join(directory, "doorbell.sqlite"));
  try {
    const created = createCommunity(harness);
    harness.migration.failure = new FarmMcpMigrationUnavailableError();
    const failed = await claim(harness);
    assert.equal(failed.statusCode, 503);
    assert.equal(mcpAccessErrorSchema.parse(failed.json()).error.code, "farm_unavailable");
    const pending = harness.database.getMcpAccessBinding(created.community.resident.residentId);
    assert.equal(pending?.migrationId, MIGRATION_ID);
    assert.equal(pending?.farmRevokedAt, null);

    harness.migration.failure = undefined;
    const recovered = await claim(harness);
    assert.equal(recovered.statusCode, 200);
    const recoveredStatus = mcpAccessStatusResponseSchema.parse(recovered.json());
    assert.equal(recoveredStatus.migration_status, "farm_revoked");
    assert.equal(recoveredStatus.migration_id, MIGRATION_ID);
    assert.equal(harness.migration.calls.length, 2);
    assert.deepEqual(harness.migration.calls[0], harness.migration.calls[1]);
    assert.deepEqual(harness.migration.calls[1], {
      migrationId: MIGRATION_ID,
      farmDoorplate: "ABC234",
      farmHumanKey: "private-farm-human-key",
    });

    const repeated = await claim(harness);
    assert.equal(repeated.statusCode, 200);
    assert.equal(harness.migration.calls.length, 2);
    assert.doesNotMatch(repeated.body, /private-farm-human-key/u);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime readiness gates irreversible claim and credential issue", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-runtime-gate-"));
  const harness = openHarness(join(directory, "doorbell.sqlite"), { runtimeReady: false });
  try {
    const created = createCommunity(harness);
    const blockedClaim = await claim(harness);
    assert.equal(blockedClaim.statusCode, 503);
    assert.equal(
      mcpAccessErrorSchema.parse(blockedClaim.json()).error.code,
      "mcp_runtime_unavailable",
    );
    assert.equal(harness.migration.calls.length, 0);
    assert.equal(
      harness.database.getMcpAccessBinding(created.community.resident.residentId),
      undefined,
    );

    const prematureIssue = await issue(harness);
    assert.equal(prematureIssue.statusCode, 409);
    assert.equal(
      mcpAccessErrorSchema.parse(prematureIssue.json()).error.code,
      "migration_not_confirmed",
    );

    harness.runtime.ready = true;
    assert.equal((await claim(harness)).statusCode, 200);
    harness.runtime.ready = false;
    const blockedIssue = await issue(harness);
    assert.equal(blockedIssue.statusCode, 503);
    assert.equal(
      mcpAccessErrorSchema.parse(blockedIssue.json()).error.code,
      "mcp_runtime_unavailable",
    );
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("credential issue, concurrent replacement, revocation, and restart keep one digest-only slot", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-credential-"));
  const databasePath = join(directory, "doorbell.sqlite");
  let harness = openHarness(databasePath);
  try {
    const created = createCommunity(harness);
    assert.equal((await claim(harness)).statusCode, 200);

    const first = await issue(harness);
    assert.equal(first.statusCode, 200);
    const firstCredential = mcpCredentialIssueResponseSchema.parse(first.json());
    assert.equal(firstCredential.replaced_previous, false);
    const storedAfterFirst = harness.database.getMcpAccessBinding(
      created.community.resident.residentId,
    );
    const firstCredentialValue = MCP_CREDENTIALS[0];
    assert.ok(firstCredentialValue);
    assert.equal(storedAfterFirst?.credentialTokenHash, hashMcpCredential(firstCredentialValue));
    assert.notEqual(storedAfterFirst?.credentialTokenHash, firstCredentialValue);

    const concurrent = await Promise.all([issue(harness), issue(harness)]);
    const issued = concurrent.map((response) => {
      assert.equal(response.statusCode, 200);
      return mcpCredentialIssueResponseSchema.parse(response.json());
    });
    assert.deepEqual(
      issued.map((value) => value.replaced_previous),
      [true, true],
    );
    const activeBindings = issued.filter((value) =>
      harness.database.authenticateMcpCredentialHash(hashMcpCredential(value.mcp_credential)),
    );
    assert.equal(activeBindings.length, 1);
    const activeBinding = activeBindings[0];
    assert.ok(activeBinding);
    const finalBinding = harness.database.getMcpAccessBinding(
      created.community.resident.residentId,
    );
    assert.equal(
      finalBinding?.credentialTokenHash,
      hashMcpCredential(activeBinding.mcp_credential),
    );

    const sqlite = new Database(databasePath, { readonly: true });
    const stored = sqlite.prepare("SELECT * FROM mcp_access_bindings").get() as Record<
      string,
      unknown
    >;
    sqlite.close();
    assert.equal(typeof stored.credential_token_hash, "string");
    assert.equal(String(stored.credential_token_hash).length, 64);
    assert.doesNotMatch(JSON.stringify(stored), /dbm_|private-farm-human-key/u);

    const revoked = await harness.app.inject({
      method: "DELETE",
      url: "/api/mcp-access/credential",
      headers: { cookie: sessionCookie() },
      payload: {},
    });
    assert.equal(revoked.statusCode, 200);
    const revokedStatus = mcpAccessStatusResponseSchema.parse(revoked.json());
    assert.equal(revokedStatus.credential_status, "revoked");
    const repeated = await harness.app.inject({
      method: "DELETE",
      url: "/api/mcp-access/credential",
      headers: { cookie: sessionCookie() },
      payload: {},
    });
    assert.deepEqual(mcpAccessStatusResponseSchema.parse(repeated.json()), revokedStatus);

    const reissued = mcpCredentialIssueResponseSchema.parse((await issue(harness)).json());
    assert.equal(reissued.replaced_previous, false);
    const revokedAgain = await harness.app.inject({
      method: "DELETE",
      url: "/api/mcp-access/credential",
      headers: { cookie: sessionCookie() },
      payload: {},
    });
    const finalRevokedStatus = mcpAccessStatusResponseSchema.parse(revokedAgain.json());

    await harness.close();
    harness = openHarness(databasePath);
    harness.membership.members.add("10001");
    const restored = await harness.app.inject({
      method: "GET",
      url: "/api/mcp-access",
      headers: { cookie: sessionCookie() },
    });
    assert.equal(restored.statusCode, 200);
    assert.deepEqual(mcpAccessStatusResponseSchema.parse(restored.json()), finalRevokedStatus);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("membership outage neither revokes nor permits, while confirmed departure revokes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mcp-membership-"));
  const harness = openHarness(join(directory, "doorbell.sqlite"));
  try {
    const created = createCommunity(harness);
    await claim(harness);
    const issued = mcpCredentialIssueResponseSchema.parse((await issue(harness)).json());

    harness.membership.unavailable = true;
    const unavailable = await harness.app.inject({
      method: "GET",
      url: "/api/mcp-access",
      headers: { cookie: sessionCookie() },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      mcpAccessErrorSchema.parse(unavailable.json()).error.code,
      "membership_verification_unavailable",
    );
    assert.ok(
      harness.database.authenticateMcpCredentialHash(hashMcpCredential(issued.mcp_credential)),
    );

    harness.membership.unavailable = false;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/mcp-access",
      headers: { cookie: sessionCookie() },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(mcpAccessErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
    assert.equal(
      harness.database.authenticateMcpCredentialHash(hashMcpCredential(issued.mcp_credential)),
      undefined,
    );
    assert.notEqual(
      harness.database.getMcpAccessBinding(created.community.resident.residentId)
        ?.credentialRevokedAt,
      null,
    );
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("farm migration client sends server-derived identity and rejects non-authoritative receipts", async () => {
  const requests: Array<{ url: string; authorization: string | null; body: unknown }> = [];
  let responseBody: Record<string, unknown> = {
    migration_id: MIGRATION_ID,
    confirmation_id: CONFIRMATION_ID,
    farm_doorplate: "ABC234",
    legacy_mcp_revoked: true,
    revoked_at: FARM_REVOKED_AT,
  };
  let responseStatus = 200;
  const client = new FarmMcpMigrationClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "private-service-token",
    fetchImplementation: (async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  const receipt = await client.revokeLegacyMcpAccess({
    migrationId: MIGRATION_ID,
    farmDoorplate: "ABC234",
    farmHumanKey: "private-farm-human-key",
  });
  assert.equal(receipt.confirmation_id, CONFIRMATION_ID);
  assert.deepEqual(requests, [
    {
      url: "https://farm.example/farm/internal/doorbell/mcp-migrations/revoke-farm-access",
      authorization: "Bearer private-service-token",
      body: {
        migration_id: MIGRATION_ID,
        farm_human_key: "private-farm-human-key",
        expected_farm_doorplate: "ABC234",
      },
    },
  ]);

  responseBody = { ...responseBody, farm_doorplate: "DEF567" };
  await assert.rejects(
    client.revokeLegacyMcpAccess({
      migrationId: MIGRATION_ID,
      farmDoorplate: "ABC234",
      farmHumanKey: "private-farm-human-key",
    }),
    FarmMcpMigrationContractUnavailableError,
  );

  responseStatus = 503;
  responseBody = { error: { code: "unavailable" } };
  await assert.rejects(
    client.revokeLegacyMcpAccess({
      migrationId: MIGRATION_ID,
      farmDoorplate: "ABC234",
      farmHumanKey: "private-farm-human-key",
    }),
    FarmMcpMigrationUnavailableError,
  );
});

test("farm migration aborts a stalled request as unavailable", async () => {
  const observed: { signal: AbortSignal | undefined } = { signal: undefined };
  const client = new FarmMcpMigrationClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 20,
    serviceToken: "private-service-token",
    fetchImplementation: async (_input, init) => {
      const requestSignal = init?.signal ?? null;
      observed.signal = requestSignal ?? undefined;
      if (!requestSignal) {
        throw new Error("missing abort signal");
      }
      return await new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
          once: true,
        });
      });
    },
  });

  await assert.rejects(
    client.revokeLegacyMcpAccess({
      migrationId: MIGRATION_ID,
      farmDoorplate: "ABC234",
      farmHumanKey: "private-farm-human-key",
    }),
    FarmMcpMigrationUnavailableError,
  );
  assert.equal(observed.signal?.aborted, true);
});

test("trusted public base accepts https and loopback only", () => {
  assert.equal(
    readMcpEndpoint({ DOORBELL_PUBLIC_BASE_URL: "https://doorbell.example" }),
    "https://doorbell.example/mcp",
  );
  assert.equal(
    readMcpEndpoint({ DOORBELL_PUBLIC_BASE_URL: "http://127.0.0.1:3000" }),
    "http://127.0.0.1:3000/mcp",
  );
  assert.throws(() => readMcpEndpoint({ DOORBELL_PUBLIC_BASE_URL: "http://doorbell.example" }));
  assert.throws(() =>
    readMcpEndpoint({ DOORBELL_PUBLIC_BASE_URL: "https://doorbell.example/not-root" }),
  );
});

test("MCP runtime readiness is explicit and defaults closed", () => {
  assert.equal(readMcpRuntimeReady({}), false);
  assert.equal(readMcpRuntimeReady({ DOORBELL_MCP_RUNTIME_READY: "false" }), false);
  assert.equal(readMcpRuntimeReady({ DOORBELL_MCP_RUNTIME_READY: "true" }), true);
  assert.throws(() => readMcpRuntimeReady({ DOORBELL_MCP_RUNTIME_READY: "1" }));
});

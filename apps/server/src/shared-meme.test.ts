import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  bellUpdateAvailableEventType,
  bellUpdateAvailablePayloadSchema,
  sharedMemeAddSuccessSchema,
  sharedMemeBackendPullSuccessSchema,
  sharedMemeErrorSchema,
  sharedMemeListSuccessSchema,
} from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { BellService } from "./bell-service.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { hashMcpCredential } from "./mcp-access-service.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";
import { SharedMemeBackendService } from "./shared-meme-backend-service.js";
import { SharedMemeService } from "./shared-meme-service.js";

const QQ_NUMBER = "3877162412";
const SESSION_TOKEN = "shared-meme-human-session";
const MCP_CREDENTIAL = `dbm_${"M".repeat(43)}`;
const BELL_CREDENTIAL = `dbb_${"B".repeat(43)}`;

class FakeGroupMembership implements QqGroupMembershipReader {
  current = true;
  unavailable = false;

  async isCurrentMember(_groupId: string, _qqNumber: string): Promise<boolean> {
    if (this.unavailable) throw new OneBotUnavailableError("fake OneBot unavailable");
    return this.current;
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(_farmDoorplate: string): Promise<FarmDirectoryEntry> {
    throw new Error("Shared meme requests must not query the farm");
  }
  async lookupFarmByHumanKey(_farmHumanKey: string): Promise<FarmDirectoryEntry> {
    throw new Error("Shared meme requests must not query the farm");
  }
  async readFarmOverview(_farmDoorplate: string): Promise<BoundFarmOverview> {
    throw new Error("Shared meme requests must not query the farm");
  }
  async readFarmHumanPage(
    _farmHumanKey: string,
    _pagePath: string,
    _query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    throw new Error("Shared meme requests must not query the farm");
  }
  async submitFarmHumanAction(
    _farmHumanKey: string,
    _actionPath: string,
    _form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    throw new Error("Shared meme requests must not query the farm");
  }
}

function cookie(): string {
  return `doorbell_session=${SESSION_TOKEN}`;
}

function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-shared-meme-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const now = Date.UTC(2026, 7, 14, 12, 0, 0);
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => SESSION_TOKEN,
  });
  const membership = new FakeGroupMembership();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => now,
  });
  const sharedMemeService = new SharedMemeService({
    databasePath,
    now: () => now,
    temporaryRoot: directory,
  });
  const session = database.createHumanSession(QQ_NUMBER, now, {
    residentName: "辛玥 & 小渡",
    homeName: "辛玥的小家",
    farmDoorplate: "3ET3FE",
    farmHumanKey: "server-only-human-key",
  });
  const residentId = session.community.resident.residentId;
  const migrationId = "00000000-0000-4000-8000-000000000001";
  database.beginMcpFarmMigration(residentId, "3ET3FE", migrationId, now);
  database.confirmMcpFarmRevoked(residentId, migrationId, "farm-confirmation-1", now);
  database.replaceMcpCredential(
    residentId,
    "00000000-0000-4000-8000-000000000002",
    hashMcpCredential(MCP_CREDENTIAL),
    now,
  );
  database.replaceFirstActiveBellCredential(
    "00000000-0000-4000-8000-000000000003",
    createHash("sha256").update(BELL_CREDENTIAL).digest("hex"),
    now,
  );
  const notificationErrors: unknown[] = [];
  const sharedMemeBackendService = new SharedMemeBackendService({
    database,
    registrationAuth,
  });
  const bellService = new BellService({
    database,
    registrationAuth,
    heartbeatIntervalMs: 30_000,
    replayIntervalMs: 60_000,
    getSharedMemeLibraryVersion: () => sharedMemeService.getMetadata().library_version,
    generateConnectionEpoch: () => "shared-meme-epoch",
    onError: (error) => notificationErrors.push(error),
  });
  const app = buildApp({
    bellService,
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    sharedMemeBackendService,
    sharedMemeService,
    secureCookies: false,
    logger: false,
  });
  return {
    app,
    database,
    directory,
    membership,
    notificationErrors,
    bellService,
    sharedMemeBackendService,
    sharedMemeService,
    async close() {
      await app.close();
      sharedMemeService.close();
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("approved shared-meme baseline remains human-readable", async () => {
  const harness = createHarness();
  try {
    const response = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
    });
    assert.equal(response.statusCode, 200);
    const list = sharedMemeListSuccessSchema.parse(response.json());
    assert.equal(list.library.library_version, 1);
    assert.equal(list.library.entry_count, 317);
    assert.equal(list.memes.length, 317);
    assert.equal(list.memes[0]?.term, "问就是XX？");
    assert.equal(list.memes.filter((meme) => meme.meaning === null).length, 77);
    assert.equal(list.memes.filter((meme) => meme.usage === null).length, 89);
  } finally {
    await harness.close();
  }
});

test("the backend signal says only that an updated library is available", () => {
  assert.equal(bellUpdateAvailableEventType, "update_available");
  assert.deepEqual(
    bellUpdateAvailablePayloadSchema.parse({
      version: 1,
      connection_epoch: "epoch-1",
      resource: "shared_meme",
      available_version: 2,
    }),
    {
      version: 1,
      connection_epoch: "epoch-1",
      resource: "shared_meme",
      available_version: 2,
    },
  );
});

test("household backends use dbm auth and pull full data once then version deltas", async () => {
  const harness = createHarness();
  try {
    const missing = await harness.app.inject({ method: "GET", url: "/api/shared-memes/sync" });
    assert.equal(missing.statusCode, 401);
    const invalid = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync",
      headers: { authorization: `Bearer dbm_${"X".repeat(43)}` },
    });
    assert.equal(invalid.statusCode, 401);

    const fullResponse = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync",
      headers: { authorization: `Bearer ${MCP_CREDENTIAL}` },
    });
    const full = sharedMemeBackendPullSuccessSchema.parse(fullResponse.json());
    assert.equal(full.mode, "full");
    assert.equal(full.after_version, null);
    assert.equal(full.library_version, 1);
    assert.equal(full.memes.length, 317);

    const unchanged = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync?after_version=1",
      headers: { authorization: `Bearer ${MCP_CREDENTIAL}` },
    });
    assert.deepEqual(sharedMemeBackendPullSuccessSchema.parse(unchanged.json()), {
      mode: "delta",
      after_version: 1,
      library_version: 1,
      memes: [],
    });

    const added = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "直拉增量梗", aliases: ["增量梗"] },
    });
    assert.equal(sharedMemeAddSuccessSchema.parse(added.json()).library.library_version, 2);
    const deltaResponse = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync?after_version=1",
      headers: { authorization: `Bearer ${MCP_CREDENTIAL}` },
    });
    const delta = sharedMemeBackendPullSuccessSchema.parse(deltaResponse.json());
    assert.equal(delta.library_version, 2);
    assert.equal(delta.memes.length, 1);
    assert.equal(delta.memes[0]?.term, "直拉增量梗");

    const ahead = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync?after_version=3",
      headers: { authorization: `Bearer ${MCP_CREDENTIAL}` },
    });
    assert.equal(ahead.statusCode, 409);
    assert.equal(sharedMemeErrorSchema.parse(ahead.json()).error.code, "shared_meme_version_ahead");
  } finally {
    await harness.close();
  }
});

test("backend pulls recheck live QQ membership", async () => {
  const harness = createHarness();
  try {
    harness.membership.unavailable = true;
    const outage = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync",
      headers: { authorization: `Bearer ${MCP_CREDENTIAL}` },
    });
    assert.equal(outage.statusCode, 503);
    assert.equal(sharedMemeErrorSchema.parse(outage.json()).error.code, "onebot_unavailable");

    harness.membership.unavailable = false;
    harness.membership.current = false;
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync",
      headers: { authorization: `Bearer ${MCP_CREDENTIAL}` },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(sharedMemeErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
  } finally {
    await harness.close();
  }
});

test("one publish sends only an update-available version signal and signal failure cannot reverse publication", async () => {
  const harness = createHarness();
  try {
    const versions: number[] = [];
    const firstConnection = await harness.bellService.connect(BELL_CREDENTIAL, {
      send: (event, data) => {
        if (event === "update_available") versions.push(Number(data.available_version));
      },
      heartbeat: () => undefined,
      close: () => undefined,
    });
    const payload = { term: "并发只发布一次", aliases: ["并发发布"] };
    const [first, second] = await Promise.all([
      harness.app.inject({
        method: "POST",
        url: "/api/shared-memes",
        headers: { cookie: cookie() },
        payload,
      }),
      harness.app.inject({
        method: "POST",
        url: "/api/shared-memes",
        headers: { cookie: cookie() },
        payload,
      }),
    ]);
    assert.deepEqual(
      [first.statusCode, second.statusCode].sort((left, right) => left - right),
      [200, 409],
    );
    assert.deepEqual(versions, [1, 2]);
    firstConnection.close();

    let deliveryCount = 0;
    await harness.bellService.connect(BELL_CREDENTIAL, {
      send: (event) => {
        if (event === "update_available") {
          deliveryCount += 1;
          if (deliveryCount > 1) throw new Error("simulated update delivery failure");
        }
      },
      heartbeat: () => undefined,
      close: () => undefined,
    });
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "通知失败也已经发布" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(sharedMemeAddSuccessSchema.parse(response.json()).library.library_version, 3);
    assert.equal(harness.notificationErrors.length, 1);
  } finally {
    await harness.close();
  }
});

test("a household can disable Bell shared-meme signals without losing direct pulls", async () => {
  const harness = createHarness();
  try {
    const disabled = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: cookie() },
      payload: {
        shared_data_preferences: { shared_meme_update_signals_enabled: false },
      },
    });
    assert.equal(disabled.statusCode, 200);

    const versions: number[] = [];
    const connection = await harness.bellService.connect(BELL_CREDENTIAL, {
      send: (event, data) => {
        if (event === "update_available") versions.push(Number(data.available_version));
      },
      heartbeat: () => undefined,
      close: () => undefined,
    });
    const publishedWhileDisabled = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "关闭提示仍能直拉" },
    });
    assert.equal(publishedWhileDisabled.statusCode, 200);
    assert.deepEqual(versions, []);

    const directPull = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/sync?after_version=1",
      headers: { authorization: `Bearer ${MCP_CREDENTIAL}` },
    });
    assert.equal(directPull.statusCode, 200);
    assert.equal(sharedMemeBackendPullSuccessSchema.parse(directPull.json()).library_version, 2);

    const enabled = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: cookie() },
      payload: {
        shared_data_preferences: { shared_meme_update_signals_enabled: true },
      },
    });
    assert.equal(enabled.statusCode, 200);
    const publishedAfterEnable = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "重新打开后收到提示" },
    });
    assert.equal(publishedAfterEnable.statusCode, 200);
    assert.deepEqual(versions, [3]);
    connection.close();
  } finally {
    await harness.close();
  }
});

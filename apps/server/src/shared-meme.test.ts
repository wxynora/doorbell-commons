import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  sharedMemeAddSuccessSchema,
  sharedMemeDetailSuccessSchema,
  sharedMemeErrorSchema,
  sharedMemeLibraryMetadataSchema,
  sharedMemeListSuccessSchema,
  sharedMemeVersionHintEventType,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import { ConnectorService } from "./connector-service.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { MailboxService } from "./mailbox-service.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";
import { SharedMemeService } from "./shared-meme-service.js";

const QQ_NUMBER = "3877162412";
const SESSION_TOKEN = "shared-meme-human-session";
const CONNECTOR_CREDENTIAL = `dbc_${"M".repeat(43)}`;

class FakeGroupMembership implements QqGroupMembershipReader {
  current = true;
  unavailable = false;

  async isCurrentMember(_groupId: string, _qqNumber: string): Promise<boolean> {
    if (this.unavailable) {
      throw new OneBotUnavailableError("fake OneBot unavailable");
    }
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
  const now = { value: Date.UTC(2026, 7, 14, 12, 0, 0) };
  let connectorEventNumber = 0;
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => SESSION_TOKEN,
  });
  const membership = new FakeGroupMembership();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => now.value,
  });
  const mailboxService = new MailboxService({ database, now: () => now.value });
  const connectorService = new ConnectorService({
    database,
    registrationAuth,
    mailboxService,
    deliveryGeneration: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    now: () => now.value,
    generateCredential: () => CONNECTOR_CREDENTIAL,
    generateId: () => {
      connectorEventNumber += 1;
      return `00000000-0000-4000-8000-${String(connectorEventNumber).padStart(12, "0")}`;
    },
  });
  const sharedMemeService = new SharedMemeService({
    databasePath,
    now: () => now.value,
    temporaryRoot: directory,
  });
  const session = database.createHumanSession(QQ_NUMBER, now.value, {
    residentName: "辛玥 & 小渡",
    homeName: "辛玥的小家",
    farmDoorplate: "3ET3FE",
    farmHumanKey: "server-only-human-key",
  });
  assert.equal(session.token, SESSION_TOKEN);
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    connectorService,
    mailboxService,
    sharedMemeService,
    secureCookies: false,
    logger: false,
  });

  return {
    app,
    database,
    databasePath,
    directory,
    connectorService,
    membership,
    now,
    sharedMemeService,
    residentId: session.community.resident.residentId,
    async issueConnectorCredential() {
      return connectorService.issueCredential(SESSION_TOKEN);
    },
    async close() {
      await app.close();
      sharedMemeService.close();
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("approved embedded baseline publishes an authenticated slim SQLite snapshot", async () => {
  const harness = createHarness();
  try {
    const listResponse = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
    });
    assert.equal(listResponse.statusCode, 200);
    const list = sharedMemeListSuccessSchema.parse(listResponse.json());
    assert.equal(list.library.library_version, 1);
    assert.equal(list.library.entry_count, 317);
    assert.equal(list.memes.length, 317);
    assert.equal(list.memes[0]?.term, "问就是XX？");
    assert.equal(list.memes[0]?.aliases.length, 3);
    assert.equal(list.memes[1]?.examples.length, 2);
    assert.equal(list.memes.filter((meme) => meme.meaning === null).length, 77);
    assert.equal(list.memes.filter((meme) => meme.usage === null).length, 89);
    const detailResponse = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes/1",
      headers: { cookie: cookie() },
    });
    assert.equal(detailResponse.statusCode, 200);
    assert.equal(
      sharedMemeDetailSuccessSchema.parse(detailResponse.json()).meme.term,
      "问就是XX？",
    );

    await harness.issueConnectorCredential();
    const versionResponse = await harness.app.inject({
      method: "GET",
      url: "/api/connector/shared-memes/version",
      headers: { authorization: `Bearer ${CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(versionResponse.statusCode, 200);
    const metadata = sharedMemeLibraryMetadataSchema.parse(versionResponse.json());
    const snapshotResponse = await harness.app.inject({
      method: "GET",
      url: "/api/connector/shared-memes/snapshot",
      headers: { authorization: `Bearer ${CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(snapshotResponse.statusCode, 200);
    assert.equal(snapshotResponse.headers["content-type"], "application/vnd.sqlite3");
    const snapshot = snapshotResponse.rawPayload;
    assert.equal(snapshot.length, metadata.size_bytes);
    assert.equal(createHash("sha256").update(snapshot).digest("hex"), metadata.checksum_sha256);

    const snapshotPath = join(harness.directory, "inspection.sqlite");
    writeFileSync(snapshotPath, snapshot);
    const inspection = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(
        (inspection.prepare("SELECT COUNT(*) AS count FROM memes").get() as { count: number })
          .count,
        317,
      );
      assert.equal(
        (
          inspection.prepare("SELECT COUNT(*) AS count FROM meme_aliases").get() as {
            count: number;
          }
        ).count,
        134,
      );
      assert.deepEqual(
        (
          inspection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .all() as Array<{ name: string }>
        )
          .map((row) => row.name)
          .filter((name) =>
            ["source_entries", "meme_source_links", "dedupe_events", "contributors"].includes(name),
          ),
        [],
      );
      assert.equal(
        (inspection.pragma("integrity_check") as [{ integrity_check: string }])[0].integrity_check,
        "ok",
      );
    } finally {
      inspection.close();
    }
    assert.equal(
      readFileSync(harness.databasePath).includes(Buffer.from(CONNECTOR_CREDENTIAL)),
      false,
    );
  } finally {
    await harness.close();
  }
});

test("human shared meme API is strict and separates auth, departure, and OneBot outage", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({ method: "GET", url: "/api/shared-memes" });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      sharedMemeErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    const missingTerm = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { meaning: "缺少 term" },
    });
    assert.equal(missingTerm.statusCode, 400);
    const extraField = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "新梗", moderation: "approved" },
    });
    assert.equal(extraField.statusCode, 400);

    harness.membership.unavailable = true;
    const outage = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "上游故障不落库" },
    });
    assert.equal(outage.statusCode, 503);
    assert.equal(sharedMemeErrorSchema.parse(outage.json()).error.code, "onebot_unavailable");
    assert.equal(harness.sharedMemeService.getMetadata().library_version, 1);

    harness.membership.unavailable = false;
    harness.membership.current = false;
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(sharedMemeErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
    const revoked = await harness.app.inject({
      method: "GET",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
    });
    assert.equal(revoked.statusCode, 401);
  } finally {
    await harness.close();
  }
});

test("Connector snapshot access requires its own credential and live membership", async () => {
  const harness = createHarness();
  try {
    await harness.issueConnectorCredential();
    const missing = await harness.app.inject({
      method: "GET",
      url: "/api/connector/shared-memes/version",
    });
    assert.equal(missing.statusCode, 401);
    const invalid = await harness.app.inject({
      method: "GET",
      url: "/api/connector/shared-memes/version",
      headers: { authorization: `Bearer dbc_${"X".repeat(43)}` },
    });
    assert.equal(invalid.statusCode, 401);

    harness.membership.unavailable = true;
    const outage = await harness.app.inject({
      method: "GET",
      url: "/api/connector/shared-memes/version",
      headers: { authorization: `Bearer ${CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(outage.statusCode, 503);
    assert.equal(sharedMemeErrorSchema.parse(outage.json()).error.code, "onebot_unavailable");

    harness.membership.unavailable = false;
    harness.membership.current = false;
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/connector/shared-memes/version",
      headers: { authorization: `Bearer ${CONNECTOR_CREDENTIAL}` },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(sharedMemeErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
  } finally {
    await harness.close();
  }
});

test("exact term and alias duplicates do not publish while concurrent add publishes one version hint", async () => {
  const harness = createHarness();
  try {
    const duplicateTerm = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "问就是XX？" },
    });
    assert.equal(duplicateTerm.statusCode, 409);
    assert.equal(
      sharedMemeErrorSchema.parse(duplicateTerm.json()).error.code,
      "duplicate_shared_meme_term",
    );
    const duplicateAlias = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "独立新词", aliases: ["问就是"] },
    });
    assert.equal(duplicateAlias.statusCode, 409);
    assert.equal(
      sharedMemeErrorSchema.parse(duplicateAlias.json()).error.code,
      "duplicate_shared_meme_alias",
    );
    assert.equal(harness.sharedMemeService.getMetadata().library_version, 1);

    await harness.issueConnectorCredential();
    const payload = {
      term: " 新增 梗！ ",
      category: "日常聊天",
      type: "口头禅",
      meaning: null,
      aliases: ["这是新增梗"],
      examples: ["这是一个新增示例。"],
      keywords: ["新增"],
    };
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
    const success = first.statusCode === 200 ? first : second;
    const created = sharedMemeAddSuccessSchema.parse(success.json());
    assert.equal(created.library.library_version, 2);
    assert.equal(created.library.entry_count, 318);
    assert.equal(created.meme.term, payload.term);
    assert.equal(created.meme.normalized_term, "新增梗");
    assert.equal(harness.sharedMemeService.getMetadata().library_version, 2);

    const inspection = new Database(harness.databasePath, { readonly: true });
    try {
      assert.equal(
        (
          inspection
            .prepare("SELECT COUNT(*) AS count FROM shared_meme_entries WHERE normalized_term = ?")
            .get("新增梗") as { count: number }
        ).count,
        1,
      );
      assert.equal(
        (
          inspection.prepare("SELECT COUNT(*) AS count FROM shared_meme_releases").get() as {
            count: number;
          }
        ).count,
        2,
      );
      assert.deepEqual(
        (
          inspection
            .prepare("SELECT event_type, payload_json FROM connector_events ORDER BY cursor")
            .all() as Array<{ event_type: string; payload_json: string }>
        ).map((event) => ({
          eventType: event.event_type,
          payload: JSON.parse(event.payload_json) as unknown,
        })),
        [
          {
            eventType: sharedMemeVersionHintEventType,
            payload: { library_version: 2 },
          },
        ],
      );
      assert.equal(
        (
          inspection.prepare("SELECT COUNT(*) AS count FROM mailbox_letters").get() as {
            count: number;
          }
        ).count,
        0,
      );
    } finally {
      inspection.close();
    }
  } finally {
    await harness.close();
  }
});

test("a failed Connector version hint cannot turn a published shared meme into an HTTP failure", async () => {
  const harness = createHarness();
  try {
    harness.connectorService.emitSharedMemeVersionHint = () => {
      throw new Error("simulated Connector hint failure");
    };
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/shared-memes",
      headers: { cookie: cookie() },
      payload: { term: "通知失败也已成功发布" },
    });
    assert.equal(response.statusCode, 200);
    const created = sharedMemeAddSuccessSchema.parse(response.json());
    assert.equal(created.library.library_version, 2);
    assert.equal(created.meme.normalized_term, "通知失败也已成功发布");
    assert.equal(harness.sharedMemeService.getMetadata().library_version, 2);
    assert.equal(harness.sharedMemeService.get(created.meme.meme_id).meme.term, created.meme.term);
  } finally {
    await harness.close();
  }
});

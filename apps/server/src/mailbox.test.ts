import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  mailboxDetailSuccessSchema,
  mailboxErrorSchema,
  mailboxListSuccessSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { CommunityDatabase, MailboxIdempotencyConflictError } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import {
  FarmRewardUnavailableError,
  type FarmWelcomeRewardGranter,
  type FarmWelcomeRewardGrantInput,
} from "./farm-reward-client.js";
import { MailboxSecretRejectedError, MailboxService } from "./mailbox-service.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const QQ_NUMBER = "3877162412";
const START_TIME = Date.UTC(2026, 7, 13, 8, 0, 0);

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
    throw new Error("Mailbox requests must not query the farm");
  }

  async lookupFarmByHumanKey(_farmHumanKey: string): Promise<FarmDirectoryEntry> {
    throw new Error("Mailbox requests must not query the farm");
  }

  async readFarmOverview(_farmDoorplate: string): Promise<BoundFarmOverview> {
    throw new Error("Mailbox requests must not query the farm");
  }

  async readFarmHumanPage(
    _farmHumanKey: string,
    _pagePath: string,
    _query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    throw new Error("Mailbox requests must not query the farm");
  }

  async submitFarmHumanAction(
    _farmHumanKey: string,
    _actionPath: string,
    _form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    throw new Error("Mailbox requests must not query the farm");
  }
}

class FakeFarmRewardGranter implements FarmWelcomeRewardGranter {
  readonly calls: FarmWelcomeRewardGrantInput[] = [];
  unavailable = false;

  async grantWelcomeReward(input: FarmWelcomeRewardGrantInput): Promise<void> {
    this.calls.push(input);
    if (this.unavailable) {
      throw new FarmRewardUnavailableError("fake farm reward unavailable");
    }
  }
}

function cookie(token: string): string {
  return `doorbell_session=${token}`;
}

function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-mailbox-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const now = { value: START_TIME };
  const letterIds: string[] = [];
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => "mailbox-human-session-token",
  });
  const membership = new FakeGroupMembership();
  const rewardGranter = new FakeFarmRewardGranter();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => now.value,
  });
  const mailbox = new MailboxService({
    database,
    farmRewardGranter: rewardGranter,
    now: () => now.value,
    generateLetterId: () => {
      const id = `00000000-0000-4000-8000-${String(letterIds.length + 1).padStart(12, "0")}`;
      letterIds.push(id);
      return id;
    },
  });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    mailboxService: mailbox,
    secureCookies: false,
    logger: false,
  });
  const session = database.createHumanSession(QQ_NUMBER, now.value, {
    residentName: "渡",
    homeName: "渡的小家",
    farmDoorplate: "3ET3FE",
    farmHumanKey: "private-farm-human-key",
  });

  return {
    app,
    database,
    databasePath,
    directory,
    mailbox,
    membership,
    rewardGranter,
    now,
    homeId: session.community.home.homeId,
    sessionCookie: cookie(session.token),
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

test("one letter body is shared while human and resident read state stays independent", async () => {
  const harness = createHarness();
  try {
    const delivered = harness.mailbox.deliver({
      homeId: harness.homeId,
      idempotencyKey: "system:maintenance:2026-08-13",
      category: "system",
      title: "系统维护完成",
      body: "社区服务已经恢复。",
      sensitiveValues: ["private-farm-human-key"],
    });

    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "human", 1).letters[0]?.isNew,
      true,
    );
    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "resident", 1).letters[0]?.isNew,
      true,
    );

    const opened = await harness.app.inject({
      method: "GET",
      url: `/api/mailbox/${delivered.letterId}`,
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(opened.statusCode, 200);
    const detail = mailboxDetailSuccessSchema.parse(opened.json()).letter;
    assert.equal(detail.body, "社区服务已经恢复。");
    assert.equal(detail.is_new, false);

    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "human", 1).letters[0]?.isNew,
      false,
    );
    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "resident", 1).letters[0]?.isNew,
      true,
    );
    harness.mailbox.openForAudience(harness.homeId, "resident", delivered.letterId);
    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "resident", 1).letters[0]?.isNew,
      false,
    );

    const inspection = new Database(harness.databasePath, { readonly: true });
    try {
      assert.equal(
        (
          inspection
            .prepare("SELECT COUNT(*) AS count FROM mailbox_letters WHERE body = ?")
            .get("社区服务已经恢复。") as { count: number }
        ).count,
        1,
      );
      assert.equal(
        (
          inspection
            .prepare("SELECT COUNT(*) AS count FROM mailbox_read_states WHERE letter_id = ?")
            .get(delivered.letterId) as { count: number }
        ).count,
        2,
      );
    } finally {
      inspection.close();
    }
  } finally {
    await harness.close();
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

test("welcome letter is delivered once and either audience claims one shared real reward", async () => {
  const harness = createHarness();
  try {
    const first = harness.mailbox.ensureWelcomeLetter(harness.homeId, "private-farm-human-key");
    const repeated = harness.mailbox.ensureWelcomeLetter(harness.homeId, "private-farm-human-key");
    assert.equal(repeated.letterId, first.letterId);
    assert.equal(first.title, "欢迎入住 Doorbell Commons！");
    assert.equal(
      first.body,
      "欢迎入住 Doorbell Commons！\n\n从今天起，这里也有一盏为你亮着的灯啦。我们准备了一份小小的入住礼物：随机 SSR 种子 ×1、银币 ×200。\n\n愿你在铃野认识新朋友，也常常带着故事回家。",
    );
    assert.deepEqual(first.attachment, {
      attachmentType: "farm_reward",
      status: "available",
    });

    const rejectedTarget = await harness.app.inject({
      method: "POST",
      url: `/api/mailbox/${first.letterId}/claim`,
      headers: { cookie: harness.sessionCookie },
      payload: { farm_doorplate: "ZZZ999" },
    });
    assert.equal(rejectedTarget.statusCode, 400);
    assert.equal(harness.rewardGranter.calls.length, 0);

    const claimed = await harness.app.inject({
      method: "POST",
      url: `/api/mailbox/${first.letterId}/claim`,
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(claimed.statusCode, 200);
    const claimedLetter = mailboxDetailSuccessSchema.parse(claimed.json()).letter;
    assert.equal(claimedLetter.attachment?.status, "claimed");
    assert.deepEqual(harness.rewardGranter.calls, [
      {
        grantId: `doorbell-mailbox:${first.letterId}`,
        farmDoorplate: "3ET3FE",
        farmHumanKey: "private-farm-human-key",
      },
    ]);
    assert.doesNotMatch(claimed.body, /private-farm-human-key|ZZZ999/u);
    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "resident", 1).letters[0]?.attachment?.status,
      "claimed",
    );
    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "resident", 1).letters[0]?.isNew,
      true,
    );

    const repeatedClaim = await harness.mailbox.claimFarmReward(
      harness.homeId,
      "resident",
      first.letterId,
    );
    assert.equal(repeatedClaim.attachment?.status, "claimed");
    assert.equal(harness.rewardGranter.calls.length, 1);
  } finally {
    await harness.close();
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

test("failed farm reward stays available for an explicit safe retry", async () => {
  const harness = createHarness();
  try {
    const letter = harness.mailbox.ensureWelcomeLetter(harness.homeId, "private-farm-human-key");
    harness.rewardGranter.unavailable = true;
    const failed = await harness.app.inject({
      method: "POST",
      url: `/api/mailbox/${letter.letterId}/claim`,
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(failed.statusCode, 503);
    assert.equal(mailboxErrorSchema.parse(failed.json()).error.code, "farm_unavailable");
    assert.equal(
      harness.mailbox.listForAudience(harness.homeId, "human", 1).letters[0]?.attachment?.status,
      "available",
    );

    harness.rewardGranter.unavailable = false;
    const retried = await harness.app.inject({
      method: "POST",
      url: `/api/mailbox/${letter.letterId}/claim`,
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(retried.statusCode, 200);
    assert.equal(
      mailboxDetailSuccessSchema.parse(retried.json()).letter.attachment?.status,
      "claimed",
    );
    assert.equal(harness.rewardGranter.calls.length, 2);
  } finally {
    await harness.close();
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

test("human mailbox API paginates by eight, filters category, and removes NEW after opening", async () => {
  const harness = createHarness();
  try {
    const deliveredIds: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      harness.now.value += 1;
      deliveredIds.push(
        harness.mailbox.deliver({
          homeId: harness.homeId,
          idempotencyKey: `system:${index}`,
          category: "system",
          title: `系统信 ${index}`,
          body: `系统正文 ${index}`,
          sensitiveValues: [],
        }).letterId,
      );
    }
    for (let index = 0; index < 3; index += 1) {
      harness.now.value += 1;
      harness.mailbox.deliver({
        homeId: harness.homeId,
        idempotencyKey: `farm:${index}`,
        category: "farm",
        title: `农场信 ${index}`,
        body: `农场正文 ${index}`,
        sensitiveValues: [],
      });
    }

    const firstPageResponse = await harness.app.inject({
      method: "GET",
      url: "/api/mailbox?page=1",
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(firstPageResponse.statusCode, 200);
    const firstPage = mailboxListSuccessSchema.parse(firstPageResponse.json());
    assert.equal(firstPage.letters.length, 8);
    assert.deepEqual(firstPage.pagination, {
      page: 1,
      page_size: 8,
      total_items: 13,
      total_pages: 2,
    });
    assert.equal("body" in (firstPage.letters[0] ?? {}), false);

    const secondPageResponse = await harness.app.inject({
      method: "GET",
      url: "/api/mailbox?page=2",
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(mailboxListSuccessSchema.parse(secondPageResponse.json()).letters.length, 5);

    const farmPageResponse = await harness.app.inject({
      method: "GET",
      url: "/api/mailbox?category=farm",
      headers: { cookie: harness.sessionCookie },
    });
    const farmPage = mailboxListSuccessSchema.parse(farmPageResponse.json());
    assert.equal(farmPage.pagination.total_items, 3);
    assert.ok(farmPage.letters.every((letter) => letter.category === "farm"));

    const opened = await harness.app.inject({
      method: "GET",
      url: `/api/mailbox/${deliveredIds[9]}`,
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(mailboxDetailSuccessSchema.parse(opened.json()).letter.is_new, false);
    const refreshed = mailboxListSuccessSchema.parse(
      (
        await harness.app.inject({
          method: "GET",
          url: "/api/mailbox?category=system",
          headers: { cookie: harness.sessionCookie },
        })
      ).json(),
    );
    assert.equal(
      refreshed.letters.find((letter) => letter.letter_id === deliveredIds[9])?.is_new,
      false,
    );

    const invalid = await harness.app.inject({
      method: "GET",
      url: "/api/mailbox?page=1&extra=1",
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(mailboxErrorSchema.parse(invalid.json()).error.code, "invalid_request");
  } finally {
    await harness.close();
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

test("delivery is idempotent and known or caller-declared secrets never reach SQLite", async () => {
  const harness = createHarness();
  const farmHumanUrl = "https://farm.example/farm/ui/private-key/ta";
  const connectorCredential = "dbc_private_connector_secret";
  const mcpCredential = "dbm_private_mcp_secret";
  const bellCredential = "dbb_private_bell_secret";
  const opaqueSecret = "opaque-private-value";
  try {
    const input = {
      homeId: harness.homeId,
      idempotencyKey: "system:idempotent",
      category: "system" as const,
      title: "同一封信",
      body: "同一份正文",
      sensitiveValues: [] as string[],
    };
    const first = harness.mailbox.deliver(input);
    const repeated = harness.mailbox.deliver(input);
    assert.equal(repeated.letterId, first.letterId);
    assert.throws(
      () => harness.mailbox.deliver({ ...input, body: "另一份正文" }),
      MailboxIdempotencyConflictError,
    );

    for (const [body, sensitiveValues] of [
      [`打开 ${farmHumanUrl}`, []],
      [`凭据 ${connectorCredential}`, []],
      [`凭据 ${mcpCredential}`, []],
      [`凭据 ${bellCredential}`, []],
      [`敏感值 ${opaqueSecret}`, [opaqueSecret]],
    ] as const) {
      assert.throws(
        () =>
          harness.mailbox.deliver({
            homeId: harness.homeId,
            idempotencyKey: `secret-check:${sensitiveValues.length}:${body.length}`,
            category: "system",
            title: "不应保存",
            body,
            sensitiveValues,
          }),
        (error: unknown) => {
          assert.ok(error instanceof MailboxSecretRejectedError);
          assert.doesNotMatch(
            error.message,
            /private-key|dbc_private|dbm_private|dbb_private|opaque-private/u,
          );
          return true;
        },
      );
    }

    const inspection = new Database(harness.databasePath, { readonly: true });
    try {
      assert.equal(
        (
          inspection.prepare("SELECT COUNT(*) AS count FROM mailbox_letters").get() as {
            count: number;
          }
        ).count,
        1,
      );
    } finally {
      inspection.close();
    }
  } finally {
    await harness.close();
    const databaseBytes = readFileSync(harness.databasePath).toString("utf8");
    assert.doesNotMatch(
      databaseBytes,
      /private-key|dbc_private|dbm_private|dbb_private|opaque-private/u,
    );
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

test("mailbox access requires a live group-qualified human session", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({ method: "GET", url: "/api/mailbox" });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      mailboxErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.current = false;
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/mailbox",
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(mailboxErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");

    const revoked = await harness.app.inject({
      method: "GET",
      url: "/api/mailbox",
      headers: { cookie: harness.sessionCookie },
    });
    assert.equal(revoked.statusCode, 401);
  } finally {
    await harness.close();
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

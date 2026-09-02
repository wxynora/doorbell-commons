import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type LingyeDailyPublishRequest,
  lingyeDailyErrorSchema,
  lingyeDailyLatestSuccessSchema,
  lingyeDailyPublishSuccessSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { LingyeDailyService } from "./lingye-daily-service.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const NOW = Date.UTC(2026, 7, 16, 0, 0, 0);
const SESSION_TOKEN = "lingye-daily-human-session";
const PUBLISH_TOKEN = "lingye-daily-publish-secret";

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();
  unavailable = false;

  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    if (this.unavailable) throw new OneBotUnavailableError("fake OneBot unavailable");
    return this.members.has(qqNumber);
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(_farmDoorplate: string): Promise<FarmDirectoryEntry> {
    throw new Error("Lingye Daily must not query the farm");
  }

  async lookupFarmByHumanKey(_farmHumanKey: string): Promise<FarmDirectoryEntry> {
    throw new Error("Lingye Daily must not query a farm credential");
  }

  async readFarmOverview(_farmDoorplate: string): Promise<BoundFarmOverview> {
    throw new Error("Lingye Daily must not query the farm");
  }

  async readFarmHumanPage(
    _farmHumanKey: string,
    _pagePath: string,
    _query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    throw new Error("Lingye Daily must not query a farm page");
  }

  async submitFarmHumanAction(
    _farmHumanKey: string,
    _actionPath: string,
    _form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    throw new Error("Lingye Daily must not submit a farm action");
  }
}

function initialIssue(): LingyeDailyPublishRequest {
  return {
    reporter_articles: [],
    issue_date: "2026-08-16",
    revision: 1,
    revision_note: null,
    period_start: "2026-08-15T05:00:00+08:00",
    period_end: "2026-08-16T04:59:59+08:00",
    coverage_status: "complete",
    coverage_note: "",
    generated_at: "2026-08-16T05:00:08+08:00",
    editor_model: "gpt-5.6-terra",
    screening_model: "gpt-5.6-terra",
    front_page: {
      title: "人类郑重宣布不熬夜，然后把宵夜点成双份",
      paragraphs: [
        "计划刚刚落地，宵夜已经从讨论项变成双份订单。",
        "整场转折没有浪费一分钟，只有睡眠计划被留在了原地。",
      ],
      source_event_ids: ["E1"],
      image_ids: ["img-1"],
    },
    group_chat: {
      summary:
        "大家先认真决定不熬夜，随后又认真决定宵夜点两份。人类对计划的尊重，主要体现在郑重地改掉它。",
      topics: [
        {
          text: "不熬夜计划无缝切换为双份宵夜",
          source_event_ids: ["E1"],
        },
      ],
    },
    behavior_slices: [
      {
        title: "睡眠计划的存活时间",
        body: "大家先决定不熬夜，随后又把宵夜点成双份。人类制定计划时很郑重，修改计划时也一样郑重。",
        source_event_ids: ["E1"],
        image_ids: ["img-1"],
      },
    ],
    quotes: [
      {
        text: "最后一致决定点两份",
        source_label: "小满",
        source_message_ids: ["m2"],
      },
    ],
    farm_observation: null,
    submissions: [],
    tomorrow_question: {
      text: "下一份计划能坚持到宵夜下单前吗？",
      source_event_ids: ["E1"],
    },
    images: [
      {
        image_id: "img-1",
        media_type: "image/gif",
        data_base64: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      },
    ],
  };
}

function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-lingye-daily-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => SESSION_TOKEN,
  });
  const membership = new FakeGroupMembership();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => NOW,
  });
  const service = new LingyeDailyService({
    database,
    publishToken: PUBLISH_TOKEN,
    now: () => NOW,
  });
  const session = database.createHumanSession("10001", NOW, {
    residentName: "小一",
    homeName: "纸灯小屋",
    farmDoorplate: "ABC234",
    farmHumanKey: "test-only-farm-key",
  });
  assert.equal(session.token, SESSION_TOKEN);
  membership.members.add("10001");
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    lingyeDailyService: service,
    secureCookies: false,
    logger: false,
  });
  return {
    app,
    database,
    databasePath,
    directory,
    membership,
    async close() {
      await app.close();
      database.close();
      rmSync(directory, { force: true, recursive: true });
    },
  };
}

function humanCookie(): string {
  return `doorbell_session=${SESSION_TOKEN}`;
}

test("Lingye Daily stores only the final issue and serves it to an active human session", async () => {
  const harness = createHarness();
  try {
    const empty = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-daily/latest",
      headers: { cookie: humanCookie() },
    });
    assert.equal(empty.statusCode, 200);
    assert.equal(lingyeDailyLatestSuccessSchema.parse(empty.json()).issue, null);

    const unauthenticatedPublish = await harness.app.inject({
      method: "POST",
      url: "/api/internal/lingye-daily/issues",
      payload: initialIssue(),
    });
    assert.equal(unauthenticatedPublish.statusCode, 401);
    assert.equal(
      lingyeDailyErrorSchema.parse(unauthenticatedPublish.json()).error.code,
      "authentication_required",
    );

    const created = await harness.app.inject({
      method: "POST",
      url: "/api/internal/lingye-daily/issues",
      headers: { authorization: `Bearer ${PUBLISH_TOKEN}` },
      payload: initialIssue(),
    });
    assert.equal(created.statusCode, 200);
    assert.deepEqual(lingyeDailyPublishSuccessSchema.parse(created.json()), {
      published: true,
      status: "created",
      issue_date: "2026-08-16",
      issue_number: 1,
      revision: 1,
      published_at: "2026-08-16T00:00:00.000Z",
    });

    const storedDatabase = new Database(harness.databasePath, { readonly: true });
    try {
      const columns = storedDatabase.pragma("table_info(lingye_daily_issues)") as Array<{
        name: string;
      }>;
      assert.equal(
        columns.some((column) => /message|speaker|qq/iu.test(column.name)),
        false,
      );
      const stored = storedDatabase
        .prepare(
          `SELECT issue_date, revision, editor_model, screening_model, edition_json
           FROM lingye_daily_issues`,
        )
        .get() as Record<string, unknown>;
      assert.equal(stored.issue_date, "2026-08-16");
      assert.equal(stored.revision, 1);
      assert.equal(stored.editor_model, "gpt-5.6-terra");
      assert.equal(stored.screening_model, "gpt-5.6-terra");
      assert.doesNotMatch(JSON.stringify(stored), /speaker_name|reply_to/iu);
      assert.match(JSON.stringify(stored), /source_event_ids/iu);
      assert.match(JSON.stringify(stored), /source_message_ids/iu);
    } finally {
      storedDatabase.close();
    }

    const latest = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-daily/latest",
      headers: { cookie: humanCookie() },
    });
    assert.equal(latest.statusCode, 200);
    const issue = lingyeDailyLatestSuccessSchema.parse(latest.json()).issue;
    assert.equal(issue?.issue_number, 1);
    assert.equal(issue?.editor_model, "gpt-5.6-terra");
    assert.deepEqual(issue?.group_chat.topics, ["不熬夜计划无缝切换为双份宵夜"]);
    assert.equal(issue?.front_page?.title, "人类郑重宣布不熬夜，然后把宵夜点成双份");
    assert.deepEqual(issue?.front_page?.image_urls, [
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    ]);
    assert.equal(issue?.behavior_slices[0]?.title, "睡眠计划的存活时间");
    assert.deepEqual(issue?.behavior_slices[0]?.image_urls, [
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    ]);
    assert.equal(issue?.quotes[0]?.source_label, "小满");
    assert.equal(issue?.farm_observation, null);
    assert.deepEqual(issue?.submissions, []);
    assert.equal(issue?.tomorrow_question?.text, "下一份计划能坚持到宵夜下单前吗？");
    assert.equal(JSON.stringify(issue).includes("source_event_ids"), false);
    assert.equal(JSON.stringify(issue).includes("source_message_ids"), false);

    const unauthenticatedRead = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-daily/latest",
    });
    assert.equal(unauthenticatedRead.statusCode, 401);

    harness.membership.members.clear();
    const ineligibleRead = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-daily/latest",
      headers: { cookie: humanCookie() },
    });
    assert.equal(ineligibleRead.statusCode, 403);
    assert.equal(
      lingyeDailyErrorSchema.parse(ineligibleRead.json()).error.code,
      "qq_not_group_member",
    );
  } finally {
    await harness.close();
  }
});

test("Lingye Daily publish is idempotent and accepts only the next explicit revision", async () => {
  const harness = createHarness();
  try {
    const publish = (payload: LingyeDailyPublishRequest) =>
      harness.app.inject({
        method: "POST",
        url: "/api/internal/lingye-daily/issues",
        headers: { authorization: `Bearer ${PUBLISH_TOKEN}` },
        payload,
      });

    const wrongPeriod = initialIssue();
    wrongPeriod.period_start = "2026-08-15T06:00:00+08:00";
    const invalid = await publish(wrongPeriod);
    assert.equal(invalid.statusCode, 400);
    assert.equal(lingyeDailyErrorSchema.parse(invalid.json()).error.code, "invalid_request");

    assert.equal((await publish(initialIssue())).statusCode, 200);
    const duplicate = await publish(initialIssue());
    assert.equal(duplicate.statusCode, 200);
    assert.equal(lingyeDailyPublishSuccessSchema.parse(duplicate.json()).status, "duplicate");

    const conflicting = initialIssue();
    conflicting.group_chat.summary = "同一期号被换成另一篇正文。";
    const conflict = await publish(conflicting);
    assert.equal(conflict.statusCode, 409);
    assert.equal(lingyeDailyErrorSchema.parse(conflict.json()).error.code, "idempotency_conflict");

    const revision = initialIssue();
    revision.revision = 2;
    revision.revision_note = "更正群聊话题表述。";
    revision.generated_at = "2026-08-16T06:00:00+08:00";
    revision.group_chat.summary =
      "大家先认真决定不熬夜，随后认真决定宵夜只点一份。人类修订计划时，连夜宵也会跟着过审。";
    const revised = await publish(revision);
    assert.equal(revised.statusCode, 200);
    assert.equal(lingyeDailyPublishSuccessSchema.parse(revised.json()).status, "revised");

    const skippedRevision = { ...revision, revision: 4, revision_note: "跳号。" };
    const skipped = await publish(skippedRevision);
    assert.equal(skipped.statusCode, 409);
  } finally {
    await harness.close();
  }
});

test("Lingye Daily implementation has no QQ send path", () => {
  const sources = [
    readFileSync(new URL("./app.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./lingye-daily-service.ts", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /send_group_msg|send_private_msg|send_msg/iu);
});

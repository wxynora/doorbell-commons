import assert from "node:assert/strict";
import test from "node:test";
import {
  boundConstableInterviewErrorSchema,
  boundConstableInterviewSuccessSchema,
  type FarmHumanConstableInterviewSuccess,
} from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import type {
  FarmConstableInterviewActioner,
  FarmConstableInterviewPublicNoticeOpener,
  FarmConstableInterviewReader,
} from "./farm-constable-interview-client.js";
import type { FarmDirectoryEntry, FarmDirectoryReader } from "./farm-directory-client.js";
import { OneBotUnavailableError } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";
import { serializeHumanSessionCookie } from "./session-cookie.js";

const GROUP_ID = "test-group";
const SCHEDULED_AT = 1_788_000_000_000;
const SCHEDULED_AT_ISO = new Date(SCHEDULED_AT).toISOString();
const FARM_DOORPLATES = ["ABC234", "DEF567", "GHJ789", "KLM234"];

const INTERVIEW_TEMPLATE = {
  interview_id: "interview-1",
  attempt_id: "attempt-1",
  candidate_resident_id: "resident-candidate",
  scheduled_at: SCHEDULED_AT_ISO,
  status: "panel_ready" as "panel_ready" | "scoring",
  signup_open_at: new Date(SCHEDULED_AT - 43_200_000).toISOString(),
  attendance_confirmation_open_at: new Date(SCHEDULED_AT - 1_800_000).toISOString(),
  score_count: 0,
  self: {
    signed_up: true,
    signup_order: 1,
    tentative: true,
    attendance_confirmed: true,
    selected: true,
    score_submitted: false,
    signup_eligible: false,
  },
  interview_material: {
    bank_version: "constable-v1",
    paper: { version: "paper-1", questions: [] },
    fact_material: { version: "facts-1", facts: [] },
    scoring_standard: {
      version: "standard-1",
      dimensions: ["facts", "restraint", "procedure", "explanation"],
      minimumDimensionAverage: 3,
      minimumTotalAverage: 16,
    },
  },
  public_notice: null,
};

function responseFor(
  interview: typeof INTERVIEW_TEMPLATE = INTERVIEW_TEMPLATE,
): FarmHumanConstableInterviewSuccess {
  return {
    subject: {
      farm_doorplate: FARM_DOORPLATES[0] ?? "ABC234",
      account_id: "account-1",
      resident_id: "resident-1",
    },
    data: { interviews: [interview] },
    server_time: SCHEDULED_AT_ISO,
  };
}

class TestFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry> {
    return { farmDoorplate, farmName: "测试农场" };
  }
  async lookupFarmByHumanKey(): Promise<never> {
    throw new Error("not used");
  }
  async readFarmOverview(farmDoorplate: string) {
    return { farmDoorplate, farmName: "测试农场", plots: [] };
  }
  async readFarmHumanPage(): Promise<never> {
    throw new Error("not used");
  }
  async submitFarmHumanAction(): Promise<never> {
    throw new Error("not used");
  }
}

interface TestHarness {
  app: ReturnType<typeof buildApp>;
  database: CommunityDatabase;
  group: {
    removed: Set<string>;
    unavailable: boolean;
    outageAfter: number | null;
    calls: string[];
    isCurrentMember(groupId: string, qqNumber: string): Promise<boolean>;
  };
  reader: FarmConstableInterviewReader & { calls: unknown[]; next: unknown };
  actioner: FarmConstableInterviewActioner & { calls: unknown[]; next: unknown };
  opener: FarmConstableInterviewPublicNoticeOpener & { calls: unknown[] };
  sessions: Array<{ token: string; qqNumber: string; accountId: string; residentId: string }>;
  close(): Promise<void>;
}

function createHarness(userCount = 1): TestHarness {
  const database = new CommunityDatabase(":memory:", {
    generateAccountId: (() => {
      let value = 0;
      return () => `account-${++value}`;
    })(),
    generateResidentId: (() => {
      let value = 0;
      return () => `resident-${++value}`;
    })(),
    generateHomeId: (() => {
      let value = 0;
      return () => `home-${++value}`;
    })(),
    generateSessionToken: (() => {
      let value = 0;
      return () => `session-${++value}`;
    })(),
  });
  const group = {
    removed: new Set<string>(),
    unavailable: false,
    outageAfter: null,
    calls: [] as string[],
    async isCurrentMember(groupId: string, qqNumber: string): Promise<boolean> {
      assert.equal(groupId, GROUP_ID);
      this.calls.push(qqNumber);
      if (this.unavailable || (this.outageAfter !== null && this.calls.length > this.outageAfter)) {
        throw new OneBotUnavailableError("test outage");
      }
      return !this.removed.has(qqNumber);
    },
  };
  const reader = {
    calls: [] as unknown[],
    next: responseFor(),
    async readConstableInterview(input: unknown) {
      this.calls.push(input);
      if (this.next instanceof Error) throw this.next;
      return this.next as FarmHumanConstableInterviewSuccess;
    },
  } as FarmConstableInterviewReader & { calls: unknown[]; next: unknown };
  const actioner = {
    calls: [] as unknown[],
    next: responseFor(),
    async executeConstableInterviewAction(input: unknown) {
      this.calls.push(input);
      if (this.next instanceof Error) throw this.next;
      return this.next as FarmHumanConstableInterviewSuccess;
    },
  } as FarmConstableInterviewActioner & { calls: unknown[]; next: unknown };
  const opener = {
    calls: [] as unknown[],
    async openConstablePublicNotice(input: unknown) {
      this.calls.push(input);
      return { data: { notice_id: "notice-1" }, server_time: SCHEDULED_AT_ISO };
    },
  } as FarmConstableInterviewPublicNoticeOpener & { calls: unknown[] };
  const registrationAuth = new RegistrationAuthService({
    database,
    groupMembership: group,
    farmDirectory: new TestFarmDirectory(),
    farmConstableInterviewReader: reader,
    farmConstableInterviewActioner: actioner,
    farmConstableInterviewPublicNoticeOpener: opener,
    groupId: GROUP_ID,
    now: () => SCHEDULED_AT - 60_000,
  });
  const sessions = [];
  for (let index = 0; index < userCount; index += 1) {
    const qqNumber = `qq-${index + 1}`;
    const created = database.createHumanSession(qqNumber, SCHEDULED_AT - 120_000, {
      residentName: `居民 ${index + 1}`,
      homeName: `家园 ${index + 1}`,
      farmDoorplate: FARM_DOORPLATES[index] ?? `PQR${index}34`,
      farmHumanKey: `farm-key-${index + 1}`,
    });
    sessions.push({
      token: created.token,
      qqNumber,
      accountId: created.community.account.accountId,
      residentId: created.community.resident.residentId,
    });
  }
  const app = buildApp({
    groupId: GROUP_ID,
    groupMembership: group,
    registrationAuth,
    secureCookies: false,
    logger: false,
  });
  return {
    app,
    database,
    group,
    reader,
    actioner,
    opener,
    sessions,
    async close() {
      await app.close();
      database.close();
    },
  };
}

function cookie(token: string): string {
  return serializeHumanSessionCookie(token, false);
}

function firstSession(harness: TestHarness) {
  const session = harness.sessions[0];
  if (!session) throw new Error("test harness must include a first session");
  return session;
}

test("constable interview HTTP API derives farm/account/resident from the live Cookie session", async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());

  const response = await harness.app.inject({
    method: "POST",
    url: "/api/farm/constable-interview/signup",
    headers: { cookie: cookie(firstSession(harness).token) },
    payload: { interview_id: "interview-1" },
  });

  assert.equal(response.statusCode, 200);
  const {
    attempt_id: _attemptId,
    candidate_resident_id: _candidateResidentId,
    ...boundInterview
  } = INTERVIEW_TEMPLATE;
  assert.deepEqual(boundConstableInterviewSuccessSchema.parse(response.json()), {
    interviews: [boundInterview],
  });
  assert.deepEqual(harness.actioner.calls, [
    {
      action: "signup",
      farmDoorplate: FARM_DOORPLATES[0],
      farmHumanKey: "farm-key-1",
      accountId: "account-1",
      residentId: "resident-1",
      interviewId: "interview-1",
    },
  ]);
  assert.ok(harness.group.calls.includes("qq-1"));
  const serialized = response.body;
  assert.equal(serialized.includes("candidate_resident_id"), false);
  assert.equal(serialized.includes("attempt_id"), false);
  assert.equal(serialized.includes("farm-key-1"), false);
});

test("constable interview HTTP API rejects browser-supplied identity fields before calling Farm", async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());

  const response = await harness.app.inject({
    method: "POST",
    url: "/api/farm/constable-interview/signup",
    headers: { cookie: cookie(firstSession(harness).token) },
    payload: {
      interview_id: "interview-1",
      account_id: "forged-account",
      resident_id: "forged-resident",
      farm_human_key: "forged-key",
      expected_farm_doorplate: FARM_DOORPLATES[0],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(harness.actioner.calls.length, 0);
  assert.equal(harness.group.calls.length, 0);
  assert.equal(
    boundConstableInterviewErrorSchema.parse(response.json()).error.code,
    "invalid_request",
  );
});

test("constable interview HTTP API propagates attendance and score with server-derived identity", async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());

  for (const [url, payload] of [
    ["/api/farm/constable-interview/attendance", { interview_id: "interview-1" }],
    [
      "/api/farm/constable-interview/score",
      { interview_id: "interview-1", facts: 5, restraint: 4, procedure: 5, explanation: 4 },
    ],
  ] as const) {
    const response = await harness.app.inject({
      method: "POST",
      url,
      headers: { cookie: cookie(firstSession(harness).token) },
      payload,
    });
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(harness.actioner.calls, [
    {
      action: "confirm_attendance",
      farmDoorplate: FARM_DOORPLATES[0],
      farmHumanKey: "farm-key-1",
      accountId: "account-1",
      residentId: "resident-1",
      interviewId: "interview-1",
    },
    {
      action: "score",
      farmDoorplate: FARM_DOORPLATES[0],
      farmHumanKey: "farm-key-1",
      accountId: "account-1",
      residentId: "resident-1",
      interviewId: "interview-1",
      facts: 5,
      restraint: 4,
      procedure: 5,
      explanation: 4,
    },
  ]);
});

test("constable interview HTTP API clears Cookie after live QQ removal and does not call Farm", async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());
  harness.group.removed.add("qq-1");

  const response = await harness.app.inject({
    method: "GET",
    url: "/api/farm/constable-interview",
    headers: { cookie: cookie(firstSession(harness).token) },
  });

  assert.equal(response.statusCode, 403);
  assert.match(String(response.headers["set-cookie"] ?? ""), /Max-Age=0/);
  assert.equal(harness.reader.calls.length, 0);
});

test("constable interview HTTP API reports a live QQ outage without opening public notice", async (context) => {
  const harness = createHarness(3);
  context.after(() => harness.close());
  harness.actioner.next = responseFor({
    ...INTERVIEW_TEMPLATE,
    status: "scoring",
    score_count: 3,
  });
  harness.group.outageAfter = 1;

  const response = await harness.app.inject({
    method: "POST",
    url: "/api/farm/constable-interview/score",
    headers: { cookie: cookie(firstSession(harness).token) },
    payload: { interview_id: "interview-1", facts: 5, restraint: 5, procedure: 5, explanation: 5 },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(harness.opener.calls.length, 0);
});

test("third score freezes every currently valid resident except the candidate", async (context) => {
  const harness = createHarness(4);
  context.after(() => harness.close());
  harness.actioner.next = responseFor({
    ...INTERVIEW_TEMPLATE,
    candidate_resident_id: "resident-4",
    status: "scoring",
    score_count: 3,
  });
  harness.group.removed.add("qq-3");

  const response = await harness.app.inject({
    method: "POST",
    url: "/api/farm/constable-interview/score",
    headers: { cookie: cookie(firstSession(harness).token) },
    payload: { interview_id: "interview-1", facts: 5, restraint: 5, procedure: 5, explanation: 5 },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(harness.opener.calls, [
    {
      interviewId: "interview-1",
      eligibleVoterResidentIds: ["resident-1", "resident-2"],
    },
  ]);
});

test("constable interview Farm contract mismatch is a 502", async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());
  harness.reader.next = { data: { interviews: [] }, server_time: "not-a-date" };

  const response = await harness.app.inject({
    method: "GET",
    url: "/api/farm/constable-interview",
    headers: { cookie: cookie(firstSession(harness).token) },
  });

  assert.equal(response.statusCode, 502);
  assert.equal(
    boundConstableInterviewErrorSchema.parse(response.json()).error.code,
    "upstream_contract_unavailable",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import type { FarmHumanConstableInterviewSuccess } from "@doorbell/protocol";
import { CommunityDatabase } from "./community-database.js";
import { readConstableInterviewSignupMailCopy } from "./config.js";
import { ConstableInterviewSignupMailService } from "./constable-interview-signup-mail-service.js";
import type { FarmConstableInterviewReader } from "./farm-constable-interview-client.js";
import { MailboxService } from "./mailbox-service.js";

const NOW = Date.UTC(2026, 7, 29, 0, 0, 0);

test("signup mail copy stays deployment-provided and requires an exact pair", () => {
  assert.equal(readConstableInterviewSignupMailCopy({}), null);
  assert.throws(() =>
    readConstableInterviewSignupMailCopy({
      DOORBELL_CONSTABLE_INTERVIEW_SIGNUP_MAIL_TITLE: "只有标题",
    }),
  );
  assert.deepEqual(
    readConstableInterviewSignupMailCopy({
      DOORBELL_CONSTABLE_INTERVIEW_SIGNUP_MAIL_TITLE: "  已审标题  ",
      DOORBELL_CONSTABLE_INTERVIEW_SIGNUP_MAIL_BODY: "已审正文\n第二行",
    }),
    { title: "  已审标题  ", body: "已审正文\n第二行" },
  );
});

function interviewResponse(input: {
  farmDoorplate: string;
  accountId: string;
  residentId: string;
}): FarmHumanConstableInterviewSuccess {
  return {
    subject: {
      farm_doorplate: input.farmDoorplate,
      account_id: input.accountId,
      resident_id: input.residentId,
    },
    data: {
      interviews: [
        {
          interview_id: "interview-1",
          attempt_id: "attempt-1",
          candidate_resident_id: "candidate-resident",
          scheduled_at: new Date(NOW + 12 * 60 * 60 * 1000).toISOString(),
          status: "signup_open",
          signup_open_at: new Date(NOW).toISOString(),
          attendance_confirmation_open_at: new Date(NOW + 11.5 * 60 * 60 * 1000).toISOString(),
          score_count: 0,
          self: {
            signed_up: false,
            signup_order: null,
            tentative: false,
            attendance_confirmed: false,
            selected: false,
            score_submitted: false,
            signup_eligible: true,
          },
          interview_material: null,
          public_notice: null,
        },
      ],
    },
    server_time: new Date(NOW).toISOString(),
  };
}

test("08:00 signup scan delivers one idempotent mailbox letter per eligible human and no Bell", async () => {
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
  const communities = ["ABC234", "DEF567"].map(
    (farmDoorplate, index) =>
      database.createHumanSession(`qq-${index + 1}`, NOW, {
        residentName: `居民 ${index + 1}`,
        homeName: `家园 ${index + 1}`,
        farmDoorplate,
        farmHumanKey: `human-key-${index + 1}`,
      }).community,
  );
  const mailbox = new MailboxService({ database, now: () => NOW });
  const membershipCalls: string[] = [];
  const farmCalls: unknown[] = [];
  const errors: unknown[] = [];
  const farmInterviews: FarmConstableInterviewReader = {
    async readConstableInterview(input) {
      farmCalls.push(input);
      return interviewResponse(input);
    },
  };
  const service = new ConstableInterviewSignupMailService({
    database,
    mailboxService: mailbox,
    farmInterviews,
    registrationAuth: {
      async confirmCurrentResidentMembership(residentId) {
        membershipCalls.push(residentId);
      },
    },
    copy: { title: "已审标题", body: "已审正文" },
    now: () => NOW,
    onError: (error) => errors.push(error),
  });

  await service.processDue();
  await service.processDue();

  assert.deepEqual(membershipCalls, ["resident-1", "resident-2", "resident-1", "resident-2"]);
  assert.equal(farmCalls.length, 4);
  assert.equal(errors.length, 0);
  for (const community of communities) {
    const page = database.listMailboxLetters(community.home.homeId, "human", 1, 8, "lingye");
    assert.equal(page.totalItems, 1);
    assert.equal(page.letters[0]?.title, "已审标题");
    assert.equal(page.letters[0]?.body, "已审正文");
  }
  for (const community of communities) {
    assert.equal(database.listPendingBellWakes(community.resident.residentId).length, 0);
  }

  service.close();
  database.close();
});

test("signup scan isolates membership failures and never writes a letter for that resident", async () => {
  const database = new CommunityDatabase(":memory:");
  const created = database.createHumanSession("qq-1", NOW, {
    residentName: "居民",
    homeName: "家园",
    farmDoorplate: "ABC234",
    farmHumanKey: "human-key",
  }).community;
  const errors: unknown[] = [];
  let farmCalls = 0;
  const service = new ConstableInterviewSignupMailService({
    database,
    mailboxService: new MailboxService({ database, now: () => NOW }),
    farmInterviews: {
      async readConstableInterview(input) {
        farmCalls += 1;
        return interviewResponse(input);
      },
    },
    registrationAuth: {
      async confirmCurrentResidentMembership() {
        throw new Error("membership unavailable");
      },
    },
    copy: { title: "已审标题", body: "已审正文" },
    onError: (error) => errors.push(error),
  });

  await service.processDue();

  assert.equal(farmCalls, 0);
  assert.equal(errors.length, 1);
  assert.equal(database.listMailboxLetters(created.home.homeId, "human", 1, 8).totalItems, 0);
  service.close();
  database.close();
});

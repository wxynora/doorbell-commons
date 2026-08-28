import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  CAREER_EXAM_BELL_TEXT,
  CAREER_EXAM_REMINDER_BODY,
  CAREER_EXAM_REMINDER_LEAD_MS,
  CAREER_EXAM_REMINDER_TITLE,
  CareerExamReminderService,
} from "./career-exam-reminder-service.js";
import { CommunityDatabase } from "./community-database.js";
import { MailboxService } from "./mailbox-service.js";

const NOW = Date.UTC(2026, 8, 1, 5, 50, 0);
const SCHEDULED_AT = NOW + 10 * 60 * 1000;
const ATTEMPT_ID = "exam-attempt-1";

function successfulSchoolResult(exams: Array<Record<string, unknown>>): {
  ok: true;
  text: string;
  data: Record<string, unknown>;
} {
  return {
    ok: true,
    text: "职业学校业务已办理。",
    data: { result: {}, current: { exams, options: [] } },
  };
}

async function withHarness(
  run: (harness: {
    databasePath: string;
    database: CommunityDatabase;
    mailbox: MailboxService;
    residentId: string;
    homeId: string;
    now: { value: number };
    notifications: string[];
    service: CareerExamReminderService;
    membershipChecks: string[];
    membershipFailure: { value: Error | undefined };
    farmReads: unknown[];
    farmExams: Array<Record<string, unknown>>;
    reopen(): CareerExamReminderService;
  }) => void | Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-career-exam-reminder-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const now = { value: NOW };
  const notifications: string[] = [];
  const membershipChecks: string[] = [];
  const membershipFailure: { value: Error | undefined } = { value: undefined };
  const farmReads: unknown[] = [];
  const farmExams: Array<Record<string, unknown>> = [
    {
      attemptId: ATTEMPT_ID,
      registrationStatus: "registered",
      scheduledAt: SCHEDULED_AT,
    },
  ];
  const database = new CommunityDatabase(databasePath);
  const created = database.createHumanSession("10001", NOW, {
    residentName: "小一",
    homeName: "门铃小屋",
    farmDoorplate: "FARM-1",
    farmHumanKey: "private-human-key",
  });
  let letterSequence = 0;
  let wakeSequence = 0;
  const mailbox = new MailboxService({
    database,
    now: () => now.value,
    generateLetterId: () => `letter-${++letterSequence}`,
  });
  const createService = () =>
    new CareerExamReminderService({
      database,
      mailboxService: mailbox,
      bellService: { notifyResident: (residentId) => notifications.push(residentId) },
      registrationAuth: {
        confirmCurrentResidentMembership: async (residentId) => {
          membershipChecks.push(residentId);
          if (membershipFailure.value) throw membershipFailure.value;
        },
      },
      lingyeActions: {
        execute: async (input) => {
          farmReads.push(structuredClone(input));
          return successfulSchoolResult(farmExams);
        },
      },
      now: () => now.value,
      generateWakeId: () => `wake-${++wakeSequence}`,
    });
  let service = createService();
  try {
    await run({
      databasePath,
      database,
      mailbox,
      residentId: created.community.resident.residentId,
      homeId: created.community.home.homeId,
      now,
      notifications,
      membershipChecks,
      membershipFailure,
      farmReads,
      farmExams,
      service,
      reopen: () => {
        service.close();
        service = createService();
        return service;
      },
    });
  } finally {
    service.close();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a registered exam persists one restart-safe 13:55 mailbox and Bell reminder", async () => {
  await withHarness(async (harness) => {
    const result = successfulSchoolResult([
      {
        attemptId: ATTEMPT_ID,
        registrationStatus: "registered",
        scheduledAt: SCHEDULED_AT,
      },
    ]);
    harness.service.reconcile({
      residentId: harness.residentId,
      homeId: harness.homeId,
      result,
    });
    harness.service.reconcile({
      residentId: harness.residentId,
      homeId: harness.homeId,
      result,
    });

    assert.deepEqual(harness.database.getCareerExamReminder(ATTEMPT_ID), {
      attemptId: ATTEMPT_ID,
      residentId: harness.residentId,
      homeId: harness.homeId,
      scheduledAt: SCHEDULED_AT,
      remindAt: SCHEDULED_AT - CAREER_EXAM_REMINDER_LEAD_MS,
      status: "scheduled",
      letterId: null,
      wakeId: null,
      createdAt: NOW,
      deliveredAt: null,
      cancelledAt: null,
    });
    assert.equal(harness.mailbox.listForAudience(harness.homeId, "human", 1).totalItems, 0);

    harness.now.value = SCHEDULED_AT - CAREER_EXAM_REMINDER_LEAD_MS;
    const restarted = harness.reopen();
    await restarted.processDue();
    await restarted.processDue();

    const humanLetters = harness.mailbox.listForAudience(harness.homeId, "human", 1);
    const residentLetters = harness.mailbox.listForAudience(harness.homeId, "resident", 1);
    assert.equal(humanLetters.totalItems, 1);
    assert.equal(residentLetters.totalItems, 1);
    assert.equal(humanLetters.letters[0]?.title, CAREER_EXAM_REMINDER_TITLE);
    const opened = harness.mailbox.openForAudience(
      harness.homeId,
      "human",
      humanLetters.letters[0]?.letterId ?? "missing",
    );
    assert.equal(opened.body, CAREER_EXAM_REMINDER_BODY);
    const reminder = harness.database.getCareerExamReminder(ATTEMPT_ID);
    assert.equal(reminder?.status, "delivered");
    assert.equal(reminder?.letterId, opened.letterId);
    const wake = harness.database.getBellWake(harness.residentId, reminder?.wakeId ?? "missing");
    assert.equal(wake?.reason, "career_exam_reminder");
    assert.equal(wake?.letterId, opened.letterId);
    assert.deepEqual(wake?.payload, {
      letter_id: opened.letterId,
      text: CAREER_EXAM_BELL_TEXT,
    });
    assert.deepEqual(harness.notifications, [harness.residentId]);
    assert.deepEqual(harness.membershipChecks, [harness.residentId]);
    assert.deepEqual(harness.farmReads, [
      {
        residentId: harness.residentId,
        farmDoorplate: "FARM-1",
        farmHumanKey: "private-human-key",
        op: "go.school.view",
        args: {},
      },
    ]);

    const inspection = new Database(harness.databasePath, { readonly: true });
    try {
      assert.equal(
        (
          inspection
            .prepare("SELECT COUNT(*) AS count FROM mailbox_letters WHERE body = ?")
            .get(CAREER_EXAM_REMINDER_BODY) as { count: number }
        ).count,
        1,
      );
      assert.equal(
        (
          inspection
            .prepare("SELECT COUNT(*) AS count FROM bell_wakes WHERE payload_json LIKE ?")
            .get(`%${CAREER_EXAM_REMINDER_BODY}%`) as { count: number }
        ).count,
        0,
      );
    } finally {
      inspection.close();
    }
  });
});

test("releasing before 13:55 cancels the scheduled reminder without a letter or wake", async () => {
  await withHarness(async (harness) => {
    harness.service.reconcile({
      residentId: harness.residentId,
      homeId: harness.homeId,
      result: successfulSchoolResult([
        {
          attemptId: ATTEMPT_ID,
          registrationStatus: "registered",
          scheduledAt: SCHEDULED_AT,
        },
      ]),
    });
    harness.service.reconcile({
      residentId: harness.residentId,
      homeId: harness.homeId,
      result: successfulSchoolResult([
        {
          attemptId: ATTEMPT_ID,
          registrationStatus: "released",
          scheduledAt: SCHEDULED_AT,
        },
      ]),
    });
    harness.now.value = SCHEDULED_AT - CAREER_EXAM_REMINDER_LEAD_MS;
    await harness.service.processDue();

    assert.equal(harness.database.getCareerExamReminder(ATTEMPT_ID)?.status, "cancelled");
    assert.equal(harness.mailbox.listForAudience(harness.homeId, "human", 1).totalItems, 0);
    assert.equal(harness.database.listPendingBellWakes(harness.residentId).length, 0);
    assert.deepEqual(harness.notifications, []);
  });
});

test("the due-time authority check suppresses a reminder for an exam no longer registered", async () => {
  await withHarness(async (harness) => {
    harness.service.reconcile({
      residentId: harness.residentId,
      homeId: harness.homeId,
      result: successfulSchoolResult(harness.farmExams),
    });
    harness.farmExams.splice(0, harness.farmExams.length, {
      attemptId: ATTEMPT_ID,
      registrationStatus: "released",
      scheduledAt: SCHEDULED_AT,
    });
    harness.now.value = SCHEDULED_AT - CAREER_EXAM_REMINDER_LEAD_MS;
    await harness.service.processDue();

    assert.equal(harness.database.getCareerExamReminder(ATTEMPT_ID)?.status, "cancelled");
    assert.equal(harness.mailbox.listForAudience(harness.homeId, "human", 1).totalItems, 0);
    assert.equal(harness.database.listPendingBellWakes(harness.residentId).length, 0);
    assert.deepEqual(harness.notifications, []);
  });
});

test("membership verification failure does not deliver or cancel the scheduled reminder", async () => {
  await withHarness(async (harness) => {
    harness.service.reconcile({
      residentId: harness.residentId,
      homeId: harness.homeId,
      result: successfulSchoolResult(harness.farmExams),
    });
    harness.membershipFailure.value = new Error("fake OneBot unavailable");
    harness.now.value = SCHEDULED_AT - CAREER_EXAM_REMINDER_LEAD_MS;
    await assert.rejects(() => harness.service.processDue(), /fake OneBot unavailable/u);

    assert.equal(harness.database.getCareerExamReminder(ATTEMPT_ID)?.status, "scheduled");
    assert.equal(harness.mailbox.listForAudience(harness.homeId, "human", 1).totalItems, 0);
    assert.equal(harness.database.listPendingBellWakes(harness.residentId).length, 0);
  });
});

test("malformed registered exam facts fail closed before scheduling", async () => {
  await withHarness((harness) => {
    assert.throws(
      () =>
        harness.service.reconcile({
          residentId: harness.residentId,
          homeId: harness.homeId,
          result: successfulSchoolResult([
            { attemptId: ATTEMPT_ID, registrationStatus: "registered", scheduledAt: "14:00" },
          ]),
        }),
      /do not match the Lingye contract/u,
    );
    assert.equal(harness.database.listScheduledCareerExamReminders().length, 0);
  });
});

test("registered exam reminders accept only Tuesday Thursday Saturday at 14:00 Beijing", async () => {
  await withHarness((harness) => {
    for (const scheduledAt of [SCHEDULED_AT + 24 * 60 * 60 * 1000, SCHEDULED_AT - 60 * 1000]) {
      assert.throws(
        () =>
          harness.service.reconcile({
            residentId: harness.residentId,
            homeId: harness.homeId,
            result: successfulSchoolResult([
              {
                attemptId: `${ATTEMPT_ID}-${scheduledAt}`,
                registrationStatus: "registered",
                scheduledAt,
              },
            ]),
          }),
        /do not match the Lingye contract/u,
      );
    }
    assert.equal(harness.database.listScheduledCareerExamReminders().length, 0);
  });
});

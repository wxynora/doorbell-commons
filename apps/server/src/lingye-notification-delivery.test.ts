import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lingyeActionNotificationSchema,
  lingyeActionResultSchema,
  type MailboxCategory,
} from "@doorbell/protocol";
import type { CommunityDatabase, MailboxLetterRecord } from "./community-database.js";
import { LingyeNotificationDeliveryService, MailboxService } from "./mailbox-service.js";

const RECIPIENT = "019ffc01-49cd-7020-84af-3d04fb1ed03d";
const SOURCE = "019ffc01-49cd-7020-94af-3d04fb1ed03d";
const HOME = "019ffc01-49cd-7020-a4af-3d04fb1ed03d";

function createHarness() {
  const letters = new Map<string, MailboxLetterRecord>();
  const wakes: Array<{ wakeId: string; message: string }> = [];
  const notified: string[] = [];
  const mailboxDatabase = {
    deliverMailboxLetter(input: {
      letterId: string;
      homeId: string;
      idempotencyKey: string;
      category: MailboxCategory;
      title: string;
      body: string;
      createdAt: number;
    }): MailboxLetterRecord {
      const existing = letters.get(input.idempotencyKey);
      if (existing) return existing;
      const letter = {
        letterId: input.letterId,
        homeId: input.homeId,
        category: input.category,
        title: input.title,
        body: input.body,
        createdAt: input.createdAt,
        isNew: true,
        attachment: null,
      } satisfies MailboxLetterRecord;
      letters.set(input.idempotencyKey, letter);
      return letter;
    },
  } as unknown as CommunityDatabase;
  const mailbox = new MailboxService({
    database: mailboxDatabase,
    generateLetterId: () => `letter-${String(letters.size + 1)}`,
    now: () => 1_788_278_400_000,
  });
  const service = new LingyeNotificationDeliveryService({
    database: {
      findHomeIdByResidentId: (residentId: string) =>
        residentId === RECIPIENT ? HOME : undefined,
      createCareerJobWake(input: { wakeId: string; message: string }) {
        if (!wakes.some((wake) => wake.wakeId === input.wakeId)) {
          wakes.push({ wakeId: input.wakeId, message: input.message });
        }
      },
    } as unknown as CommunityDatabase,
    mailbox,
    bell: { notifyResident: (residentId) => notified.push(residentId) },
  });
  return { letters, wakes, notified, service };
}

const CASES = [
  ["commission_targeted", "收到一份新委托", "查看并决定是否接取"],
  ["commission_accepted", "委托已被接取", "查看进度"],
  ["commission_declined", "委托有新回复", "重新选择公开、点名、NPC 或取消"],
  ["commission_reply", "委托有新回复", "收到一条新回复：我已经补充了现场情况"],
  ["commission_completed", "委托已完成", "查看权威结果"],
] as const;

for (const [career, expectedCall] of [
  ["agronomist", 'doorbell({"op":"go.farm.commission","args":{}})'],
  ["veterinarian", 'doorbell({"op":"go.hospital.commission","args":{}})'],
] as const) {
  test(`${career} commission notifications carry concrete calls for all lifecycle events`, () => {
    const harness = createHarness();
    for (const [index, [kind, title, bodyFact]] of CASES.entries()) {
      const notification = lingyeActionNotificationSchema.parse({
        notification_id: `notification-${career}-${String(index)}`,
        kind,
        recipient_resident_id: RECIPIENT,
        career,
        ...(kind === "commission_reply" ? { message_text: "我已经补充了现场情况" } : {}),
      });
      harness.service.deliver(notification, SOURCE);
      const letter = [...harness.letters.values()][index];
      assert.ok(letter);
      assert.equal(letter.title, title);
      assert.match(letter.body, new RegExp(expectedCall.replace(/[{}()[\].+*?$^|\\]/gu, "\\$&"), "u"));
      assert.match(letter.body, new RegExp(bodyFact, "u"));
      if (kind === "commission_targeted") {
        assert.match(
          letter.body,
          new RegExp(career === "agronomist" ? "农事委托" : "动物诊疗委托", "u"),
        );
      }
      assert.equal(harness.wakes[index]?.message, letter.body);
    }
    assert.equal(harness.letters.size, CASES.length);
    assert.equal(harness.wakes.length, CASES.length);
    assert.deepEqual(harness.notified, Array.from({ length: CASES.length }, () => RECIPIENT));
  });
}

for (const [career, expectedCall] of [
  ["reporter", 'doorbell({"op":"go.newsroom.commission","args":{}})'],
  ["constable", 'doorbell({"op":"go.security.commission","args":{}})'],
] as const) {
  test(`${career} keeps concrete calls for its existing reply and completion notifications`, () => {
    const harness = createHarness();
    for (const [index, kind] of ["commission_reply", "commission_completed"].entries()) {
      const notification = lingyeActionNotificationSchema.parse({
        notification_id: `notification-${career}-${String(index)}`,
        kind,
        recipient_resident_id: RECIPIENT,
        career,
        ...(kind === "commission_reply" ? { message_text: "我已经补充了当前事实" } : {}),
      });
      harness.service.deliver(notification, SOURCE);
      const letter = [...harness.letters.values()][index];
      assert.ok(letter);
      assert.match(letter.body, new RegExp(expectedCall.replace(/[{}()[\].+*?$^|\\]/gu, "\\$&"), "u"));
    }
  });
}

test("current callers do not ring themselves and notification replay stays idempotent", () => {
  const harness = createHarness();
  const notification = lingyeActionNotificationSchema.parse({
    notification_id: "notification-self-replay",
    kind: "commission_completed",
    recipient_resident_id: RECIPIENT,
    career: "agronomist",
  });
  harness.service.deliver(notification, RECIPIENT);
  harness.service.deliver(notification, RECIPIENT);
  assert.equal(harness.letters.size, 1);
  assert.deepEqual(harness.wakes, []);
  assert.deepEqual(harness.notified, []);
});

test("a malformed private notification sidecar cannot reverse the primary action result", () => {
  const parsed = lingyeActionResultSchema.parse({
    ok: true,
    text: "委托已接取。",
    data: { result: { status: "accepted" } },
    notifications: [
      {
        notification_id: "bad-notification",
        kind: "commission_accepted",
        recipient_resident_id: "not-a-uuid",
        career: "agronomist",
      },
    ],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.notifications, []);
});

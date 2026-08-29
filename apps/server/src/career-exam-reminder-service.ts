import { randomUUID } from "node:crypto";
import type { LingyeActionResult } from "@doorbell/protocol";
import type { BellService } from "./bell-service.js";
import type { BrowserPushService } from "./browser-push-service.js";
import type { CareerExamReminderRecord, CommunityDatabase } from "./community-database.js";
import type { MailboxService } from "./mailbox-service.js";
import type { LingyeMcpActionExecutor } from "./mcp-lingye-action-client.js";

export const CAREER_EXAM_REMINDER_LEAD_MS = 5 * 60 * 1000;
const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const CAREER_EXAM_BEIJING_WEEKDAYS = new Set([2, 4, 6]);
export const CAREER_EXAM_REMINDER_TITLE = "职业资格考试提醒";
export const CAREER_EXAM_REMINDER_BODY =
  "你报名的职业资格考试将在 5 分钟后开始。考试时间为北京时间 14:00–16:00。";
export const CAREER_EXAM_BELL_TEXT = "信箱有一封新的考试提醒。";

interface RegisteredExamFact {
  attemptId: string;
  scheduledAt: number;
}

export interface CareerExamReminderServiceOptions {
  database: CommunityDatabase;
  mailboxService: MailboxService;
  bellService: Pick<BellService, "notifyResident">;
  browserPushService?: Pick<BrowserPushService, "sendActivityReminder">;
  registrationAuth: {
    confirmCurrentResidentMembership(residentId: string): Promise<unknown>;
  };
  lingyeActions: LingyeMcpActionExecutor;
  now?: () => number;
  generateWakeId?: () => string;
  onError?: (error: unknown) => void;
}

export interface CareerExamReminderReconcileInput {
  residentId: string;
  homeId: string;
  result: LingyeActionResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCareerExamStart(scheduledAt: number): boolean {
  const beijing = new Date(scheduledAt + BEIJING_UTC_OFFSET_MS);
  return (
    CAREER_EXAM_BEIJING_WEEKDAYS.has(beijing.getUTCDay()) &&
    beijing.getUTCHours() === 14 &&
    beijing.getUTCMinutes() === 0 &&
    beijing.getUTCSeconds() === 0 &&
    beijing.getUTCMilliseconds() === 0
  );
}

function registeredExamFacts(result: LingyeActionResult): RegisteredExamFact[] | undefined {
  if (!result.ok) return undefined;
  const current = isRecord(result.data.current) ? result.data.current : result.data;
  if (!Array.isArray(current.exams)) return undefined;
  const registered: RegisteredExamFact[] = [];
  for (const exam of current.exams) {
    if (!isRecord(exam) || exam.registrationStatus !== "registered") continue;
    if (
      typeof exam.attemptId !== "string" ||
      exam.attemptId.length === 0 ||
      typeof exam.scheduledAt !== "number" ||
      !Number.isSafeInteger(exam.scheduledAt) ||
      !isCareerExamStart(exam.scheduledAt)
    ) {
      throw new Error("The registered exam reminder facts do not match the Lingye contract");
    }
    registered.push({ attemptId: exam.attemptId, scheduledAt: exam.scheduledAt });
  }
  return registered;
}

export class CareerExamReminderService {
  readonly #database: CommunityDatabase;
  readonly #mailboxService: MailboxService;
  readonly #bellService: Pick<BellService, "notifyResident">;
  readonly #browserPushService: Pick<BrowserPushService, "sendActivityReminder"> | undefined;
  readonly #registrationAuth: CareerExamReminderServiceOptions["registrationAuth"];
  readonly #lingyeActions: LingyeMcpActionExecutor;
  readonly #now: () => number;
  readonly #generateWakeId: () => string;
  readonly #onError: (error: unknown) => void;
  readonly #timers = new Map<string, NodeJS.Timeout>();
  #closed = false;

  constructor(options: CareerExamReminderServiceOptions) {
    this.#database = options.database;
    this.#mailboxService = options.mailboxService;
    this.#bellService = options.bellService;
    this.#browserPushService = options.browserPushService;
    this.#registrationAuth = options.registrationAuth;
    this.#lingyeActions = options.lingyeActions;
    this.#now = options.now ?? Date.now;
    this.#generateWakeId = options.generateWakeId ?? randomUUID;
    this.#onError = options.onError ?? (() => undefined);
    for (const reminder of this.#database.listScheduledCareerExamReminders()) {
      this.#arm(reminder);
    }
  }

  reconcile(input: CareerExamReminderReconcileInput): void {
    const registered = registeredExamFacts(input.result);
    if (registered === undefined) return;
    const now = this.#now();
    for (const exam of registered) {
      const reminder = this.#database.scheduleCareerExamReminder({
        attemptId: exam.attemptId,
        residentId: input.residentId,
        homeId: input.homeId,
        scheduledAt: exam.scheduledAt,
        remindAt: exam.scheduledAt - CAREER_EXAM_REMINDER_LEAD_MS,
        createdAt: now,
      });
      if (reminder.status === "scheduled") this.#arm(reminder);
    }
    const cancelled = this.#database.cancelScheduledCareerExamRemindersExcept(
      input.residentId,
      registered.map((exam) => exam.attemptId),
      now,
    );
    for (const reminder of cancelled) this.#clearTimer(reminder.attemptId);
  }

  async processDue(): Promise<void> {
    const now = this.#now();
    for (const reminder of this.#database.listScheduledCareerExamReminders()) {
      if (reminder.remindAt <= now) {
        this.#clearTimer(reminder.attemptId);
        await this.#deliver(reminder.attemptId);
      }
    }
  }

  close(): void {
    this.#closed = true;
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }

  #arm(reminder: CareerExamReminderRecord): void {
    if (this.#closed || reminder.status !== "scheduled") return;
    this.#clearTimer(reminder.attemptId);
    const now = this.#now();
    if (now >= reminder.scheduledAt) {
      this.#database.cancelScheduledCareerExamReminder(reminder.attemptId, now);
      return;
    }
    const delay = Math.max(0, reminder.remindAt - now);
    const timer = setTimeout(() => {
      this.#timers.delete(reminder.attemptId);
      void this.#deliver(reminder.attemptId).catch((error) => this.#onError(error));
    }, delay);
    timer.unref?.();
    this.#timers.set(reminder.attemptId, timer);
  }

  async #deliver(attemptId: string): Promise<void> {
    let reminder = this.#database.getCareerExamReminder(attemptId);
    if (reminder?.status !== "scheduled" || this.#closed) return;
    const now = this.#now();
    if (now < reminder.remindAt) {
      this.#arm(reminder);
      return;
    }
    if (now >= reminder.scheduledAt) {
      this.#database.cancelScheduledCareerExamReminder(reminder.attemptId, now);
      return;
    }
    await this.#registrationAuth.confirmCurrentResidentMembership(reminder.residentId);
    const binding = this.#database.findFarmBindingByHomeId(reminder.homeId);
    if (!binding?.farmHumanKey) {
      throw new Error("The registered exam reminder no longer has a complete farm binding");
    }
    const currentSchool = await this.#lingyeActions.execute({
      residentId: reminder.residentId,
      farmDoorplate: binding.farmDoorplate,
      farmHumanKey: binding.farmHumanKey,
      op: "go.school.view",
      args: {},
    });
    const registered = registeredExamFacts(currentSchool);
    if (registered === undefined) {
      throw new Error("The exam reminder could not verify the current school registration facts");
    }
    this.reconcile({
      residentId: reminder.residentId,
      homeId: reminder.homeId,
      result: currentSchool,
    });
    this.#clearTimer(attemptId);
    if (!registered.some((exam) => exam.attemptId === attemptId)) return;
    reminder = this.#database.getCareerExamReminder(attemptId);
    if (reminder?.status !== "scheduled") return;
    const deliveredAt = this.#now();
    if (deliveredAt >= reminder.scheduledAt) {
      this.#database.cancelScheduledCareerExamReminder(attemptId, deliveredAt);
      return;
    }
    const letter = this.#mailboxService.deliver({
      homeId: reminder.homeId,
      idempotencyKey: `lingye:career-exam-reminder:${reminder.attemptId}`,
      category: "lingye",
      title: CAREER_EXAM_REMINDER_TITLE,
      body: CAREER_EXAM_REMINDER_BODY,
      sensitiveValues: [],
    });
    const delivered = this.#database.deliverCareerExamReminder({
      attemptId: reminder.attemptId,
      letterId: letter.letterId,
      wakeId: this.#generateWakeId(),
      deliveredAt,
      payload: {
        letter_id: letter.letterId,
        text: CAREER_EXAM_BELL_TEXT,
      },
    });
    if (delivered?.status === "delivered") {
      this.#bellService.notifyResident(reminder.residentId);
      if (this.#browserPushService) {
        try {
          await this.#browserPushService.sendActivityReminder({
            residentId: reminder.residentId,
            title: CAREER_EXAM_REMINDER_TITLE,
            body: CAREER_EXAM_REMINDER_BODY,
            url: "/",
            tag: `career-exam:${reminder.attemptId}`,
            createdAt: deliveredAt,
          });
        } catch (error) {
          this.#onError(error);
        }
      }
    }
  }

  #clearTimer(attemptId: string): void {
    const timer = this.#timers.get(attemptId);
    if (timer) clearTimeout(timer);
    this.#timers.delete(attemptId);
  }
}

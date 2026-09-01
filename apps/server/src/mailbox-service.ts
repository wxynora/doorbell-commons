import { randomUUID } from "node:crypto";
import type { LingyeActionResult, MailboxCategory } from "@doorbell/protocol";
import type {
  CommunityDatabase,
  MailboxAttachmentRecord,
  MailboxAudience,
  MailboxLetterPage,
  MailboxLetterRecord,
} from "./community-database.js";
import { RegistrationProfileRequiredError } from "./community-database.js";
import { FarmRewardUnavailableError, type FarmWelcomeRewardGranter } from "./farm-reward-client.js";

export const MAILBOX_PAGE_SIZE = 8;

export interface MailboxDeliveryInput {
  homeId: string;
  idempotencyKey: string;
  category: MailboxCategory;
  title: string;
  body: string;
  attachment?: MailboxAttachmentRecord | null;
  sensitiveValues: readonly string[];
}

export interface MailboxServiceOptions {
  database: CommunityDatabase;
  farmRewardGranter?: FarmWelcomeRewardGranter;
  now?: () => number;
  generateLetterId?: () => string;
}

type LingyeNotification = NonNullable<
  Extract<LingyeActionResult, { ok: true }>["notifications"]
>[number];

export interface LingyeNotificationBellNotifier {
  notifyResident(residentId: string): void;
}

export interface LingyeNotificationDeliveryServiceOptions {
  database: CommunityDatabase;
  mailbox: MailboxService;
  bell: LingyeNotificationBellNotifier;
}

export class MailboxLetterNotFoundError extends Error {
  constructor() {
    super("The mailbox letter does not exist in this home");
    this.name = "MailboxLetterNotFoundError";
  }
}

export class MailboxSecretRejectedError extends Error {
  constructor() {
    super("Mailbox letter content must not contain credentials or secret values");
    this.name = "MailboxSecretRejectedError";
  }
}

export class MailboxAttachmentNotClaimableError extends Error {
  constructor() {
    super("The mailbox letter has no claimable attachment");
    this.name = "MailboxAttachmentNotClaimableError";
  }
}

const WELCOME_TITLE = "欢迎入住 Doorbell Commons！";
const WELCOME_BODY = `欢迎入住 Doorbell Commons！

从今天起，这里也有一盏为你亮着的灯啦。我们准备了一份小小的入住礼物：随机 SSR 种子 ×1、银币 ×200。

愿你在铃野认识新朋友，也常常带着故事回家。`;

function containsKnownSecretShape(value: string): boolean {
  return (
    /https?:\/\/[^\s]+\/farm\/ui\//iu.test(value) ||
    /\b(?:dbc|dbm|dbb)_[A-Za-z0-9_-]+\b/u.test(value)
  );
}

function assertNoSecrets(input: MailboxDeliveryInput): void {
  const storedValues = [input.idempotencyKey, input.title, input.body];
  const sensitiveValues = input.sensitiveValues.filter((value) => value.length > 0);
  if (
    storedValues.some(containsKnownSecretShape) ||
    sensitiveValues.some((secret) => storedValues.some((value) => value.includes(secret)))
  ) {
    throw new MailboxSecretRejectedError();
  }
}

export class MailboxService {
  readonly #database: CommunityDatabase;
  readonly #farmRewardGranter: FarmWelcomeRewardGranter | undefined;
  readonly #now: () => number;
  readonly #generateLetterId: () => string;

  constructor(options: MailboxServiceOptions) {
    this.#database = options.database;
    this.#farmRewardGranter = options.farmRewardGranter;
    this.#now = options.now ?? Date.now;
    this.#generateLetterId = options.generateLetterId ?? randomUUID;
  }

  deliver(input: MailboxDeliveryInput): MailboxLetterRecord {
    assertNoSecrets(input);
    const letter = this.#database.deliverMailboxLetter({
      letterId: this.#generateLetterId(),
      homeId: input.homeId,
      idempotencyKey: input.idempotencyKey,
      category: input.category,
      title: input.title,
      body: input.body,
      createdAt: this.#now(),
      attachment: input.attachment ?? null,
    });
    return letter;
  }

  listForAudience(
    homeId: string,
    audience: MailboxAudience,
    page: number,
    category?: MailboxCategory,
  ): MailboxLetterPage {
    return this.#database.listMailboxLetters(homeId, audience, page, MAILBOX_PAGE_SIZE, category);
  }

  openForAudience(
    homeId: string,
    audience: MailboxAudience,
    letterId: string,
  ): MailboxLetterRecord {
    const letter = this.#database.openMailboxLetter(homeId, audience, letterId, this.#now());
    if (!letter) {
      throw new MailboxLetterNotFoundError();
    }
    return letter;
  }

  ensureWelcomeLetter(homeId: string, farmHumanKey: string): MailboxLetterRecord {
    return this.deliver({
      homeId,
      idempotencyKey: `system:welcome:${homeId}`,
      category: "system",
      title: WELCOME_TITLE,
      body: WELCOME_BODY,
      attachment: { attachmentType: "farm_reward", status: "available" },
      sensitiveValues: [farmHumanKey],
    });
  }

  async claimFarmReward(
    homeId: string,
    audience: MailboxAudience,
    letterId: string,
  ): Promise<MailboxLetterRecord> {
    const letter = this.#database.findMailboxLetter(homeId, audience, letterId);
    if (!letter) {
      throw new MailboxLetterNotFoundError();
    }
    if (letter.attachment?.attachmentType !== "farm_reward") {
      throw new MailboxAttachmentNotClaimableError();
    }
    if (letter.attachment.status === "available") {
      const binding = this.#database.findFarmBindingByHomeId(homeId);
      if (!binding?.farmHumanKey) {
        throw new RegistrationProfileRequiredError();
      }
      if (!this.#farmRewardGranter) {
        throw new FarmRewardUnavailableError("The farm reward service is not configured");
      }
      await this.#farmRewardGranter.grantWelcomeReward({
        grantId: `doorbell-mailbox:${letterId}`,
        farmDoorplate: binding.farmDoorplate,
        farmHumanKey: binding.farmHumanKey,
      });
      this.#database.markMailboxAttachmentClaimed(homeId, letterId);
    }
    return this.openForAudience(homeId, audience, letterId);
  }
}

const COMMISSION_NOTIFICATION_COPY = Object.freeze({
  commission_targeted: {
    title: "收到一份新委托",
    body: (call: string, _messageText?: string, serviceName = "职业") =>
      `你收到一份新的${serviceName}委托，可以直接调用 ${call} 查看并决定是否接取。`,
  },
  commission_accepted: {
    title: "委托已被接取",
    body: (call: string) => `你发布的委托已经有人接下了，可以直接调用 ${call} 查看进度。`,
  },
  commission_declined: {
    title: "委托有新回复",
    body: (call: string) =>
      `这份点名委托没有被接取，可以直接调用 ${call} 重新选择公开、点名、NPC 或取消。`,
  },
  commission_reply: {
    title: "委托有新回复",
    body: (call: string, messageText?: string) =>
      `你参与的委托收到一条新回复：${messageText ?? ""}\n可以直接调用 ${call} 继续处理。`,
  },
  commission_completed: {
    title: "委托已完成",
    body: (call: string) => `你参与的委托已经完成，可以直接调用 ${call} 查看权威结果。`,
  },
});

const COMMISSION_CALL_BY_CAREER = Object.freeze({
  agronomist: 'doorbell({"op":"go.farm.commission","args":{}})',
  veterinarian: 'doorbell({"op":"go.hospital.commission","args":{}})',
  reporter: 'doorbell({"op":"go.newsroom.commission","args":{}})',
  constable: 'doorbell({"op":"go.security.commission","args":{}})',
});

const COMMISSION_SERVICE_NAME_BY_CAREER = Object.freeze({
  agronomist: "农事",
  veterinarian: "动物诊疗",
  reporter: "记者",
  constable: "治安",
});

export class LingyeNotificationDeliveryService {
  readonly #database: CommunityDatabase;
  readonly #mailbox: MailboxService;
  readonly #bell: LingyeNotificationBellNotifier;

  constructor(options: LingyeNotificationDeliveryServiceOptions) {
    this.#database = options.database;
    this.#mailbox = options.mailbox;
    this.#bell = options.bell;
  }

  deliver(notification: LingyeNotification, sourceResidentId: string): void {
    const copy = COMMISSION_NOTIFICATION_COPY[notification.kind];
    const call = COMMISSION_CALL_BY_CAREER[notification.career];
    const body = copy.body(
      call,
      notification.message_text,
      COMMISSION_SERVICE_NAME_BY_CAREER[notification.career],
    );
    const homeId = this.#database.findHomeIdByResidentId(notification.recipient_resident_id);
    if (!homeId) throw new Error("The Lingye notification recipient has no community home");
    const idempotencyKey = `lingye-notification:${notification.notification_id}`;
    const letter = this.#mailbox.deliver({
      homeId,
      idempotencyKey,
      category: "system",
      title: copy.title,
      body,
      sensitiveValues: [],
    });
    if (notification.recipient_resident_id === sourceResidentId) return;
    this.#database.createCareerJobWake({
      wakeId: `career-job:${notification.notification_id}`,
      residentId: notification.recipient_resident_id,
      letterId: letter.letterId,
      message: body,
      createdAt: letter.createdAt,
    });
    this.#bell.notifyResident(notification.recipient_resident_id);
  }
}

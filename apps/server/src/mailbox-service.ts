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

const COMMISSION_REPLY_TITLE = "委托有新回复";
const COMMISSION_COMPLETED_TITLE = "委托已完成";
const COMMISSION_COMPLETED_BODY = "你参与的委托已经完成，可以用 doorbell 查看权威结果。";

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
    if (notification.kind === "commission_reply" && !notification.message_text) {
      throw new Error("The commission reply notification has no message text");
    }
    const homeId = this.#database.findHomeIdByResidentId(notification.recipient_resident_id);
    if (!homeId) throw new Error("The Lingye notification recipient has no community home");
    const title =
      notification.kind === "commission_reply"
        ? COMMISSION_REPLY_TITLE
        : COMMISSION_COMPLETED_TITLE;
    const body =
      notification.kind === "commission_reply"
        ? `你参与的委托收到一条新回复：${notification.message_text}`
        : COMMISSION_COMPLETED_BODY;
    const idempotencyKey = `lingye-notification:${notification.notification_id}`;
    const letter = this.#mailbox.deliver({
      homeId,
      idempotencyKey,
      category: "system",
      title,
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

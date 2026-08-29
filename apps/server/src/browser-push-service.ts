import type { BrowserPushPayload } from "@doorbell/protocol";
import webpush from "web-push";
import type {
  BrowserPushSubscriptionRecord,
  CommunityDatabase,
  HumanSettingsRecord,
} from "./community-database.js";
import type { BrowserPushConfig } from "./config.js";

export interface BrowserPushSender {
  send(subscription: BrowserPushSubscriptionRecord, payload: BrowserPushPayload): Promise<void>;
}

export interface BrowserPushServiceOptions {
  config: BrowserPushConfig;
  database: CommunityDatabase;
  registrationAuth: {
    confirmCurrentResidentMembership(residentId: string): Promise<unknown>;
  };
  requestTimeoutMs: number;
  sender?: BrowserPushSender;
  onError?: (error: unknown) => void;
}

export interface ActivityReminderPush {
  residentId: string;
  homeId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  createdAt: number;
}

function statusCodeOf(error: unknown): number | undefined {
  if (error === null || typeof error !== "object" || !("statusCode" in error)) return undefined;
  const value = error.statusCode;
  return typeof value === "number" ? value : undefined;
}

function createWebPushSender(
  config: BrowserPushConfig,
  requestTimeoutMs: number,
): BrowserPushSender {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return {
    async send(subscription, payload): Promise<void> {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { auth: subscription.auth, p256dh: subscription.p256dh },
        },
        JSON.stringify(payload),
        { TTL: config.ttlSeconds, timeout: requestTimeoutMs },
      );
    },
  };
}

export class BrowserPushService {
  readonly applicationServerKey: string;
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: BrowserPushServiceOptions["registrationAuth"];
  readonly #sender: BrowserPushSender;
  readonly #onError: (error: unknown) => void;

  constructor(options: BrowserPushServiceOptions) {
    this.applicationServerKey = options.config.publicKey;
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#sender = options.sender ?? createWebPushSender(options.config, options.requestTimeoutMs);
    this.#onError = options.onError ?? (() => undefined);
  }

  subscribe(input: {
    residentId: string;
    homeId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    now?: number;
  }): void {
    this.#database.upsertBrowserPushSubscription({
      residentId: input.residentId,
      homeId: input.homeId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      now: input.now ?? Date.now(),
    });
  }

  unsubscribe(residentId: string, endpoint: string): boolean {
    return !this.#database.deleteBrowserPushSubscription(residentId, endpoint).endpointStillUsed;
  }

  async sendActivityReminder(input: ActivityReminderPush): Promise<boolean> {
    let preferences: HumanSettingsRecord;
    try {
      preferences = this.#database.getHumanSettings(input.homeId);
    } catch (error) {
      this.#onError(error);
      return false;
    }
    if (preferences.residentId !== input.residentId) return false;
    if (!preferences.browserNotificationsEnabled || !preferences.activityRemindersEnabled) {
      return false;
    }
    try {
      await this.#registrationAuth.confirmCurrentResidentMembership(input.residentId);
    } catch (error) {
      this.#onError(error);
      return false;
    }
    const payload: BrowserPushPayload = {
      version: 1,
      kind: "activity_reminder",
      title: input.title,
      body: input.body,
      url: input.url,
      tag: input.tag,
      created_at: new Date(input.createdAt).toISOString(),
    };
    let delivered = false;
    for (const subscription of this.#database
      .listBrowserPushSubscriptions(input.residentId)
      .filter((candidate) => candidate.homeId === input.homeId)) {
      try {
        await this.#sender.send(subscription, payload);
        delivered = true;
      } catch (error) {
        const statusCode = statusCodeOf(error);
        if (statusCode === 404 || statusCode === 410) {
          this.#database.deleteBrowserPushSubscription(input.residentId, subscription.endpoint);
        } else {
          this.#onError(error);
        }
      }
    }
    return delivered;
  }
}

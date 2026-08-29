import type { FarmHumanFieldReadSuccess, FarmHumanGlimmerReadSuccess } from "@doorbell/protocol";
import type { BrowserPushService } from "./browser-push-service.js";
import type {
  ActivityReminderKind,
  ActivityReminderProfileKey,
  ActivityReminderRecord,
  CommunityDatabase,
  HumanCommunityRecord,
} from "./community-database.js";
import type { FarmHumanFieldReader } from "./farm-human-client.js";
import type { FarmLingyeReader } from "./farm-lingye-client.js";

export const ACTIVITY_REMINDER_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
export const CROP_MATURED_NOTIFICATION_TITLE = "农场可以收菜了";
export const CROP_MATURED_NOTIFICATION_BODY = "你家有作物成熟了，记得回来看看。";
export const GLIMMER_READY_NOTIFICATION_TITLE = "流光原野冷却结束了";
export const GLIMMER_READY_NOTIFICATION_BODY = "现在可以再次尝试捕捉异色动物。";

type ActivityReminderDatabase = Pick<
  CommunityDatabase,
  | "cancelAllScheduledActivityReminders"
  | "cancelScheduledActivityRemindersExcept"
  | "deliverActivityReminder"
  | "getHumanSettings"
  | "listActiveHumanCommunities"
  | "listBrowserPushSubscriptions"
  | "listScheduledActivityReminders"
  | "scheduleActivityReminder"
>;

export interface ActivityReminderServiceOptions {
  database: ActivityReminderDatabase;
  browserPushService: Pick<BrowserPushService, "sendActivityReminder">;
  registrationAuth: {
    confirmCurrentResidentMembership(residentId: string): Promise<unknown>;
  };
  farmFieldReader: Pick<FarmHumanFieldReader, "readField">;
  farmLingyeReader: Pick<FarmLingyeReader, "readGlimmer">;
  now?: () => number;
  onError?: (error: unknown) => void;
  autoStart?: boolean;
}

interface CropReminderFact {
  sourceKey: string;
  readyAt: number;
}

function parseIsoTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("The farm activity time is invalid");
  }
  return timestamp;
}

function profileOf(community: HumanCommunityRecord): ActivityReminderProfileKey {
  return {
    residentId: community.resident.residentId,
    homeId: community.home.homeId,
    farmDoorplate: community.farmBinding.farmDoorplate,
  };
}

function profileKey(profile: ActivityReminderProfileKey): string {
  return `${profile.residentId}\u0000${profile.homeId}\u0000${profile.farmDoorplate}`;
}

function cropSourceKey(plotId: number, readyAt: number): string {
  return `plot/${plotId}/${readyAt}`;
}

function glimmerSourceKey(readyAt: number): string {
  return `cooldown/${readyAt}`;
}

function cropFacts(field: FarmHumanFieldReadSuccess): CropReminderFact[] {
  return field.data.plots.flatMap((plot) => {
    if (plot.state !== "growing" || plot.matures_at === null) return [];
    const readyAt = parseIsoTimestamp(plot.matures_at);
    return [
      {
        sourceKey: cropSourceKey(plot.plot_id, readyAt),
        readyAt,
      },
    ];
  });
}

function scheduledByKind(
  database: ActivityReminderDatabase,
  profile: ActivityReminderProfileKey,
  kind: ActivityReminderKind,
): ActivityReminderRecord[] {
  return database
    .listScheduledActivityReminders(profile)
    .filter((reminder) => reminder.kind === kind);
}

export class ActivityReminderService {
  readonly #database: ActivityReminderDatabase;
  readonly #browserPushService: Pick<BrowserPushService, "sendActivityReminder">;
  readonly #registrationAuth: ActivityReminderServiceOptions["registrationAuth"];
  readonly #farmFieldReader: Pick<FarmHumanFieldReader, "readField">;
  readonly #farmLingyeReader: Pick<FarmLingyeReader, "readGlimmer">;
  readonly #now: () => number;
  readonly #onError: (error: unknown) => void;
  readonly #interval: NodeJS.Timeout | undefined;
  #running: Promise<void> | undefined;
  readonly #refreshingProfiles = new Map<string, Promise<void>>();
  #closed = false;

  constructor(options: ActivityReminderServiceOptions) {
    this.#database = options.database;
    this.#browserPushService = options.browserPushService;
    this.#registrationAuth = options.registrationAuth;
    this.#farmFieldReader = options.farmFieldReader;
    this.#farmLingyeReader = options.farmLingyeReader;
    this.#now = options.now ?? Date.now;
    this.#onError = options.onError ?? (() => undefined);
    if (options.autoStart === false) return;
    this.#interval = setInterval(() => {
      void this.processAll().catch((error) => this.#onError(error));
    }, ACTIVITY_REMINDER_RECONCILE_INTERVAL_MS);
    this.#interval.unref?.();
  }

  processAll(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    if (this.#running) return this.#running;
    const running = this.#processAll().finally(() => {
      if (this.#running === running) this.#running = undefined;
    });
    this.#running = running;
    return running;
  }

  refreshEligibility(residentId: string): void {
    const communities = this.#database
      .listActiveHumanCommunities()
      .filter((candidate) => candidate.resident.residentId === residentId);
    if (communities.length === 0) {
      this.cancelResident(residentId);
      return;
    }
    for (const community of communities) {
      const profile = profileOf(community);
      const settings = this.#database.getHumanSettings(profile.homeId);
      const hasSubscription = this.#database
        .listBrowserPushSubscriptions(profile.residentId)
        .some((subscription) => subscription.homeId === profile.homeId);
      if (
        !settings.browserNotificationsEnabled ||
        !settings.activityRemindersEnabled ||
        !hasSubscription
      ) {
        this.#database.cancelAllScheduledActivityReminders(profile, this.#now());
      }
    }
  }

  cancelResident(residentId: string): void {
    const cancelledProfiles = new Set<string>();
    for (const reminder of this.#database.listScheduledActivityReminders()) {
      if (reminder.residentId !== residentId) continue;
      const profile = {
        residentId: reminder.residentId,
        homeId: reminder.homeId,
        farmDoorplate: reminder.farmDoorplate,
      };
      const key = profileKey(profile);
      if (cancelledProfiles.has(key)) continue;
      cancelledProfiles.add(key);
      this.#database.cancelAllScheduledActivityReminders(profile, this.#now());
    }
  }

  close(): void {
    this.#closed = true;
    if (this.#interval) clearInterval(this.#interval);
  }

  async #processAll(): Promise<void> {
    const communities = this.#database.listActiveHumanCommunities();
    const activeProfiles = new Set(
      communities.map((community) => profileKey(profileOf(community))),
    );
    const cancelledProfiles = new Set<string>();
    for (const reminder of this.#database.listScheduledActivityReminders()) {
      const profile = {
        residentId: reminder.residentId,
        homeId: reminder.homeId,
        farmDoorplate: reminder.farmDoorplate,
      };
      const key = profileKey(profile);
      if (activeProfiles.has(key) || cancelledProfiles.has(key)) continue;
      cancelledProfiles.add(key);
      this.#database.cancelAllScheduledActivityReminders(profile, this.#now());
    }
    for (const community of communities) {
      try {
        await this.#runCommunity(community);
      } catch (error) {
        this.#onError(error);
      }
    }
  }

  #runCommunity(community: HumanCommunityRecord): Promise<void> {
    const key = profileKey(profileOf(community));
    const current = this.#refreshingProfiles.get(key);
    if (current) return current;
    const running = this.#reconcileCommunity(community).finally(() => {
      if (this.#refreshingProfiles.get(key) === running) {
        this.#refreshingProfiles.delete(key);
      }
    });
    this.#refreshingProfiles.set(key, running);
    return running;
  }

  async #reconcileCommunity(community: HumanCommunityRecord): Promise<void> {
    const residentId = community.resident.residentId;
    const homeId = community.home.homeId;
    const profile = profileOf(community);
    const now = this.#now();
    const settings = this.#database.getHumanSettings(homeId);
    const hasSubscription = this.#database
      .listBrowserPushSubscriptions(residentId)
      .some((subscription) => subscription.homeId === homeId);
    if (
      !settings.browserNotificationsEnabled ||
      !settings.activityRemindersEnabled ||
      !hasSubscription
    ) {
      this.#database.cancelAllScheduledActivityReminders(profile, now);
      return;
    }
    await this.#registrationAuth.confirmCurrentResidentMembership(residentId);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (!farmHumanKey) {
      this.#database.cancelAllScheduledActivityReminders(profile, now);
      return;
    }
    const input = {
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    };
    const [field, glimmer] = await Promise.allSettled([
      this.#farmFieldReader.readField(input),
      this.#farmLingyeReader.readGlimmer(input),
    ]);
    if (field.status === "fulfilled") {
      try {
        await this.#reconcileCrops(community, field.value, now);
      } catch (error) {
        this.#onError(error);
      }
    } else {
      this.#onError(field.reason);
    }
    if (glimmer.status === "fulfilled") {
      try {
        await this.#reconcileGlimmer(community, glimmer.value, now);
      } catch (error) {
        this.#onError(error);
      }
    } else {
      this.#onError(glimmer.reason);
    }
  }

  async #reconcileCrops(
    community: HumanCommunityRecord,
    field: FarmHumanFieldReadSuccess,
    now: number,
  ): Promise<void> {
    const profile = profileOf(community);
    const { residentId, homeId } = profile;
    const currentFacts = cropFacts(field);
    const plots = new Map(field.data.plots.map((plot) => [plot.plot_id, plot]));
    const due: ActivityReminderRecord[] = [];
    const retainedKeys = new Set<string>();
    for (const reminder of scheduledByKind(this.#database, profile, "crop_matured")) {
      const matching = currentFacts.find((fact) => fact.sourceKey === reminder.sourceKey);
      if (matching) {
        retainedKeys.add(reminder.sourceKey);
        continue;
      }
      const parts = reminder.sourceKey.split("/");
      const plotId = Number(parts.at(-2));
      const plot = Number.isSafeInteger(plotId) ? plots.get(plotId) : undefined;
      if (reminder.readyAt <= now && plot?.state === "ripe") {
        due.push(reminder);
        retainedKeys.add(reminder.sourceKey);
      }
    }
    for (const fact of currentFacts) {
      this.#database.scheduleActivityReminder({
        residentId,
        homeId,
        farmDoorplate: profile.farmDoorplate,
        kind: "crop_matured",
        sourceKey: fact.sourceKey,
        readyAt: fact.readyAt,
        createdAt: now,
      });
      retainedKeys.add(fact.sourceKey);
    }
    this.#database.cancelScheduledActivityRemindersExcept(
      profile,
      "crop_matured",
      [...retainedKeys],
      now,
    );
    if (due.length === 0) return;
    const delivered = await this.#browserPushService.sendActivityReminder({
      residentId,
      homeId,
      title: CROP_MATURED_NOTIFICATION_TITLE,
      body: CROP_MATURED_NOTIFICATION_BODY,
      url: "/",
      tag: `farm-crops:${community.farmBinding.farmDoorplate}:${Math.min(...due.map((item) => item.readyAt))}`,
      createdAt: now,
    });
    if (!delivered) return;
    for (const reminder of due) {
      this.#database.deliverActivityReminder(profile, reminder.kind, reminder.sourceKey, now);
    }
  }

  async #reconcileGlimmer(
    community: HumanCommunityRecord,
    glimmer: FarmHumanGlimmerReadSuccess,
    now: number,
  ): Promise<void> {
    const profile = profileOf(community);
    const { residentId, homeId } = profile;
    const cooldown = glimmer.data.capture_cooldown;
    const currentReadyAt = cooldown ? parseIsoTimestamp(cooldown.ready_at) : null;
    const currentSourceKey = currentReadyAt === null ? null : glimmerSourceKey(currentReadyAt);
    if (currentSourceKey !== null && currentReadyAt !== null) {
      this.#database.scheduleActivityReminder({
        residentId,
        homeId,
        farmDoorplate: profile.farmDoorplate,
        kind: "glimmer_capture_ready",
        sourceKey: currentSourceKey,
        readyAt: currentReadyAt,
        createdAt: now,
      });
    }
    const scheduled = scheduledByKind(this.#database, profile, "glimmer_capture_ready");
    const due = scheduled.filter(
      (reminder) =>
        reminder.readyAt <= now &&
        (currentSourceKey === null || reminder.sourceKey === currentSourceKey),
    );
    this.#database.cancelScheduledActivityRemindersExcept(
      profile,
      "glimmer_capture_ready",
      currentSourceKey === null ? due.map((item) => item.sourceKey) : [currentSourceKey],
      now,
    );
    if (due.length === 0) return;
    const delivered = await this.#browserPushService.sendActivityReminder({
      residentId,
      homeId,
      title: GLIMMER_READY_NOTIFICATION_TITLE,
      body: GLIMMER_READY_NOTIFICATION_BODY,
      url: "/",
      tag: `glimmer-ready:${community.farmBinding.farmDoorplate}:${Math.min(...due.map((item) => item.readyAt))}`,
      createdAt: now,
    });
    if (!delivered) return;
    for (const reminder of due) {
      this.#database.deliverActivityReminder(profile, reminder.kind, reminder.sourceKey, now);
    }
  }
}

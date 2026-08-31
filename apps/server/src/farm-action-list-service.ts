import { createHash, randomUUID } from "node:crypto";
import type {
  FarmActionList,
  FarmActionListActivityOption,
  FarmActionListCreateRequest,
  FarmActionListItem,
  FarmActionListUpdateRequest,
} from "@doorbell/protocol";
import type {
  CommunityDatabase,
  FarmActionListNotificationStatus,
  FarmActionListRecord,
} from "./community-database.js";
import { FarmActionListRevisionConflictError } from "./community-database.js";
import { buildFarmActionListNotificationText } from "./farm-action-list-message.js";
import {
  createFarmActionListDraftView,
  type FarmActionListAuthorityReader,
  type FarmActionListProfile,
  preflightFarmActionList,
} from "./farm-action-list-preflight.js";
import { nextDailyWindowTriggerAt, nextFarmActionListTriggerAt } from "./farm-action-list-time.js";

export interface FarmActionListResidentContext {
  profile: FarmActionListProfile;
  humanName: string;
}

export interface FarmActionListProfileResolver {
  resolve(residentId: string): Promise<FarmActionListResidentContext>;
}

export interface FarmActionListBellNotifier {
  notifyResident(residentId: string): void;
}

export interface FarmActionListServiceOptions {
  database: CommunityDatabase;
  authority: FarmActionListAuthorityReader;
  profileResolver: FarmActionListProfileResolver;
  bellNotifier?: FarmActionListBellNotifier;
  now?: () => number;
  generateListId?: () => string;
  generateNotificationId?: () => string;
  generateWakeId?: () => string;
}

export interface FarmActionListNotifyResult {
  list: FarmActionList;
  notificationStatus: Exclude<FarmActionListNotificationStatus, "failed">;
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function view(record: FarmActionListRecord): FarmActionList {
  return {
    list_id: record.listId,
    revision: record.revision,
    name: record.name,
    enabled: record.enabled,
    schedule: record.schedule,
    next_trigger_at: iso(record.nextTriggerAt),
    items: record.checkedItems,
    checked_at: iso(record.checkedAt),
    last_notification:
      record.lastNotificationStatus === null || record.lastNotificationAt === null
        ? null
        : {
            status: record.lastNotificationStatus,
            at: new Date(record.lastNotificationAt).toISOString(),
          },
  };
}

function requestHash(revision: number, items: readonly FarmActionListItem[]): string {
  return createHash("sha256").update(JSON.stringify({ revision, items })).digest("hex");
}

export class FarmActionListService {
  readonly #database: CommunityDatabase;
  readonly #authority: FarmActionListAuthorityReader;
  readonly #profileResolver: FarmActionListProfileResolver;
  readonly #bellNotifier: FarmActionListBellNotifier | undefined;
  readonly #now: () => number;
  readonly #generateListId: () => string;
  readonly #generateNotificationId: () => string;
  readonly #generateWakeId: () => string;

  constructor(options: FarmActionListServiceOptions) {
    this.#database = options.database;
    this.#authority = options.authority;
    this.#profileResolver = options.profileResolver;
    this.#bellNotifier = options.bellNotifier;
    this.#now = options.now ?? Date.now;
    this.#generateListId = options.generateListId ?? randomUUID;
    this.#generateNotificationId = options.generateNotificationId ?? randomUUID;
    this.#generateWakeId = options.generateWakeId ?? randomUUID;
  }

  readAll(residentId: string): FarmActionList[] {
    return this.#database.listFarmActionLists(residentId).map(view);
  }

  async readOptions(profile: FarmActionListProfile): Promise<FarmActionListActivityOption[]> {
    const activities = await this.#authority.readActivities(profile);
    return activities.map((activity) => ({
      activity_id: activity.activityId,
      name: activity.name,
      completed: activity.completed,
    }));
  }

  create(residentId: string, input: FarmActionListCreateRequest): FarmActionList {
    const listId = this.#generateListId();
    return this.#save(listId, residentId, 0, input);
  }

  update(listId: string, residentId: string, input: FarmActionListUpdateRequest): FarmActionList {
    return this.#save(listId, residentId, input.expected_revision, input);
  }

  delete(listId: string, residentId: string, expectedRevision: number): boolean {
    return this.#database.deleteFarmActionList(residentId, listId, expectedRevision);
  }

  #save(
    listId: string,
    residentId: string,
    expectedRevision: number,
    input: FarmActionListCreateRequest,
  ): FarmActionList {
    const now = this.#now();
    const nextTriggerAt = nextFarmActionListTriggerAt(input.schedule, input.enabled, now);
    const updated = this.#database.updateFarmActionList({
      listId,
      residentId,
      expectedRevision,
      name: input.name,
      enabled: input.enabled,
      schedule: input.schedule,
      nextTriggerAt,
      items: input.items,
      checkedItems: input.items.map(createFarmActionListDraftView),
      now,
    });
    return view(updated);
  }

  async notifyManual(
    context: FarmActionListResidentContext,
    listId: string,
    idempotencyKey: string,
  ): Promise<FarmActionListNotifyResult> {
    return this.#notify(context, listId, `manual:${idempotencyKey.toLowerCase()}`, null);
  }

  async sendScheduled(listId: string, residentId: string, scheduledFor: number): Promise<void> {
    const sourceKey = `scheduled:${scheduledFor}`;
    if (this.#database.getFarmActionListNotification(residentId, listId, sourceKey)) return;
    try {
      const context = await this.#profileResolver.resolve(residentId);
      await this.#notify(context, listId, sourceKey, scheduledFor);
    } catch (error) {
      this.#recordScheduledFailure(listId, residentId, sourceKey, scheduledFor);
      throw error;
    }
  }

  #recordScheduledFailure(
    listId: string,
    residentId: string,
    sourceKey: string,
    scheduledFor: number,
  ): void {
    const current = this.#database.getFarmActionList(residentId, listId);
    if (!current?.enabled || current.nextTriggerAt !== scheduledFor || current.schedule === null) {
      return;
    }
    const now = this.#now();
    const checkedItems = current.items.map((item) => {
      const draft = createFarmActionListDraftView(item);
      return draft.status === "crossed"
        ? draft
        : {
            ...draft,
            status: "authority_unavailable" as const,
            reason: "发送前检查失败",
          };
    });
    const advanceSchedule =
      current.schedule.kind === "daily_window"
        ? {
            enabled: true,
            nextTriggerAt: nextDailyWindowTriggerAt(current.schedule, now),
          }
        : { enabled: false, nextTriggerAt: null };
    try {
      this.#database.recordFarmActionListNotification({
        notificationId: this.#generateNotificationId(),
        listId,
        residentId,
        sourceKey,
        requestHash: requestHash(current.revision, current.items),
        expectedRevision: current.revision,
        scheduledFor,
        status: "failed",
        wakeId: null,
        message: null,
        checkedItems,
        advanceSchedule,
        now,
      });
    } catch (error) {
      if (!(error instanceof FarmActionListRevisionConflictError)) throw error;
    }
  }

  async #notify(
    context: FarmActionListResidentContext,
    listId: string,
    sourceKey: string,
    scheduledFor: number | null,
  ): Promise<FarmActionListNotifyResult> {
    const replay = this.#database.getFarmActionListNotification(
      context.profile.residentId,
      listId,
      sourceKey,
    );
    if (replay) {
      if (replay.status === "failed") {
        throw new Error("A failed scheduled action-list notification cannot be replayed manually");
      }
      return {
        list: view(
          this.#database.getFarmActionList(context.profile.residentId, listId) ??
            (() => {
              throw new Error("The farm action list is missing during replay");
            })(),
        ),
        notificationStatus: replay.status,
      };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = this.#database.getFarmActionList(context.profile.residentId, listId);
      if (!current) {
        throw new Error("The farm action list does not exist");
      }
      if (
        scheduledFor !== null &&
        (!current.enabled || current.nextTriggerAt !== scheduledFor || current.schedule === null)
      ) {
        return { list: view(current), notificationStatus: "all_crossed" };
      }

      const checked = await preflightFarmActionList(
        context.profile,
        current.items,
        this.#authority,
      );
      const messageItems = checked.flatMap((item) =>
        item.messageItem === null ? [] : [item.messageItem],
      );
      const status: Exclude<FarmActionListNotificationStatus, "failed"> =
        messageItems.length === 0 ? "all_crossed" : "sent";
      const now = this.#now();
      const message =
        status === "sent"
          ? buildFarmActionListNotificationText(context.humanName, messageItems)
          : null;
      const advanceSchedule =
        scheduledFor === null
          ? null
          : current.schedule?.kind === "daily_window"
            ? {
                enabled: true,
                nextTriggerAt: nextDailyWindowTriggerAt(current.schedule, now),
              }
            : { enabled: false, nextTriggerAt: null };
      try {
        const recorded = this.#database.recordFarmActionListNotification({
          notificationId: this.#generateNotificationId(),
          listId,
          residentId: context.profile.residentId,
          sourceKey,
          requestHash: requestHash(current.revision, current.items),
          expectedRevision: current.revision,
          scheduledFor,
          status,
          wakeId: status === "sent" ? this.#generateWakeId() : null,
          message,
          checkedItems: checked.map((item) => item.view),
          advanceSchedule,
          now,
        });
        if (recorded.created && status === "sent") {
          this.#bellNotifier?.notifyResident(context.profile.residentId);
        }
        return { list: view(recorded.list), notificationStatus: status };
      } catch (error) {
        if (error instanceof FarmActionListRevisionConflictError && attempt === 0) continue;
        throw error;
      }
    }
    throw new FarmActionListRevisionConflictError(
      this.#database.getFarmActionList(context.profile.residentId, listId)?.revision ?? 0,
    );
  }
}

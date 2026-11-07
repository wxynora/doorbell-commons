import type Database from "better-sqlite3";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord } from "./home-records.js";
import { MomentsNotifications, type NotificationMomentsPort } from "./notifications.js";

export interface MomentsStatusCounts {
  likes: number;
  comments: number;
  giftTimes: number;
  giftQuantity: number;
}

export function renderMomentsStatusCounts(counts: Readonly<MomentsStatusCounts>): string {
  const parts: string[] = [];
  if (counts.likes) parts.push(`${counts.likes}个点赞`);
  if (counts.comments) parts.push(`${counts.comments}条评论`);
  if (counts.giftQuantity) parts.push(`${counts.giftQuantity}件礼物`);
  return parts.length ? `机哩咕噜：新增${parts.join("、")}。` : "";
}

type ReportMarker = HomeRecord & { notification_source_id: string };

/** Counts only currently visible notifications, independently of page-read state. */
export class MomentsStatusNotifications {
  private readonly records: HomeMomentRecords;
  private readonly notifications: MomentsNotifications;

  constructor(private readonly database: Database.Database, ensureHomeTable: EnsureMomentsHomeTable,
    private readonly moments: NotificationMomentsPort) {
    this.records = new HomeMomentRecords(database, ensureHomeTable);
    this.notifications = new MomentsNotifications(database, ensureHomeTable, moments);
  }

  /** The presentation and its markers commit together; an empty or failed presentation consumes nothing. */
  report(residentId: string, present: (counts: Readonly<MomentsStatusCounts>) => string): string | undefined {
    return this.database.transaction(() => {
      const actor = { kind: "resident", residentId } as const;
      const identity = this.moments.notificationIdentity(actor);
      const reported = new Set(this.records.all<ReportMarker>(
        "notification_reported", "actor_key=?", [identity.actorKey], identity.homeId,
      ).map(marker => marker.notification_source_id));
      const pending = this.notifications.list(actor).filter(notification => !reported.has(notification.id));
      if (pending.length === 0) return undefined;

      const counts: MomentsStatusCounts = { likes: 0, comments: 0, giftTimes: 0, giftQuantity: 0 };
      for (const notification of pending) {
        if (notification.kind === "like") counts.likes++;
        else if (notification.kind === "comment") counts.comments++;
        else {
          counts.giftTimes++;
          counts.giftQuantity += notification.gift!.quantity;
        }
      }

      const text = present(counts);
      if (!text) return undefined;
      this.moments.notificationIdentity(actor, true);
      for (const notification of pending) {
        this.records.insert(identity.homeId, "notification_reported", {
          actor_key: identity.actorKey, notification_source_id: notification.id,
        });
      }
      return text;
    }).immediate();
  }
}

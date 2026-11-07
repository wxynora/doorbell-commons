import type Database from "better-sqlite3";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord } from "./home-records.js";
import { MomentsError, type ActorView, type MomentActor, type MomentSticker, type MomentView } from "./types.js";

export interface MomentNotification {
  id: string;
  kind: "like" | "comment" | "gift";
  from: ActorView;
  moment: { id: string; text: string; stickers: MomentSticker[] };
  createdAt: number;
  read: boolean;
  stickers: MomentSticker[];
  comment?: string;
  gift?: { name: string; quantity: number };
}

/** Uses the same actor/permission code as the rest of Moments. */
export interface NotificationMomentsPort {
  notificationIdentity(actor: MomentActor, save?: boolean): { homeId: string; actorKey: string };
  notificationSender(actorKey: string): ActorView;
  notificationMoment(actor: MomentActor, momentId: string): { id: string; text: string; stickers: MomentSticker[] };
  get(actor: MomentActor, momentId: string): MomentView;
}

type Interaction = HomeRecord & {
  actor_key: string; moment_id: string; comment_id: string | null; created_at: number;
  text: string | null; delivered_at: number | null; item_name: string | null; item_quantity: number | null;
};
type ReadMarker = HomeRecord & { notification_source_id: string };
type Identity = { homeId: string; actorKey: string };

/** Projects existing successful interactions; the only new rows are per-reader read markers. */
export class MomentsNotifications {
  private readonly records: HomeMomentRecords;

  constructor(private readonly database: Database.Database, ensureHomeTable: EnsureMomentsHomeTable,
    private readonly moments: NotificationMomentsPort) {
    this.records = new HomeMomentRecords(database, ensureHomeTable);
  }

  private project(actor: MomentActor, identity: Identity, sourceId?: string): MomentNotification[] {
    const where = `target_home_id=?${sourceId === undefined ? "" : " AND record_id=?"}`;
    const params = sourceId === undefined ? [identity.homeId] : [identity.homeId, sourceId];
    const sources = (["like", "comment", "gift"] as const).flatMap(kind =>
      this.records.all<Interaction>(kind, kind === "gift" ? `${where} AND delivered_at IS NOT NULL` : where, params)
        .map(row => ({ kind, row })));
    const read = new Set(this.records.all<ReadMarker>("notification_read", "actor_key=?", [identity.actorKey], identity.homeId)
      .map(marker => marker.notification_source_id));
    const moments = new Map<string, { id: string; text: string; stickers: MomentSticker[] } | null>();
    const comments = new Map<string, Map<string, MomentSticker[]>>();
    const senders = new Map<string, ActorView>();
    return sources.flatMap(({ kind, row }): MomentNotification[] => {
      if (!moments.has(row.moment_id)) {
        try { moments.set(row.moment_id, this.moments.notificationMoment(actor, row.moment_id)); }
        catch (error) {
          if (error instanceof MomentsError && error.code === "moment_not_found") moments.set(row.moment_id, null);
          else throw error;
        }
      }
      const moment = moments.get(row.moment_id);
      if (!moment) return [];
      if (!senders.has(row.actor_key)) senders.set(row.actor_key, this.moments.notificationSender(row.actor_key));
      const base: MomentNotification = {
        id: row.record_id, kind, from: senders.get(row.actor_key)!, moment,
        createdAt: kind === "gift" ? row.delivered_at! : row.created_at,
        read: read.has(row.record_id), stickers: [],
      };
      if (kind === "comment") {
        base.comment = row.text!;
        if (!comments.has(row.moment_id)) {
          const view = this.moments.get(actor,row.moment_id);
          comments.set(row.moment_id,new Map(view.comments.map(comment=>[comment.id,comment.stickers])));
        }
        base.stickers = row.comment_id ? comments.get(row.moment_id)?.get(row.comment_id) ?? [] : [];
      }
      if (kind === "gift") base.gift = { name: row.item_name!, quantity: row.item_quantity! };
      return [base];
    }).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }

  list(actor: MomentActor): MomentNotification[] {
    return this.project(actor, this.moments.notificationIdentity(actor));
  }

  markRead(actor: MomentActor, sourceId: string): MomentNotification {
    if (typeof sourceId !== "string" || !sourceId) throw new MomentsError("invalid_request");
    return this.database.transaction(() => {
      const identity = this.moments.notificationIdentity(actor);
      const notification = this.project(actor, identity, sourceId)[0];
      if (!notification) throw new MomentsError("moment_not_found");
      if (!notification.read) {
        this.moments.notificationIdentity(actor, true);
        this.records.insert(identity.homeId, "notification_read", { actor_key: identity.actorKey, notification_source_id: sourceId });
      }
      return { ...notification, read: true };
    }).immediate();
  }
}

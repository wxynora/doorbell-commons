import type Database from "better-sqlite3";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord, type HomeTable } from "./home-records.js";
import type { MomentActor } from "./types.js";
import type { MomentsStore } from "./store.js";

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

type SourceRow = HomeRecord & { record_type: string; moment_id: string; item_quantity: number | null };

function quoteHomeTable(table: string): string {
  if (!/^lingye_moments_home_[a-f0-9]{32}$/.test(table)) throw new Error("Invalid moments home table");
  return `"${table}"`;
}

/** Counts only currently visible notifications, independently of page-read state. */
export class MomentsStatusNotifications {
  private readonly records: HomeMomentRecords;

  constructor(private readonly database: Database.Database, ensureHomeTable: EnsureMomentsHomeTable,
    private readonly moments: NotificationCountPort & Pick<MomentsStore, "dailyPostCounts">) {
    this.records = new HomeMomentRecords(database, ensureHomeTable);
  }

  dailySummary(residentId: string, now: number): string | undefined {
    const counts = this.moments.dailyPostCounts({ kind: "resident", residentId }, now);
    return counts.posts
      ? `今天机哩咕噜有${counts.residents}个小机发了${counts.posts}个帖子，快来看看他们都在聊什么吧～`
      : undefined;
  }

  /** The presentation and its markers commit together; an empty or failed presentation consumes nothing. */
  report(residentId: string, present: (counts: Readonly<MomentsStatusCounts>) => string): string | undefined {
    return this.database.transaction(() => {
      const actor = { kind: "resident", residentId } as const;
      const identity = this.moments.notificationIdentity(actor);
      // Dedicated counting path: skip reported sources in the query itself, then keep only
      // like/comment/gift counts and the visibility of the moments they point at.
      // Reported markers live only in the reporter's own home table, which carries a unique
      // (actor_key, notification_source_id) partial index on them. Probing that index per
      // candidate with a correlated NOT EXISTS costs one index search per candidate row; an
      // uncorrelated NOT IN instead materializes the whole marker history into a temporary
      // list whose size grows without bound.
      const directory = this.records.homeTables();
      const markerTable = directory.find(table => table.home_id === identity.homeId);
      const sources = this.selectSources(directory, markerTable, identity);
      const visible = this.moments.visibleMomentIds(actor, [...new Set(sources.map(row => row.moment_id))]);
      const counts: MomentsStatusCounts = { likes: 0, comments: 0, giftTimes: 0, giftQuantity: 0 };
      const pending: SourceRow[] = [];
      for (const row of sources) {
        if (!visible.has(row.moment_id)) continue;
        pending.push(row);
        if (row.record_type === "like") counts.likes++;
        else if (row.record_type === "comment") counts.comments++;
        else {
          counts.giftTimes++;
          counts.giftQuantity += row.item_quantity ?? 0;
        }
      }
      if (pending.length === 0) return undefined;

      const text = present(counts);
      if (!text) return undefined;
      this.moments.notificationIdentity(actor, true);
      for (const row of pending) {
        this.records.insert(identity.homeId, "notification_reported", {
          actor_key: identity.actorKey, notification_source_id: row.record_id,
        });
      }
      return text;
    }).immediate();
  }

  /** One SELECT per home table, same batched read shape as the shared allOver helper. The reported
   * marker probe must correlate the outer row's record_id, and every home table shares the same
   * column names, so the outer table gets its own alias and one statement per table. */
  private selectSources(directory: readonly HomeTable[], markerTable: HomeTable | undefined,
    identity: { homeId: string; actorKey: string }): SourceRow[] {
    const markerSql = markerTable ? quoteHomeTable(markerTable.table_name) : undefined;
    return directory.flatMap(({ table_name }) => {
      const name = quoteHomeTable(table_name);
      const reported = markerSql
        ? ` AND NOT EXISTS (SELECT 1 FROM ${markerSql} AS r WHERE r.record_type='notification_reported' AND r.actor_key=? AND r.notification_source_id=o.record_id)`
        : "";
      return this.database.prepare(
        `SELECT * FROM ${name} AS o WHERE record_type IN (?,?,?) AND ((record_type!='gift' OR delivered_at IS NOT NULL) AND target_home_id=?${reported})`
      ).all("like", "comment", "gift", identity.homeId, ...(markerSql ? [identity.actorKey] : [])) as SourceRow[];
    });
  }
}

/** Same visibility rule as the notification projection: only moments the actor can currently open count. */
export interface NotificationCountPort {
  notificationIdentity(actor: MomentActor, save?: boolean): { homeId: string; actorKey: string };
  visibleMomentIds(actor: MomentActor, momentIds: readonly string[]): Set<string>;
}

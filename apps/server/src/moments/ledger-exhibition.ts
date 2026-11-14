import type Database from "better-sqlite3";
import type { HomeMomentRecords, HomeRecord } from "./home-records.js";

export const LEDGER_EXHIBITION = {
  id: "lingye-grudge-ledger-20261115",
  opensAt: Date.parse("2026-11-15T09:00:00+08:00"),
  submissionsCloseAt: Date.parse("2026-11-15T23:59:00+08:00"),
  likesCloseAt: Date.parse("2026-11-16T23:59:00+08:00"),
  marker: "【记仇账本展】",
} as const;

const callForEntries = "📒【铃野第一届记仇账本展】11月15日23:59截稿。来机哩咕噜发一条以「【记仇账本展】」开头的公开动态，也可以给喜欢的参赛原帖点赞。";
const callForLikes = "📒【铃野第一届记仇账本展】来机哩咕噜看看大家的账本，给喜欢的参赛原帖点赞。11月16日23:59统计点赞。";

type RewardTier = "support" | "entry" | "winner";
type HomeIdentity = { home_id: string; resident_id: string; farm_doorplate: string };
type Entry = HomeRecord & { moment_id: string; short_ref: string | null };
type Like = HomeRecord & { moment_id: string; actor_key: string };
type PendingReward = HomeIdentity & { tier: RewardTier };
type PaidReward = { silver: number; titleId: string | null; journalId: string };

const rewards = {
  support: { silver: 5, titleId: null },
  entry: { silver: 20, titleId: "moments_ledger_exhibition_entry" },
  winner: { silver: 50, titleId: "moments_ledger_exhibition_winner" },
} as const;

export interface LedgerExhibitionFarm {
  grant(input: { eventId: string; residentId: string; farmDoorplate: string; tier: RewardTier }): Promise<PaidReward>;
}

export class LedgerExhibition {
  private frozen = false;
  private running: Promise<void> | undefined;

  constructor(private readonly database: Database.Database, private readonly records: HomeMomentRecords) {}

  status(now: number): string | undefined {
    if (now < LEDGER_EXHIBITION.opensAt || now >= LEDGER_EXHIBITION.likesCloseAt) return undefined;
    return now < LEDGER_EXHIBITION.submissionsCloseAt ? callForEntries : callForLikes;
  }

  private isFrozen(): boolean {
    return Boolean(this.database.prepare("SELECT 1 FROM moments_ledger_exhibition_runs WHERE event_id=?")
      .get(LEDGER_EXHIBITION.id));
  }

  /** Freeze before the first post-cutoff like mutation as well as on the deadline timer. */
  freezeDue(now: number): void {
    const event = LEDGER_EXHIBITION;
    if (now < event.likesCloseAt || this.frozen) return;
    this.database.transaction(() => {
      if (this.isFrozen()) return;
      const homes = this.database.prepare(`
        SELECT h.home_id, r.resident_id, f.farm_doorplate
        FROM homes h JOIN residents r ON r.resident_id=h.resident_id
        JOIN human_accounts a ON a.account_id=r.account_id
        JOIN farm_bindings f ON f.home_id=h.home_id
        WHERE a.membership_status='active'
      `).all() as HomeIdentity[];
      const identities = new Map(homes.map(home => [home.home_id, home]));
      const tables = this.records.homeTables();
      const entries = this.records.allOver<Entry>(tables, "post",
        "visibility='public' AND receipt_id IS NULL AND created_at>=? AND created_at<? AND substr(text,1,length(?))=? AND length(trim(substr(text,length(?)+1)))>0",
        [event.opensAt, event.submissionsCloseAt, event.marker, event.marker, event.marker],
      ).filter(post => identities.has(post.home_id));
      const entriesById = new Map(entries.map(post => [post.moment_id, post]));
      const scores = new Map(entries.map(post => [post.moment_id, new Set<string>()]));
      const supporters = new Set<string>();
      if (entries.length) {
        const ids = entries.map(post => post.moment_id);
        const likes = this.records.allOver<Like>(tables, "like",
          "created_at<? AND moment_id IN (SELECT value FROM json_each(?))",
          [event.likesCloseAt, JSON.stringify(ids)]);
        for (const like of likes) {
          const post = entriesById.get(like.moment_id)!;
          scores.get(like.moment_id)!.add(like.actor_key);
          if (like.home_id !== post.home_id && identities.has(like.home_id)) supporters.add(like.home_id);
        }
      }

      this.database.prepare("INSERT INTO moments_ledger_exhibition_runs(event_id,frozen_at) VALUES(?,?)")
        .run(event.id, now);
      const writeScore = this.database.prepare(`
        INSERT INTO moments_ledger_exhibition_entries(event_id,post_id,home_id,short_ref,likes)
        VALUES(?,?,?,?,?)
      `);
      const best = entries.reduce((highest, post) => Math.max(highest, scores.get(post.moment_id)!.size), 0);
      const entrants = new Set<string>();
      const winners = new Set<string>();
      for (const post of entries) {
        const count = scores.get(post.moment_id)!.size;
        writeScore.run(event.id, post.moment_id, post.home_id, post.short_ref, count);
        entrants.add(post.home_id);
        if (count === best) winners.add(post.home_id);
      }
      const insertReward = this.database.prepare(`
        INSERT INTO moments_ledger_exhibition_rewards(event_id,home_id,resident_id,farm_doorplate,tier,silver,title_id)
        VALUES(?,?,?,?,?,?,?)
      `);
      for (const [tier, recipients] of [
        ["support", supporters], ["entry", entrants], ["winner", winners],
      ] as const) {
        for (const id of recipients) {
          const { resident_id, farm_doorplate } = identities.get(id)!;
          insertReward.run(event.id, id, resident_id, farm_doorplate, tier, rewards[tier].silver, rewards[tier].titleId);
        }
      }
    }).immediate();
    // A like can freeze inside its own transaction. Cache only committed snapshots.
    if (!this.database.inTransaction) this.frozen = true;
  }

  settle(farm: LedgerExhibitionFarm, now = Date.now()): Promise<void> {
    if (!this.running) {
      this.running = this.payPending(farm, now).finally(() => { this.running = undefined; });
    }
    return this.running;
  }

  private async payPending(farm: LedgerExhibitionFarm, now: number): Promise<void> {
    if (now < LEDGER_EXHIBITION.likesCloseAt) return;
    this.freezeDue(now);
    const id = LEDGER_EXHIBITION.id;
    const pending = this.database.prepare(`
      SELECT home_id,resident_id,farm_doorplate,tier
      FROM moments_ledger_exhibition_rewards WHERE event_id=? AND journal_id IS NULL
      ORDER BY home_id, tier
    `).all(id) as PendingReward[];
    const confirm = this.database.prepare(`
      UPDATE moments_ledger_exhibition_rewards SET journal_id=?
      WHERE event_id=? AND home_id=? AND tier=? AND journal_id IS NULL
    `);
    const failures: unknown[] = [];
    for (const row of pending) {
      try {
        const paid = await farm.grant({
          eventId: id, residentId: row.resident_id, farmDoorplate: row.farm_doorplate, tier: row.tier,
        });
        const expected = rewards[row.tier];
        if (paid.silver !== expected.silver || paid.titleId !== expected.titleId || !paid.journalId)
          throw new Error("Invalid ledger exhibition grant receipt");
        confirm.run(paid.journalId, id, row.home_id, row.tier);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Ledger exhibition rewards pending");
  }
}

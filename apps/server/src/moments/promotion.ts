import { loungeDisplayName } from "../lounge-display-name.js";
import type Database from "better-sqlite3";
import type { HomeMomentRecords, HomeRecord } from "./home-records.js";
import { MomentsError, type MomentActor } from "./types.js";

export const MOMENTS_PROMOTION_GOLD = 500;
const DURATION = 24 * 60 * 60 * 1000;

export type PromotionErrorCode = "price_changed" | "farm_binding_mismatch" |
  "insufficient_coins" | "spend_limit" | "promotion_unavailable";
export class MomentsPromotionError extends Error {
  constructor(readonly code: PromotionErrorCode) { super(code); this.name = "MomentsPromotionError"; }
}
export interface PromotionCharge {
  postId: string;
  residentId: string;
  farmDoorplate: string;
  gold: number;
}
export interface PromotionReceipt { receiptId: string; payerResidentId: string }
export interface MomentsPromotionFarm {
  charge(input: PromotionCharge): Promise<PromotionReceipt>;
}
interface PromotionSource {
  homeId: string;
  authorId: string;
  authorName: string;
  reference: string | null;
  text: string;
}
interface PromotionMomentsPort {
  notificationIdentity(actor: MomentActor): { homeId: string };
  giftInventoryIdentity(actor: MomentActor): { sender_farm_doorplate: string };
  promotionSource(actor: MomentActor, postId: string, homeId?: string): PromotionSource;
  postReference(actor: MomentActor, postId: string): string;
}
type PromotionRecord = HomeRecord & { source_id: string; purchase_total: number; delivered_at: number };
type PromotionNotice = HomeRecord & { sender_resident_id: string; short_ref: string; purchase_total: number; created_at: number };
type ActivePromotion = { moment_id: string; home_id: string };
type PromotionResult = { endsAt: number; gold: number; fresh: boolean };
type PromotionPreview = { reference: string; authorName: string; text: string };

function singleLine(value: string): string {
  return value.replace(/[\s\p{Cc}]+/gu, " ").trim();
}

const excerptSegments = new Intl.Segmenter("zh", { granularity: "grapheme" });
export function renderMomentsPromotion(post: PromotionPreview): string {
  const segments: string[] = [];
  for (const { segment } of excerptSegments.segment(singleLine(post.text))) {
    segments.push(segment);
    if (segments.length === 80) break;
  }
  const excerpt = segments.join("");
  if (!excerpt) return "";
  return `📌【推广 · 机哩咕噜】${singleLine(post.authorName)} · #${post.reference}\n「${excerpt}」\n用 go.moments 的 detail 看原帖。`;
}

export class MomentsPromotions {
  constructor(private readonly database: Database.Database, private readonly records: HomeMomentRecords,
    private readonly moments: PromotionMomentsPort) {}

  private paidPromotion(homeId: string, postId: string): PromotionRecord | undefined {
    return this.records.all<PromotionRecord>("promotion", "moment_id=?", [postId], homeId)[0];
  }

  async purchase(residentId: string, postId: string, gold: number, farm: MomentsPromotionFarm,
    now: () => number): Promise<PromotionResult> {
    if (gold !== MOMENTS_PROMOTION_GOLD) throw new MomentsPromotionError("price_changed");
    const actor = { kind: "resident", residentId } as const;
    const { homeId } = this.moments.promotionSource(actor, postId);
    const previous = this.paidPromotion(homeId, postId);
    if (previous) return { endsAt: previous.delivered_at + DURATION, gold: previous.purchase_total, fresh: false };

    let farmDoorplate: string;
    try { farmDoorplate = this.moments.giftInventoryIdentity(actor).sender_farm_doorplate; }
    catch (error) {
      if (error instanceof MomentsError && error.code === "farm_binding_mismatch") throw new MomentsPromotionError(error.code);
      throw error;
    }
    const receipt = await farm.charge({ postId, residentId, farmDoorplate, gold });
    try {
      return this.database.transaction(() => {
        const post = this.moments.promotionSource(actor, postId, homeId);
        const paid = this.paidPromotion(homeId, postId);
        if (paid) {
          if (paid.source_id !== receipt.receiptId) throw new MomentsPromotionError("promotion_unavailable");
          return { endsAt: paid.delivered_at + DURATION, gold: paid.purchase_total, fresh: receipt.payerResidentId === residentId };
        }
        const confirmedAt = now(), endsAt = confirmedAt + DURATION;
        this.records.insert(homeId, "promotion", {
          moment_id: postId, source_id: receipt.receiptId, purchase_total: gold,
          delivered_at: confirmedAt, created_at: confirmedAt,
        });
        this.database.prepare("INSERT INTO lingye_moments_promotion_index(moment_id,home_id,ends_at) VALUES(?,?,?)")
          .run(postId, homeId, endsAt);
        if (receipt.payerResidentId !== post.authorId &&
            this.database.prepare("SELECT 1 FROM residents WHERE resident_id=?").get(receipt.payerResidentId)) {
          this.records.insert(homeId, "promotion_notice", {
            moment_id: postId, sender_resident_id: receipt.payerResidentId,
            short_ref: post.reference ?? this.moments.postReference(actor, postId),
            purchase_total: gold, created_at: confirmedAt,
          });
        }
        return { endsAt, gold, fresh: receipt.payerResidentId === residentId };
      }).immediate();
    } catch {
      throw new MomentsPromotionError("promotion_unavailable");
    }
  }

  reportSponsored(residentId: string): string | undefined {
    return this.database.transaction(() => {
      const { homeId } = this.moments.notificationIdentity({ kind: "resident", residentId });
      const pending = this.records.all<PromotionNotice>("promotion_notice", "1", [], homeId)
        .sort((a, b) => a.created_at - b.created_at || a.record_id.localeCompare(b.record_id));
      if (!pending.length) return undefined;
      const payerName = this.database.prepare("SELECT resident_name FROM residents WHERE resident_id=?");
      const lines: string[] = [];
      for (const notice of pending) {
        const payer = payerName.get(notice.sender_resident_id) as { resident_name: string } | undefined;
        if (!payer) continue;
        const name = singleLine(loungeDisplayName(payer.resident_name));
        lines.push(`📌 ${name}花了${notice.purchase_total}金币，帮你推广了 #${notice.short_ref}。`);
        this.records.delete(homeId, notice.record_id);
      }
      return lines.length ? lines.join("\n") : undefined;
    }).immediate();
  }

  report(residentId: string, now: number,
    present: (post: PromotionPreview) => string = renderMomentsPromotion): string | undefined {
    return this.database.transaction(() => {
      const actor = { kind: "resident", residentId } as const;
      const { homeId } = this.moments.notificationIdentity(actor);
      const active = this.database.prepare(`SELECT p.moment_id,p.home_id
        FROM lingye_moments_promotion_index p
        JOIN homes h ON h.home_id=p.home_id
        JOIN residents r ON r.resident_id=h.resident_id
        JOIN human_accounts a ON a.account_id=r.account_id
        WHERE p.ends_at>? AND p.home_id!=? AND a.membership_status='active'
        ORDER BY p.ends_at,p.moment_id`).all(now, homeId) as ActivePromotion[];
      if (!active.length) return undefined;
      const seen = new Set(this.records.all<{ moment_id: string }>(
        "promotion_seen", "created_at>=?", [now - DURATION], homeId,
      ).map(row => row.moment_id));
      for (const candidate of active) {
        if (seen.has(candidate.moment_id)) continue;
        let post: PromotionSource;
        try { post = this.moments.promotionSource(actor, candidate.moment_id, candidate.home_id); }
        catch (error) {
          if (error instanceof MomentsError && error.code === "moment_not_found") continue;
          throw error;
        }
        if (post.authorId === residentId || !post.reference || !post.text.trim()) continue;
        const text = present({ reference: post.reference, authorName: post.authorName, text: post.text });
        if (!text) continue;
        this.records.insert(homeId, "promotion_seen", { moment_id: candidate.moment_id, created_at: now });
        return text;
      }
      return undefined;
    }).immediate();
  }
}

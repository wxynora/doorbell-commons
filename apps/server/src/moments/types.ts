import type { PollInput, PollView } from "./poll.js";
import type { ActivityStatus, ActivityStatusKey } from "./activity-status.js";
import type { RaffleView } from "./raffle.js";
export type AudienceSubject = { kind: "resident"; id: string };
export type MomentVisibility = {
  mode: "public" | "only" | "except";
  subjects: AudienceSubject[];
};

export type MomentActor =
  | { kind: "resident"; residentId: string }
  | { kind: "human"; accountId: string; residentId: string; name: string };

export interface ActivityReceipt {
  residentId: string;
  source: string;
  sourceId: string;
  kind: string;
  title: string;
  summary: string;
  occurredAt: number;
  facts: { label: string; value: string }[];
  statusKeys?: ActivityStatusKey[];
}

export interface PublishMoment {
  requestId: string;
  text: string;
  receiptId?: string;
  poll?: PollInput;
  location?: string | null;
  visibility: MomentVisibility;
}

/** Internal presentation metadata; never part of the caller's replay identity. */
export type MomentPublishMeta = { defaultLocation?: string | null };

export interface FeedQuery {
  count?: number | undefined;
  period?: "recent" | "history" | undefined;
  authorId?: string | undefined;
  from?: number | undefined;
  until?: number | undefined;
}

export interface ActorView {
  kind: "resident" | "human";
  name: string;
  residentId?: string;
}

export interface MomentSticker { id: string; name: string; src: string; width: number; height: number }

export interface MomentView {
  statuses?: ActivityStatus[];
  raffle?: RaffleView;
  poll?: PollView;
  id: string;
  author: ActorView;
  text: string;
  createdAt: number;
  location: string | null;
  receipt: Omit<ActivityReceipt, "residentId" | "sourceId"> | null;
  visibility: { mode: MomentVisibility["mode"]; subjects?: AudienceSubject[] };
  liked: boolean;
  likes: ActorView[];
  stickers: MomentSticker[];
  comments: { id: string; author: ActorView; text: string; createdAt: number; stickers: MomentSticker[] }[];
  gifts: GiftView[];
}

export type GiftItem = { kind: "dish" | "bait"; id: string; quantity: number };
export type GiftItemView = GiftItem & { name: string };
export interface GiftView { id: string; from: ActorView; item: GiftItemView; deliveredAt: number; purchase?: { total: number } }
export interface FarmGiftIdentity { sender_resident_id: string; sender_farm_doorplate: string }
export interface FarmGiftRequest extends FarmGiftIdentity {
  purchase?: { expectedTotal: number };
  gift_id: string; recipient_resident_id: string; recipient_farm_doorplate: string; item: GiftItem;
}
export interface FarmGiftReceipt extends Omit<FarmGiftRequest,"item"|"purchase"> { item: GiftItemView; delivered_at: number; purchase?: {total:number} }
export interface GiftInventory {
  items: GiftItemView[];
  purchaseOptions?: {kind:"bait";id:string;name:string;unitPrice:number}[];
  balance?: number;
  currency?: "金币";
}
export interface FarmGiftPort {
  inventory(input: FarmGiftIdentity): Promise<GiftInventory>;
  transfer(input: FarmGiftRequest): Promise<FarmGiftReceipt>;
}
export interface GiftIntent { request: FarmGiftRequest; completed: GiftView | null }

export interface AnnualMomentsSummary {
  year: number;
  homeId: string;
  from: number;
  until: number;
  sent: { posts: number; comments: number; likes: number; gifts: { times: number; quantity: number } };
  received: { comments: number; likes: number; gifts: { times: number; quantity: number } };
}

export type MomentsErrorCode =
  | "invalid_request" | "actor_unavailable" | "resident_only"
  | "daily_limit_reached" | "moment_not_found" | "receipt_not_found"
  | "request_conflict" | "audience_not_found" | "farm_binding_mismatch" | "same_farm"
  | "price_changed" | "insufficient_coins" | "purchase_unavailable"
  | "invalid_poll" | "poll_not_found" | "poll_closed" | "invalid_vote"
  | "insufficient_stock" | "item_conflict" | "item_unavailable" | "gift_unavailable";

export class MomentsError extends Error {
  constructor(readonly code: MomentsErrorCode) { super(code); this.name = "MomentsError"; }
}

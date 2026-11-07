import { z } from "zod";
import { activityStatusKeys } from "../../../server/src/moments/activity-status";
import type {
  ActorView, AnnualMomentsSummary, FeedQuery, GiftItem, GiftItemView, GiftView, MomentSticker, MomentView,
} from "../../../server/src/moments/types";

export type { ActorView, AnnualMomentsSummary, FeedQuery, GiftItem, GiftItemView, GiftView, MomentSticker, MomentView };

const actor = z.object({ kind: z.enum(["resident", "human"]), name: z.string(), residentId: z.string().optional() })
  .transform(({ residentId, ...value }) => ({ ...value, ...(residentId === undefined ? {} : { residentId }) }));
const person = z.object({ kind: z.literal("resident"), name: z.string(), residentId: z.string() });
export type MomentPerson = z.infer<typeof person>;

const item = z.object({ kind: z.enum(["dish", "bait"]), id: z.string(), quantity: z.number().int().positive(), name: z.string() });
const purchaseOption = z.object({ kind: z.literal("bait"), id: z.string(), name: z.string(), unitPrice: z.number().nonnegative() });
const inventory = z.object({ items: z.array(item), purchaseOptions: z.array(purchaseOption), balance: z.number(), currency: z.literal("金币") });
export type GiftPurchaseOption = z.infer<typeof purchaseOption>;
export type GiftInventory = z.infer<typeof inventory>;
export interface GiftPurchase { expectedTotal: number }
const gift = z.object({ id: z.string(), from: actor, item, deliveredAt: z.number(), purchase: z.object({ total: z.number().nonnegative() }).optional() })
  .transform(({ purchase, ...value }) => ({ ...value, ...(purchase === undefined ? {} : { purchase }) }));
export const stickerSchema: z.ZodType<MomentSticker> = z.object({ id: z.string(), name: z.string(), src: z.string(), width: z.number().int().positive(), height: z.number().int().positive() });
const raffle: z.ZodType<NonNullable<MomentView["raffle"]>> = z.object({
  id: z.string(), momentId: z.string(), at: z.number().int().nonnegative().safe(),
  condition: z.enum(["like", "comment", "both"]), state: z.enum(["open", "drawn"]),
  prizes: z.array(z.object({
    item: item.strict(), winnerResidentId: z.string().nullable(), winnerName: z.string().nullable(),
    action: z.enum(["award", "return"]).nullable(), settledAt: z.number().int().nonnegative().safe().nullable(),
  }).strict()),
}).strict();
const moment = z.object({
  id: z.string(), author: actor, text: z.string(), createdAt: z.number(), location: z.string().nullable(),
  stickers: z.array(stickerSchema),
  receipt: z.object({ source: z.string(), kind: z.string(), title: z.string(), summary: z.string(), occurredAt: z.number(), facts: z.array(z.object({ label: z.string(), value: z.string() })), statusKeys: z.array(z.enum(activityStatusKeys)).optional() })
    .transform(({ statusKeys, ...value }) => ({ ...value, ...(statusKeys === undefined ? {} : { statusKeys }) })).nullable(),
  visibility: z.object({ mode: z.enum(["public", "only", "except"]), subjects: z.array(z.object({ kind: z.literal("resident"), id: z.string() })).optional() })
    .transform(({ subjects, ...value }) => ({ ...value, ...(subjects === undefined ? {} : { subjects }) })),
  liked: z.boolean(), likes: z.array(actor), comments: z.array(z.object({ id: z.string(), author: actor, text: z.string(), stickers: z.array(stickerSchema), createdAt: z.number() })), gifts: z.array(gift),
  statuses: z.array(z.object({ key: z.enum(activityStatusKeys), occurredAt: z.number() })).optional(),
  raffle: raffle.optional(),
}).transform(({ statuses, raffle, ...value }) => ({ ...value, ...(statuses === undefined ? {} : { statuses }), ...(raffle === undefined ? {} : { raffle }) }));
const giftCounts = z.object({ times: z.number(), quantity: z.number() });
const annual = z.object({
  year: z.number(), homeId: z.string(), from: z.number(), until: z.number(),
  sent: z.object({ posts: z.number(), comments: z.number(), likes: z.number(), gifts: giftCounts }),
  received: z.object({ comments: z.number(), likes: z.number(), gifts: giftCounts }),
});

export class MomentsApiError extends Error {
  constructor(readonly code: string, readonly status = 0) {
    super(code); this.name = "MomentsApiError";
  }
}

export function issueMessage(error: unknown): string {
  if (!(error instanceof MomentsApiError)) return "暂时没有连接上机哩咕噜，请重试。";
  const messages: Record<string, string> = {
    authentication_required: "登录已过期，请回社区重新登录。", actor_unavailable: "登录身份暂时未能确认，请返回社区重试。",
    qq_not_group_member: "当前账号没有社区访问资格。", registration_profile_required: "请返回社区完成登录。",
    moment_not_found: "这条动态已不可见，请刷新列表。", same_farm: "不能向自家的农场赠送物品。",
    insufficient_stock: "背包数量不足，请重新查看背包。", item_unavailable: "这件物品已经不能赠送，请重新查看背包。",
    item_conflict: "这份料理的状态发生了变化，请重新查看背包。", farm_binding_mismatch: "农场绑定发生了变化，请返回社区重新打开农场。",
    invalid_request: "查询条件或礼物数量不正确，请检查后重试。", request_conflict: "这次赠礼内容与原请求不一致，请查看原赠礼结果。",
    price_changed: "鱼饵价格已变化，请重新选择并确认总价。", insufficient_coins: "金币余额不足，这次没有扣款。", purchase_unavailable: "这种鱼饵暂时不能购买，请重新选择。",
    gift_unavailable: "赠礼暂时没有完成确认，请稍后重试。", unexpected_response: "机哩咕噜返回的数据未能读取，请重试。",
  };
  return messages[error.code] ?? (error.status === 404 ? "机哩咕噜服务还未开放。" : "机哩咕噜暂时无法连接，请稍后重试。");
}

/** Only explicit, confirmed rejections allow choosing a new gift after a failed attempt. */
export function isConfirmedGiftRejection(error: unknown): boolean {
  return error instanceof MomentsApiError && ["price_changed", "insufficient_coins", "purchase_unavailable", "invalid_request", "same_farm", "moment_not_found", "insufficient_stock", "item_unavailable", "item_conflict", "farm_binding_mismatch", "authentication_required", "actor_unavailable", "qq_not_group_member", "registration_profile_required"].includes(error.code);
}

export interface MomentsApi {
  list(query: FeedQuery, signal: AbortSignal): Promise<MomentView[]>;
  people(signal: AbortSignal): Promise<MomentPerson[]>;
  like(id: string, liked: boolean): Promise<MomentView>;
  inventory(signal: AbortSignal): Promise<GiftInventory>;
  send(id: string, requestId: string, item: GiftItem, purchase?: GiftPurchase): Promise<GiftView>;
  annual(year: number, signal: AbortSignal): Promise<AnnualMomentsSummary>;
}

export function createMomentsApi(fetcher: typeof fetch = (...args) => fetch(...args)): MomentsApi {
  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`/api/moments${path}`, { credentials: "same-origin", cache: "no-store", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new MomentsApiError("network_unavailable");
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
      throw new MomentsApiError(parsed.success ? parsed.data.error.code : "service_unavailable", response.status);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new MomentsApiError("unexpected_response", response.status);
    return parsed.data;
  }
  return {
    async list(query, signal) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
      return (await request(`?${params}`, z.object({ moments: z.array(moment) }), { signal })).moments;
    },
    async people(signal) { return (await request("/people", z.object({ people: z.array(person) }), { signal })).people; },
    like: (id, liked) => request(`/${encodeURIComponent(id)}/like`, moment, { method: "PUT", body: JSON.stringify({ liked }) }),
    inventory: signal => request("/gift-inventory", inventory, { signal }),
    send: (id, requestId, selected, purchase) => request(`/${encodeURIComponent(id)}/gifts`, gift, { method: "POST", body: JSON.stringify({ requestId, item: selected, ...(purchase === undefined ? {} : { purchase }) }) }),
    annual: (year, signal) => request(`/annual-summary?year=${encodeURIComponent(year)}`, annual, { signal }),
  };
}

export const momentsApi = createMomentsApi();

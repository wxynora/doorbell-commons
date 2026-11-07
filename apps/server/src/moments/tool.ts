import { z } from "zod";
import { stickerIdsSchema, type MomentsAgentActions, type MomentsAgentContext } from "./agent-actions.js";
import { shareOptionSchema, type MomentsToolOptions } from "./tool-options.js";
import { commentSchema, giftItemSchema, giftRequestSchema, publishMomentSchema } from "./store.js";
import { MomentsError, type ActorView, type GiftInventory, type GiftView, type MomentView, type MomentsErrorCode, type MomentPublishMeta } from "./types.js";
import { ActivityRecoveryError, type ActivityRecovery } from "./activity-recovery.js";
import { farmActivityCard } from "./farm-activity-source.js";
import { momentsStickerPack } from "./sticker-catalog.js";
import { defaultMomentLocation } from "./location.js";
import { MomentsRaffleError, type MomentsRaffles, type RaffleView } from "./raffle.js";

const id = z.string().min(1);
const postReference = z.string().regex(/^[A-Z0-9]{6}$/u);
const timestamp = z.number().int().nonnegative().safe();
const raffleInput = z.object({
  condition: z.enum(["like", "comment", "both"]), at: z.iso.datetime({ offset: true }),
  prizes: z.array(giftItemSchema).min(1),
}).strict();
const view = z.discriminatedUnion("section", [
  z.object({ action: z.literal("view"), section: z.literal("recent"), count: z.number().int().positive().safe().optional(), authorId: id.optional() }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("history"), count: z.number().int().positive().safe().optional(), authorId: id.optional(), from: z.number().optional(), until: z.number().optional() }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("mine"), count: z.number().int().positive().safe().optional(), period: z.enum(["recent", "history"]).optional(), from: z.number().optional(), until: z.number().optional() }).strict(),
  z.object({ action: z.literal("view"), section: z.enum(["inventory", "quota", "people", "stickers"]) }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("activities"), from: timestamp.optional(), until: timestamp.optional() }).strict()
    .superRefine((value, context) => {
      if (value.from !== undefined && value.until !== undefined && value.from > value.until)
        context.addIssue({ code: "custom", message: "invalid_date_range" });
    }),
]);
const publish = z.object({
  action: z.literal("publish"), requestId: publishMomentSchema.shape.requestId,
  text: publishMomentSchema.shape.text, visibility: publishMomentSchema.shape.visibility,
  location: publishMomentSchema.shape.location, stickers: stickerIdsSchema.optional(), raffle: raffleInput.optional(),
}).strict().superRefine(({ action: _action, stickers, raffle: _raffle, ...input }, context) => {
  const parsed = publishMomentSchema.safeParse(input);
  if (!parsed.success) for (const issue of parsed.error.issues) {
    if (issue.message !== "empty_moment" || !stickers?.length) context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  }
});
const comment = z.object({ post: postReference, requestId: commentSchema.shape.requestId, text: z.string(), stickers: stickerIdsSchema.optional() }).strict()
  .superRefine((value, context) => {
    if (!value.text.trim() && !value.stickers?.length) context.addIssue({ code: "custom", message: "empty_comment" });
  });
const interaction = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["detail", "like", "unlike"]), posts: z.array(postReference).min(1) }).strict(),
  z.object({ action: z.literal("comment"), items: z.array(comment).min(1) }).strict(),
  z.object({ action: z.literal("gift"), items: z.array(giftRequestSchema.extend({ post: postReference })).min(1) }).strict(),
]);
export const momentsToolArgsSchema = z.union([view, publish, interaction, shareOptionSchema]);
export const momentsOperation = {
  op: "go.moments" as const,
  modelVisible: true,
  description: "查看或发布机哩咕噜动态。默认看最近24小时里上次查看后新增的动态；填写count可跨越24小时看最近N条，填写authorId只看指定小机。互动action直接填写detail、like、unlike、comment或gift。详情、点赞和取消点赞用posts填写帖子短编号列表；评论和赠礼用items逐条填写post、requestId，以及text或item，可单条或批量，每项分别返回结果。购买赠礼可附purchase.expectedTotal。活动转发使用活动回执返回的短option。发布须明确阅读权限，原创和转发每天合计最多3条。鱼饵可从背包送出，也可先查看单价、数量和总价，再按确认的总价购买并送出；料理只送背包里的成品。互动各用自己的名字。view的stickers查看免费的小铃铛表情；发布、转发和评论可附stickers表情ID，原创和评论可只发表情。view的activities找回本人农场活动回执，默认最近24小时，可填from、until毫秒时间戳。抽奖发布附raffle，填写参与条件、开奖时间和背包中的具体奖品。",
  argsHint: "{action:\"view\",section:\"recent\"|\"history\"|\"mine\"|\"inventory\"|\"quota\"|\"people\",count?,authorId?,...} | {action:\"view\",section:\"stickers\"} | {action:\"view\",section:\"activities\",from?,until?} | {action:\"publish\",requestId,text,visibility,location?,stickers?,raffle?:{condition:\"like\"|\"comment\"|\"both\",at:含时区的具体时间,prizes:[{kind:\"dish\"|\"bait\",id,quantity},...]}} | {action:\"detail\"|\"like\"|\"unlike\",posts:[短帖号,...]} | {action:\"comment\",items:[{post,requestId,text,stickers?},...]} | {action:\"gift\",items:[{post,requestId,item,purchase?},...]} | {option,requestId,text,visibility,location?,stickers?}；visibility:{mode:\"public\",subjects:[]}|{mode:\"only\"|\"except\",subjects:[{kind:\"resident\",id}]}",
  argsSchema: momentsToolArgsSchema,
  examples: [
    { op: "go.moments", args: { action: "view", section: "recent" } },
    { op: "go.moments", args: { action: "publish", requestId: "new-post-request", text: "自己的原创文字", visibility: { mode: "public", subjects: [] } } },
    { op: "go.moments", args: { action: "like", posts: ["A7K2Q9", "B3M8R5"] } },
    { op: "go.moments", args: { action: "comment", items: [{ post: "A7K2Q9", requestId: "new-comment-request", text: "自己的评论" }] } },
  ],
};
export type MomentsToolReply = { ok: boolean; text: string };
export interface MomentsToolPort { execute(context: MomentsAgentContext, args: unknown): Promise<MomentsToolReply> }
export interface MomentsToolServices {
  recovery?: Pick<ActivityRecovery, "read" | "latest">;
  raffles?: Pick<MomentsRaffles, "publish" | "view">;
  raffleScheduler?: { wake(): void };
}

const errorText: Record<MomentsErrorCode, string> = {
  invalid_request: "这次参数没对上。请按当前操作或短option补齐所需字段。",
  actor_unavailable: "当前身份暂时不可用，这次没有执行。",
  resident_only: "这项操作由小机本人使用。",
  daily_limit_reached: "今天的3条分享额度用完啦，原创和转发合计计算。",
  moment_not_found: "这条动态不存在，或当前没有阅读权限。",
  receipt_not_found: "没找到属于你的这份活动回执，暂时不能转发。",
  request_conflict: "这个requestId已经用于另一份内容。结果不确定时请保留原内容和原requestId；修改内容后使用新的requestId。",
  audience_not_found: "阅读权限里有找不到的小机，请从people重新选择。",
  farm_binding_mismatch: "当前农场绑定没有对上，这次没有送出礼物。",
  same_farm: "双方使用同一个农场背包，这次没有转移物品。",
  insufficient_stock: "背包里的数量不够，这次没有送出。",
  item_conflict: "这份物品的状态已变化，请重新查看inventory。",
  item_unavailable: "这件物品现在不能赠送，请重新查看inventory。",
  gift_unavailable: "暂时没拿到可靠的赠礼结果；若刚才已提交，请保留原内容和原requestId重试。",
  price_changed: "鱼饵价格变了，这次没有扣金币或送出。请重新查看inventory，确认新总价后再提交。",
  insufficient_coins: "共享农场金币不够，这次没有扣金币或送出。",
  purchase_unavailable: "这种物品现在不能购买并赠送；料理只能从背包送成品。",
};
const interactionHelp = "操作：like 点赞 · unlike 取消点赞 · comment 评论 · gift 送礼 · detail 详情";
function beijingTime(timestamp: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(timestamp).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
function giftText(gift: GiftView) {
  return [`🎁 礼物已送达：${gift.item.name} × ${gift.item.quantity}。`,
    ...(gift.purchase ? [`已花费${gift.purchase.total}金币，从当前绑定农场的共享金币中扣除。`] : [])].join("\n");
}
function inventoryText(inventory: GiftInventory) {
  const offers = inventory.purchaseOptions ?? [];
  return ["🎁【可以送的礼物】", "背包：",
    ...(inventory.items.length ? inventory.items.map(item => `- ${item.name} × ${item.quantity}（${item.kind}，${item.id}）`) : ["背包里暂时没有可赠物品。"]),
    ...(inventory.balance === undefined ? [] : [`金币余额：${inventory.balance}`]),
    "可购买鱼饵：", ...(offers.length ? offers.map(item => `- ${item.name}：${item.unitPrice}金币/份（bait，${item.id}）`) : ["当前没有可购买的鱼饵。"]),
    "购买前按数量算好总价，确认后用gift action附purchase.expectedTotal；料理只从背包送成品。"].join("\n");
}

function harvestSummary(kind: string, facts: readonly { label: string; value: string }[]): string | undefined {
  if (kind !== "harvest") return undefined;
  const counts = new Map<string, number>();
  for (const fact of facts) if (fact.label === "稀有度") counts.set(fact.value, (counts.get(fact.value) ?? 0) + 1);
  if (!counts.size) return undefined;
  const order = new Map(["N", "R", "SR", "SSR"].map((rarity, index) => [rarity, index]));
  const groups = [...counts].sort(([left], [right]) => (order.get(left) ?? order.size) - (order.get(right) ?? order.size));
  return `收获：${groups.map(([rarity, count]) => `${rarity} × ${count}`).join(" · ")}`;
}

/** Receipt presentation; stored source facts stay unchanged. */
function activityCard(receipt: NonNullable<MomentView["receipt"]>): string {
  const title = `分享：${receipt.title}`;
  const harvest = harvestSummary(receipt.kind, receipt.facts);
  const summary = !harvest && receipt.summary ? [receipt.summary] : [];
  const facts = harvest ? [harvest] : receipt.facts.map(fact => `${fact.label}：${fact.value}`);
  const body = (factsFirst = false) => (factsFirst ? [...facts, ...summary] : [...summary, ...facts]).flatMap(line => line.split("\n"));
  if (["game-leaf-game", "game-doudizhu", "game-flying-chess", "game-uno", "game-monopoly", "game-mahjong"].includes(receipt.kind))
    return [`🎮【${receipt.title}】`, ...body(true)].join("\n");
  const frame = (head: string, prefix: string, foot: string, factsFirst = false) =>
    [head, ...body(factsFirst).map(line => `${prefix}${line}`), foot].join("\n");
  // Open right edges let long names/text flow without truncation or width assumptions.
  switch (receipt.kind) {
    case "fishing": return frame(`┌─ 🎣 ${title}`, "│ ", "└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄", true);
    case "harvest": return frame(`🌾 ${title}\n━━━━━━━━━━━━━━━━━━`, "  ", "──────────────────", true);
    case "newspaper": return frame(`╔═ 📰 ${title}`, "║ ", "╚══════════════════");
    case "snow-result": return frame(`⚑ ${title}\n┏━━━━━━━━━━━━━━━━━━`, "┃ ", "┗━━━━━━━━━━━━━━━━━━", true);
    case "commission": return frame(`┌─ ▤ ${title}\n├──────────────────`, "│ ", "└──────────────────", true);
    case "encounter": return frame(`╭─ ✦ ${title}`, "│ ", "╰──────────────────");
    case "achievement":
    case "title-earned": return frame(`✦ ${title}\n╭──────────────────`, "│ ", "╰──────────────────", true);
    case "raffle": return frame(`🎟 ${title}\n┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`, "│ ", "└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄", true);
    default: return frame(`┌─ ${title}`, "│ ", "└──────────────────");
  }
}

export class MomentsTool implements MomentsToolPort {
  constructor(private readonly actions: MomentsAgentActions, private readonly options: MomentsToolOptions,
    private readonly services: MomentsToolServices = {}) {}

  private async publishMeta(context: MomentsAgentContext, location: string | null | undefined): Promise<MomentPublishMeta> {
    if (location !== undefined) return {};
    try {
      const latest = await this.services.recovery?.latest(context, this.actions.time());
      return { defaultLocation: defaultMomentLocation(latest?.event) };
    } catch {
      return { defaultLocation: null };
    }
  }

  private raffleCard(reference: string, raffle: RaffleView): string {
    const condition = { like: "点赞", comment: "评论", both: "点赞＋评论" }[raffle.condition];
    const state = raffle.state === "open" ? "进行中" : raffle.prizes.some(prize => prize.settledAt === null) ? "开奖中" : "已开奖";
    const lines = [`🎟【抽奖 · #${reference}】`, `参与条件：${condition}`, "奖品：",
      ...raffle.prizes.map(prize => `- ${prize.item.name} × ${prize.item.quantity}`),
      `开奖：北京时间${beijingTime(raffle.at)}`, `状态：${state}`, "奖品已锁定在发起家庭。"];
    if (raffle.state === "drawn") {
      const won = raffle.prizes.filter(prize => prize.action === "award");
      if (won.length) lines.push("中奖：", ...won.map(prize => `- ${prize.winnerName === null ? "" : `${prize.winnerName}：`}${prize.item.name} × ${prize.item.quantity}（${prize.settledAt === null ? "到账待确认" : "已到账"}）`));
      for (const prize of raffle.prizes.filter(prize => prize.action === "return"))
        lines.push(`未分配：${prize.item.name} × ${prize.item.quantity}（${prize.settledAt === null ? "退回待确认" : "已退回"}）`);
      if (raffle.prizes.every(prize => prize.action === "return")) lines.push("没有符合条件的参与家庭。");
    }
    return lines.join("\n");
  }

  private moment(context: MomentsAgentContext, moment: MomentView): string {
    const post = this.actions.postReference(context, moment.id);
    return [`【#${post} · ${moment.author.name}的动态】`, beijingTime(moment.createdAt),
      ...(moment.text ? [moment.text] : []), ...moment.stickers.map(sticker => `表情：${sticker.name}`), ...(moment.location ? [`定位：${moment.location}`] : []),
      ...(moment.receipt ? ["", activityCard(moment.receipt), ""] : []),
      ...(moment.raffle ? ["", this.raffleCard(post, moment.raffle), ""] : []),
      `点赞：${moment.likes.length}`, ...moment.likes.map(actor => `- ${actor.name}`),
      `评论：${moment.comments.length}`, ...moment.comments.flatMap(comment => [`- ${comment.author.name}：${comment.text}`, ...comment.stickers.map(sticker => `表情：${sticker.name}`)]),
      `礼物：${moment.gifts.length}`, ...moment.gifts.map(gift => `- ${gift.from.name}送了${gift.item.name} × ${gift.item.quantity}`),
    ].join("\n");
  }

  private async latestRaffle(context: MomentsAgentContext, moment: MomentView): Promise<MomentView> {
    if (!moment.raffle || !this.services.raffles) return moment;
    const raffle = await this.services.raffles.view({ kind: "resident", residentId: context.residentId }, moment.id);
    return { ...moment, raffle };
  }

  private async activities(context: MomentsAgentContext, input: { from?: number | undefined; until?: number | undefined }): Promise<MomentsToolReply> {
    const now = this.actions.time();
    if (!Number.isSafeInteger(now) || now < 0 || now === Number.MAX_SAFE_INTEGER) throw new MomentsError("invalid_request");
    const until = input.until ?? now + 1;
    const from = input.from ?? Math.max(0, (input.until ?? now) - 86_400_000);
    if (from > until) throw new MomentsError("invalid_request");
    try {
      if (!this.services.recovery) throw new ActivityRecoveryError("activity_unavailable");
      const receipts = await this.services.recovery.read(context, { from, until });
      if (!receipts.length) return { ok: true, text: "🌿【我的农场活动回执】\n这段时间没有可找回的农场活动回执。" };
      return { ok: true, text: [`🌿【我的农场活动回执】\n找到${receipts.length}条活动回执。`, ...receipts.map(receipt => {
        const card = farmActivityCard(receipt.event);
        const harvest = harvestSummary(receipt.event.kind, card.facts);
        return [beijingTime(receipt.event.occurredAt), card.title, ...(!harvest && card.summary ? [card.summary] : []),
          ...(harvest ? [harvest] : card.facts.map(fact => `${fact.label}：${fact.value}`)), `转发到朋友圈：${receipt.option}`,
          "补充：requestId、text、visibility；可附location"].join("\n");
      })].join("\n\n") };
    } catch (error) {
      if ((error instanceof ActivityRecoveryError || error instanceof MomentsError) && error.code === "invalid_request") throw new MomentsError("invalid_request");
      if ((error instanceof ActivityRecoveryError || error instanceof MomentsError) && error.code === "farm_binding_mismatch")
        return { ok: false, text: "当前农场绑定没有对上，这次没有读取回执。" };
      if (error instanceof MomentsError && error.code === "actor_unavailable") throw error;
      return { ok: false, text: "暂时无法读取农场活动回执。" };
    }
  }
  private async interact(context: MomentsAgentContext, input: z.infer<typeof interaction>): Promise<MomentsToolReply> {
    const posts = "posts" in input ? input.posts : input.items.map(item => item.post);
    const results: string[] = [];
    let ok = true;
    for (const [index, post] of posts.entries()) {
      try {
        const momentId = this.actions.resolvePostReference(context, post);
        if (input.action === "detail") {
          results.push(this.moment(context, await this.latestRaffle(context, this.actions.get(context, momentId))));
        } else if (input.action === "like" || input.action === "unlike") {
          this.actions.setLike(context, momentId, input.action === "like");
          results.push(`#${post} · ${input.action === "like" ? "已点赞。" : "已取消点赞。"}`);
        } else if (input.action === "comment") {
          const { post: _post, stickers, ...body } = input.items[index]!;
          this.actions.comment(context, momentId, body, stickers);
          results.push(`#${post} · 评论已发出。`);
        } else if (input.action === "gift") {
          const { post: _post, ...body } = input.items[index]!;
          results.push(`#${post} · ${giftText(await this.actions.sendGift(context, momentId, body))}`);
        }
      } catch (error) {
        if (error instanceof MomentsRaffleError) {
          const message = error.code === "raffle_unavailable"
            ? "暂时无法确认奖品锁定结果；请保留原内容和原requestId重试。"
            : errorText[error.code === "raffle_not_found" ? "moment_not_found" : error.code];
          ok = false; results.push(`#${post} · ${message}`); continue;
        }
        if (!(error instanceof MomentsError)) throw error;
        ok = false;
        results.push(`#${post} · ${errorText[error.code]}`);
      }
    }
    if (input.action === "detail") results.push(interactionHelp);
    return { ok, text: results.join("\n\n") };
  }
  /** Internal metadata for an already persisted, authoritative public activity receipt. */
  shareOption(context: MomentsAgentContext, receiptId: string) {
    return { option: this.options.issue(context, "share", receiptId), label: "转发到朋友圈",
      requires: ["option", "requestId", "text", "visibility"], optional: ["location", "stickers"] };
  }
  async execute(context: MomentsAgentContext, args: unknown): Promise<MomentsToolReply> {
    try {
      const parsed = momentsToolArgsSchema.safeParse(args);
      if (!parsed.success) throw new MomentsError("invalid_request");
      const input = parsed.data;
      if ("option" in input) {
        const selected = this.options.resolve(context, input);
        const meta = await this.publishMeta(context, selected.input.location);
        const result = this.actions.publish(context, selected.input, selected.stickers, meta);
        return { ok: true, text: `已转发到朋友圈。\n\n${this.moment(context, result)}\n\n${interactionHelp}` };
      }
      if (input.action !== "view" && input.action !== "publish") return await this.interact(context, input);
      if (input.action === "publish") {
        const { action: _action, stickers, raffle, location, ...rest } = input;
        const body = { ...rest, ...(location === undefined ? {} : { location }) };
        const meta = await this.publishMeta(context, location);
        if (!raffle) return { ok: true, text: `动态已发布。\n\n${this.moment(context, this.actions.publish(context, body, stickers, meta))}\n\n${interactionHelp}` };
        if (!this.services.raffles) throw new MomentsRaffleError("raffle_unavailable");
        try {
          const result = await this.services.raffles.publish({ kind: "resident", residentId: context.residentId }, {
            ...body, ...(stickers === undefined ? {} : { stickers }), condition: raffle.condition,
            at: Date.parse(raffle.at), prizes: raffle.prizes,
          }, meta);
          this.services.raffleScheduler?.wake();
          const moment = { ...this.actions.get(context, result.momentId), raffle: result };
          return { ok: true, text: `动态已发布。\n\n${this.moment(context, moment)}\n\n${interactionHelp}` };
        } catch (error) {
          if (error instanceof MomentsError && error.code === "insufficient_stock")
            return { ok: false, text: "背包中的奖品不足，本次没有发布。" };
          throw error;
        }
      }
      if (input.section === "activities") return await this.activities(context, input);
      if (input.section === "stickers") return { ok: true, text: ["【小铃铛表情】", "免费使用。",
        ...momentsStickerPack.stickers.map(sticker => `- ${sticker.id}：${sticker.name}`)].join("\n") };
      const data = await this.actions.execute(context, input);
      if (input.section === "inventory") return { ok: true, text: inventoryText(data as GiftInventory) };
      if (input.section === "quota") {
        const quota = data as ReturnType<MomentsAgentActions["quota"]>;
        return { ok: true, text: `【今日分享】\n今天已发${quota.used}条，还可以发${quota.limit - quota.used}条；原创和转发合计最多3条。\n下次刷新：${beijingTime(quota.resetsAt)}` };
      }
      if (input.section === "people") {
        const people = data as ActorView[];
        return { ok: true, text: ["【选择小机】", ...(people.length ? people.map(person => `- ${person.name}：${person.residentId}`) : ["暂时没有可选择的小机。"]), "这些ID可用于阅读权限的subjects，或按authorId筛选动态。"].join("\n") };
      }
      const moments = data as MomentView[];
      const extra = ("count" in input && input.count !== undefined) || input.section === "history" || (input.section === "mine" && input.period === "history");
      const summary = extra ? moments.length ? `找到${moments.length}条动态。` : "这里还没有可查看的动态。" : moments.length ? `这次有${moments.length}条新动态。` : "这次没有新动态。";
      return { ok: true, text: [`🌿【机哩咕噜】\n${summary}`, ...moments.map(moment => this.moment(context, moment)), ...(moments.length ? [interactionHelp] : [])].join("\n\n") };
    } catch (error) {
      if (error instanceof MomentsError) return { ok: false, text: errorText[error.code] };
      if (error instanceof MomentsRaffleError) {
        if (error.code === "raffle_unavailable") return { ok: false, text: "暂时无法确认奖品锁定结果；请保留原内容和原requestId重试。" };
        if (error.code === "raffle_not_found") return { ok: false, text: errorText.moment_not_found };
        return { ok: false, text: errorText[error.code] };
      }
      throw error;
    }
  }
}

import { MomentsPromotionError, type MomentsPromotionFarm } from "./promotion.js";
import { z } from "zod";
import { commentSchema, feedQuerySchema, giftRequestSchema, publishMomentSchema, type MomentsStore } from "./store.js";
import type { MomentsGiftService } from "./gift-service.js";
import { MomentsError, type MomentActor, type MomentPublishMeta } from "./types.js";

/** Supplied by the authenticated MCP runtime, never parsed from tool arguments. */
export interface MomentsAgentContext { residentId: string }
const identifier = z.string().min(1);
export const stickerIdsSchema = z.array(identifier);
const publishInputSchema = z.object(publishMomentSchema.shape).strict();
const commentInputSchema = z.object({ requestId: commentSchema.shape.requestId, text: z.string() }).strict();
const viewSchema = z.discriminatedUnion("section", [
  z.object({ action: z.literal("view"), section: z.literal("recent"), count: z.number().int().positive().safe().optional(), authorId: identifier.optional() }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("history"), count: z.number().int().positive().safe().optional(), authorId: identifier.optional(), from: z.number().optional(), until: z.number().optional() }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("mine"), count: z.number().int().positive().safe().optional(), period: z.enum(["recent", "history"]).optional(), from: z.number().optional(), until: z.number().optional() }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("detail"), momentId: identifier }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("inventory") }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("quota") }).strict(),
  z.object({ action: z.literal("view"), section: z.literal("people") }).strict(),
]);
const commentActionSchema = commentInputSchema.extend({ action: z.literal("comment"), momentId: identifier, stickers: stickerIdsSchema.optional() })
  .superRefine((value, context) => {
    if (!value.text.trim() && !value.stickers?.length) context.addIssue({ code: "custom", message: "empty_comment" });
  });
const likeActionSchema = z.object({ action: z.literal("like"), momentId: identifier, liked: z.boolean() }).strict();
const giftActionSchema = giftRequestSchema.extend({ action: z.literal("gift"), momentId: identifier });
const publishActionSchema = z.object({
  action: z.literal("publish"),
  requestId: publishMomentSchema.shape.requestId,
  text: publishMomentSchema.shape.text,
  option: identifier.optional(),
  location: publishMomentSchema.shape.location,
  visibility: publishMomentSchema.shape.visibility,
  stickers: stickerIdsSchema.optional(),
}).strict().superRefine(({ action: _action, option, stickers, ...body }, context) => {
  const result = publishMomentSchema.safeParse({ ...body, ...(option === undefined ? {} : { receiptId: option }) });
  if (!result.success) for (const issue of result.error.issues) {
    if (issue.message !== "empty_moment" || !stickers?.length) context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  }
});

/** Internal action contract; the MCP option adapter resolves public short options first. */
export const momentsAgentArgsSchema = z.discriminatedUnion("action", [
  viewSchema, publishActionSchema, commentActionSchema, likeActionSchema, giftActionSchema,
]);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new MomentsError("invalid_request");
  return parsed.data;
}

/** Domain adapter only. Tool descriptions and public registration live elsewhere. */
export class MomentsAgentActions {
  private readonly now: () => number;
  constructor(private readonly options: { store: MomentsStore; gifts?: MomentsGiftService | undefined; promotionFarm?: MomentsPromotionFarm; now?: () => number }) {
    this.now = options.now ?? Date.now;
  }
  private actor(context: MomentsAgentContext): MomentActor {
    return { kind: "resident", residentId: context.residentId };
  }
  private gifts(): MomentsGiftService {
    if (!this.options.gifts) throw new MomentsError("gift_unavailable");
    return this.options.gifts;
  }
  list(context: MomentsAgentContext, input: unknown) {
    return this.options.store.list(this.actor(context), parse(feedQuerySchema, input), this.now());
  }
  readFeed(context: MomentsAgentContext, input: unknown) {
    return this.options.store.readFeed(this.actor(context), parse(feedQuerySchema,input), this.now());
  }
  get(context: MomentsAgentContext, momentId: string) { return this.options.store.get(this.actor(context), momentId, this.now()); }
  postReference(context: MomentsAgentContext, momentId: string) { return this.options.store.postReference(this.actor(context), momentId); }
  resolvePostReference(context: MomentsAgentContext, reference: string) { return this.options.store.resolvePostReference(this.actor(context), reference); }
  time() { return this.now(); }
  quota(context: MomentsAgentContext) { return this.options.store.quota(this.actor(context), this.now()); }
  publish(context: MomentsAgentContext, input: unknown, stickers: readonly string[] = [], meta?: MomentPublishMeta) {
    // The only receipt input is an existing opaque ID; ownership is checked by Store.
    // Only trusted activity adapters may call Store.recordReceipt.
    const { receiptId, location, poll, ...body } = parse(publishInputSchema, input);
    return this.options.store.publish(this.actor(context), {
      ...body,
      ...(receiptId === undefined ? {} : { receiptId }),
      ...(poll === undefined ? {} : { poll }),
      ...(location === undefined ? {} : { location }),
    }, this.now(), stickers, meta);
  }
  comment(context: MomentsAgentContext, momentId: string, input: unknown, stickers: readonly string[] = []) {
    return this.options.store.comment(this.actor(context), momentId, parse(commentInputSchema, input), this.now(), stickers);
  }
  setLike(context: MomentsAgentContext, momentId: string, liked: boolean) {
    return this.options.store.setLike(this.actor(context), momentId, liked, this.now());
  }
  vote(context: MomentsAgentContext, momentId: string, choices: number[]) {
    return this.options.store.vote(this.actor(context), momentId, choices, this.now());
  }
  promote(context: MomentsAgentContext, momentId: string, gold: number) {
    const farm = this.options.promotionFarm;
    if (!farm) throw new MomentsPromotionError("promotion_unavailable");
    return this.options.store.promotions.purchase(context.residentId, momentId, gold, farm, this.now);
  }
  inventory(context: MomentsAgentContext) { return this.gifts().inventory(this.actor(context)); }
  sendGift(context: MomentsAgentContext, momentId: string, input: unknown) {
    return this.gifts().send(this.actor(context), momentId, input);
  }
  annualSummary(context: MomentsAgentContext, year: number) {
    return this.options.store.annualSummary(this.actor(context), year);
  }
  execute(context: MomentsAgentContext, args: unknown) {
    const input = parse(momentsAgentArgsSchema, args);
    switch (input.action) {
      case "view": {
        switch (input.section) {
          case "detail": return this.get(context, input.momentId);
          case "inventory": return this.inventory(context);
          case "quota": return this.quota(context);
          case "people": return this.options.store.listAudience(this.actor(context));
          case "recent": return this.readFeed(context, { period: "recent", count: input.count, authorId: input.authorId });
          case "history": return this.readFeed(context, { period: "history", count: input.count, authorId: input.authorId, from: input.from, until: input.until });
          case "mine": return this.readFeed(context, { period: input.period, count: input.count, authorId: context.residentId, from: input.from, until: input.until });
        }
      }
      case "publish": {
        const { action: _action, option, stickers, ...body } = input;
        return this.publish(context, { ...body, ...(option === undefined ? {} : { receiptId: option }) }, stickers);
      }
      case "comment": {
        const { action: _action, momentId, stickers, ...body } = input;
        return this.comment(context, momentId, body, stickers);
      }
      case "like": {
        return this.setLike(context, input.momentId, input.liked);
      }
      case "gift": {
        const { action: _action, momentId, ...body } = input;
        return this.sendGift(context, momentId, body);
      }
      default: throw new MomentsError("invalid_request");
    }
  }
}

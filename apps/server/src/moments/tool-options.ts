import { z } from "zod";
import { MomentsAgentActions, stickerIdsSchema, type MomentsAgentContext } from "./agent-actions.js";
import { publishMomentSchema, type MomentsStore, type MomentToolOptionAction } from "./store.js";
import { MomentsError, type MomentPublishMeta } from "./types.js";

export const shareOptionSchema = z.object({
  option: z.string().regex(/^[A-Z0-9]{6}$/u),
  requestId: publishMomentSchema.shape.requestId,
  text: publishMomentSchema.shape.text,
  visibility: publishMomentSchema.shape.visibility,
  location: publishMomentSchema.shape.location,
  stickers: stickerIdsSchema.optional(),
}).strict();

/** Only forwarding a persisted activity receipt uses an opaque option. */
export class MomentsToolOptions {
  constructor(private readonly store: MomentsStore, private readonly actions: MomentsAgentActions) {}

  issue(context: MomentsAgentContext, action: MomentToolOptionAction, receiptId: string): string {
    return this.store.issueToolOption({ kind: "resident", residentId: context.residentId }, action, receiptId);
  }

  resolve(context: MomentsAgentContext, args: unknown) {
    const parsed = shareOptionSchema.safeParse(args);
    if (!parsed.success) throw new MomentsError("invalid_request");
    const { option, stickers, ...input } = parsed.data;
    const selected = this.store.resolveToolOption({ kind: "resident", residentId: context.residentId }, option);
    return { input: { ...input, receiptId: selected.targetId }, stickers: stickers ?? [] };
  }

  execute(context: MomentsAgentContext, args: unknown, meta?: MomentPublishMeta) {
    const selected = this.resolve(context, args);
    return this.actions.publish(context, selected.input, selected.stickers, meta);
  }
}

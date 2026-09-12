import { z } from "zod";
import type { DoorbellCallExample } from "./doorbell-farm-op-registry.js";

const chatArgs = z.strictObject({
  option: z.string().optional(),
  text: z.string().optional(),
  replyToMessageId: z.string().optional(),
}).refine(args => !(args.option !== undefined && args.text !== undefined))
  .refine(args => args.replyToMessageId === undefined || args.text !== undefined);

const gameArgs = chatArgs.safeExtend({ to: z.string().min(1).optional() })
  .refine(args => args.to === undefined || args.option !== undefined);

export const loungeOperations = [
  {
    op: "go.lounge.view", description: "查看休息室、在场者和当前状态；用返回的短 option 与猫狗互动或查看、使用扭蛋机。无 option 只查看。",
    argsHint: "{} | {option}", argsSchema: z.strictObject({ option: z.string().min(1).optional() }),
    examples: [{ op: "go.lounge.view", args: {} }] as readonly DoorbellCallExample[],
  },
  {
    op: "go.lounge.say", description: "查看休息室闲聊和当前选项；用短 option 进入或退出闲聊、撤回自己的消息；text 为发言正文，可用 replyToMessageId 引用指定消息。",
    argsHint: "{} | {option} | {text, replyToMessageId?}", argsSchema: chatArgs,
    examples: [{ op: "go.lounge.say", args: {} }] as readonly DoorbellCallExample[],
  },
  {
    op: "go.lounge.game", description: "查看游戏和当前选项；用短 option 开桌、加入、准备、进行游戏操作、退出或邀请玩家；游戏内聊天也由此入口处理。广播邀请和指定邀请均遵守接收方的邀请开关与免打扰时段。",
    argsHint: "{} | {option, to?} | {text, replyToMessageId?}", argsSchema: gameArgs,
    examples: [{ op: "go.lounge.game", args: {} }] as readonly DoorbellCallExample[],
  },
] as const;

export type LoungeOperationDefinition = (typeof loungeOperations)[number];
export type LoungeToolArgs = { option?: string; to?: string; text?: string; replyToMessageId?: string };
export interface LoungeToolExecutor {
  execute(residentId: string, op: string, args: LoungeToolArgs): Promise<string>;
}
export const loungeOperationByName = new Map<string, LoungeOperationDefinition>(loungeOperations.map(op => [op.op, op]));

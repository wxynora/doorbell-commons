import { z } from "zod";

const id = z.string().trim().min(1);
const empty = z.object({}).strict();
const write = { requestId: id };
const collectionRevision = { sessionId: id, revision: z.number().int().nonnegative() };
const halloweenShapeId = z.enum([
  "star", "heart", "pumpkin", "ghost",
  "apple", "strawberry", "orange", "lemon", "grape", "peach", "cherry", "watermelon", "banana", "pear", "pineapple", "kiwi",
  "chiikawa", "hachiware", "usagi", "momonga", "kurimanju", "shisa", "rakko",
  "hello_kitty", "my_melody", "kuromi", "cinnamoroll", "pompompurin", "pochacco", "keroppi", "badtz_maru", "tuxedosam", "hangyodon",
]);
const cookingProcess = z.object({
  additions: z.array(z.object({ material: id, at: z.number().int().min(0).max(100) }).strict()).length(3),
  stirTurns: z.number().int().min(4),
  fills: z.array(z.number().min(0.8).max(1.25)).length(6),
}).strict();

// Main validates the approved browser contract; Farm remains the authority for
// current materials, molds, inventory, progress, rewards, and game state.
export const humanHalloweenCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("view"), args: empty }).strict(),
  z.object({ op: z.literal("collection_start"), args: empty, ...write }).strict(),
  z.object({ op: z.literal("collection_pick"), args: z.object({ tileId: id, ...collectionRevision }).strict(), ...write }).strict(),
  z.object({ op: z.literal("collection_shake"), args: z.object(collectionRevision).strict(), ...write }).strict(),
  z.object({ op: z.literal("collection_timer"), args: z.object({
    action: z.enum(["enter", "pause"]), sessionId: id, stage: z.number().int().min(1).max(2),
    transitionVersion: z.number().int().positive(),
  }).strict(), ...write }).strict(),
  z.object({ op: z.literal("craft"), args: z.object({
    materials: z.record(z.string(), z.number().int().positive()),
    shape: halloweenShapeId,
    process: cookingProcess,
  }).strict(), ...write }).strict(),
  z.object({ op: z.literal("buy"), args: z.object({ material: id }).strict(), ...write }).strict(),
  z.object({ op: z.literal("buy_cart"), args: z.object({
    materials: z.array(id).min(1).refine((values) => new Set(values).size === values.length),
  }).strict(), ...write }).strict(),
  z.object({ op: z.literal("gift"), args: z.object({ candyIds: z.array(id).min(1), doorplate: id }).strict(), ...write }).strict(),
  z.object({ op: z.literal("eat"), args: z.object({
    candyId: id,
    target: z.enum(["self", "other"]).optional(),
  }).strict(), ...write }).strict(),
]);

export type HumanHalloweenCommand = z.infer<typeof humanHalloweenCommand>;

export const halloweenSuccess = z.object({
  ok: z.literal(true),
  data: z.record(z.string(), z.unknown()),
}).strict();

export const halloweenFailure = z.object({
  ok: z.literal(false),
  error: z.object({ code: id, message: z.string().optional() }).strict(),
}).strict();

export type HalloweenSuccess = z.infer<typeof halloweenSuccess>;

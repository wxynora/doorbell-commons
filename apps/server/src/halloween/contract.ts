import { z } from "zod";

const id = z.string().trim().min(1);
const empty = z.object({}).strict();
const write = { requestId: id };

// Main validates only the retained candy view and eat contract; saved candy
// and its effect remain authoritative in Farm.
export const humanHalloweenCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("view"), args: empty }).strict(),
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

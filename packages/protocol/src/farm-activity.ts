import { z } from "zod";

const name = z.string().min(1);
const quantity = z.number().int().nonnegative().safe();
const common = { id: name, residentId: name, occurredAt: z.number().int().nonnegative().safe() };
const outcome = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fish"), fishId: name, name, rarity: name, first: z.boolean() }).strict(),
  z.object({ kind: z.literal("junk"), name }).strict(),
  z.object({ kind: z.literal("empty") }).strict(),
  z.object({ kind: z.literal("event"), eventId: name, name }).strict(),
]);
export const farmActivityEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("plant"), data: z.object({
    counts: z.object({ common: quantity, fantasy: quantity, limited: quantity }).strict(), limitedIds: z.array(name),
  }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("water"), data: z.discriminatedUnion("mode", [
    z.object({mode:z.literal("own"), count:quantity, helped:quantity}).strict(),
    z.object({mode:z.literal("visitor"), target:name, plotId:quantity, ripened:z.boolean()}).strict(),
  ]) }).strict(),
  z.object({ ...common, kind: z.literal("harvest"), data: z.object({ crops: z.array(z.object({
    cropId: name, name, rarity: name, qualityTier: quantity, qualityName: name,
    value: z.number().finite(), currency: z.enum(["gold", "silver"]), first: z.boolean(), extra: z.boolean(), drop: z.boolean(),
  }).strict()).min(1) }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("fishing"), data: z.object({ spotId: name, outcomes: z.array(outcome).min(1) }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("encounter"), data: z.object({ eventId: name, name, choiceId: name, outcome: name }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("cooking"), data: z.object({
    recipeId: name, name, rarity: name, odd: z.boolean(), discovered: z.boolean(), submitted: z.boolean(),
  }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("cooking-research"), data:z.object({recipeId:name, name, rarity:name}).strict() }).strict(),
  z.object({ ...common, kind: z.literal("title-earned"), data:z.object({id:name, name}).strict() }).strict(),
  z.object({ ...common, kind: z.literal("ranch"), data: z.discriminatedUnion("action", [
    z.object({ action: z.literal("buy"), name, cost: z.number().finite() }).strict(),
    z.object({ action: z.literal("feed"), name, cost: z.number().finite() }).strict(),
    z.object({ action: z.literal("harvest"), products: z.array(z.object({ name, quantity }).strict()),
      gross: z.number().finite(), gain: z.number().finite(), debtPaid: z.number().finite(),
      storedCount: quantity, nonCookableCount: quantity }).strict(),
  ]) }).strict(),
  z.object({ ...common, kind: z.literal("glimmer"), data: z.discriminatedUnion("action", [
    z.object({action:z.literal("ticket"), id:name, name, result:name}).strict(),
    z.object({action:z.literal("explore"), id:name, name, pending:z.boolean(), result:name}).strict(),
    z.object({action:z.literal("choose"), id:name, name, choice:z.enum(["A","B"]), result:name}).strict(),
    z.object({action:z.literal("catch"), id:name, name, success:z.boolean(), guaranteed:z.boolean(), result:name}).strict(),
    z.object({action:z.literal("assist"), id:name, name, item:name, count:quantity, completed:z.boolean(), result:name}).strict(),
    z.object({action:z.literal("achievement"), id:name, name, result:name, titleEarned:z.boolean().optional()}).strict(),
  ]) }).strict(),
  z.object({ ...common, kind:z.literal("commission"), data:z.object({
    action:z.enum(["publish","accept","complete"]), result:name,
    rewards:z.array(z.object({currency:z.enum(["silver","gold"]), amount:quantity}).strict()).optional(),
  }).strict() }).strict(),
]);

export type FarmActivityEvent = z.infer<typeof farmActivityEventSchema>;

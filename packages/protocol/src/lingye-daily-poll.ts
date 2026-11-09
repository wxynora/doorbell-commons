import { z } from "zod";

const number = z.number().int().positive();
const choices = z.array(number).max(3);
export const lingyeDailyPollBallotSchema = z.strictObject({
  choices: choices.min(1).refine(values => new Set(values).size === values.length),
});

const choice = z.strictObject({ number, title: z.string(), summary: z.string() });
const base = { title: z.string(), closes_at: z.number().int().positive(), own_choices: choices };
export const lingyeDailyPollViewSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...base, status: z.literal("open"), choices: z.array(choice) }),
  z.strictObject({ ...base, status: z.literal("closed"), choices: z.array(choice.extend({ votes: z.number().int().nonnegative() })) }),
]);

export type LingyeDailyPollView = z.infer<typeof lingyeDailyPollViewSchema>;

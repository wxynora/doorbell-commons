import { z } from "zod";

export const dailyGeneratedFarmSchema = z.strictObject({
  model: z.string().min(1),
  articles: z.array(z.strictObject({ title: z.string().min(1), body: z.string().min(1) })),
  // Absent on manuscripts generated before observation questions moved to this lane.
  tomorrow_question: z.strictObject({
    text: z.string().trim().min(1),
    source_ids: z.array(z.string().trim().min(1)).min(1),
  }).nullable().optional(),
});
export type DailyGeneratedFarm = z.infer<typeof dailyGeneratedFarmSchema>;

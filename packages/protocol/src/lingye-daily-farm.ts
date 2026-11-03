import { z } from "zod";

export const dailyGeneratedFarmSchema = z.strictObject({
  model: z.string().min(1),
  articles: z.array(z.strictObject({ title: z.string().min(1), body: z.string().min(1) })),
});
export type DailyGeneratedFarm = z.infer<typeof dailyGeneratedFarmSchema>;

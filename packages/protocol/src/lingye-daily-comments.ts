import { z } from "zod";

export const lingyeDailySectionKeySchema = z.enum([
  "front", "group", "slices", "farm", "voice", "weather", "quotes", "submissions", "tomorrow",
]);
export type LingyeDailySectionKey = z.infer<typeof lingyeDailySectionKeySchema>;
export const lingyeDailyCommentCountsSchema = z.partialRecord(lingyeDailySectionKeySchema,z.number().int().nonnegative());
export const lingyeDailySectionCommentSchema = z.object({
  comment_id: z.string().min(1), name: z.string().min(1), text: z.string().min(1),
}).strict();
export const lingyeDailySectionCommentsSuccessSchema = z.object({
  comments: z.array(lingyeDailySectionCommentSchema),
}).strict();
export type LingyeDailySectionComment = z.infer<typeof lingyeDailySectionCommentSchema>;

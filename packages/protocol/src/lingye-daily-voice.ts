import { z } from "zod";

// Internal newsroom metadata; never accepted from the Gemini ingestion request.
export const lingyeDailyVoiceArticleSchema = z.object({
  submission_id: z.string().trim().min(1),
  author: z.string().trim().min(1),
  text: z.string().trim().min(1),
}).strict();
export type LingyeDailyVoiceArticle = z.infer<typeof lingyeDailyVoiceArticleSchema>;

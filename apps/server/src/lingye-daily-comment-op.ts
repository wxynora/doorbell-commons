import { z } from "zod";
import type { DoorbellCallExample } from "./doorbell-farm-op-registry.js";

export const dailyCommentOperation = {
  op: "go.newsroom.comment" as const,
  description: "针对已出版日报的某个板块写评论。",
  argsHint: '{issueDate:"YYYY-MM-DD",section:"farm",text:"这期真有意思"}',
  argsSchema: z.strictObject({issueDate:z.iso.date(),section:z.string(),text:z.string()}),
  examples: [{op:"go.newsroom.comment",args:{issueDate:"2026-09-06",section:"farm",text:"这期真有意思"}}] as readonly DoorbellCallExample[],
};

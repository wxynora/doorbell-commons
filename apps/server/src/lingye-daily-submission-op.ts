import { z } from "zod";
import type { DoorbellCallExample } from "./doorbell-farm-op-registry.js";
import { DailySubmissionError, type DailySubmissionReview, type LingyeDailyStore } from "./lingye-daily-store.js";

export const dailySubmissionOperation = {
  op: "go.newsroom.submit" as const,
  description: "向指定期次的明日观察题投稿，无需记者资格；署名由当前登录居民确定。",
  argsHint: '{issueDate:"YYYY-MM-DD",text:"对这期观察题的看法"}',
  argsSchema: z.strictObject({ issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), text: z.string() }),
  examples: [{ op: "go.newsroom.submit", args: { issueDate: "2026-09-02", text: "对这期观察题的看法" } }] as readonly DoorbellCallExample[],
};

const SELECTION_INSTRUCTION = "请提交本期投稿的有效编号，用英文逗号分隔，最多三个；没有合适投稿时填 0。";
const REVIEW_RECEIPT = "本期小机投稿审批已保存";

const ERRORS: Record<string, string> = {
  issue_not_published: "这期日报尚未发布或不存在，不能投稿。",
  question_missing: "这期日报没有明日观察题，不能投稿。",
  empty_submission: "投稿正文不能为空。",
  selection_numbers_required: SELECTION_INSTRUCTION,
  three_submissions_selected: SELECTION_INSTRUCTION,
  reviewer_mismatch: "这份小机投稿审批任务不属于你当前的排班。",
  review_closed: "本期小机投稿已经审批完成，不能重新选择。",
  submission_review_pending: "请先提交本期小机投稿的入选编号，再完成报道审稿。",
};

export function dailySubmissionErrorText(error: unknown): string | undefined {
  return error instanceof DailySubmissionError ? ERRORS[error.code] : undefined;
}

export function submitDailyObservation(store: LingyeDailyStore, residentId: string, args: Record<string, unknown>, now: number): string {
  // The registered op schema already validated both fields; author never comes from args.
  store.submit(residentId, args.issueDate as string, args.text as string, now);
  return "投稿已收到，入选后会在后续日报署名刊登。";
}

export function reviewDailySubmissions(store: LingyeDailyStore, residentId: string, args: Record<string, unknown>, now: number): string | undefined {
  if (typeof args.option !== "string") return undefined;
  const result = store.reviewSubmission(residentId, args.option, args.text as string | undefined, now);
  if (result) return REVIEW_RECEIPT;
  store.assertArticleReviewReady(args.option, residentId);
  return undefined;
}

export function renderDailySubmissionReview(review: DailySubmissionReview | undefined): string {
  if (!review?.items.length) return "";
  const call = { op: "go.newsroom.commission", args: {
    option: review.option, text: review.items.slice(0, 3).map(item => item.number).join(","),
  } };
  // Only the small call example is JSON; every candidate remains complete plain text.
  return [
    "小机投稿箱",
    SELECTION_INSTRUCTION,
    `doorbell(${JSON.stringify(call)})`,
    ...review.items.map(item => `${item.number}.\n${item.question_issue_date}｜${item.question_text}\n${item.body}`),
  ].join("\n\n");
}

import {
  type BoundConstableInterviewActionRequest,
  type BoundConstableInterviewErrorCode,
  type BoundConstableInterviewReadRequest,
  type BoundConstableInterviewScoreRequest,
  type BoundConstableInterviewSuccess,
  boundConstableInterviewActionRequestSchema,
  boundConstableInterviewErrorSchema,
  boundConstableInterviewReadRequestSchema,
  boundConstableInterviewScoreRequestSchema,
  boundConstableInterviewSuccessSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export interface InterviewIssue {
  code: BoundConstableInterviewErrorCode | ClientIssueCode;
  serverMessage: string | null;
}
interface RequestOptions { fetcher?: FrontendFetcher; signal?: AbortSignal; }
const issue = (code: InterviewIssue["code"]): InterviewIssue => ({ code, serverMessage: null });
async function request(url: string, init: RequestInit, options: RequestOptions): Promise<ApiResult<BoundConstableInterviewSuccess, InterviewIssue>> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      ...init, credentials: "same-origin", ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch { return { ok: false, issue: issue("network_unavailable") }; }
  let payload: unknown;
  try { payload = await response.json(); } catch { return { ok: false, issue: issue("unexpected_response") }; }
  if (!response.ok) {
    const error = boundConstableInterviewErrorSchema.safeParse(payload);
    return { ok: false, issue: error.success
      ? { code: error.data.error.code, serverMessage: error.data.error.message }
      : issue("unexpected_response") };
  }
  const parsed = boundConstableInterviewSuccessSchema.safeParse(payload);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, issue: issue("unexpected_response") };
}
export function readConstableInterviews(input: BoundConstableInterviewReadRequest = {}, options: RequestOptions = {}) {
  const parsed = boundConstableInterviewReadRequestSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false as const, issue: issue("invalid_request") });
  const query = new URLSearchParams(parsed.data.interview_id ? { interview_id: parsed.data.interview_id } : {});
  return request(`/api/farm/constable-interview${query.size ? `?${query}` : ""}`, { method: "GET" }, options);
}
export function actOnConstableInterview(action: "signup" | "attendance", input: BoundConstableInterviewActionRequest, options: RequestOptions = {}) {
  const parsed = boundConstableInterviewActionRequestSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false as const, issue: issue("invalid_request") });
  return request(`/api/farm/constable-interview/${action}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data),
  }, options);
}
export function scoreConstableInterview(input: BoundConstableInterviewScoreRequest, options: RequestOptions = {}) {
  const parsed = boundConstableInterviewScoreRequestSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false as const, issue: issue("invalid_interview_score") });
  return request("/api/farm/constable-interview/score", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data),
  }, options);
}
const messages: Record<InterviewIssue["code"], string> = {
  invalid_request: "面试请求格式不正确，请刷新后重试。",
  authentication_required: "登录已失效，请重新登录。",
  qq_not_group_member: "当前账号已不具备社区资格。",
  onebot_unavailable: "暂时无法核验群成员资格，尚未办理本次操作。",
  registration_profile_required: "请先完成当前小机档案与农场绑定。",
  farm_credential_invalid: "当前农场绑定已失效，请重新绑定。",
  farm_not_found: "没有找到当前绑定的农场。",
  farm_unavailable: "农场服务暂时不可用，请先刷新核对本次操作结果。",
  upstream_contract_unavailable: "面试服务返回的资料无法核验，请先刷新核对状态。",
  interview_material_not_configured: "本场面试的题目或评分资料尚未配置，暂时不能评分。",
  examiner_account_identity_conflict: "当前账号与本场报名时的小机档案不一致，请切回原档案。",
  interview_not_found: "没有找到这场面试。",
  constable_written_exam_required: "需要先通过本级治安官笔试。",
  constable_written_result_expired: "本次笔试结果已超过30天有效期，需要重新报考。",
  invalid_interview_session: "面试排期无效，面试须安排在北京时间20:00。",
  examiner_signup_closed: "本场面试已经关闭考官报名。",
  examiner_signup_window_closed: "考官只能在面试当日08:00至20:00前报名。",
  examiner_not_eligible: "当前账号未通过本场考官资格或利益回避核验，未占用席位。",
  examiner_confirmation_window_closed: "请在本场面试当日19:30至20:00前确认到场。",
  examiner_not_signed_up: "你尚未报名本场面试的考官。",
  interview_not_ready: "本场面试尚未到开场时间。",
  interview_scores_incomplete: "还没有收齐三名考官的评分，暂不能结算。",
  interview_score_conflict: "你已提交过另一份评分，已提交的评分不能修改。",
  invalid_interview_score: "请填写0至20之间的整数评分，并完成三项星评。",
  interview_not_scoring: "本场还不能评分，或已经结束评分。",
  interview_answer_required: "请先提交本场面试答卷。",
  examiner_not_selected: "只有本场最终选定的三名人类考官可以评分。",
  network_unavailable: "网络连接中断，操作结果尚未确认，请先刷新核对。",
  unexpected_response: "返回结果无法识别，请先刷新核对操作是否已经完成。",
};
export function interviewIssueMessage(value: InterviewIssue) { return messages[value.code]; }

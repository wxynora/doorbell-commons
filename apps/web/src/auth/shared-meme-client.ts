import {
  type SharedMemeAddRequest,
  type SharedMemeAddSuccess,
  type SharedMemeDetailSuccess,
  type SharedMemeError,
  type SharedMemeListSuccess,
  sharedMemeAddSuccessSchema,
  sharedMemeDetailSuccessSchema,
  sharedMemeErrorSchema,
  sharedMemeListSuccessSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type SharedMemeIssueCode = SharedMemeError["error"]["code"] | ClientIssueCode;

export interface SharedMemeIssue {
  code: SharedMemeIssueCode;
  serverMessage: string | null;
}

function clientIssue(code: ClientIssueCode): SharedMemeIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseIssue(payload: unknown): SharedMemeIssue {
  const parsed = sharedMemeErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

async function requestSharedMeme<T>(
  url: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  init: RequestInit,
  fetcher: FrontendFetcher,
): Promise<ApiResult<T, SharedMemeIssue>> {
  let response: Response;
  try {
    response = await fetcher(url, { credentials: "same-origin", ...init });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseIssue(payload) };
  }

  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export function listSharedMemes(
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<SharedMemeListSuccess, SharedMemeIssue>> {
  return requestSharedMeme(
    "/api/shared-memes",
    sharedMemeListSuccessSchema,
    { method: "GET" },
    fetcher,
  );
}

export function getSharedMeme(
  memeId: number,
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<SharedMemeDetailSuccess, SharedMemeIssue>> {
  return requestSharedMeme(
    `/api/shared-memes/${memeId}`,
    sharedMemeDetailSuccessSchema,
    { method: "GET" },
    fetcher,
  );
}

export function addSharedMeme(
  input: SharedMemeAddRequest,
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<SharedMemeAddSuccess, SharedMemeIssue>> {
  return requestSharedMeme(
    "/api/shared-memes",
    sharedMemeAddSuccessSchema,
    {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    fetcher,
  );
}

export function sharedMemeIssueMessage(issue: SharedMemeIssue): string {
  const messages: Record<SharedMemeIssueCode, string> = {
    authentication_required: "登录已失效，请重新登录。",
    duplicate_shared_meme_alias: "这个别名已经属于梗库里的其他条目。",
    duplicate_shared_meme_term: "这个梗已经在共享梗库里了。",
    invalid_request: "填写内容不符合共享梗库要求，请检查后再提交。",
    network_unavailable: "现在连不上共享梗库，请稍后再试。",
    onebot_unavailable: "暂时无法核验 QQ 群资格，请稍后再试。",
    qq_not_group_member: "当前 QQ 已不具备社区访问资格。",
    registration_profile_required: "请先完成居民、家园和农场绑定。",
    shared_meme_not_found: "这条共享梗不存在或已经不可用。",
    shared_meme_unavailable: "共享梗库暂时不可用，请稍后再试。",
    unexpected_response: "共享梗库返回了无法识别的数据，请稍后再试。",
  };
  return messages[issue.code];
}

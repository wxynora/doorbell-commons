import {
  type MailboxCategory,
  type MailboxDetailSuccess,
  type MailboxError,
  type MailboxListSuccess,
  mailboxDetailSuccessSchema,
  mailboxErrorSchema,
  mailboxListSuccessSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type MailboxIssueCode = MailboxError["error"]["code"] | ClientIssueCode;

export interface MailboxIssue {
  code: MailboxIssueCode;
  serverMessage: string | null;
}

interface MailboxRequestOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

interface MailboxListOptions extends MailboxRequestOptions {
  category?: MailboxCategory;
  page: number;
}

function clientIssue(code: ClientIssueCode): MailboxIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseIssue(payload: unknown): MailboxIssue {
  const parsed = mailboxErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

async function requestMailbox<T>(
  url: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  init: RequestInit,
  options: MailboxRequestOptions,
): Promise<ApiResult<T, MailboxIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      credentials: "same-origin",
      ...init,
      ...(options.signal ? { signal: options.signal } : {}),
    });
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

export function listMailbox(
  options: MailboxListOptions,
): Promise<ApiResult<MailboxListSuccess, MailboxIssue>> {
  const query = new URLSearchParams({ page: String(options.page) });
  if (options.category) {
    query.set("category", options.category);
  }
  return requestMailbox(
    `/api/mailbox?${query.toString()}`,
    mailboxListSuccessSchema,
    { method: "GET" },
    options,
  );
}

export function getMailboxLetter(
  letterId: string,
  options: MailboxRequestOptions = {},
): Promise<ApiResult<MailboxDetailSuccess, MailboxIssue>> {
  return requestMailbox(
    `/api/mailbox/${encodeURIComponent(letterId)}`,
    mailboxDetailSuccessSchema,
    { method: "GET" },
    options,
  );
}

export function claimMailboxAttachment(
  letterId: string,
  options: MailboxRequestOptions = {},
): Promise<ApiResult<MailboxDetailSuccess, MailboxIssue>> {
  return requestMailbox(
    `/api/mailbox/${encodeURIComponent(letterId)}/claim`,
    mailboxDetailSuccessSchema,
    {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    options,
  );
}

export function mailboxIssueMessage(issue: MailboxIssue): string {
  const messages: Record<MailboxIssueCode, string> = {
    attachment_not_claimable: "这封信没有可领取的附件。",
    authentication_required: "登录已失效，请重新登录。",
    farm_credential_invalid: "农场绑定已经失效，暂时无法领取。",
    farm_unavailable: "农场暂时不可用，请稍后再试。",
    invalid_request: "信箱请求无效，请刷新后重试。",
    letter_not_found: "这封信不存在或已不可用。",
    network_unavailable: "现在连不上信箱，请稍后再试。",
    onebot_unavailable: "暂时无法核验 QQ 群资格，请稍后再试。",
    qq_not_group_member: "当前 QQ 已不具备社区访问资格。",
    registration_profile_required: "请先完成居民、家园和农场绑定。",
    unexpected_response: "信箱返回了无法识别的数据，请稍后再试。",
    upstream_contract_unavailable: "农场回执暂时无法核验，请稍后再试。",
  };
  return messages[issue.code];
}

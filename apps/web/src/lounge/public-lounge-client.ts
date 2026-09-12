import { type LoungeSnapshot, loungeSnapshotSchema } from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "../auth/auth-client";

export type PublicLoungeIssueCode = ClientIssueCode | string;

export interface PublicLoungeIssue {
  code: PublicLoungeIssueCode;
  serverMessage: string | null;
}

interface PublicLoungeReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): PublicLoungeIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): PublicLoungeIssue {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return clientIssue("unexpected_response");
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return clientIssue("unexpected_response");
  }
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  return typeof code === "string" && typeof message === "string"
    ? { code, serverMessage: message }
    : clientIssue("unexpected_response");
}

export async function getPublicLoungeSnapshot(
  options: PublicLoungeReadOptions = {},
): Promise<ApiResult<LoungeSnapshot, PublicLoungeIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/lounge", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseServerIssue(payload) };
  }

  const parsed = loungeSnapshotSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export function publicLoungeIssueMessage(issue: PublicLoungeIssue): string {
  const messages: Record<string, string> = {
    authentication_required: "登录已失效，请重新登录。",
    network_unavailable: "现在连不上公共休息室，请稍后再试。",
    onebot_unavailable: "暂时无法确认社区资格，请稍后再试。",
    qq_not_group_member: "当前账号没有社区访问资格。",
    registration_profile_required: "请先完成社区注册。",
    unexpected_response: "公共休息室返回了无法识别的数据，请稍后再试。",
  };
  return messages[issue.code] ?? issue.serverMessage ?? "公共休息室暂时不可用，请稍后再试。";
}

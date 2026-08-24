import { boundRanchReadErrorSchema, boundRanchReadSuccessSchema } from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundRanchRead = ReturnType<typeof boundRanchReadSuccessSchema.parse>;
export type RanchIssueCode =
  | ReturnType<typeof boundRanchReadErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface RanchIssue {
  code: RanchIssueCode;
  serverMessage: string | null;
}

interface RanchReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): RanchIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseRanchIssue(payload: unknown): RanchIssue {
  const parsed = boundRanchReadErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

export async function getBoundRanch(
  options: RanchReadOptions = {},
): Promise<ApiResult<BoundRanchRead, RanchIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/ranch", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseRanchIssue(payload) };
  }

  const parsed = boundRanchReadSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const getFarmRanch = getBoundRanch;
export const getRanch = getBoundRanch;

export function ranchIssueMessage(issue: RanchIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上牧场，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "牧场数据返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "牧场暂时不可用，请稍后再试。";
}

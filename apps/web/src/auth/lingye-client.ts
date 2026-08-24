import {
  type BoundGlimmerReadSuccess,
  type BoundTogetherReadSuccess,
  boundGlimmerReadErrorSchema,
  boundGlimmerReadSuccessSchema,
  boundTogetherReadErrorSchema,
  boundTogetherReadSuccessSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type LingyeIssueCode = ClientIssueCode | string;

export interface LingyeIssue {
  code: LingyeIssueCode;
  serverMessage: string | null;
}

export type BoundGlimmerRead = BoundGlimmerReadSuccess;
export type BoundTogetherRead = BoundTogetherReadSuccess;

interface LingyeReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): LingyeIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(
  payload: unknown,
  schema: {
    safeParse(
      value: unknown,
    ): { success: true; data: { error: { code: string; message: string } } } | { success: false };
  },
): LingyeIssue {
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

async function readLingye<T>(
  url: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  errorSchema: {
    safeParse(
      value: unknown,
    ): { success: true; data: { error: { code: string; message: string } } } | { success: false };
  },
  options: LingyeReadOptions,
): Promise<ApiResult<T, LingyeIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseServerIssue(payload, errorSchema) };
  }

  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export function getBoundGlimmer(
  options: LingyeReadOptions = {},
): Promise<ApiResult<BoundGlimmerRead, LingyeIssue>> {
  return readLingye(
    "/api/lingye/glimmer",
    boundGlimmerReadSuccessSchema,
    boundGlimmerReadErrorSchema,
    options,
  );
}

export function getBoundTogether(
  options: LingyeReadOptions = {},
): Promise<ApiResult<BoundTogetherRead, LingyeIssue>> {
  return readLingye(
    "/api/lingye/together",
    boundTogetherReadSuccessSchema,
    boundTogetherReadErrorSchema,
    options,
  );
}

export const getLingyeGlimmer = getBoundGlimmer;
export const getLingyeTogether = getBoundTogether;

export function lingyeIssueMessage(issue: LingyeIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上铃野，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "铃野数据返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "铃野暂时不可用，请稍后再试。";
}

import {
  boundFarmDecorationsReadSuccessSchema,
  boundFarmDecorationLayoutSaveRequestSchema,
  boundFarmDecorationLayoutSaveSuccessSchema,
  boundFarmDecorationLayoutSaveErrorSchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundFarmDecorationsRead = ReturnType<
  typeof boundFarmDecorationsReadSuccessSchema.parse
>;
export type FarmDecorationLayout = BoundFarmDecorationsRead["data"]["layout"];
export type BoundFarmDecorationLayoutSave = ReturnType<
  typeof boundFarmDecorationLayoutSaveSuccessSchema.parse
>;
export interface FarmDecorationIssue {
  code:
    | ReturnType<typeof boundFarmDecorationLayoutSaveErrorSchema.parse>["error"]["code"]
    | ClientIssueCode;
  serverMessage: string | null;
}

interface ReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

async function payloadOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function issueFrom(payload: unknown): FarmDecorationIssue {
  const parsed = boundFarmDecorationLayoutSaveErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : { code: "unexpected_response", serverMessage: null };
}

export async function getBoundFarmDecorations(
  options: ReadOptions = {},
): Promise<ApiResult<BoundFarmDecorationsRead, FarmDecorationIssue>> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/farm/decorations", {
      method: "GET",
      credentials: "same-origin",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: { code: "network_unavailable", serverMessage: null } };
  }
  const payload = await payloadOf(response);
  if (!response.ok) return { ok: false, issue: issueFrom(payload) };
  const parsed = boundFarmDecorationsReadSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: issueFrom(undefined) };
}

export async function saveBoundFarmDecorationLayout(
  options: ReadOptions & {
    expectedRevision: string;
    idempotencyKey: string;
    layout: FarmDecorationLayout;
  },
): Promise<ApiResult<BoundFarmDecorationLayoutSave, FarmDecorationIssue>> {
  const body = boundFarmDecorationLayoutSaveRequestSchema.parse({
    idempotency_key: options.idempotencyKey,
    expected_revision: options.expectedRevision,
    layout: options.layout,
  });
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/farm/decorations/layout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: { code: "network_unavailable", serverMessage: null } };
  }
  const payload = await payloadOf(response);
  if (!response.ok) return { ok: false, issue: issueFrom(payload) };
  const parsed = boundFarmDecorationLayoutSaveSuccessSchema.safeParse(payload);
  return parsed.success && parsed.data.data.result.receipt_id === options.idempotencyKey
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: issueFrom(undefined) };
}

export function farmDecorationIssueMessage(issue: FarmDecorationIssue): string {
  if (issue.code === "network_unavailable") return "现在连不上农场，布置尚未保存，请重试。";
  if (issue.code === "unexpected_response") return "装饰数据暂时无法识别，请稍后重试。";
  return issue.serverMessage || "装饰暂时不可用，请稍后重试。";
}

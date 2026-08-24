import {
  type BoundFarmSettingsActionSuccess,
  boundFarmSettingsActionErrorSchema,
  boundFarmSettingsActionRequestSchema,
  boundFarmSettingsActionSuccessSchema,
  type farmSettingsActionFieldSchema,
  farmSettingsActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundFarmSettingsAction = BoundFarmSettingsActionSuccess;
export type FarmSettingsActionIssueCode =
  | ReturnType<typeof boundFarmSettingsActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface FarmSettingsActionIssue {
  code: FarmSettingsActionIssueCode;
  currentCatalogRevision: string | null;
  serverMessage: string | null;
}

export interface FarmSettingsActionInput {
  idempotencyKey: string;
  expectedCatalogRevision: string;
  field: ReturnType<typeof farmSettingsActionFieldSchema.parse>;
  value: string | boolean | null;
}

interface FarmSettingsActionOptions extends FarmSettingsActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): FarmSettingsActionIssue {
  return { code, currentCatalogRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): FarmSettingsActionIssue {
  const parsed = boundFarmSettingsActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentCatalogRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function updateBoundFarmSettings(
  options: FarmSettingsActionOptions,
): Promise<ApiResult<BoundFarmSettingsAction, FarmSettingsActionIssue>> {
  const body = boundFarmSettingsActionRequestSchema.parse({
    expected_catalog_revision: options.expectedCatalogRevision,
    field: options.field,
    value: options.value,
  });
  const idempotencyKey = farmSettingsActionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/settings/actions", {
      credentials: "same-origin",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }
  const payload = await readPayload(response);
  if (!response.ok) return { ok: false, issue: parseServerIssue(payload) };
  const parsed = boundFarmSettingsActionSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.data.result.field === options.field
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const executeBoundFarmSettingsAction = updateBoundFarmSettings;
export const updateFarmSettings = updateBoundFarmSettings;

export function farmSettingsActionIssueMessage(issue: FarmSettingsActionIssue): string {
  if (issue.code === "network_unavailable") return "现在连不上农场设置，请稍后再试。";
  if (issue.code === "unexpected_response") return "农场设置返回了无法识别的数据，请稍后再试。";
  if (issue.code === "state_conflict") return "设置已经变化，已重新读取，请再保存一次。";
  if (issue.code === "idempotency_conflict") return "这次保存请求已经失效，请重新保存。";
  return issue.serverMessage || "农场设置暂时不可用，请稍后再试。";
}

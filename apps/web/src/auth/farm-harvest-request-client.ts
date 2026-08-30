import {
  type BoundFarmHarvestRequestCreateSuccess,
  boundFarmHarvestRequestCreateSchema,
  boundFarmHarvestRequestCreateSuccessSchema,
  boundFarmHarvestRequestErrorSchema,
  farmHarvestRequestIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type FarmHarvestRequestIssueCode =
  | ReturnType<typeof boundFarmHarvestRequestErrorSchema.parse>["error"]["code"]
  | ClientIssueCode
  | "harvest_request_expired"
  | "harvest_request_failed";

export interface FarmHarvestRequestIssue {
  code: FarmHarvestRequestIssueCode;
  currentFieldRevision: string | null;
  serverMessage: string | null;
}

export interface CreateFarmHarvestRequestInput {
  idempotencyKey: string;
  fieldRevision: string;
}

interface CreateFarmHarvestRequestOptions extends CreateFarmHarvestRequestInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: FarmHarvestRequestIssueCode): FarmHarvestRequestIssue {
  return { code, currentFieldRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): FarmHarvestRequestIssue {
  const parsed = boundFarmHarvestRequestErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentFieldRevision: parsed.data.error.current_field_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function createBoundFarmHarvestRequest(
  options: CreateFarmHarvestRequestOptions,
): Promise<ApiResult<BoundFarmHarvestRequestCreateSuccess, FarmHarvestRequestIssue>> {
  const body = boundFarmHarvestRequestCreateSchema.parse({
    field_revision: options.fieldRevision,
  });
  const idempotencyKey = farmHarvestRequestIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/harvest-requests", {
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
  const parsed = boundFarmHarvestRequestCreateSuccessSchema.safeParse(payload);
  if (!parsed.success || parsed.data.data.field_revision !== options.fieldRevision) {
    return { ok: false, issue: clientIssue("unexpected_response") };
  }
  if (parsed.data.data.status === "expired") {
    return { ok: false, issue: clientIssue("harvest_request_expired") };
  }
  if (parsed.data.data.status === "failed") {
    return { ok: false, issue: clientIssue("harvest_request_failed") };
  }
  return { ok: true, data: parsed.data };
}

export function farmHarvestRequestIssueMessage(issue: FarmHarvestRequestIssue): string {
  switch (issue.code) {
    case "field_changed":
      return "田地状态已变化，请刷新后再喊 TA。";
    case "no_ripe_plots":
      return "现在没有成熟的菜可以收。";
    case "idempotency_conflict":
      return "这次通知和之前的内容不一致，请重新操作。";
    case "farm_unavailable":
      return "农场暂时无法处理，请稍后再试。";
    case "onebot_unavailable":
      return "现在无法联系 TA，请稍后再试。";
    case "network_unavailable":
      return "现在连不上 Doorbell，请稍后再试。";
    case "harvest_request_expired":
      return "这次收菜通知已经过期，请重新喊 TA。";
    case "harvest_request_failed":
      return "这次通知没有送达，请重新喊 TA。";
    default:
      return "暂时无法通知 TA，请稍后再试。";
  }
}

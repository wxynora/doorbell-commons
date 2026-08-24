import {
  type BoundFarmRanchResidentActionSuccess,
  boundFarmRanchResidentActionErrorSchema,
  boundFarmRanchResidentActionRequestSchema,
  boundFarmRanchResidentActionSuccessSchema,
  type FarmRanchResidentAction,
  type FarmRanchResidentActionPayload,
  type FarmRanchResidentType,
  farmRanchResidentActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundRanchResidentAction = BoundFarmRanchResidentActionSuccess;
export type RanchResidentActionIssueCode =
  | ReturnType<typeof boundFarmRanchResidentActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface RanchResidentActionIssue {
  code: RanchResidentActionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export interface RanchResidentActionInput {
  idempotencyKey: string;
  expectedRevision: string;
  action: FarmRanchResidentAction;
  residentType: FarmRanchResidentType;
  kindId: string;
  payload: FarmRanchResidentActionPayload;
}

interface RanchResidentActionOptions extends RanchResidentActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): RanchResidentActionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): RanchResidentActionIssue {
  const parsed = boundFarmRanchResidentActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function executeBoundRanchResidentAction(
  options: RanchResidentActionOptions,
): Promise<ApiResult<BoundRanchResidentAction, RanchResidentActionIssue>> {
  const body = boundFarmRanchResidentActionRequestSchema.parse({
    expected_revision: options.expectedRevision,
    action: options.action,
    resident_type: options.residentType,
    kind_id: options.kindId,
    payload: options.payload,
  });
  const idempotencyKey = farmRanchResidentActionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/ranch/resident-actions", {
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
  if (!response.ok) {
    return { ok: false, issue: parseServerIssue(payload) };
  }

  const parsed = boundFarmRanchResidentActionSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.data.result.action === options.action &&
    parsed.data.data.result.resident_type === options.residentType &&
    parsed.data.data.result.kind_id === options.kindId &&
    parsed.data.data.result.outcome.kind === options.action
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const postBoundRanchResidentAction = executeBoundRanchResidentAction;
export const executeRanchResidentAction = executeBoundRanchResidentAction;

export function ranchResidentActionIssueMessage(issue: RanchResidentActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上牧场，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "牧场动作返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "牧场动作暂时不可用，请稍后再试。";
}

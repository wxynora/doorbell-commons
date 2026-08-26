import {
  type BoundFarmExpeditionActionSuccess,
  boundFarmExpeditionActionErrorSchema,
  boundFarmExpeditionActionRequestSchema,
  boundFarmExpeditionActionSuccessSchema,
  type FarmExpeditionAction,
  type FarmExpeditionActionPayload,
  farmExpeditionActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundExpeditionAction = BoundFarmExpeditionActionSuccess;
export type ExpeditionActionIssueCode =
  | ReturnType<typeof boundFarmExpeditionActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface ExpeditionActionIssue {
  code: ExpeditionActionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export interface ExpeditionActionInput {
  idempotencyKey: string;
  expectedRevision: string;
  action: FarmExpeditionAction;
  payload: FarmExpeditionActionPayload;
}

interface ExpeditionActionOptions extends ExpeditionActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): ExpeditionActionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): ExpeditionActionIssue {
  const parsed = boundFarmExpeditionActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function executeBoundExpeditionAction(
  options: ExpeditionActionOptions,
): Promise<ApiResult<BoundExpeditionAction, ExpeditionActionIssue>> {
  const body = boundFarmExpeditionActionRequestSchema.parse({
    expected_revision: options.expectedRevision,
    action: options.action,
    payload: options.payload,
  });
  const idempotencyKey = farmExpeditionActionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/expedition/actions", {
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

  const parsed = boundFarmExpeditionActionSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.data.result.action === options.action &&
    parsed.data.revision !== options.expectedRevision
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const executeExpeditionAction = executeBoundExpeditionAction;
export const postBoundExpeditionAction = executeBoundExpeditionAction;

export function expeditionActionIssueMessage(issue: ExpeditionActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上农场，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "探险动作返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "探险动作暂时不可用，请稍后再试。";
}

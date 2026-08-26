import {
  type BoundFarmRanchDecorationActionSuccess,
  boundFarmRanchDecorationActionErrorSchema,
  boundFarmRanchDecorationActionRequestSchema,
  boundFarmRanchDecorationActionSuccessSchema,
  type FarmRanchDecorationAction,
  farmRanchDecorationActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundRanchDecorationAction = BoundFarmRanchDecorationActionSuccess;
export type RanchDecorationActionIssueCode =
  | ReturnType<typeof boundFarmRanchDecorationActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface RanchDecorationActionIssue {
  code: RanchDecorationActionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export interface RanchDecorationActionInput {
  idempotencyKey: string;
  expectedRevision: string;
  action: FarmRanchDecorationAction;
  decorationId: string;
}

interface RanchDecorationActionOptions extends RanchDecorationActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): RanchDecorationActionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): RanchDecorationActionIssue {
  const parsed = boundFarmRanchDecorationActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function executeBoundRanchDecorationAction(
  options: RanchDecorationActionOptions,
): Promise<ApiResult<BoundRanchDecorationAction, RanchDecorationActionIssue>> {
  const body = boundFarmRanchDecorationActionRequestSchema.parse({
    expected_revision: options.expectedRevision,
    action: options.action,
    decoration_id: options.decorationId,
  });
  const idempotencyKey = farmRanchDecorationActionIdempotencyKeySchema.parse(
    options.idempotencyKey,
  );
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/ranch/decorations/actions", {
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

  const parsed = boundFarmRanchDecorationActionSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.data.result.action === options.action &&
    parsed.data.data.result.decoration_id === options.decorationId &&
    parsed.data.data.result.outcome.kind === options.action &&
    parsed.data.data.result.outcome.decoration_id === options.decorationId &&
    parsed.data.data.resource.farm.farm_doorplate !== null
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const postBoundRanchDecorationAction = executeBoundRanchDecorationAction;
export const executeRanchDecorationAction = executeBoundRanchDecorationAction;

export function ranchDecorationActionIssueMessage(issue: RanchDecorationActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上牧场，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "牧场装饰动作返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "牧场装饰动作暂时不可用，请稍后再试。";
}

import {
  boundFarmOriginalPlantActionErrorSchema,
  boundFarmOriginalPlantActionRequestSchema,
  boundFarmOriginalPlantActionSuccessSchema,
  farmOriginalPlantActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundOriginalPlantAction = ReturnType<
  typeof boundFarmOriginalPlantActionSuccessSchema.parse
>;
export type OriginalPlantActionIssueCode =
  | ReturnType<typeof boundFarmOriginalPlantActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface OriginalPlantActionIssue {
  code: OriginalPlantActionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export interface OriginalPlantActionInput {
  idempotencyKey: string;
  expectedRevision: string;
  name: string;
  latin: string;
  desc: string;
  plant: string;
  harvest: string;
}

interface OriginalPlantActionOptions extends OriginalPlantActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): OriginalPlantActionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): OriginalPlantActionIssue {
  const parsed = boundFarmOriginalPlantActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

export async function executeBoundOriginalPlantAction(
  options: OriginalPlantActionOptions,
): Promise<ApiResult<BoundOriginalPlantAction, OriginalPlantActionIssue>> {
  const body = boundFarmOriginalPlantActionRequestSchema.parse({
    expected_revision: options.expectedRevision,
    name: options.name,
    latin: options.latin,
    desc: options.desc,
    plant: options.plant,
    harvest: options.harvest,
  });
  const idempotencyKey = farmOriginalPlantActionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/original-plant/actions", {
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

  const parsed = boundFarmOriginalPlantActionSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.revision !== options.expectedRevision
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const executeOriginalPlantAction = executeBoundOriginalPlantAction;
export const postBoundOriginalPlantAction = executeBoundOriginalPlantAction;

export function originalPlantActionIssueMessage(issue: OriginalPlantActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上农场，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "原创植物动作返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "原创植物动作暂时不可用，请稍后再试。";
}

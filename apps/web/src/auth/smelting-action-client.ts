import {
  type BoundFarmSmeltingActionSuccess,
  boundFarmSmeltingActionErrorSchema,
  boundFarmSmeltingActionRequestSchema,
  boundFarmSmeltingActionSuccessSchema,
  farmSmeltingActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundSmeltingAction = BoundFarmSmeltingActionSuccess;
export type SmeltingActionIssueCode =
  | ReturnType<typeof boundFarmSmeltingActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface SmeltingActionIssue {
  code: SmeltingActionIssueCode;
  currentSmeltingRevision: string | null;
  serverMessage: string | null;
}

export interface SmeltingActionInput {
  expectedFarmDoorplate: string;
  idempotencyKey: string;
  materialIds: string[];
  expectedSmeltingRevision: string;
}

interface SmeltingActionOptions extends SmeltingActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): SmeltingActionIssue {
  return { code, currentSmeltingRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): SmeltingActionIssue {
  const parsed = boundFarmSmeltingActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentSmeltingRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function resultMatchesInput(result: BoundSmeltingAction, options: SmeltingActionInput): boolean {
  const receipt = result.data.result;
  return (
    result.data.resource.farm.farm_doorplate === options.expectedFarmDoorplate &&
    receipt.receipt_id === options.idempotencyKey &&
    receipt.material_ids.length === options.materialIds.length &&
    receipt.material_ids.every((id, index) => id === options.materialIds[index])
  );
}

export async function executeBoundSmeltingAction(
  options: SmeltingActionOptions,
): Promise<ApiResult<BoundSmeltingAction, SmeltingActionIssue>> {
  const body = boundFarmSmeltingActionRequestSchema.parse({
    material_ids: options.materialIds,
    expected_smelting_revision: options.expectedSmeltingRevision,
  });
  const idempotencyKey = farmSmeltingActionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/smelting/actions", {
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

  const parsed = boundFarmSmeltingActionSuccessSchema.safeParse(payload);
  return parsed.success && resultMatchesInput(parsed.data, options)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const executeSmeltingAction = executeBoundSmeltingAction;

export function smeltingActionIssueMessage(issue: SmeltingActionIssue): string {
  if (issue.code === "network_unavailable") return "现在连不上农场，请稍后再试。";
  if (issue.code === "unexpected_response") return "熔炼结果无法核验，请稍后再试。";
  return issue.serverMessage || "熔炼暂时不可用，请稍后再试。";
}

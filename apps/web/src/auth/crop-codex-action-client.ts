import {
  type BoundFarmCropCodexActionSuccess,
  boundFarmCropCodexActionErrorSchema,
  boundFarmCropCodexActionRequestSchema,
  boundFarmCropCodexActionSuccessSchema,
  type FarmCropCodexAction,
  farmCropCodexActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundCropCodexAction = BoundFarmCropCodexActionSuccess;
export type CropCodexActionIssueCode =
  | ReturnType<typeof boundFarmCropCodexActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface CropCodexActionIssue {
  code: CropCodexActionIssueCode;
  currentCodexRevision: string | null;
  serverMessage: string | null;
}

export interface CropCodexActionInput {
  expectedFarmDoorplate: string;
  idempotencyKey: string;
  cropId: string;
  action: FarmCropCodexAction;
  expectedCodexRevision: string;
}

interface CropCodexActionOptions extends CropCodexActionInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): CropCodexActionIssue {
  return { code, currentCodexRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): CropCodexActionIssue {
  const parsed = boundFarmCropCodexActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentCodexRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function resultMatchesInput(result: BoundCropCodexAction, options: CropCodexActionInput): boolean {
  const receipt = result.data.result;
  return (
    result.data.resource.farm.farm_doorplate === options.expectedFarmDoorplate &&
    receipt.receipt_id === options.idempotencyKey &&
    receipt.crop_id === options.cropId &&
    receipt.action === options.action &&
    receipt.starred === (options.action === "star")
  );
}

export async function executeBoundCropCodexAction(
  options: CropCodexActionOptions,
): Promise<ApiResult<BoundCropCodexAction, CropCodexActionIssue>> {
  const body = boundFarmCropCodexActionRequestSchema.parse({
    crop_id: options.cropId,
    action: options.action,
    expected_codex_revision: options.expectedCodexRevision,
  });
  const idempotencyKey = farmCropCodexActionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/codex/actions", {
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

  const parsed = boundFarmCropCodexActionSuccessSchema.safeParse(payload);
  return parsed.success && resultMatchesInput(parsed.data, options)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const executeCropCodexAction = executeBoundCropCodexAction;
export const postBoundCropCodexAction = executeBoundCropCodexAction;

export function cropCodexActionIssueMessage(issue: CropCodexActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上农场图鉴，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "图鉴动作返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "图鉴动作暂时不可用，请稍后再试。";
}

import {
  type BoundFarmKitchenCookSuccess,
  boundFarmKitchenCookErrorSchema,
  boundFarmKitchenCookRequestSchema,
  boundFarmKitchenCookSuccessSchema,
  farmKitchenCookIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundKitchenCook = BoundFarmKitchenCookSuccess;
export type KitchenCookIssueCode =
  | ReturnType<typeof boundFarmKitchenCookErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface KitchenCookIssue {
  code: KitchenCookIssueCode;
  currentKitchenInventoryRevision: string | null;
  serverMessage: string | null;
}

export interface KitchenCookInput {
  expectedFarmDoorplate: string;
  idempotencyKey: string;
  items: string[];
  expectedKitchenInventoryRevision: string;
}

interface KitchenCookOptions extends KitchenCookInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): KitchenCookIssue {
  return { code, currentKitchenInventoryRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): KitchenCookIssue {
  const parsed = boundFarmKitchenCookErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentKitchenInventoryRevision:
          parsed.data.error.current_kitchen_inventory_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function itemRefsMatch(requestItems: string[], receiptItems: string[]): boolean {
  return (
    requestItems.length === receiptItems.length &&
    requestItems.every((item, index) => receiptItems[index] === item)
  );
}

function resultMatchesInput(result: BoundKitchenCook, input: KitchenCookInput): boolean {
  const receipt = result.data.result;
  return (
    result.data.resource.farm.farm_doorplate === input.expectedFarmDoorplate &&
    receipt.receipt_id === input.idempotencyKey &&
    receipt.outcome.kind === "cook" &&
    itemRefsMatch(input.items, receipt.outcome.item_refs) &&
    result.kitchen_inventory_revision !== input.expectedKitchenInventoryRevision
  );
}

export async function executeBoundKitchenCook(
  options: KitchenCookOptions,
): Promise<ApiResult<BoundKitchenCook, KitchenCookIssue>> {
  const body = boundFarmKitchenCookRequestSchema.parse({
    expected_kitchen_inventory_revision: options.expectedKitchenInventoryRevision,
    items: options.items,
  });
  const idempotencyKey = farmKitchenCookIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/kitchen/cooks", {
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

  const parsed = boundFarmKitchenCookSuccessSchema.safeParse(payload);
  return parsed.success && resultMatchesInput(parsed.data, options)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const postBoundKitchenCook = executeBoundKitchenCook;
export const executeKitchenCook = executeBoundKitchenCook;

export function kitchenCookIssueMessage(issue: KitchenCookIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上料理台，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "料理结果返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "料理暂时不可用，请稍后再试。";
}

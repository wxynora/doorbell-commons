import {
  type BoundFarmKitchenPurchaseSuccess,
  boundFarmKitchenPurchaseErrorSchema,
  boundFarmKitchenPurchaseRequestSchema,
  boundFarmKitchenPurchaseSuccessSchema,
  farmKitchenPurchaseIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundKitchenPurchase = BoundFarmKitchenPurchaseSuccess;
export type KitchenPurchaseIssueCode =
  | ReturnType<typeof boundFarmKitchenPurchaseErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface KitchenPurchaseIssue {
  code: KitchenPurchaseIssueCode;
  currentShopRevision: string | null;
  serverMessage: string | null;
}

export interface KitchenPurchaseInput {
  idempotencyKey: string;
  expectedShopRevision: string;
  items: Array<{
    kind: "ingredient" | "recipe" | "tool";
    itemId: string;
    quantity: number;
  }>;
}

interface KitchenPurchaseOptions extends KitchenPurchaseInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): KitchenPurchaseIssue {
  return { code, currentShopRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): KitchenPurchaseIssue {
  const parsed = boundFarmKitchenPurchaseErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentShopRevision: parsed.data.error.current_shop_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function receiptItemsMatch(
  requestItems: KitchenPurchaseInput["items"],
  receiptItems: BoundKitchenPurchase["data"]["result"]["items"],
): boolean {
  return (
    requestItems.length === receiptItems.length &&
    requestItems.every((item, index) => {
      const receiptItem = receiptItems[index];
      return (
        receiptItem !== undefined &&
        receiptItem.kind === item.kind &&
        receiptItem.item_id === item.itemId &&
        receiptItem.quantity === item.quantity
      );
    })
  );
}

export async function purchaseBoundKitchenItem(
  options: KitchenPurchaseOptions,
): Promise<ApiResult<BoundKitchenPurchase, KitchenPurchaseIssue>> {
  const body = boundFarmKitchenPurchaseRequestSchema.parse({
    expected_shop_revision: options.expectedShopRevision,
    items: options.items.map((item) => ({
      kind: item.kind,
      item_id: item.itemId,
      quantity: item.quantity,
    })),
  });
  const idempotencyKey = farmKitchenPurchaseIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/kitchen/purchases", {
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

  const parsed = boundFarmKitchenPurchaseSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    receiptItemsMatch(options.items, parsed.data.data.result.items)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const purchaseKitchenItem = purchaseBoundKitchenItem;

export function kitchenPurchaseIssueMessage(issue: KitchenPurchaseIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上料理台，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "料理购买结果返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "料理购买暂时不可用，请稍后再试。";
}

import {
  type BoundFarmKitchenShopRefreshSuccess,
  boundFarmKitchenShopRefreshErrorSchema,
  boundFarmKitchenShopRefreshRequestSchema,
  boundFarmKitchenShopRefreshSuccessSchema,
  farmKitchenShopRefreshIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundKitchenShopRefresh = BoundFarmKitchenShopRefreshSuccess;
export type KitchenShopRefreshIssueCode =
  | ReturnType<typeof boundFarmKitchenShopRefreshErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface KitchenShopRefreshIssue {
  code: KitchenShopRefreshIssueCode;
  currentShopRevision: string | null;
  serverMessage: string | null;
}

export interface KitchenShopRefreshInput {
  idempotencyKey: string;
  expectedShopRevision: string;
}

interface KitchenShopRefreshOptions extends KitchenShopRefreshInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): KitchenShopRefreshIssue {
  return { code, currentShopRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): KitchenShopRefreshIssue {
  const parsed = boundFarmKitchenShopRefreshErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentShopRevision: parsed.data.error.current_shop_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function resultMatchesResource(result: BoundKitchenShopRefresh): boolean {
  const receipt = result.data.result;
  const shop = result.data.resource.daily_shop;
  return (
    shop.status === "available" &&
    shop.refresh_window_id === receipt.refresh_window_id &&
    shop.refresh_used_count === receipt.refresh_used_count &&
    shop.refresh_remaining_count === receipt.refresh_remaining_count &&
    shop.refresh_limit === receipt.refresh_limit &&
    shop.next_cost_coins === receipt.next_cost_coins &&
    shop.can_refresh === receipt.can_refresh
  );
}

export async function refreshBoundKitchenShop(
  options: KitchenShopRefreshOptions,
): Promise<ApiResult<BoundKitchenShopRefresh, KitchenShopRefreshIssue>> {
  const body = boundFarmKitchenShopRefreshRequestSchema.parse({
    expected_shop_revision: options.expectedShopRevision,
  });
  const idempotencyKey = farmKitchenShopRefreshIdempotencyKeySchema.parse(
    options.idempotencyKey,
  );
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/kitchen/shop/refreshes", {
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

  const parsed = boundFarmKitchenShopRefreshSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.shop_revision !== options.expectedShopRevision &&
    resultMatchesResource(parsed.data)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const refreshKitchenShop = refreshBoundKitchenShop;

export function kitchenShopRefreshIssueMessage(issue: KitchenShopRefreshIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上料理食材铺，请稍后重试。";
  }
  if (issue.code === "unexpected_response") {
    return "食材刷新结果返回了无法识别的数据，请稍后重试。";
  }
  return issue.serverMessage || "食材栏暂时不能刷新，请稍后再试。";
}

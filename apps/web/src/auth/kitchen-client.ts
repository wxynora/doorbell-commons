import {
  type BoundFarmKitchenReadSuccess,
  type BoundFarmKitchenShopOpenSuccess,
  boundFarmKitchenReadErrorSchema,
  boundFarmKitchenReadSuccessSchema,
  boundFarmKitchenShopOpenErrorSchema,
  boundFarmKitchenShopOpenRequestSchema,
  boundFarmKitchenShopOpenSuccessSchema,
  farmKitchenShopOpenIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type BoundKitchenRead = BoundFarmKitchenReadSuccess;
export type KitchenIssueCode =
  | ReturnType<typeof boundFarmKitchenReadErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface KitchenIssue {
  code: KitchenIssueCode;
  serverMessage: string | null;
}

export type BoundKitchenShopOpen = BoundFarmKitchenShopOpenSuccess;
export type KitchenShopOpenIssueCode =
  | ReturnType<typeof boundFarmKitchenShopOpenErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface KitchenShopOpenIssue {
  code: KitchenShopOpenIssueCode;
  currentShopRevision: string | null;
  serverMessage: string | null;
}

interface KitchenReadOptions {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): KitchenIssue {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): KitchenIssue {
  const parsed = boundFarmKitchenReadErrorSchema.safeParse(payload);
  return parsed.success
    ? { code: parsed.data.error.code, serverMessage: parsed.data.error.message }
    : clientIssue("unexpected_response");
}

export async function getBoundKitchen(
  options: KitchenReadOptions = {},
): Promise<ApiResult<BoundKitchenRead, KitchenIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/kitchen", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseServerIssue(payload) };
  }

  const parsed = boundFarmKitchenReadSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const getBoundFarmKitchen = getBoundKitchen;
export const getFarmKitchen = getBoundKitchen;

export function kitchenIssueMessage(issue: KitchenIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上料理台，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "料理台数据返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "料理台暂时不可用，请稍后再试。";
}

export async function openBoundKitchenShop(options: {
  expectedShopRevision: string;
  fetcher?: FrontendFetcher;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<ApiResult<BoundKitchenShopOpen, KitchenShopOpenIssue>> {
  const body = boundFarmKitchenShopOpenRequestSchema.parse({
    expected_shop_revision: options.expectedShopRevision,
  });
  const idempotencyKey = farmKitchenShopOpenIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/kitchen/shop/openings", {
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
    return {
      ok: false,
      issue: { code: "network_unavailable", currentShopRevision: null, serverMessage: null },
    };
  }
  const payload = await readPayload(response);
  if (!response.ok) {
    const parsed = boundFarmKitchenShopOpenErrorSchema.safeParse(payload);
    return parsed.success
      ? {
          ok: false,
          issue: {
            code: parsed.data.error.code,
            currentShopRevision: parsed.data.error.current_shop_revision ?? null,
            serverMessage: parsed.data.error.message,
          },
        }
      : {
          ok: false,
          issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
        };
  }
  const parsed = boundFarmKitchenShopOpenSuccessSchema.safeParse(payload);
  return parsed.success &&
    parsed.data.data.result.receipt_id === idempotencyKey &&
    parsed.data.data.resource.daily_shop.status === "available" &&
    parsed.data.data.resource.daily_shop.is_current_day === true
    ? { ok: true, data: parsed.data }
    : {
        ok: false,
        issue: { code: "unexpected_response", currentShopRevision: null, serverMessage: null },
      };
}

export function kitchenShopOpenIssueMessage(issue: KitchenShopOpenIssue): string {
  if (issue.code === "network_unavailable") return "现在连不上料理商店，请稍后重试。";
  if (issue.code === "unexpected_response") {
    return "料理商店货架返回了无法识别的数据，请稍后重试。";
  }
  return issue.serverMessage || "料理商店暂时无法打开，请稍后重试。";
}

export function replaceKitchenAfterShopOpen(
  kitchen: BoundKitchenRead,
  opened: BoundKitchenShopOpen,
): BoundKitchenRead {
  return {
    data: opened.data.resource,
    kitchen_inventory_revision: kitchen.kitchen_inventory_revision,
    shop_revision: opened.shop_revision,
    server_time: opened.server_time,
  };
}

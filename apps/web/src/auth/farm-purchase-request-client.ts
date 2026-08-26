import {
  type BoundFarmPurchaseRequestCreateSuccess,
  boundFarmPurchaseRequestCreateSchema,
  boundFarmPurchaseRequestCreateSuccessSchema,
  boundFarmPurchaseRequestErrorSchema,
  farmPurchaseRequestIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

export type FarmPurchaseRequestIssueCode =
  | ReturnType<typeof boundFarmPurchaseRequestErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface FarmPurchaseRequestIssue {
  code: FarmPurchaseRequestIssueCode;
  currentShopRevision: string | null;
  serverMessage: string | null;
}

export interface CreateFarmPurchaseRequestInput {
  idempotencyKey: string;
  shop: "field" | "ranch";
  shopRevision: string;
  items: Array<{
    kind: "seed" | "potion" | "potion_set" | "recipe" | "animal" | "pet";
    itemId: string;
    quantity: number;
  }>;
}

interface CreateFarmPurchaseRequestOptions extends CreateFarmPurchaseRequestInput {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
}

function clientIssue(code: ClientIssueCode): FarmPurchaseRequestIssue {
  return { code, currentShopRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): FarmPurchaseRequestIssue {
  const parsed = boundFarmPurchaseRequestErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentShopRevision: parsed.data.error.current_shop_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function requestItemsMatch(
  input: CreateFarmPurchaseRequestInput,
  response: BoundFarmPurchaseRequestCreateSuccess,
): boolean {
  return (
    response.data.shop === input.shop &&
    response.data.shop_revision === input.shopRevision &&
    response.data.status === "requested" &&
    response.data.items.length === input.items.length &&
    input.items.every((item, index) => {
      const result = response.data.items[index];
      return (
        result?.kind === item.kind && result.item_id === item.itemId && result.qty === item.quantity
      );
    })
  );
}

export async function createBoundFarmPurchaseRequest(
  options: CreateFarmPurchaseRequestOptions,
): Promise<ApiResult<BoundFarmPurchaseRequestCreateSuccess, FarmPurchaseRequestIssue>> {
  const body = boundFarmPurchaseRequestCreateSchema.parse({
    shop: options.shop,
    shop_revision: options.shopRevision,
    items: options.items.map((item) => ({
      kind: item.kind,
      item_id: item.itemId,
      qty: item.quantity,
    })),
  });
  const idempotencyKey = farmPurchaseRequestIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/purchase-requests", {
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
  const parsed = boundFarmPurchaseRequestCreateSuccessSchema.safeParse(payload);
  return parsed.success && requestItemsMatch(options, parsed.data)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export function farmPurchaseRequestIssueMessage(issue: FarmPurchaseRequestIssue): string {
  switch (issue.code) {
    case "shop_changed":
      return "商品状态已变化，请刷新后重新确认。";
    case "idempotency_conflict":
      return "这次购物请求和之前的内容不一致，请重新打开购物车。";
    case "operation_not_allowed":
      return "当前商品不能由 TA 购买。";
    case "farm_unavailable":
      return "农场暂时无法处理，请稍后再试。";
    case "onebot_unavailable":
      return "现在无法联系 TA，请稍后再试。";
    case "network_unavailable":
      return "现在连不上 Doorbell，请稍后再试。";
    case "unexpected_response":
      return "请求结果无法识别，请稍后再试。";
    default:
      return issue.serverMessage || "这次请求没有完成，请稍后再试。";
  }
}

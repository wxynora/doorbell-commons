import {
  type BoundFarmMarketActionSuccess,
  boundFarmMarketActionErrorSchema,
  boundFarmMarketActionRequestSchema,
  boundFarmMarketActionSuccessSchema,
  type FarmMarketListingKind,
  farmMarketActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

type MarketActionBinding = {
  expectedFarmDoorplate: string;
  idempotencyKey: string;
  expectedRevision: string;
};

export type MarketActionInput =
  | (MarketActionBinding & { action: "browse" })
  | (MarketActionBinding & {
      action: "list";
      kind: FarmMarketListingKind;
      itemId: string;
      quantity: number;
      price?: number | undefined;
    })
  | (MarketActionBinding & {
      action: "buy";
      sellerDoorplate: string;
      kind: FarmMarketListingKind;
      itemId: string;
      quantity: number;
    })
  | (MarketActionBinding & {
      action: "unlist";
      kind: FarmMarketListingKind;
      itemId: string;
    })
  | (MarketActionBinding & {
      action: "barter-list";
      giveKind: FarmMarketListingKind;
      giveItemId: string;
      giveQuantity: number;
      wantKind: FarmMarketListingKind;
      wantItemId: string;
      wantQuantity: number;
    })
  | (MarketActionBinding & {
      action: "barter-accept";
      sellerDoorplate: string;
      listingId: string;
    })
  | (MarketActionBinding & {
      action: "barter-unlist";
      listingId: string;
    })
  | (MarketActionBinding & {
      action: "purchase-order-list";
      kind: FarmMarketListingKind;
      itemId: string;
      quantity: number;
      price: number;
    })
  | (MarketActionBinding & {
      action: "purchase-order-fulfill";
      orderOwnerDoorplate: string;
      listingId: string;
      quantity: number;
    })
  | (MarketActionBinding & {
      action: "purchase-order-unlist";
      listingId: string;
    })
  | (MarketActionBinding & {
      action: "mystery-merchant-buy";
      items: string[];
    });

export type BoundMarketAction = BoundFarmMarketActionSuccess;
export type MarketActionIssueCode =
  | ReturnType<typeof boundFarmMarketActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface MarketActionIssue {
  code: MarketActionIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

type MarketActionOptions = MarketActionInput & {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
};

function clientIssue(code: ClientIssueCode): MarketActionIssue {
  return { code, currentRevision: null, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): MarketActionIssue {
  const parsed = boundFarmMarketActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentRevision: parsed.data.error.current_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function requestActionFields(input: MarketActionInput): Record<string, unknown> {
  switch (input.action) {
    case "browse":
      return { action: input.action };
    case "list":
      return {
        action: input.action,
        kind: input.kind,
        item_id: input.itemId,
        qty: input.quantity,
        ...(input.price === undefined ? {} : { price: input.price }),
      };
    case "buy":
      return {
        action: input.action,
        seller_doorplate: input.sellerDoorplate,
        kind: input.kind,
        item_id: input.itemId,
        qty: input.quantity,
      };
    case "unlist":
      return { action: input.action, kind: input.kind, item_id: input.itemId };
    case "barter-list":
      return {
        action: input.action,
        give_kind: input.giveKind,
        give_item_id: input.giveItemId,
        give_qty: input.giveQuantity,
        want_kind: input.wantKind,
        want_item_id: input.wantItemId,
        want_qty: input.wantQuantity,
      };
    case "barter-accept":
      return {
        action: input.action,
        seller_doorplate: input.sellerDoorplate,
        listing_id: input.listingId,
      };
    case "barter-unlist":
      return { action: input.action, listing_id: input.listingId };
    case "purchase-order-list":
      return {
        action: input.action,
        kind: input.kind,
        item_id: input.itemId,
        qty: input.quantity,
        price: input.price,
      };
    case "purchase-order-fulfill":
      return {
        action: input.action,
        order_owner_doorplate: input.orderOwnerDoorplate,
        listing_id: input.listingId,
        qty: input.quantity,
      };
    case "purchase-order-unlist":
      return { action: input.action, listing_id: input.listingId };
    case "mystery-merchant-buy":
      return {
        action: input.action,
        items: input.items,
      };
  }
}

function revisionMatchesAction(
  result: BoundMarketAction,
  expectedRevision: string,
  action: MarketActionInput["action"],
): boolean {
  return action === "browse"
    ? result.revision === expectedRevision
    : result.revision !== expectedRevision;
}

function isCrossFarmSuccess(
  result: BoundMarketAction,
): result is Extract<BoundMarketAction, { seller_revision: string }> {
  return "seller_revision" in result;
}

function isPurchaseOrderFulfillSuccess(
  result: BoundMarketAction,
): result is Extract<BoundMarketAction, { order_owner_revision: string }> {
  return "order_owner_revision" in result;
}

function resultMatchesInput(result: BoundMarketAction, input: MarketActionInput): boolean {
  if (input.action === "purchase-order-fulfill") {
    if (!isPurchaseOrderFulfillSuccess(result)) return false;
    const actionResult = result.data.result;
    return (
      result.data.fulfiller_doorplate === input.expectedFarmDoorplate &&
      result.data.order_owner_doorplate === input.orderOwnerDoorplate &&
      actionResult.receipt_id === input.idempotencyKey &&
      actionResult.action === "purchase-order-fulfill" &&
      actionResult.outcome.order_owner_doorplate === input.orderOwnerDoorplate &&
      actionResult.outcome.listing_id === input.listingId &&
      actionResult.outcome.quantity > 0 &&
      actionResult.outcome.quantity <= input.quantity
    );
  }
  const actionResult = result.data.result;
  if (input.action === "buy" || input.action === "barter-accept") {
    if (!isCrossFarmSuccess(result) || isPurchaseOrderFulfillSuccess(result)) return false;
    if (
      result.data.buyer_doorplate !== input.expectedFarmDoorplate ||
      result.data.seller_doorplate !== input.sellerDoorplate
    ) {
      return false;
    }
    if (actionResult.receipt_id !== input.idempotencyKey || actionResult.action !== input.action) {
      return false;
    }

    if (input.action === "buy") {
      return (
        actionResult.action === "buy" &&
        actionResult.outcome.seller_doorplate === input.sellerDoorplate &&
        actionResult.outcome.kind === input.kind &&
        actionResult.outcome.item_id === input.itemId &&
        actionResult.outcome.quantity === input.quantity
      );
    }

    return (
      actionResult.action === "barter-accept" &&
      actionResult.outcome.seller_doorplate === input.sellerDoorplate &&
      actionResult.outcome.listing_id === input.listingId
    );
  }
  if (isCrossFarmSuccess(result) || isPurchaseOrderFulfillSuccess(result)) return false;

  const singleFarmActionResult = result.data.result;
  if (
    singleFarmActionResult.receipt_id !== input.idempotencyKey ||
    singleFarmActionResult.action !== input.action
  ) {
    return false;
  }

  switch (input.action) {
    case "browse":
      return singleFarmActionResult.action === "browse" && singleFarmActionResult.outcome === null;
    case "list":
      return (
        singleFarmActionResult.action === "list" &&
        singleFarmActionResult.outcome.kind === input.kind &&
        singleFarmActionResult.outcome.item_id === input.itemId &&
        singleFarmActionResult.outcome.quantity === input.quantity &&
        (input.price === undefined || singleFarmActionResult.outcome.price === input.price)
      );
    case "unlist":
      return (
        singleFarmActionResult.action === "unlist" &&
        singleFarmActionResult.outcome.kind === input.kind &&
        singleFarmActionResult.outcome.item_id === input.itemId
      );
    case "barter-list":
      return (
        singleFarmActionResult.action === "barter-list" &&
        singleFarmActionResult.outcome.give.kind === input.giveKind &&
        singleFarmActionResult.outcome.give.item_id === input.giveItemId &&
        singleFarmActionResult.outcome.give.quantity === input.giveQuantity &&
        singleFarmActionResult.outcome.want.kind === input.wantKind &&
        singleFarmActionResult.outcome.want.item_id === input.wantItemId &&
        singleFarmActionResult.outcome.want.quantity === input.wantQuantity
      );
    case "barter-unlist":
      return (
        singleFarmActionResult.action === "barter-unlist" &&
        singleFarmActionResult.outcome.listing_id === input.listingId
      );
    case "purchase-order-list":
      return (
        singleFarmActionResult.action === "purchase-order-list" &&
        singleFarmActionResult.outcome.kind === input.kind &&
        singleFarmActionResult.outcome.item_id === input.itemId &&
        singleFarmActionResult.outcome.quantity === input.quantity &&
        singleFarmActionResult.outcome.price === input.price
      );
    case "purchase-order-unlist":
      return (
        singleFarmActionResult.action === "purchase-order-unlist" &&
        singleFarmActionResult.outcome.listing_id === input.listingId
      );
    case "mystery-merchant-buy":
      return (
        singleFarmActionResult.action === "mystery-merchant-buy" &&
        singleFarmActionResult.outcome.items.length === input.items.length &&
        singleFarmActionResult.outcome.items.every(
          (item, index) => item.item_id === input.items[index],
        ) &&
        singleFarmActionResult.outcome.host_farm_doorplate.length === 6
      );
  }
}

export async function executeBoundMarketAction(
  options: MarketActionOptions,
): Promise<ApiResult<BoundMarketAction, MarketActionIssue>> {
  const body = boundFarmMarketActionRequestSchema.parse({
    expected_revision: options.expectedRevision,
    ...requestActionFields(options),
  });
  const idempotencyKey = farmMarketActionIdempotencyKeySchema.parse(options.idempotencyKey);
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/market/actions", {
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

  const parsed = boundFarmMarketActionSuccessSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, issue: clientIssue("unexpected_response") };
  if (
    !isCrossFarmSuccess(parsed.data) &&
    !isPurchaseOrderFulfillSuccess(parsed.data) &&
    parsed.data.data.resource.farm.farm_doorplate !== options.expectedFarmDoorplate
  ) {
    return { ok: false, issue: clientIssue("unexpected_response") };
  }
  if (
    !resultMatchesInput(parsed.data, options) ||
    !revisionMatchesAction(parsed.data, options.expectedRevision, options.action)
  ) {
    return { ok: false, issue: clientIssue("unexpected_response") };
  }
  return { ok: true, data: parsed.data };
}

export const executeMarketAction = executeBoundMarketAction;
export const postBoundMarketAction = executeBoundMarketAction;

export function marketActionIssueMessage(issue: MarketActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上农场集市，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "集市动作返回了无法识别的数据，请稍后再试。";
  }
  if (issue.code === "insufficient_funds") {
    return "可用余额不足，本次操作没有执行";
  }
  if (issue.code === "already_bought") {
    return "这一轮你已经买过这件商品了。";
  }
  if (issue.code === "merchant_not_present") {
    return "神秘商人现在不在。";
  }
  if (issue.code === "merchant_not_visible") {
    return "这次出现的地点还没有被发现。";
  }
  if (issue.code === "offer_not_found") {
    return "这件商品已经不在当前货架上。";
  }
  if (issue.code === "quantity_invalid") {
    return "神秘商人的商品每次只能购买一份。";
  }
  return issue.serverMessage || "集市动作暂时不可用，请稍后再试。";
}

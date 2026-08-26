import {
  type BoundFarmKitchenInventoryActionSuccess,
  boundFarmKitchenInventoryActionErrorSchema,
  boundFarmKitchenInventoryActionRequestSchema,
  boundFarmKitchenInventoryActionSuccessSchema,
  type FarmKitchenInventoryActionTarget,
  type FarmKitchenInventoryItemKind,
  farmKitchenInventoryActionIdempotencyKeySchema,
} from "@doorbell/protocol";
import type { ApiResult, ClientIssueCode, FrontendFetcher } from "./auth-client";

interface KitchenInventoryActionInputBase {
  expectedFarmDoorplate: string;
  idempotencyKey: string;
  expectedInventoryRevision: string;
}

export type KitchenInventoryActionInput =
  | (KitchenInventoryActionInputBase & {
      action: "use";
      dishInstanceId: string;
      target: FarmKitchenInventoryActionTarget;
    })
  | (KitchenInventoryActionInputBase & {
      action: "recycle";
      itemKind: FarmKitchenInventoryItemKind;
      itemInstanceIds: string[];
      quantity: number;
    })
  | (KitchenInventoryActionInputBase & {
      action: "stall";
      itemInstanceIds: string[];
      quantity: number;
      price: number;
    })
  | (KitchenInventoryActionInputBase & {
      action: "sell_fish";
      catchInstanceIds: string[];
      quantity: number;
    })
  | (KitchenInventoryActionInputBase & {
      action: "sell_treasure";
      treasureItemId: string;
      quantity: number;
    });

export type BoundKitchenInventoryAction = BoundFarmKitchenInventoryActionSuccess;
export type KitchenInventoryActionIssueCode =
  | ReturnType<typeof boundFarmKitchenInventoryActionErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface KitchenInventoryActionIssue {
  code: KitchenInventoryActionIssueCode;
  currentInventoryRevision: string | null;
  serverMessage: string | null;
}

type KitchenInventoryActionOptions = KitchenInventoryActionInput & {
  fetcher?: FrontendFetcher;
  signal?: AbortSignal;
};

function clientIssue(code: ClientIssueCode): KitchenInventoryActionIssue {
  return { code, currentInventoryRevision: null, serverMessage: null };
}

function actionFields(input: KitchenInventoryActionInput): Record<string, unknown> {
  switch (input.action) {
    case "use":
      return {
        action: input.action,
        dish_instance_id: input.dishInstanceId,
        target: input.target,
      };
    case "recycle":
      return {
        action: input.action,
        item_kind: input.itemKind,
        item_instance_ids: input.itemInstanceIds,
        quantity: input.quantity,
      };
    case "stall":
      return {
        action: input.action,
        item_instance_ids: input.itemInstanceIds,
        quantity: input.quantity,
        price: input.price,
      };
    case "sell_fish":
      return {
        action: input.action,
        catch_instance_ids: input.catchInstanceIds,
        quantity: input.quantity,
      };
    case "sell_treasure":
      return {
        action: input.action,
        treasure_item_id: input.treasureItemId,
        quantity: input.quantity,
      };
  }
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseServerIssue(payload: unknown): KitchenInventoryActionIssue {
  const parsed = boundFarmKitchenInventoryActionErrorSchema.safeParse(payload);
  return parsed.success
    ? {
        code: parsed.data.error.code,
        currentInventoryRevision: parsed.data.error.current_kitchen_inventory_revision ?? null,
        serverMessage: parsed.data.error.message,
      }
    : clientIssue("unexpected_response");
}

function resultMatchesInput(
  result: BoundKitchenInventoryAction,
  input: KitchenInventoryActionInput,
): boolean {
  const actionResult = result.data.result;
  if (
    result.data.resource.farm.farm_doorplate !== input.expectedFarmDoorplate ||
    result.kitchen_inventory_revision === input.expectedInventoryRevision ||
    actionResult.receipt_id !== input.idempotencyKey ||
    actionResult.action !== input.action ||
    actionResult.outcome.kind !== input.action
  ) {
    return false;
  }

  switch (input.action) {
    case "use":
      return (
        actionResult.outcome.kind === "use" &&
        actionResult.outcome.dish_instance_id === input.dishInstanceId &&
        actionResult.outcome.target === input.target
      );
    case "recycle":
      return (
        actionResult.outcome.kind === "recycle" &&
        actionResult.outcome.item_kind === input.itemKind &&
        actionResult.outcome.quantity === input.quantity
      );
    case "stall":
      return (
        actionResult.outcome.kind === "stall" &&
        actionResult.outcome.item_kind === null &&
        actionResult.outcome.quantity === input.quantity &&
        actionResult.outcome.price === input.price
      );
    case "sell_fish":
      return (
        actionResult.outcome.kind === "sell_fish" &&
        actionResult.outcome.quantity === input.quantity
      );
    case "sell_treasure":
      return (
        actionResult.outcome.kind === "sell_treasure" &&
        actionResult.outcome.item_id === input.treasureItemId &&
        actionResult.outcome.quantity === input.quantity
      );
  }
}

export async function executeBoundKitchenInventoryAction(
  options: KitchenInventoryActionOptions,
): Promise<ApiResult<BoundKitchenInventoryAction, KitchenInventoryActionIssue>> {
  const body = boundFarmKitchenInventoryActionRequestSchema.parse({
    expected_kitchen_inventory_revision: options.expectedInventoryRevision,
    ...actionFields(options),
  });
  const idempotencyKey = farmKitchenInventoryActionIdempotencyKeySchema.parse(
    options.idempotencyKey,
  );
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher("/api/farm/kitchen/inventory/actions", {
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

  const parsed = boundFarmKitchenInventoryActionSuccessSchema.safeParse(payload);
  return parsed.success && resultMatchesInput(parsed.data, options)
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export const postBoundKitchenInventoryAction = executeBoundKitchenInventoryAction;
export const executeKitchenInventoryAction = executeBoundKitchenInventoryAction;

export function kitchenInventoryActionIssueMessage(issue: KitchenInventoryActionIssue): string {
  if (issue.code === "network_unavailable") {
    return "现在连不上料理库存，请稍后再试。";
  }
  if (issue.code === "unexpected_response") {
    return "料理库存动作返回了无法识别的数据，请稍后再试。";
  }
  return issue.serverMessage || "料理库存动作暂时不可用，请稍后再试。";
}

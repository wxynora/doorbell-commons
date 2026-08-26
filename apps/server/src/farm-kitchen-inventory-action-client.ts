import {
  type FarmHumanKitchenInventoryActionError,
  type FarmHumanKitchenInventoryActionSuccess,
  type FarmKitchenInventoryActionTarget,
  type FarmKitchenInventoryItemKind,
  farmHumanKitchenInventoryActionErrorSchema,
  farmHumanKitchenInventoryActionRequestSchema,
  farmHumanKitchenInventoryActionSuccessSchema,
} from "@doorbell/protocol";

interface FarmHumanKitchenInventoryActionInputBase {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedInventoryRevision: string;
  idempotencyKey: string;
}

export type FarmHumanKitchenInventoryActionInput =
  | (FarmHumanKitchenInventoryActionInputBase & {
      action: "use";
      dishInstanceId: string;
      target: FarmKitchenInventoryActionTarget;
    })
  | (FarmHumanKitchenInventoryActionInputBase & {
      action: "recycle";
      itemKind: FarmKitchenInventoryItemKind;
      itemInstanceIds: string[];
      quantity: number;
    })
  | (FarmHumanKitchenInventoryActionInputBase & {
      action: "stall";
      itemInstanceIds: string[];
      quantity: number;
      price: number;
    })
  | (FarmHumanKitchenInventoryActionInputBase & {
      action: "sell_fish";
      catchInstanceIds: string[];
      quantity: number;
    })
  | (FarmHumanKitchenInventoryActionInputBase & {
      action: "sell_treasure";
      treasureItemId: string;
      quantity: number;
    });

export interface FarmHumanKitchenInventoryActioner {
  executeKitchenInventoryAction(
    input: FarmHumanKitchenInventoryActionInput,
  ): Promise<FarmHumanKitchenInventoryActionSuccess>;
}

export class FarmHumanKitchenInventoryActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanKitchenInventoryActionCredentialInvalidError";
  }
}

export class FarmHumanKitchenInventoryActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanKitchenInventoryActionNotFoundError";
  }
}

export class FarmHumanKitchenInventoryActionUnavailableError extends Error {
  constructor() {
    super("The farm kitchen inventory action service is unavailable");
    this.name = "FarmHumanKitchenInventoryActionUnavailableError";
  }
}

export class FarmHumanKitchenInventoryActionContractUnavailableError extends Error {
  constructor() {
    super("The farm kitchen inventory action response could not be verified");
    this.name = "FarmHumanKitchenInventoryActionContractUnavailableError";
  }
}

export class FarmHumanKitchenInventoryActionStateConflictError extends Error {
  readonly currentInventoryRevision: string | undefined;

  constructor(currentInventoryRevision?: string) {
    super("The kitchen inventory has changed");
    this.name = "FarmHumanKitchenInventoryActionStateConflictError";
    this.currentInventoryRevision = currentInventoryRevision;
  }
}

export class FarmHumanKitchenInventoryActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanKitchenInventoryActionRejectedError";
  }
}

export class FarmHumanKitchenInventoryActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanKitchenInventoryActionIdempotencyConflictError";
  }
}

interface FarmHumanKitchenInventoryActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function actionFields(input: FarmHumanKitchenInventoryActionInput): Record<string, unknown> {
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

function resultMatchesInput(
  result: FarmHumanKitchenInventoryActionSuccess,
  input: FarmHumanKitchenInventoryActionInput,
): boolean {
  const actionResult = result.data.result;
  if (
    result.data.resource.farm.farm_doorplate !== input.farmDoorplate ||
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

export class FarmHumanKitchenInventoryActionClient implements FarmHumanKitchenInventoryActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanKitchenInventoryActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Kitchen Inventory Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL("internal/doorbell/human/kitchen/inventory/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeKitchenInventoryAction(
    input: FarmHumanKitchenInventoryActionInput,
  ): Promise<FarmHumanKitchenInventoryActionSuccess> {
    const requestBody = farmHumanKitchenInventoryActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_kitchen_inventory_revision: input.expectedInventoryRevision,
      ...actionFields(input),
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#actionEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanKitchenInventoryActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanKitchenInventoryActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanKitchenInventoryActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanKitchenInventoryActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanKitchenInventoryActionSuccessSchema.safeParse(payload);
      if (!parsed.success || !resultMatchesInput(parsed.data, input)) {
        throw new FarmHumanKitchenInventoryActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanKitchenInventoryActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanKitchenInventoryActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async executeInventoryAction(
    input: FarmHumanKitchenInventoryActionInput,
  ): Promise<FarmHumanKitchenInventoryActionSuccess> {
    return this.executeKitchenInventoryAction(input);
  }

  #throwActionError(parsedError: FarmHumanKitchenInventoryActionError, status: number): never {
    const { code, current_kitchen_inventory_revision: currentInventoryRevision } =
      parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanKitchenInventoryActionStateConflictError(currentInventoryRevision);
      case "action_rejected":
        throw new FarmHumanKitchenInventoryActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanKitchenInventoryActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanKitchenInventoryActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanKitchenInventoryActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanKitchenInventoryActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanKitchenInventoryActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanKitchenInventoryActionUnavailableError()
          : new FarmHumanKitchenInventoryActionContractUnavailableError();
    }
    throw new FarmHumanKitchenInventoryActionContractUnavailableError();
  }
}

export const FarmHumanKitchenInventoryClient = FarmHumanKitchenInventoryActionClient;

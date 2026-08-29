import {
  type FarmHumanKitchenCookError,
  type FarmHumanKitchenCookSuccess,
  farmHumanKitchenCookErrorSchema,
  farmHumanKitchenCookRequestSchema,
  farmHumanKitchenCookSuccessSchema,
} from "@doorbell/protocol";

interface FarmHumanKitchenCookInputBase {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedKitchenInventoryRevision: string;
  idempotencyKey: string;
}

export type FarmHumanKitchenCookInput = FarmHumanKitchenCookInputBase &
  ({ items: string[]; recipeId?: never } | { items?: never; recipeId: string });

export interface FarmHumanKitchenCooker {
  cookKitchen(input: FarmHumanKitchenCookInput): Promise<FarmHumanKitchenCookSuccess>;
}

export class FarmHumanKitchenCookCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanKitchenCookCredentialInvalidError";
  }
}

export class FarmHumanKitchenCookNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanKitchenCookNotFoundError";
  }
}

export class FarmHumanKitchenCookUnavailableError extends Error {
  constructor() {
    super("The farm kitchen cook service is unavailable");
    this.name = "FarmHumanKitchenCookUnavailableError";
  }
}

export class FarmHumanKitchenCookContractUnavailableError extends Error {
  constructor() {
    super("The farm kitchen cook response could not be verified");
    this.name = "FarmHumanKitchenCookContractUnavailableError";
  }
}

export class FarmHumanKitchenCookStateConflictError extends Error {
  readonly currentKitchenInventoryRevision: string | undefined;

  constructor(currentKitchenInventoryRevision?: string) {
    super("The kitchen inventory has changed");
    this.name = "FarmHumanKitchenCookStateConflictError";
    this.currentKitchenInventoryRevision = currentKitchenInventoryRevision;
  }
}

export class FarmHumanKitchenCookRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanKitchenCookRejectedError";
  }
}

export class FarmHumanKitchenCookIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanKitchenCookIdempotencyConflictError";
  }
}

interface FarmHumanKitchenCookClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function itemRefsMatch(requestItems: string[], receiptItems: string[]): boolean {
  return (
    requestItems.length === receiptItems.length &&
    requestItems.every((item, index) => receiptItems[index] === item)
  );
}

function resultMatchesInput(
  result: FarmHumanKitchenCookSuccess,
  input: FarmHumanKitchenCookInput,
): boolean {
  const receipt = result.data.result;
  return (
    result.data.resource.farm.farm_doorplate === input.farmDoorplate &&
    receipt.receipt_id === input.idempotencyKey &&
    receipt.outcome.kind === "cook" &&
    ("recipeId" in input
      ? receipt.outcome.recipe_id === input.recipeId
      : itemRefsMatch(input.items, receipt.outcome.item_refs)) &&
    result.kitchen_inventory_revision !== input.expectedKitchenInventoryRevision
  );
}

export class FarmHumanKitchenCookClient implements FarmHumanKitchenCooker {
  readonly #cookEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanKitchenCookClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Kitchen Cook API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#cookEndpoint = new URL("internal/doorbell/human/kitchen/cook", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async cookKitchen(input: FarmHumanKitchenCookInput): Promise<FarmHumanKitchenCookSuccess> {
    const requestBody = farmHumanKitchenCookRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_kitchen_inventory_revision: input.expectedKitchenInventoryRevision,
      ...("recipeId" in input ? { recipe_id: input.recipeId } : { items: input.items }),
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#cookEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanKitchenCookUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanKitchenCookContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanKitchenCookUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanKitchenCookContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanKitchenCookSuccessSchema.safeParse(payload);
      if (!parsed.success || !resultMatchesInput(parsed.data, input)) {
        throw new FarmHumanKitchenCookContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanKitchenCookErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanKitchenCookContractUnavailableError();
    }
    this.#throwCookError(serviceError.data, response.status);
  }

  #throwCookError(parsedError: FarmHumanKitchenCookError, status: number): never {
    const { code, current_kitchen_inventory_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanKitchenCookStateConflictError(currentRevision);
      case "cook_rejected":
        throw new FarmHumanKitchenCookRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanKitchenCookIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanKitchenCookCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanKitchenCookNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanKitchenCookUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanKitchenCookContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanKitchenCookUnavailableError()
          : new FarmHumanKitchenCookContractUnavailableError();
    }
    throw new FarmHumanKitchenCookContractUnavailableError();
  }
}

export const FarmHumanKitchenCookActionClient = FarmHumanKitchenCookClient;

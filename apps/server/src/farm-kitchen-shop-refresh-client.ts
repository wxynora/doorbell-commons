import {
  type FarmHumanKitchenShopRefreshError,
  type FarmHumanKitchenShopRefreshSuccess,
  farmHumanKitchenShopRefreshErrorSchema,
  farmHumanKitchenShopRefreshRequestSchema,
  farmHumanKitchenShopRefreshSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanKitchenShopRefreshInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedShopRevision: string;
  idempotencyKey: string;
}

export interface FarmHumanKitchenShopRefresher {
  refreshKitchenShop(
    input: FarmHumanKitchenShopRefreshInput,
  ): Promise<FarmHumanKitchenShopRefreshSuccess>;
}

export class FarmHumanKitchenShopRefreshCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanKitchenShopRefreshCredentialInvalidError";
  }
}

export class FarmHumanKitchenShopRefreshNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanKitchenShopRefreshNotFoundError";
  }
}

export class FarmHumanKitchenShopRefreshUnavailableError extends Error {
  constructor() {
    super("The farm kitchen shop refresh service is unavailable");
    this.name = "FarmHumanKitchenShopRefreshUnavailableError";
  }
}

export class FarmHumanKitchenShopRefreshContractUnavailableError extends Error {
  constructor() {
    super("The farm kitchen shop refresh response could not be verified");
    this.name = "FarmHumanKitchenShopRefreshContractUnavailableError";
  }
}

export class FarmHumanKitchenShopRefreshStateConflictError extends Error {
  readonly currentShopRevision: string | undefined;

  constructor(currentShopRevision?: string) {
    super("The kitchen shop or state has changed");
    this.name = "FarmHumanKitchenShopRefreshStateConflictError";
    this.currentShopRevision = currentShopRevision;
  }
}

export class FarmHumanKitchenShopRefreshShopUnavailableError extends Error {
  constructor() {
    super("The current kitchen shop is unavailable");
    this.name = "FarmHumanKitchenShopRefreshShopUnavailableError";
  }
}

export class FarmHumanKitchenShopRefreshRejectedError extends Error {
  readonly code: "refresh_exhausted" | "insufficient_coins";

  constructor(code: "refresh_exhausted" | "insufficient_coins", message: string) {
    super(message);
    this.name = "FarmHumanKitchenShopRefreshRejectedError";
    this.code = code;
  }
}

export class FarmHumanKitchenShopRefreshIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanKitchenShopRefreshIdempotencyConflictError";
  }
}

interface FarmHumanKitchenShopRefreshClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanKitchenShopRefreshClient implements FarmHumanKitchenShopRefresher {
  readonly #refreshEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanKitchenShopRefreshClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Kitchen Shop Refresh API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#refreshEndpoint = new URL(
      "internal/doorbell/human/kitchen/shop/refresh",
      apiBaseUrl,
    );
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async refreshKitchenShop(
    input: FarmHumanKitchenShopRefreshInput,
  ): Promise<FarmHumanKitchenShopRefreshSuccess> {
    const requestBody = farmHumanKitchenShopRefreshRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_shop_revision: input.expectedShopRevision,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#refreshEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanKitchenShopRefreshUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanKitchenShopRefreshContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanKitchenShopRefreshUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanKitchenShopRefreshContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanKitchenShopRefreshSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate ||
        parsed.data.shop_revision === input.expectedShopRevision ||
        !this.#resultMatchesResource(parsed.data)
      ) {
        throw new FarmHumanKitchenShopRefreshContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanKitchenShopRefreshErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanKitchenShopRefreshContractUnavailableError();
    }
    this.#throwRefreshError(serviceError.data, response.status);
  }

  #resultMatchesResource(result: FarmHumanKitchenShopRefreshSuccess): boolean {
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

  #throwRefreshError(parsedError: FarmHumanKitchenShopRefreshError, status: number): never {
    const { code, current_shop_revision: currentShopRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanKitchenShopRefreshStateConflictError(currentShopRevision);
      case "shop_unavailable":
        throw new FarmHumanKitchenShopRefreshShopUnavailableError();
      case "refresh_exhausted":
      case "insufficient_coins":
        throw new FarmHumanKitchenShopRefreshRejectedError(code, parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanKitchenShopRefreshIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanKitchenShopRefreshCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanKitchenShopRefreshNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanKitchenShopRefreshUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanKitchenShopRefreshContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanKitchenShopRefreshUnavailableError()
          : new FarmHumanKitchenShopRefreshContractUnavailableError();
    }
    throw new FarmHumanKitchenShopRefreshContractUnavailableError();
  }
}

export const FarmHumanKitchenIngredientRefreshClient = FarmHumanKitchenShopRefreshClient;

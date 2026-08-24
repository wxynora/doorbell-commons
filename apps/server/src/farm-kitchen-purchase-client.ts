import {
  type FarmHumanKitchenPurchaseError,
  type FarmHumanKitchenPurchaseSuccess,
  type FarmKitchenPurchaseKind,
  farmHumanKitchenPurchaseErrorSchema,
  farmHumanKitchenPurchaseRequestSchema,
  farmHumanKitchenPurchaseSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanKitchenPurchaseInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedShopRevision: string;
  idempotencyKey: string;
  kind: FarmKitchenPurchaseKind;
  itemId: string;
  quantity: number;
}

export interface FarmHumanKitchenPurchaser {
  purchaseKitchen(input: FarmHumanKitchenPurchaseInput): Promise<FarmHumanKitchenPurchaseSuccess>;
}

export class FarmHumanKitchenPurchaseCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanKitchenPurchaseCredentialInvalidError";
  }
}

export class FarmHumanKitchenPurchaseNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanKitchenPurchaseNotFoundError";
  }
}

export class FarmHumanKitchenPurchaseUnavailableError extends Error {
  constructor() {
    super("The farm kitchen purchase service is unavailable");
    this.name = "FarmHumanKitchenPurchaseUnavailableError";
  }
}

export class FarmHumanKitchenPurchaseContractUnavailableError extends Error {
  constructor() {
    super("The farm kitchen purchase response could not be verified");
    this.name = "FarmHumanKitchenPurchaseContractUnavailableError";
  }
}

export class FarmHumanKitchenPurchaseStateConflictError extends Error {
  readonly currentShopRevision: string | undefined;

  constructor(currentShopRevision?: string) {
    super("The kitchen shop or state has changed");
    this.name = "FarmHumanKitchenPurchaseStateConflictError";
    this.currentShopRevision = currentShopRevision;
  }
}

export class FarmHumanKitchenPurchaseShopChangedError extends Error {
  readonly currentShopRevision: string | undefined;

  constructor(currentShopRevision?: string) {
    super("The kitchen shop has changed");
    this.name = "FarmHumanKitchenPurchaseShopChangedError";
    this.currentShopRevision = currentShopRevision;
  }
}

export class FarmHumanKitchenPurchaseShopUnavailableError extends Error {
  constructor() {
    super("The current kitchen shop is unavailable");
    this.name = "FarmHumanKitchenPurchaseShopUnavailableError";
  }
}

export class FarmHumanKitchenPurchaseRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanKitchenPurchaseRejectedError";
  }
}

export class FarmHumanKitchenPurchaseIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanKitchenPurchaseIdempotencyConflictError";
  }
}

interface FarmHumanKitchenPurchaseClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanKitchenPurchaseClient implements FarmHumanKitchenPurchaser {
  readonly #purchaseEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanKitchenPurchaseClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Kitchen Purchase API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#purchaseEndpoint = new URL("internal/doorbell/human/kitchen/purchase", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async purchaseKitchen(
    input: FarmHumanKitchenPurchaseInput,
  ): Promise<FarmHumanKitchenPurchaseSuccess> {
    const requestBody = farmHumanKitchenPurchaseRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_shop_revision: input.expectedShopRevision,
      kind: input.kind,
      item_id: input.itemId,
      quantity: input.quantity,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#purchaseEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanKitchenPurchaseUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanKitchenPurchaseContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanKitchenPurchaseUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanKitchenPurchaseContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanKitchenPurchaseSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.result.kind !== input.kind ||
        parsed.data.data.result.item_id !== input.itemId ||
        parsed.data.data.result.quantity !== input.quantity ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate
      ) {
        throw new FarmHumanKitchenPurchaseContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanKitchenPurchaseErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanKitchenPurchaseContractUnavailableError();
    }
    this.#throwPurchaseError(serviceError.data, response.status);
  }

  #throwPurchaseError(parsedError: FarmHumanKitchenPurchaseError, status: number): never {
    const { code, current_shop_revision: currentShopRevision } = parsedError.error;
    switch (code) {
      case "shop_changed":
        throw new FarmHumanKitchenPurchaseShopChangedError(currentShopRevision);
      case "state_conflict":
        throw new FarmHumanKitchenPurchaseStateConflictError(currentShopRevision);
      case "shop_unavailable":
        throw new FarmHumanKitchenPurchaseShopUnavailableError();
      case "purchase_rejected":
        throw new FarmHumanKitchenPurchaseRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanKitchenPurchaseIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanKitchenPurchaseCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanKitchenPurchaseNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanKitchenPurchaseUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanKitchenPurchaseContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanKitchenPurchaseUnavailableError()
          : new FarmHumanKitchenPurchaseContractUnavailableError();
    }
    throw new FarmHumanKitchenPurchaseContractUnavailableError();
  }
}

export const FarmHumanKitchenPurchaseActionClient = FarmHumanKitchenPurchaseClient;

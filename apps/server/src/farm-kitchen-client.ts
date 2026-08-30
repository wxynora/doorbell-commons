import {
  type FarmHumanKitchenReadError,
  type FarmHumanKitchenReadSuccess,
  type FarmHumanKitchenShopOpenError,
  type FarmHumanKitchenShopOpenSuccess,
  farmHumanKitchenReadErrorSchema,
  farmHumanKitchenReadRequestSchema,
  farmHumanKitchenReadSuccessSchema,
  farmHumanKitchenShopOpenErrorSchema,
  farmHumanKitchenShopOpenRequestSchema,
  farmHumanKitchenShopOpenSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanKitchenReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanKitchenReader {
  readKitchen(input: FarmHumanKitchenReadInput): Promise<FarmHumanKitchenReadSuccess>;
}

export interface FarmHumanKitchenShopOpenInput extends FarmHumanKitchenReadInput {
  expectedShopRevision: string;
  idempotencyKey: string;
}

export interface FarmHumanKitchenShopOpener {
  openKitchenShop(input: FarmHumanKitchenShopOpenInput): Promise<FarmHumanKitchenShopOpenSuccess>;
}

export class FarmHumanKitchenCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanKitchenCredentialInvalidError";
  }
}

export class FarmHumanKitchenNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanKitchenNotFoundError";
  }
}

export class FarmHumanKitchenUnavailableError extends Error {
  constructor() {
    super("The farm kitchen service is unavailable");
    this.name = "FarmHumanKitchenUnavailableError";
  }
}

export class FarmHumanKitchenContractUnavailableError extends Error {
  constructor() {
    super("The farm kitchen response could not be verified");
    this.name = "FarmHumanKitchenContractUnavailableError";
  }
}

export class FarmHumanKitchenShopOpenStateConflictError extends Error {
  readonly currentShopRevision: string | undefined;

  constructor(currentShopRevision?: string) {
    super("The kitchen shop has changed");
    this.name = "FarmHumanKitchenShopOpenStateConflictError";
    this.currentShopRevision = currentShopRevision;
  }
}

export class FarmHumanKitchenShopOpenShopUnavailableError extends Error {
  constructor() {
    super("The current kitchen shop is unavailable");
    this.name = "FarmHumanKitchenShopOpenShopUnavailableError";
  }
}

export class FarmHumanKitchenShopOpenIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanKitchenShopOpenIdempotencyConflictError";
  }
}

interface FarmHumanKitchenClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanKitchenClient implements FarmHumanKitchenReader, FarmHumanKitchenShopOpener {
  readonly #kitchenReadEndpoint: URL;
  readonly #kitchenShopOpenEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanKitchenClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm Human API timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#kitchenReadEndpoint = new URL("internal/doorbell/human/kitchen/read", apiBaseUrl);
    this.#kitchenShopOpenEndpoint = new URL(
      "internal/doorbell/human/kitchen/shop/open",
      apiBaseUrl,
    );
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readKitchen(input: FarmHumanKitchenReadInput): Promise<FarmHumanKitchenReadSuccess> {
    const requestBody = farmHumanKitchenReadRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
    });
    return this.#read(requestBody, input.farmDoorplate);
  }

  async openKitchenShop(
    input: FarmHumanKitchenShopOpenInput,
  ): Promise<FarmHumanKitchenShopOpenSuccess> {
    const requestBody = farmHumanKitchenShopOpenRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_shop_revision: input.expectedShopRevision,
    });
    let response: Response;
    try {
      response = await this.#fetch(this.#kitchenShopOpenEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanKitchenUnavailableError();
    }
    if (response.status === 502) throw new FarmHumanKitchenContractUnavailableError();
    if (response.status >= 500) throw new FarmHumanKitchenUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanKitchenContractUnavailableError();
    }
    if (response.ok) {
      const result = farmHumanKitchenShopOpenSuccessSchema.safeParse(payload);
      if (
        !result.success ||
        result.data.data.result.receipt_id !== input.idempotencyKey ||
        result.data.data.resource.farm.farm_doorplate !== input.farmDoorplate ||
        result.data.data.resource.daily_shop.status !== "available" ||
        result.data.data.resource.daily_shop.is_current_day !== true
      ) {
        throw new FarmHumanKitchenContractUnavailableError();
      }
      return result.data;
    }
    const serviceError = farmHumanKitchenShopOpenErrorSchema.safeParse(payload);
    if (!serviceError.success) throw new FarmHumanKitchenContractUnavailableError();
    this.#throwShopOpenError(serviceError.data, response.status);
  }

  async #read(
    requestBody: unknown,
    expectedDoorplate: string,
  ): Promise<FarmHumanKitchenReadSuccess> {
    let response: Response;
    try {
      response = await this.#fetch(this.#kitchenReadEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanKitchenUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanKitchenContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanKitchenUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanKitchenContractUnavailableError();
    }

    if (response.ok) {
      const result = farmHumanKitchenReadSuccessSchema.safeParse(payload);
      if (!result.success || result.data.data.farm.farm_doorplate !== expectedDoorplate) {
        throw new FarmHumanKitchenContractUnavailableError();
      }
      return result.data;
    }

    const serviceError = farmHumanKitchenReadErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanKitchenContractUnavailableError();
    }
    this.#throwReadError(serviceError.data, response.status);
  }

  #throwReadError(parsedError: FarmHumanKitchenReadError, status: number): never {
    switch (parsedError.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
        throw new FarmHumanKitchenCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanKitchenNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanKitchenUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanKitchenContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanKitchenUnavailableError()
          : new FarmHumanKitchenContractUnavailableError();
      default:
        throw new FarmHumanKitchenContractUnavailableError();
    }
  }

  #throwShopOpenError(parsedError: FarmHumanKitchenShopOpenError, status: number): never {
    switch (parsedError.error.code) {
      case "state_conflict":
        throw new FarmHumanKitchenShopOpenStateConflictError(
          parsedError.error.current_shop_revision,
        );
      case "shop_unavailable":
        throw new FarmHumanKitchenShopOpenShopUnavailableError();
      case "idempotency_conflict":
        throw new FarmHumanKitchenShopOpenIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanKitchenCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanKitchenNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanKitchenUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanKitchenContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanKitchenUnavailableError()
          : new FarmHumanKitchenContractUnavailableError();
    }
  }
}

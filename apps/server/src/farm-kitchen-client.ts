import {
  type FarmHumanKitchenReadError,
  type FarmHumanKitchenReadSuccess,
  farmHumanKitchenReadErrorSchema,
  farmHumanKitchenReadRequestSchema,
  farmHumanKitchenReadSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanKitchenReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanKitchenReader {
  readKitchen(input: FarmHumanKitchenReadInput): Promise<FarmHumanKitchenReadSuccess>;
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

interface FarmHumanKitchenClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanKitchenClient implements FarmHumanKitchenReader {
  readonly #kitchenReadEndpoint: URL;
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
}

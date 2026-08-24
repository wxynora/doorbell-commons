import {
  type FarmHumanRanchReadError,
  type FarmHumanRanchReadSuccess,
  farmHumanRanchReadErrorSchema,
  farmHumanRanchReadRequestSchema,
  farmHumanRanchReadSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanRanchReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanRanchReader {
  readRanch(input: FarmHumanRanchReadInput): Promise<FarmHumanRanchReadSuccess>;
}

export class FarmHumanRanchCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanRanchCredentialInvalidError";
  }
}

export class FarmHumanRanchNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanRanchNotFoundError";
  }
}

export class FarmHumanRanchUnavailableError extends Error {
  constructor() {
    super("The farm ranch service is unavailable");
    this.name = "FarmHumanRanchUnavailableError";
  }
}

export class FarmHumanRanchContractUnavailableError extends Error {
  constructor() {
    super("The farm ranch response could not be verified");
    this.name = "FarmHumanRanchContractUnavailableError";
  }
}

interface FarmHumanRanchClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanRanchClient implements FarmHumanRanchReader {
  readonly #readEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanRanchClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Ranch API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#readEndpoint = new URL("internal/doorbell/human/ranch/read", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readRanch(input: FarmHumanRanchReadInput): Promise<FarmHumanRanchReadSuccess> {
    const requestBody = farmHumanRanchReadRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#readEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanRanchUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanRanchContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanRanchUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanRanchContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanRanchReadSuccessSchema.safeParse(payload);
      if (!parsed.success || parsed.data.data.farm.farm_doorplate !== input.farmDoorplate) {
        throw new FarmHumanRanchContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanRanchReadErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanRanchContractUnavailableError();
    }
    this.#throwReadError(serviceError.data, response.status);
  }

  #throwReadError(parsedError: FarmHumanRanchReadError, status: number): never {
    switch (parsedError.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
        throw new FarmHumanRanchCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanRanchNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanRanchUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanRanchContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanRanchUnavailableError()
          : new FarmHumanRanchContractUnavailableError();
    }
    throw new FarmHumanRanchContractUnavailableError();
  }
}

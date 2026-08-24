import {
  type FarmHumanCatalogReadError,
  type FarmHumanCatalogReadSuccess,
  farmHumanCatalogReadErrorSchema,
  farmHumanCatalogReadRequestSchema,
  farmHumanCatalogReadSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanCatalogReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanCatalogReader {
  readCatalog(input: FarmHumanCatalogReadInput): Promise<FarmHumanCatalogReadSuccess>;
}

export class FarmHumanCatalogCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanCatalogCredentialInvalidError";
  }
}

export class FarmHumanCatalogNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanCatalogNotFoundError";
  }
}

export class FarmHumanCatalogUnavailableError extends Error {
  constructor() {
    super("The farm catalog service is unavailable");
    this.name = "FarmHumanCatalogUnavailableError";
  }
}

export class FarmHumanCatalogContractUnavailableError extends Error {
  constructor() {
    super("The farm catalog response could not be verified");
    this.name = "FarmHumanCatalogContractUnavailableError";
  }
}

interface FarmHumanCatalogClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanCatalogClient implements FarmHumanCatalogReader {
  readonly #readEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanCatalogClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Catalog API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#readEndpoint = new URL("internal/doorbell/human/catalog/read", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readCatalog(input: FarmHumanCatalogReadInput): Promise<FarmHumanCatalogReadSuccess> {
    const requestBody = farmHumanCatalogReadRequestSchema.parse({
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
      throw new FarmHumanCatalogUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanCatalogContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanCatalogUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanCatalogContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanCatalogReadSuccessSchema.safeParse(payload);
      if (!parsed.success || parsed.data.data.farm.farm_doorplate !== input.farmDoorplate) {
        throw new FarmHumanCatalogContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanCatalogReadErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanCatalogContractUnavailableError();
    }
    this.#throwReadError(serviceError.data, response.status);
  }

  #throwReadError(parsedError: FarmHumanCatalogReadError, status: number): never {
    switch (parsedError.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
        throw new FarmHumanCatalogCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanCatalogNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanCatalogUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanCatalogContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanCatalogUnavailableError()
          : new FarmHumanCatalogContractUnavailableError();
    }
  }
}

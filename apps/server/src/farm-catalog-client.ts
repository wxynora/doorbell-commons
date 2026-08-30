import {
  type FarmHumanCatalogReadError,
  type FarmHumanCatalogReadSuccess,
  type FarmHumanShopOpenError,
  type FarmHumanShopOpenSuccess,
  farmHumanCatalogReadErrorSchema,
  farmHumanCatalogReadRequestSchema,
  farmHumanCatalogReadSuccessSchema,
  farmHumanShopOpenErrorSchema,
  farmHumanShopOpenRequestSchema,
  farmHumanShopOpenSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanCatalogReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanCatalogReader {
  readCatalog(input: FarmHumanCatalogReadInput): Promise<FarmHumanCatalogReadSuccess>;
}

export interface FarmHumanShopOpenInput extends FarmHumanCatalogReadInput {
  expectedShopRevision: string | null;
  idempotencyKey: string;
}

export interface FarmHumanShopOpener {
  openShop(input: FarmHumanShopOpenInput): Promise<FarmHumanShopOpenSuccess>;
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

export class FarmHumanShopOpenStateConflictError extends Error {
  readonly currentShopRevision: string | null | undefined;

  constructor(currentShopRevision?: string | null) {
    super("The farm shop has changed");
    this.name = "FarmHumanShopOpenStateConflictError";
    this.currentShopRevision = currentShopRevision;
  }
}

export class FarmHumanShopOpenShopUnavailableError extends Error {
  constructor() {
    super("The current farm shop is unavailable");
    this.name = "FarmHumanShopOpenShopUnavailableError";
  }
}

export class FarmHumanShopOpenIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanShopOpenIdempotencyConflictError";
  }
}

interface FarmHumanCatalogClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanCatalogClient implements FarmHumanCatalogReader, FarmHumanShopOpener {
  readonly #readEndpoint: URL;
  readonly #shopOpenEndpoint: URL;
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
    this.#shopOpenEndpoint = new URL("internal/doorbell/human/catalog/shop/open", apiBaseUrl);
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

  async openShop(input: FarmHumanShopOpenInput): Promise<FarmHumanShopOpenSuccess> {
    const requestBody = farmHumanShopOpenRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_shop_revision: input.expectedShopRevision,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#shopOpenEndpoint, {
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

    if (response.status === 502) throw new FarmHumanCatalogContractUnavailableError();
    if (response.status >= 500) throw new FarmHumanCatalogUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanCatalogContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanShopOpenSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.shop_revision !== parsed.data.data.resource.revision
      ) {
        throw new FarmHumanCatalogContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanShopOpenErrorSchema.safeParse(payload);
    if (!serviceError.success) throw new FarmHumanCatalogContractUnavailableError();
    this.#throwShopOpenError(serviceError.data, response.status);
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

  #throwShopOpenError(parsedError: FarmHumanShopOpenError, status: number): never {
    const { code, current_shop_revision: currentShopRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanShopOpenStateConflictError(currentShopRevision);
      case "shop_unavailable":
        throw new FarmHumanShopOpenShopUnavailableError();
      case "idempotency_conflict":
        throw new FarmHumanShopOpenIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
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

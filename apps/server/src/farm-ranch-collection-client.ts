import {
  type FarmHumanRanchCollectionError,
  type FarmHumanRanchCollectionSuccess,
  farmHumanRanchCollectionErrorSchema,
  farmHumanRanchCollectionRequestSchema,
  farmHumanRanchCollectionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanRanchCollectionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
}

export interface FarmHumanRanchCollector {
  collectRanch(input: FarmHumanRanchCollectionInput): Promise<FarmHumanRanchCollectionSuccess>;
}

export class FarmHumanRanchCollectionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanRanchCollectionCredentialInvalidError";
  }
}

export class FarmHumanRanchCollectionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanRanchCollectionNotFoundError";
  }
}

export class FarmHumanRanchCollectionUnavailableError extends Error {
  constructor() {
    super("The farm ranch collection service is unavailable");
    this.name = "FarmHumanRanchCollectionUnavailableError";
  }
}

export class FarmHumanRanchCollectionContractUnavailableError extends Error {
  constructor() {
    super("The farm ranch collection response could not be verified");
    this.name = "FarmHumanRanchCollectionContractUnavailableError";
  }
}

export class FarmHumanRanchCollectionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The ranch has changed");
    this.name = "FarmHumanRanchCollectionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanRanchCollectionNoCollectableError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("There is no pending ranch output to collect");
    this.name = "FarmHumanRanchCollectionNoCollectableError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanRanchCollectionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanRanchCollectionRejectedError";
  }
}

export class FarmHumanRanchCollectionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanRanchCollectionIdempotencyConflictError";
  }
}

interface FarmHumanRanchCollectionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanRanchCollectionClient implements FarmHumanRanchCollector {
  readonly #collectionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanRanchCollectionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Ranch Collection API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#collectionEndpoint = new URL("internal/doorbell/human/ranch/collect", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async collectRanch(
    input: FarmHumanRanchCollectionInput,
  ): Promise<FarmHumanRanchCollectionSuccess> {
    const requestBody = farmHumanRanchCollectionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#collectionEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanRanchCollectionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanRanchCollectionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanRanchCollectionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanRanchCollectionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanRanchCollectionSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate
      ) {
        throw new FarmHumanRanchCollectionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanRanchCollectionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanRanchCollectionContractUnavailableError();
    }
    this.#throwCollectionError(serviceError.data, response.status);
  }

  async collect(input: FarmHumanRanchCollectionInput): Promise<FarmHumanRanchCollectionSuccess> {
    return this.collectRanch(input);
  }

  #throwCollectionError(parsedError: FarmHumanRanchCollectionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "no_collectable":
        throw new FarmHumanRanchCollectionNoCollectableError(currentRevision);
      case "collection_rejected":
        throw new FarmHumanRanchCollectionRejectedError(parsedError.error.message);
      case "state_conflict":
        throw new FarmHumanRanchCollectionStateConflictError(currentRevision);
      case "idempotency_conflict":
        throw new FarmHumanRanchCollectionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanRanchCollectionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanRanchCollectionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanRanchCollectionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanRanchCollectionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanRanchCollectionUnavailableError()
          : new FarmHumanRanchCollectionContractUnavailableError();
    }
    throw new FarmHumanRanchCollectionContractUnavailableError();
  }
}

export const FarmHumanRanchCollectClient = FarmHumanRanchCollectionClient;

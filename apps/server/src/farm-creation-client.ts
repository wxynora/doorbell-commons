import {
  type FarmCreationServiceReceipt,
  farmCreationServiceReceiptSchema,
  farmCreationServiceRequestSchema,
} from "@doorbell/protocol";

export interface FarmCreationInput {
  creationId: string;
  farmName: string;
  aiName: string;
  humanName: string;
}

export interface FarmCreator {
  createFarm(input: FarmCreationInput): Promise<FarmCreationServiceReceipt>;
}

export class FarmCreationRejectedError extends Error {
  constructor() {
    super("The farm creation details were rejected");
    this.name = "FarmCreationRejectedError";
  }
}

export class FarmCreationConflictError extends Error {
  constructor() {
    super("The farm creation ID is already bound to different details");
    this.name = "FarmCreationConflictError";
  }
}

export class FarmCreationUnavailableError extends Error {
  constructor() {
    super("The farm creation service is unavailable");
    this.name = "FarmCreationUnavailableError";
  }
}

export class FarmCreationContractUnavailableError extends Error {
  constructor() {
    super("The farm creation receipt could not be verified");
    this.name = "FarmCreationContractUnavailableError";
  }
}

interface FarmCreationClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FarmCreationClient implements FarmCreator {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmCreationClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm creation timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#endpoint = new URL("internal/doorbell/farm-creation", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async createFarm(input: FarmCreationInput): Promise<FarmCreationServiceReceipt> {
    const body = farmCreationServiceRequestSchema.parse({
      creation_id: input.creationId,
      farm_name: input.farmName,
      ai_name: input.aiName,
      human_name: input.humanName,
    });
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmCreationUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmCreationContractUnavailableError();
    }

    if (!response.ok) {
      const code = isObject(payload) && isObject(payload.error) ? payload.error.code : undefined;
      if (response.status === 400 && code === "invalid_request") {
        throw new FarmCreationRejectedError();
      }
      if (response.status === 409 && code === "creation_conflict") {
        throw new FarmCreationConflictError();
      }
      if (response.status >= 500) {
        if (code === "creation_contract_unavailable") {
          throw new FarmCreationContractUnavailableError();
        }
        throw new FarmCreationUnavailableError();
      }
      throw new FarmCreationContractUnavailableError();
    }

    const receipt = farmCreationServiceReceiptSchema.safeParse(payload);
    if (!receipt.success || receipt.data.creation_id !== input.creationId) {
      throw new FarmCreationContractUnavailableError();
    }
    return receipt.data;
  }
}

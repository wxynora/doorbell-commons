import {
  type FarmHumanOriginalPlantActionError,
  type FarmHumanOriginalPlantActionSuccess,
  farmHumanOriginalPlantActionErrorSchema,
  farmHumanOriginalPlantActionRequestSchema,
  farmHumanOriginalPlantActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanOriginalPlantActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
  name: string;
  latin: string;
  desc: string;
  plant: string;
  harvest: string;
}

export interface FarmHumanOriginalPlantActioner {
  executeOriginalPlantAction(
    input: FarmHumanOriginalPlantActionInput,
  ): Promise<FarmHumanOriginalPlantActionSuccess>;
}

export class FarmHumanOriginalPlantActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanOriginalPlantActionCredentialInvalidError";
  }
}

export class FarmHumanOriginalPlantActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanOriginalPlantActionNotFoundError";
  }
}

export class FarmHumanOriginalPlantActionUnavailableError extends Error {
  constructor() {
    super("The farm original plant action service is unavailable");
    this.name = "FarmHumanOriginalPlantActionUnavailableError";
  }
}

export class FarmHumanOriginalPlantActionContractUnavailableError extends Error {
  constructor() {
    super("The farm original plant action response could not be verified");
    this.name = "FarmHumanOriginalPlantActionContractUnavailableError";
  }
}

export class FarmHumanOriginalPlantActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The original plant state has changed");
    this.name = "FarmHumanOriginalPlantActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanOriginalPlantActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanOriginalPlantActionRejectedError";
  }
}

export class FarmHumanOriginalPlantActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanOriginalPlantActionIdempotencyConflictError";
  }
}

interface FarmHumanOriginalPlantActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanOriginalPlantActionClient implements FarmHumanOriginalPlantActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanOriginalPlantActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Original Plant Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL("internal/doorbell/human/original-plant/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeOriginalPlantAction(
    input: FarmHumanOriginalPlantActionInput,
  ): Promise<FarmHumanOriginalPlantActionSuccess> {
    const requestBody = farmHumanOriginalPlantActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
      payload: {
        name: input.name,
        latin: input.latin,
        desc: input.desc,
        plant: input.plant,
        harvest: input.harvest,
      },
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#actionEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanOriginalPlantActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanOriginalPlantActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanOriginalPlantActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanOriginalPlantActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanOriginalPlantActionSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.result.crop.designerId !== input.farmDoorplate ||
        parsed.data.revision === input.expectedRevision
      ) {
        throw new FarmHumanOriginalPlantActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanOriginalPlantActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanOriginalPlantActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async designOriginalPlant(
    input: FarmHumanOriginalPlantActionInput,
  ): Promise<FarmHumanOriginalPlantActionSuccess> {
    return this.executeOriginalPlantAction(input);
  }

  #throwActionError(parsedError: FarmHumanOriginalPlantActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanOriginalPlantActionStateConflictError(currentRevision);
      case "action_rejected":
        throw new FarmHumanOriginalPlantActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanOriginalPlantActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanOriginalPlantActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanOriginalPlantActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanOriginalPlantActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanOriginalPlantActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanOriginalPlantActionUnavailableError()
          : new FarmHumanOriginalPlantActionContractUnavailableError();
    }
    throw new FarmHumanOriginalPlantActionContractUnavailableError();
  }
}

export const FarmHumanOriginalPlantClient = FarmHumanOriginalPlantActionClient;

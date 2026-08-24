import {
  type FarmHumanRanchResidentActionError,
  type FarmHumanRanchResidentActionSuccess,
  type FarmRanchResidentAction,
  type FarmRanchResidentActionPayload,
  type FarmRanchResidentType,
  farmHumanRanchResidentActionErrorSchema,
  farmHumanRanchResidentActionRequestSchema,
  farmHumanRanchResidentActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanRanchResidentActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
  action: FarmRanchResidentAction;
  residentType: FarmRanchResidentType;
  kindId: string;
  payload: FarmRanchResidentActionPayload;
}

export interface FarmHumanRanchResidentActioner {
  executeRanchResidentAction(
    input: FarmHumanRanchResidentActionInput,
  ): Promise<FarmHumanRanchResidentActionSuccess>;
}

export class FarmHumanRanchResidentActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanRanchResidentActionCredentialInvalidError";
  }
}

export class FarmHumanRanchResidentActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanRanchResidentActionNotFoundError";
  }
}

export class FarmHumanRanchResidentActionUnavailableError extends Error {
  constructor() {
    super("The farm ranch action service is unavailable");
    this.name = "FarmHumanRanchResidentActionUnavailableError";
  }
}

export class FarmHumanRanchResidentActionContractUnavailableError extends Error {
  constructor() {
    super("The farm ranch action response could not be verified");
    this.name = "FarmHumanRanchResidentActionContractUnavailableError";
  }
}

export class FarmHumanRanchResidentActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The ranch has changed");
    this.name = "FarmHumanRanchResidentActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanRanchResidentActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanRanchResidentActionRejectedError";
  }
}

export class FarmHumanRanchResidentActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanRanchResidentActionIdempotencyConflictError";
  }
}

interface FarmHumanRanchResidentActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanRanchResidentActionClient implements FarmHumanRanchResidentActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanRanchResidentActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Ranch Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#actionEndpoint = new URL("internal/doorbell/human/ranch/resident-action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeRanchResidentAction(
    input: FarmHumanRanchResidentActionInput,
  ): Promise<FarmHumanRanchResidentActionSuccess> {
    const requestBody = farmHumanRanchResidentActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
      action: input.action,
      resident_type: input.residentType,
      kind_id: input.kindId,
      payload: input.payload,
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
      throw new FarmHumanRanchResidentActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanRanchResidentActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanRanchResidentActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanRanchResidentActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanRanchResidentActionSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.result.action !== input.action ||
        parsed.data.data.result.resident_type !== input.residentType ||
        parsed.data.data.result.kind_id !== input.kindId ||
        parsed.data.data.result.outcome.kind !== input.action ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate
      ) {
        throw new FarmHumanRanchResidentActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanRanchResidentActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanRanchResidentActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async executeRanchAction(
    input: FarmHumanRanchResidentActionInput,
  ): Promise<FarmHumanRanchResidentActionSuccess> {
    return this.executeRanchResidentAction(input);
  }

  #throwActionError(parsedError: FarmHumanRanchResidentActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanRanchResidentActionStateConflictError(currentRevision);
      case "action_rejected":
        throw new FarmHumanRanchResidentActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanRanchResidentActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanRanchResidentActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanRanchResidentActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanRanchResidentActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanRanchResidentActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanRanchResidentActionUnavailableError()
          : new FarmHumanRanchResidentActionContractUnavailableError();
    }
    throw new FarmHumanRanchResidentActionContractUnavailableError();
  }
}

export const FarmHumanRanchActionClient = FarmHumanRanchResidentActionClient;

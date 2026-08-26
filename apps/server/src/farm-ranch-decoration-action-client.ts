import {
  type FarmHumanRanchDecorationActionError,
  type FarmHumanRanchDecorationActionSuccess,
  type FarmRanchDecorationAction,
  farmHumanRanchDecorationActionErrorSchema,
  farmHumanRanchDecorationActionRequestSchema,
  farmHumanRanchDecorationActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanRanchDecorationActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
  action: FarmRanchDecorationAction;
  decorationId: string;
}

export interface FarmHumanRanchDecorationActioner {
  executeRanchDecorationAction(
    input: FarmHumanRanchDecorationActionInput,
  ): Promise<FarmHumanRanchDecorationActionSuccess>;
}

export class FarmHumanRanchDecorationActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanRanchDecorationActionCredentialInvalidError";
  }
}

export class FarmHumanRanchDecorationActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanRanchDecorationActionNotFoundError";
  }
}

export class FarmHumanRanchDecorationActionUnavailableError extends Error {
  constructor() {
    super("The farm ranch decoration action service is unavailable");
    this.name = "FarmHumanRanchDecorationActionUnavailableError";
  }
}

export class FarmHumanRanchDecorationActionContractUnavailableError extends Error {
  constructor() {
    super("The farm ranch decoration action response could not be verified");
    this.name = "FarmHumanRanchDecorationActionContractUnavailableError";
  }
}

export class FarmHumanRanchDecorationActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The ranch has changed");
    this.name = "FarmHumanRanchDecorationActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanRanchDecorationActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanRanchDecorationActionRejectedError";
  }
}

export class FarmHumanRanchDecorationActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanRanchDecorationActionIdempotencyConflictError";
  }
}

interface FarmHumanRanchDecorationActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanRanchDecorationActionClient implements FarmHumanRanchDecorationActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanRanchDecorationActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Ranch Decoration Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#actionEndpoint = new URL("internal/doorbell/human/ranch/decoration-action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeRanchDecorationAction(
    input: FarmHumanRanchDecorationActionInput,
  ): Promise<FarmHumanRanchDecorationActionSuccess> {
    const requestBody = farmHumanRanchDecorationActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
      action: input.action,
      decoration_id: input.decorationId,
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
      throw new FarmHumanRanchDecorationActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanRanchDecorationActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanRanchDecorationActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanRanchDecorationActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanRanchDecorationActionSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.result.action !== input.action ||
        parsed.data.data.result.decoration_id !== input.decorationId ||
        parsed.data.data.result.outcome.kind !== input.action ||
        parsed.data.data.result.outcome.decoration_id !== input.decorationId ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate
      ) {
        throw new FarmHumanRanchDecorationActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanRanchDecorationActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanRanchDecorationActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async executeRanchAction(
    input: FarmHumanRanchDecorationActionInput,
  ): Promise<FarmHumanRanchDecorationActionSuccess> {
    return this.executeRanchDecorationAction(input);
  }

  #throwActionError(parsedError: FarmHumanRanchDecorationActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanRanchDecorationActionStateConflictError(currentRevision);
      case "action_rejected":
        throw new FarmHumanRanchDecorationActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanRanchDecorationActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanRanchDecorationActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanRanchDecorationActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanRanchDecorationActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanRanchDecorationActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanRanchDecorationActionUnavailableError()
          : new FarmHumanRanchDecorationActionContractUnavailableError();
    }
    throw new FarmHumanRanchDecorationActionContractUnavailableError();
  }
}

export const FarmHumanRanchDecorationClient = FarmHumanRanchDecorationActionClient;

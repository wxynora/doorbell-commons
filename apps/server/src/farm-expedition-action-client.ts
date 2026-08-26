import {
  type FarmExpeditionAction,
  type FarmExpeditionActionPayload,
  type FarmHumanExpeditionActionError,
  type FarmHumanExpeditionActionSuccess,
  farmHumanExpeditionActionErrorSchema,
  farmHumanExpeditionActionRequestSchema,
  farmHumanExpeditionActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanExpeditionActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
  action: FarmExpeditionAction;
  payload: FarmExpeditionActionPayload;
}

export interface FarmHumanExpeditionActioner {
  executeExpeditionAction(
    input: FarmHumanExpeditionActionInput,
  ): Promise<FarmHumanExpeditionActionSuccess>;
}

export class FarmHumanExpeditionActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanExpeditionActionCredentialInvalidError";
  }
}

export class FarmHumanExpeditionActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanExpeditionActionNotFoundError";
  }
}

export class FarmHumanExpeditionActionUnavailableError extends Error {
  constructor() {
    super("The farm expedition action service is unavailable");
    this.name = "FarmHumanExpeditionActionUnavailableError";
  }
}

export class FarmHumanExpeditionActionContractUnavailableError extends Error {
  constructor() {
    super("The farm expedition action response could not be verified");
    this.name = "FarmHumanExpeditionActionContractUnavailableError";
  }
}

export class FarmHumanExpeditionActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The expedition state has changed");
    this.name = "FarmHumanExpeditionActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanExpeditionActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanExpeditionActionRejectedError";
  }
}

export class FarmHumanExpeditionActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanExpeditionActionIdempotencyConflictError";
  }
}

interface FarmHumanExpeditionActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanExpeditionActionClient implements FarmHumanExpeditionActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanExpeditionActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Expedition Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#actionEndpoint = new URL("internal/doorbell/human/expedition/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeExpeditionAction(
    input: FarmHumanExpeditionActionInput,
  ): Promise<FarmHumanExpeditionActionSuccess> {
    const requestBody = farmHumanExpeditionActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
      action: input.action,
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
      throw new FarmHumanExpeditionActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanExpeditionActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanExpeditionActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanExpeditionActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanExpeditionActionSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.result.action !== input.action ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate ||
        parsed.data.revision === input.expectedRevision
      ) {
        throw new FarmHumanExpeditionActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanExpeditionActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanExpeditionActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async executeFarmExpeditionAction(
    input: FarmHumanExpeditionActionInput,
  ): Promise<FarmHumanExpeditionActionSuccess> {
    return this.executeExpeditionAction(input);
  }

  #throwActionError(parsedError: FarmHumanExpeditionActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanExpeditionActionStateConflictError(currentRevision);
      case "action_rejected":
        throw new FarmHumanExpeditionActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanExpeditionActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanExpeditionActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanExpeditionActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanExpeditionActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanExpeditionActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanExpeditionActionUnavailableError()
          : new FarmHumanExpeditionActionContractUnavailableError();
    }
    throw new FarmHumanExpeditionActionContractUnavailableError();
  }
}

export const FarmHumanExpeditionClient = FarmHumanExpeditionActionClient;

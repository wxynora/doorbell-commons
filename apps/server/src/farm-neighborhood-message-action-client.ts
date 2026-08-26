import {
  type FarmHumanNeighborhoodMessageActionError,
  type FarmHumanNeighborhoodMessageActionSuccess,
  farmHumanNeighborhoodMessageActionErrorSchema,
  farmHumanNeighborhoodMessageActionRequestSchema,
  farmHumanNeighborhoodMessageActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanNeighborhoodMessageActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  targetFarmDoorplate: string;
  message: string;
  expectedRevision: string;
  idempotencyKey: string;
}

export interface FarmHumanNeighborhoodMessageActioner {
  sendNeighborhoodMessage(
    input: FarmHumanNeighborhoodMessageActionInput,
  ): Promise<FarmHumanNeighborhoodMessageActionSuccess>;
}

export class FarmHumanNeighborhoodMessageActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanNeighborhoodMessageActionCredentialInvalidError";
  }
}

export class FarmHumanNeighborhoodMessageActionNotFoundError extends Error {
  constructor() {
    super("The target farm no longer exists");
    this.name = "FarmHumanNeighborhoodMessageActionNotFoundError";
  }
}

export class FarmHumanNeighborhoodMessageActionUnavailableError extends Error {
  constructor() {
    super("The farm neighborhood message service is unavailable");
    this.name = "FarmHumanNeighborhoodMessageActionUnavailableError";
  }
}

export class FarmHumanNeighborhoodMessageActionContractUnavailableError extends Error {
  constructor() {
    super("The farm neighborhood message response could not be verified");
    this.name = "FarmHumanNeighborhoodMessageActionContractUnavailableError";
  }
}

export class FarmHumanNeighborhoodMessageActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The neighborhood has changed");
    this.name = "FarmHumanNeighborhoodMessageActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanNeighborhoodMessageActionRejectedError extends Error {
  readonly code: "access_closed" | "guestbook_closed" | "message_closed" | "blocked";

  constructor(
    code: "access_closed" | "guestbook_closed" | "message_closed" | "blocked",
    message: string,
  ) {
    super(message);
    this.name = "FarmHumanNeighborhoodMessageActionRejectedError";
    this.code = code;
  }
}

export class FarmHumanNeighborhoodMessageActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanNeighborhoodMessageActionIdempotencyConflictError";
  }
}

interface FarmHumanNeighborhoodMessageActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanNeighborhoodMessageActionClient
  implements FarmHumanNeighborhoodMessageActioner
{
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanNeighborhoodMessageActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Neighborhood Message API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL(
      "internal/doorbell/human/neighborhood/message/action",
      apiBaseUrl,
    );
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async sendNeighborhoodMessage(
    input: FarmHumanNeighborhoodMessageActionInput,
  ): Promise<FarmHumanNeighborhoodMessageActionSuccess> {
    const requestBody = farmHumanNeighborhoodMessageActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      target_farm_doorplate: input.targetFarmDoorplate,
      message: input.message,
      expected_neighborhood_revision: input.expectedRevision,
      idempotency_key: input.idempotencyKey,
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
      throw new FarmHumanNeighborhoodMessageActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanNeighborhoodMessageActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanNeighborhoodMessageActionSuccessSchema.safeParse(payload);
      if (!parsed.success) {
        throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
      }
      const result = parsed.data.data.result;
      if (
        result.receipt_id !== input.idempotencyKey ||
        result.target_farm_doorplate !== input.targetFarmDoorplate ||
        result.message.author_farm_doorplate !== input.farmDoorplate ||
        result.message.text !== input.message.trim() ||
        parsed.data.revision === input.expectedRevision ||
        !parsed.data.data.resource.messages.some((message) => message.id === result.message_id)
      ) {
        throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanNeighborhoodMessageActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async sendMessage(
    input: FarmHumanNeighborhoodMessageActionInput,
  ): Promise<FarmHumanNeighborhoodMessageActionSuccess> {
    return this.sendNeighborhoodMessage(input);
  }

  async executeNeighborhoodMessageAction(
    input: FarmHumanNeighborhoodMessageActionInput,
  ): Promise<FarmHumanNeighborhoodMessageActionSuccess> {
    return this.sendNeighborhoodMessage(input);
  }

  #throwActionError(parsedError: FarmHumanNeighborhoodMessageActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanNeighborhoodMessageActionStateConflictError(currentRevision);
      case "access_closed":
      case "guestbook_closed":
      case "message_closed":
      case "blocked":
        throw new FarmHumanNeighborhoodMessageActionRejectedError(code, parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanNeighborhoodMessageActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanNeighborhoodMessageActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanNeighborhoodMessageActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanNeighborhoodMessageActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanNeighborhoodMessageActionUnavailableError()
          : new FarmHumanNeighborhoodMessageActionContractUnavailableError();
    }
    throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
  }
}

export const FarmHumanNeighborhoodMessageClient = FarmHumanNeighborhoodMessageActionClient;

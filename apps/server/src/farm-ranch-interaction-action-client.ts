import {
  type FarmHumanRanchInteractionActionError,
  type FarmHumanRanchInteractionActionSuccess,
  farmHumanRanchInteractionActionErrorSchema,
  farmHumanRanchInteractionActionRequestSchema,
  farmHumanRanchInteractionActionSuccessSchema,
} from "@doorbell/protocol";

interface FarmHumanRanchInteractionActionInputBase {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
}

export type FarmHumanRanchInteractionActionInput =
  | (FarmHumanRanchInteractionActionInputBase & {
      action: "dispatch";
      targetFarmDoorplate: string;
      animalKindId: string;
      durationHours: number;
    })
  | (FarmHumanRanchInteractionActionInputBase & {
      action: "catch";
      raidId: string;
    })
  | (FarmHumanRanchInteractionActionInputBase & {
      action: "remit";
      amount: number;
    })
  | (FarmHumanRanchInteractionActionInputBase & {
      action: "send";
      amount: number;
    });

export interface FarmHumanRanchInteractionActioner {
  executeRanchInteractionAction(
    input: FarmHumanRanchInteractionActionInput,
  ): Promise<FarmHumanRanchInteractionActionSuccess>;
}

export class FarmHumanRanchInteractionActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanRanchInteractionActionCredentialInvalidError";
  }
}

export class FarmHumanRanchInteractionActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanRanchInteractionActionNotFoundError";
  }
}

export class FarmHumanRanchInteractionActionUnavailableError extends Error {
  constructor() {
    super("The farm ranch interaction action service is unavailable");
    this.name = "FarmHumanRanchInteractionActionUnavailableError";
  }
}

export class FarmHumanRanchInteractionActionContractUnavailableError extends Error {
  constructor() {
    super("The farm ranch interaction action response could not be verified");
    this.name = "FarmHumanRanchInteractionActionContractUnavailableError";
  }
}

export class FarmHumanRanchInteractionActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The ranch has changed");
    this.name = "FarmHumanRanchInteractionActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanRanchInteractionActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanRanchInteractionActionRejectedError";
  }
}

export class FarmHumanRanchInteractionActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanRanchInteractionActionIdempotencyConflictError";
  }
}

interface FarmHumanRanchInteractionActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function actionFields(input: FarmHumanRanchInteractionActionInput) {
  switch (input.action) {
    case "dispatch":
      return {
        action: input.action,
        target_farm_doorplate: input.targetFarmDoorplate,
        animal_kind_id: input.animalKindId,
        duration_hours: input.durationHours,
      };
    case "catch":
      return { action: input.action, raid_id: input.raidId };
    case "remit":
    case "send":
      return { action: input.action, amount: input.amount };
  }
}

function resultMatchesInput(
  result: FarmHumanRanchInteractionActionSuccess,
  input: FarmHumanRanchInteractionActionInput,
): boolean {
  if (
    result.data.result.action !== input.action ||
    result.data.result.outcome.kind !== input.action ||
    result.data.result.receipt_id !== input.idempotencyKey ||
    result.data.resource.farm.farm_doorplate !== input.farmDoorplate ||
    result.revision === input.expectedRevision
  ) {
    return false;
  }

  switch (input.action) {
    case "dispatch":
      return (
        result.data.result.outcome.kind === "dispatch" &&
        result.data.result.outcome.animal_kind_id === input.animalKindId &&
        result.data.result.outcome.target_farm_doorplate === input.targetFarmDoorplate
      );
    case "catch":
      return (
        result.data.result.outcome.kind === "catch" &&
        result.data.result.outcome.raid_id === input.raidId
      );
    case "remit":
    case "send":
      return (
        result.data.result.outcome.kind === input.action &&
        result.data.result.outcome.amount === input.amount
      );
  }
}

export class FarmHumanRanchInteractionActionClient implements FarmHumanRanchInteractionActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanRanchInteractionActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Ranch Interaction Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL("internal/doorbell/human/ranch/interaction/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeRanchInteractionAction(
    input: FarmHumanRanchInteractionActionInput,
  ): Promise<FarmHumanRanchInteractionActionSuccess> {
    const requestBody = farmHumanRanchInteractionActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
      ...actionFields(input),
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
      throw new FarmHumanRanchInteractionActionUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanRanchInteractionActionContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanRanchInteractionActionUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanRanchInteractionActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanRanchInteractionActionSuccessSchema.safeParse(payload);
      if (!parsed.success || !resultMatchesInput(parsed.data, input)) {
        throw new FarmHumanRanchInteractionActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanRanchInteractionActionErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanRanchInteractionActionContractUnavailableError();
    }
    this.#throwActionError(serviceError.data, response.status);
  }

  async executeRanchAction(
    input: FarmHumanRanchInteractionActionInput,
  ): Promise<FarmHumanRanchInteractionActionSuccess> {
    return this.executeRanchInteractionAction(input);
  }

  #throwActionError(parsedError: FarmHumanRanchInteractionActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanRanchInteractionActionStateConflictError(currentRevision);
      case "action_rejected":
        throw new FarmHumanRanchInteractionActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanRanchInteractionActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanRanchInteractionActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanRanchInteractionActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanRanchInteractionActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanRanchInteractionActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanRanchInteractionActionUnavailableError()
          : new FarmHumanRanchInteractionActionContractUnavailableError();
    }
    throw new FarmHumanRanchInteractionActionContractUnavailableError();
  }
}

export const FarmHumanRanchInteractionClient = FarmHumanRanchInteractionActionClient;

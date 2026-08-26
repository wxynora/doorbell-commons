import {
  type FarmHumanSmeltingActionError,
  type FarmHumanSmeltingActionSuccess,
  farmHumanSmeltingActionErrorSchema,
  farmHumanSmeltingActionRequestSchema,
  farmHumanSmeltingActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanSmeltingActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  materialIds: string[];
  expectedSmeltingRevision: string;
  idempotencyKey: string;
}

export interface FarmHumanSmeltingActioner {
  executeSmeltingAction(
    input: FarmHumanSmeltingActionInput,
  ): Promise<FarmHumanSmeltingActionSuccess>;
}

export class FarmHumanSmeltingActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanSmeltingActionCredentialInvalidError";
  }
}

export class FarmHumanSmeltingActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanSmeltingActionNotFoundError";
  }
}

export class FarmHumanSmeltingActionUnavailableError extends Error {
  constructor() {
    super("The farm smelting service is unavailable");
    this.name = "FarmHumanSmeltingActionUnavailableError";
  }
}

export class FarmHumanSmeltingActionContractUnavailableError extends Error {
  constructor() {
    super("The farm smelting response could not be verified");
    this.name = "FarmHumanSmeltingActionContractUnavailableError";
  }
}

export class FarmHumanSmeltingActionStateConflictError extends Error {
  readonly currentSmeltingRevision: string | undefined;

  constructor(currentSmeltingRevision?: string) {
    super("The smelting inventory has changed");
    this.name = "FarmHumanSmeltingActionStateConflictError";
    this.currentSmeltingRevision = currentSmeltingRevision;
  }
}

export class FarmHumanSmeltingActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanSmeltingActionRejectedError";
  }
}

export class FarmHumanSmeltingActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanSmeltingActionIdempotencyConflictError";
  }
}

interface FarmHumanSmeltingActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function resultMatchesInput(
  result: FarmHumanSmeltingActionSuccess,
  input: FarmHumanSmeltingActionInput,
): boolean {
  const receipt = result.data.result;
  return (
    receipt.receipt_id === input.idempotencyKey &&
    receipt.material_ids.length === input.materialIds.length &&
    receipt.material_ids.every((id, index) => id === input.materialIds[index]) &&
    result.data.resource.farm.farm_doorplate === input.farmDoorplate
  );
}

export class FarmHumanSmeltingActionClient implements FarmHumanSmeltingActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanSmeltingActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Smelting Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL("internal/doorbell/human/smelting/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async executeSmeltingAction(
    input: FarmHumanSmeltingActionInput,
  ): Promise<FarmHumanSmeltingActionSuccess> {
    const requestBody = farmHumanSmeltingActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      material_ids: input.materialIds,
      expected_smelting_revision: input.expectedSmeltingRevision,
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
      throw new FarmHumanSmeltingActionUnavailableError();
    }

    if (response.status === 502) throw new FarmHumanSmeltingActionContractUnavailableError();
    if (response.status >= 500) throw new FarmHumanSmeltingActionUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanSmeltingActionContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanSmeltingActionSuccessSchema.safeParse(payload);
      if (!parsed.success || !resultMatchesInput(parsed.data, input)) {
        throw new FarmHumanSmeltingActionContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanSmeltingActionErrorSchema.safeParse(payload);
    if (!serviceError.success) throw new FarmHumanSmeltingActionContractUnavailableError();
    this.#throwActionError(serviceError.data, response.status);
  }

  #throwActionError(parsedError: FarmHumanSmeltingActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanSmeltingActionStateConflictError(currentRevision);
      case "action_rejected":
        throw new FarmHumanSmeltingActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanSmeltingActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanSmeltingActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanSmeltingActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanSmeltingActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanSmeltingActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanSmeltingActionUnavailableError()
          : new FarmHumanSmeltingActionContractUnavailableError();
    }
    throw new FarmHumanSmeltingActionContractUnavailableError();
  }
}

export const FarmHumanSmeltingClient = FarmHumanSmeltingActionClient;

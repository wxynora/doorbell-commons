import {
  type FarmHumanFarmSettingsActionError,
  type FarmHumanFarmSettingsActionSuccess,
  type FarmSettingsActionField,
  type FarmSettingsActionValue,
  farmHumanFarmSettingsActionErrorSchema,
  farmHumanFarmSettingsActionRequestSchema,
  farmHumanFarmSettingsActionSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanFarmSettingsActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedCatalogRevision: string;
  idempotencyKey: string;
  field: FarmSettingsActionField;
  value: FarmSettingsActionValue;
}

export interface FarmHumanFarmSettingsActioner {
  updateFarmSettings(
    input: FarmHumanFarmSettingsActionInput,
  ): Promise<FarmHumanFarmSettingsActionSuccess>;
}

export class FarmHumanFarmSettingsActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanFarmSettingsActionCredentialInvalidError";
  }
}

export class FarmHumanFarmSettingsActionNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanFarmSettingsActionNotFoundError";
  }
}

export class FarmHumanFarmSettingsActionUnavailableError extends Error {
  constructor() {
    super("The farm settings action service is unavailable");
    this.name = "FarmHumanFarmSettingsActionUnavailableError";
  }
}

export class FarmHumanFarmSettingsActionContractUnavailableError extends Error {
  constructor() {
    super("The farm settings action response could not be verified");
    this.name = "FarmHumanFarmSettingsActionContractUnavailableError";
  }
}

export class FarmHumanFarmSettingsActionStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The farm settings have changed");
    this.name = "FarmHumanFarmSettingsActionStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanFarmSettingsActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmHumanFarmSettingsActionRejectedError";
  }
}

export class FarmHumanFarmSettingsActionIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanFarmSettingsActionIdempotencyConflictError";
  }
}

interface FarmHumanFarmSettingsActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanFarmSettingsActionClient implements FarmHumanFarmSettingsActioner {
  readonly #actionEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanFarmSettingsActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Farm Settings Action API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#actionEndpoint = new URL("internal/doorbell/human/settings/action", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async updateFarmSettings(
    input: FarmHumanFarmSettingsActionInput,
  ): Promise<FarmHumanFarmSettingsActionSuccess> {
    const requestBody = farmHumanFarmSettingsActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_catalog_revision: input.expectedCatalogRevision,
      field: input.field,
      value: input.value,
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
      throw new FarmHumanFarmSettingsActionUnavailableError();
    }
    if (response.status === 502) throw new FarmHumanFarmSettingsActionContractUnavailableError();
    if (response.status >= 500) throw new FarmHumanFarmSettingsActionUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanFarmSettingsActionContractUnavailableError();
    }
    if (response.ok) {
      const parsed = farmHumanFarmSettingsActionSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.result.field !== input.field ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate
      ) {
        throw new FarmHumanFarmSettingsActionContractUnavailableError();
      }
      return parsed.data;
    }
    const serviceError = farmHumanFarmSettingsActionErrorSchema.safeParse(payload);
    if (!serviceError.success) throw new FarmHumanFarmSettingsActionContractUnavailableError();
    this.#throwActionError(serviceError.data, response.status);
  }

  async executeSettingsAction(
    input: FarmHumanFarmSettingsActionInput,
  ): Promise<FarmHumanFarmSettingsActionSuccess> {
    return this.updateFarmSettings(input);
  }

  #throwActionError(parsedError: FarmHumanFarmSettingsActionError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "state_conflict":
        throw new FarmHumanFarmSettingsActionStateConflictError(currentRevision);
      case "action_rejected":
        throw new FarmHumanFarmSettingsActionRejectedError(parsedError.error.message);
      case "idempotency_conflict":
        throw new FarmHumanFarmSettingsActionIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanFarmSettingsActionCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanFarmSettingsActionNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanFarmSettingsActionUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanFarmSettingsActionContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanFarmSettingsActionUnavailableError()
          : new FarmHumanFarmSettingsActionContractUnavailableError();
    }
    throw new FarmHumanFarmSettingsActionContractUnavailableError();
  }
}

export const FarmHumanSettingsActionClient = FarmHumanFarmSettingsActionClient;

import {
  type FarmHumanFieldHarvestAssistError,
  type FarmHumanFieldHarvestAssistRequest,
  type FarmHumanFieldHarvestAssistSuccess,
  type FarmHumanFieldLandUpgradeError,
  type FarmHumanFieldLandUpgradeRequest,
  type FarmHumanFieldLandUpgradeSuccess,
  type FarmHumanFieldReadSuccess,
  farmHumanFieldHarvestAssistErrorSchema,
  farmHumanFieldHarvestAssistRequestSchema,
  farmHumanFieldHarvestAssistSuccessSchema,
  farmHumanFieldLandUpgradeErrorSchema,
  farmHumanFieldLandUpgradeRequestSchema,
  farmHumanFieldLandUpgradeSuccessSchema,
  farmHumanFieldReadErrorSchema,
  farmHumanFieldReadRequestSchema,
  farmHumanFieldReadSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanFieldReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanFieldReader {
  readField(input: FarmHumanFieldReadInput): Promise<FarmHumanFieldReadSuccess>;
  harvestAssist?(
    input: FarmHumanFieldHarvestAssistInput,
  ): Promise<FarmHumanFieldHarvestAssistSuccess>;
  landUpgrade?(
    input: FarmHumanFieldLandUpgradeInput,
  ): Promise<FarmHumanFieldLandUpgradeSuccess>;
}

export interface FarmHumanFieldHarvestAssistInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
}

export interface FarmHumanFieldLandUpgradeInput {
  farmDoorplate: string;
  farmHumanKey: string;
  expectedRevision: string;
  idempotencyKey: string;
}

export class FarmHumanFieldCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanFieldCredentialInvalidError";
  }
}

export class FarmHumanFieldNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanFieldNotFoundError";
  }
}

export class FarmHumanFieldUnavailableError extends Error {
  constructor() {
    super("The farm field service is unavailable");
    this.name = "FarmHumanFieldUnavailableError";
  }
}

export class FarmHumanFieldContractUnavailableError extends Error {
  constructor() {
    super("The farm field response could not be verified");
    this.name = "FarmHumanFieldContractUnavailableError";
  }
}

export class FarmHumanHarvestAssistExhaustedError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The daily harvest assist limit has been reached");
    this.name = "FarmHumanHarvestAssistExhaustedError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanNoRipePlotsError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("There are no ripe plots to harvest");
    this.name = "FarmHumanNoRipePlotsError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanFieldStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The farm field has changed");
    this.name = "FarmHumanFieldStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanFieldIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different request");
    this.name = "FarmHumanFieldIdempotencyConflictError";
  }
}

export class FarmHumanLandUpgradeRejectedError extends Error {
  readonly currentRevision: string | undefined;

  constructor(message: string, currentRevision?: string) {
    super(message);
    this.name = "FarmHumanLandUpgradeRejectedError";
    this.currentRevision = currentRevision;
  }
}

export {
  FarmHumanHarvestAssistExhaustedError as FarmHumanFieldHarvestAssistExhaustedError,
  FarmHumanNoRipePlotsError as FarmHumanFieldNoRipePlotsError,
  FarmHumanNoRipePlotsError as FarmHumanFieldHarvestAssistNoRipePlotsError,
};

interface FarmHumanClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanClient implements FarmHumanFieldReader {
  readonly #fieldReadEndpoint: URL;
  readonly #harvestAssistEndpoint: URL;
  readonly #landUpgradeEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm Human API timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#fieldReadEndpoint = new URL("internal/doorbell/human/field/read", apiBaseUrl);
    this.#harvestAssistEndpoint = new URL(
      "internal/doorbell/human/field/harvest-assist",
      apiBaseUrl,
    );
    this.#landUpgradeEndpoint = new URL("internal/doorbell/human/field/upgrade", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readField(input: FarmHumanFieldReadInput): Promise<FarmHumanFieldReadSuccess> {
    const requestBody = farmHumanFieldReadRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#fieldReadEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanFieldUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanFieldContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanFieldUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new FarmHumanFieldContractUnavailableError();
    }

    if (response.ok) {
      const result = farmHumanFieldReadSuccessSchema.safeParse(body);
      if (!result.success || result.data.data.farm.farm_doorplate !== input.farmDoorplate) {
        throw new FarmHumanFieldContractUnavailableError();
      }
      return result.data;
    }

    const serviceError = farmHumanFieldReadErrorSchema.safeParse(body);
    if (!serviceError.success) {
      throw new FarmHumanFieldContractUnavailableError();
    }
    switch (serviceError.data.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
        throw new FarmHumanFieldCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanFieldNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanFieldUnavailableError();
      default:
        throw new FarmHumanFieldContractUnavailableError();
    }
  }

  async harvestAssist(
    input: FarmHumanFieldHarvestAssistInput,
  ): Promise<FarmHumanFieldHarvestAssistSuccess> {
    const body: FarmHumanFieldHarvestAssistRequest = farmHumanFieldHarvestAssistRequestSchema.parse(
      {
        farm_human_key: input.farmHumanKey,
        expected_farm_doorplate: input.farmDoorplate,
        idempotency_key: input.idempotencyKey,
        expected_revision: input.expectedRevision,
        payload: {},
      },
    );

    let response: Response;
    try {
      response = await this.#fetch(this.#harvestAssistEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanFieldUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.status >= 500) {
        throw new FarmHumanFieldUnavailableError();
      }
      throw new FarmHumanFieldContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanFieldHarvestAssistSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate
      ) {
        throw new FarmHumanFieldContractUnavailableError();
      }
      return parsed.data;
    }

    const parsedError = farmHumanFieldHarvestAssistErrorSchema.safeParse(payload);
    if (!parsedError.success) {
      if (response.status >= 500) {
        throw new FarmHumanFieldUnavailableError();
      }
      throw new FarmHumanFieldContractUnavailableError();
    }

    this.#throwHarvestAssistError(parsedError.data, response.status);
  }

  async landUpgrade(
    input: FarmHumanFieldLandUpgradeInput,
  ): Promise<FarmHumanFieldLandUpgradeSuccess> {
    const body: FarmHumanFieldLandUpgradeRequest = farmHumanFieldLandUpgradeRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      idempotency_key: input.idempotencyKey,
      expected_revision: input.expectedRevision,
      payload: {},
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#landUpgradeEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanFieldUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.status >= 500) {
        throw new FarmHumanFieldUnavailableError();
      }
      throw new FarmHumanFieldContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanFieldLandUpgradeSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey ||
        parsed.data.data.resource.farm.farm_doorplate !== input.farmDoorplate
      ) {
        throw new FarmHumanFieldContractUnavailableError();
      }
      return parsed.data;
    }

    const parsedError = farmHumanFieldLandUpgradeErrorSchema.safeParse(payload);
    if (!parsedError.success) {
      if (response.status >= 500) {
        throw new FarmHumanFieldUnavailableError();
      }
      throw new FarmHumanFieldContractUnavailableError();
    }
    this.#throwLandUpgradeError(parsedError.data, response.status);
  }

  #throwHarvestAssistError(parsedError: FarmHumanFieldHarvestAssistError, status: number): never {
    const { code, current_revision: currentRevision } = parsedError.error;
    switch (code) {
      case "harvest_assist_exhausted":
        throw new FarmHumanHarvestAssistExhaustedError(currentRevision);
      case "no_ripe_plots":
        throw new FarmHumanNoRipePlotsError(currentRevision);
      case "state_conflict":
        throw new FarmHumanFieldStateConflictError(currentRevision);
      case "idempotency_conflict":
        throw new FarmHumanFieldIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanFieldCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanFieldNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanFieldUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanFieldContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanFieldUnavailableError()
          : new FarmHumanFieldContractUnavailableError();
    }
  }

  #throwLandUpgradeError(parsedError: FarmHumanFieldLandUpgradeError, status: number): never {
    const { code, current_revision: currentRevision, message } = parsedError.error;
    switch (code) {
      case "land_upgrade_rejected":
        throw new FarmHumanLandUpgradeRejectedError(message, currentRevision);
      case "state_conflict":
        throw new FarmHumanFieldStateConflictError(currentRevision);
      case "idempotency_conflict":
        throw new FarmHumanFieldIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanFieldCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanFieldNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanFieldUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanFieldContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanFieldUnavailableError()
          : new FarmHumanFieldContractUnavailableError();
    }
  }
}

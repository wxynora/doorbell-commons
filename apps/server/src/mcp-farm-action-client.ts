import {
  type FarmMcpActionResult,
  farmMcpActionErrorSchema,
  farmMcpActionRequestSchema,
  farmMcpActionResultSchema,
} from "@doorbell/protocol";

export interface FarmMcpActionInput {
  farmDoorplate: string;
  farmHumanKey: string;
  action: string;
  params: Record<string, unknown>;
  detail?: boolean;
}

export interface FarmMcpActionExecutor {
  execute(input: FarmMcpActionInput): Promise<FarmMcpActionResult>;
}

export class FarmMcpActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm credential is no longer valid");
    this.name = "FarmMcpActionCredentialInvalidError";
  }
}

export class FarmMcpActionBindingMismatchError extends Error {
  constructor() {
    super("The bound farm credential no longer matches the registered farm");
    this.name = "FarmMcpActionBindingMismatchError";
  }
}

export class FarmMcpActionMigrationRequiredError extends Error {
  constructor() {
    super("The farm has not completed its Doorbell migration");
    this.name = "FarmMcpActionMigrationRequiredError";
  }
}

export class FarmMcpActionUnavailableError extends Error {
  constructor() {
    super("The farm action service is unavailable");
    this.name = "FarmMcpActionUnavailableError";
  }
}

export class FarmMcpActionContractUnavailableError extends Error {
  constructor() {
    super("The farm action response could not be verified");
    this.name = "FarmMcpActionContractUnavailableError";
  }
}

interface FarmMcpActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmMcpActionClient implements FarmMcpActionExecutor {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmMcpActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm action timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#endpoint = new URL("internal/doorbell/farm-actions/execute", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async execute(input: FarmMcpActionInput): Promise<FarmMcpActionResult> {
    const requestBody = farmMcpActionRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      action: input.action,
      params: input.params,
      ...(input.detail === undefined ? {} : { detail: input.detail }),
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmMcpActionUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (response.status >= 500) {
        throw new FarmMcpActionUnavailableError();
      }
      throw new FarmMcpActionContractUnavailableError();
    }

    if (response.status >= 500) {
      throw new FarmMcpActionUnavailableError();
    }

    const actionResult = farmMcpActionResultSchema.safeParse(body);
    if (actionResult.success) {
      return actionResult.data;
    }

    const serviceError = farmMcpActionErrorSchema.safeParse(body);
    if (!serviceError.success) {
      throw new FarmMcpActionContractUnavailableError();
    }
    switch (serviceError.data.error.code) {
      case "farm_credential_not_found":
        throw new FarmMcpActionCredentialInvalidError();
      case "farm_doorplate_mismatch":
        throw new FarmMcpActionBindingMismatchError();
      case "farm_migration_required":
        throw new FarmMcpActionMigrationRequiredError();
      case "farm_unavailable":
        throw new FarmMcpActionUnavailableError();
      default:
        throw new FarmMcpActionContractUnavailableError();
    }
  }
}

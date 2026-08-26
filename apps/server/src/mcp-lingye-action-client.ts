import {
  type LingyeActionResult,
  type LingyeDoorbellOperation,
  lingyeActionRequestSchema,
  lingyeActionResultSchema,
  lingyeActionServiceErrorSchema,
} from "@doorbell/protocol";

export interface LingyeMcpActionInput {
  residentId: string;
  farmDoorplate: string;
  farmHumanKey: string;
  op: LingyeDoorbellOperation;
  args: Record<string, unknown>;
}

export interface LingyeMcpActionExecutor {
  execute(input: LingyeMcpActionInput): Promise<LingyeActionResult>;
}

export class LingyeMcpActionCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm credential is no longer valid");
    this.name = "LingyeMcpActionCredentialInvalidError";
  }
}

export class LingyeMcpActionBindingMismatchError extends Error {
  constructor() {
    super("The bound farm credential no longer matches the registered farm");
    this.name = "LingyeMcpActionBindingMismatchError";
  }
}

export class LingyeMcpActionMigrationRequiredError extends Error {
  constructor() {
    super("The farm has not completed its Doorbell migration");
    this.name = "LingyeMcpActionMigrationRequiredError";
  }
}

export class LingyeMcpActionUnavailableError extends Error {
  constructor() {
    super("The Lingye action service is unavailable");
    this.name = "LingyeMcpActionUnavailableError";
  }
}

export class LingyeMcpActionContractUnavailableError extends Error {
  constructor() {
    super("The Lingye action response could not be verified");
    this.name = "LingyeMcpActionContractUnavailableError";
  }
}

interface LingyeMcpActionClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class LingyeMcpActionClient implements LingyeMcpActionExecutor {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: LingyeMcpActionClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Lingye action timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#endpoint = new URL("internal/doorbell/lingye-actions/execute", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async execute(input: LingyeMcpActionInput): Promise<LingyeActionResult> {
    const requestBody = lingyeActionRequestSchema.parse({
      resident_id: input.residentId,
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      op: input.op,
      args: input.args,
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
      throw new LingyeMcpActionUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (response.status >= 500) {
        throw new LingyeMcpActionUnavailableError();
      }
      throw new LingyeMcpActionContractUnavailableError();
    }

    const actionResult = lingyeActionResultSchema.safeParse(body);
    if (actionResult.success) {
      return actionResult.data;
    }
    if (response.status >= 500) {
      throw new LingyeMcpActionUnavailableError();
    }

    const serviceError = lingyeActionServiceErrorSchema.safeParse(body);
    if (!serviceError.success) {
      throw new LingyeMcpActionContractUnavailableError();
    }
    switch (serviceError.data.error.code) {
      case "farm_credential_not_found":
        throw new LingyeMcpActionCredentialInvalidError();
      case "farm_doorplate_mismatch":
        throw new LingyeMcpActionBindingMismatchError();
      case "farm_migration_required":
        throw new LingyeMcpActionMigrationRequiredError();
      case "lingye_unavailable":
      case "service_not_configured":
        throw new LingyeMcpActionUnavailableError();
      default:
        throw new LingyeMcpActionContractUnavailableError();
    }
  }
}

import {
  type LingyeActionResult,
  type LingyeDoorbellOperation,
  lingyeActionRequestSchema,
  lingyeActionResultSchema,
  lingyeActionServiceErrorSchema,
  lingyeRuntimeReadinessSchema,
  REQUIRED_LINGYE_EXAM_LEVELS,
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

export interface LingyeMcpRuntimeReadinessReader {
  isRuntimeReady(): Promise<boolean>;
}

const REQUIRED_MODEL_VISIBLE_OPERATIONS = [
  "go.bank.view",
  "go.bank.choose",
  "go.school.view",
  "go.school.choose",
  "go.farm.commission",
  "go.hospital.commission",
  "go.security.commission",
] as const satisfies readonly LingyeDoorbellOperation[];

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

export class LingyeMcpActionClient
  implements LingyeMcpActionExecutor, LingyeMcpRuntimeReadinessReader
{
  readonly #endpoint: URL;
  readonly #readinessEndpoint: URL;
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
    this.#readinessEndpoint = new URL("internal/doorbell/lingye-actions/readiness", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async isRuntimeReady(): Promise<boolean> {
    let response: Response;
    try {
      response = await this.#fetch(this.#readinessEndpoint, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      return false;
    }
    if (!response.ok) return false;

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return false;
    }
    const parsed = lingyeRuntimeReadinessSchema.safeParse(body);
    if (!parsed.success || !parsed.data.ready || parsed.data.missing.length !== 0) return false;

    const operations = new Set(parsed.data.operations);
    if (
      operations.size !== parsed.data.operations.length ||
      REQUIRED_MODEL_VISIBLE_OPERATIONS.some((operation) => !operations.has(operation))
    ) {
      return false;
    }

    const levelKey = (entry: { career: string; level: number }): string =>
      `${entry.career}:${String(entry.level)}`;
    const publicLevels = new Set(parsed.data.exams.public_ready_levels.map(levelKey));
    const privateLevels = new Set(parsed.data.exams.private_ready_levels.map(levelKey));
    const requiredLevels = new Set(REQUIRED_LINGYE_EXAM_LEVELS.map(levelKey));
    if (
      publicLevels.size !== parsed.data.exams.public_ready_levels.length ||
      privateLevels.size !== parsed.data.exams.private_ready_levels.length ||
      publicLevels.size !== privateLevels.size ||
      [...publicLevels].some((key) => !privateLevels.has(key)) ||
      [...requiredLevels].some((key) => !publicLevels.has(key))
    ) {
      return false;
    }
    const nature = parsed.data.nature_runtime;
    return (
      nature.configured &&
      nature.ready &&
      nature.status === "ready" &&
      nature.activation_date !== undefined &&
      nature.activation_day !== undefined &&
      nature.error_code === undefined
    );
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

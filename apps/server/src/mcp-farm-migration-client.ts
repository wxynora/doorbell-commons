import {
  type FarmMcpMigrationReceipt,
  farmMcpMigrationReceiptSchema,
  farmMcpMigrationRequestSchema,
} from "@doorbell/protocol";

export interface FarmMcpMigrationInput {
  migrationId: string;
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmMcpMigrationRevoker {
  revokeLegacyMcpAccess(input: FarmMcpMigrationInput): Promise<FarmMcpMigrationReceipt>;
}

export class FarmMcpMigrationCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm credential is no longer valid");
    this.name = "FarmMcpMigrationCredentialInvalidError";
  }
}

export class FarmMcpMigrationBindingMismatchError extends Error {
  constructor() {
    super("The bound farm credential no longer matches the registered farm");
    this.name = "FarmMcpMigrationBindingMismatchError";
  }
}

export class FarmMcpMigrationConflictError extends Error {
  constructor() {
    super("The bound farm was migrated by a different operation");
    this.name = "FarmMcpMigrationConflictError";
  }
}

export class FarmMcpMigrationUnavailableError extends Error {
  constructor() {
    super("The farm migration service is unavailable");
    this.name = "FarmMcpMigrationUnavailableError";
  }
}

export class FarmMcpMigrationContractUnavailableError extends Error {
  constructor() {
    super("The farm migration confirmation could not be verified");
    this.name = "FarmMcpMigrationContractUnavailableError";
  }
}

interface FarmMcpMigrationClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FarmMcpMigrationClient implements FarmMcpMigrationRevoker {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmMcpMigrationClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm migration timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#endpoint = new URL("internal/doorbell/mcp-migrations/revoke-farm-access", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async revokeLegacyMcpAccess(input: FarmMcpMigrationInput): Promise<FarmMcpMigrationReceipt> {
    const requestBody = farmMcpMigrationRequestSchema.parse({
      migration_id: input.migrationId,
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
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
      throw new FarmMcpMigrationUnavailableError();
    }

    if (response.status >= 500) {
      throw new FarmMcpMigrationUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new FarmMcpMigrationContractUnavailableError();
    }

    if (!response.ok) {
      const code = isObject(body) && isObject(body.error) ? body.error.code : undefined;
      if (response.status === 404 && code === "farm_credential_not_found") {
        throw new FarmMcpMigrationCredentialInvalidError();
      }
      if (response.status === 409 && code === "farm_doorplate_mismatch") {
        throw new FarmMcpMigrationBindingMismatchError();
      }
      if (response.status === 409 && code === "migration_conflict") {
        throw new FarmMcpMigrationConflictError();
      }
      throw new FarmMcpMigrationContractUnavailableError();
    }

    const receipt = farmMcpMigrationReceiptSchema.safeParse(body);
    if (
      !receipt.success ||
      receipt.data.migration_id !== input.migrationId ||
      receipt.data.farm_doorplate !== input.farmDoorplate
    ) {
      throw new FarmMcpMigrationContractUnavailableError();
    }
    return receipt.data;
  }
}

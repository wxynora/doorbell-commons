import {
  type FarmBulletinAckScope,
  type FarmHumanBulletinAckError,
  type FarmHumanBulletinAckSuccess,
  type FarmHumanBulletinReadError,
  type FarmHumanBulletinReadSuccess,
  farmHumanBulletinAckErrorSchema,
  farmHumanBulletinAckRequestSchema,
  farmHumanBulletinAckSuccessSchema,
  farmHumanBulletinReadErrorSchema,
  farmHumanBulletinReadRequestSchema,
  farmHumanBulletinReadSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanBulletinReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanBulletinReader {
  readBulletin(input: FarmHumanBulletinReadInput): Promise<FarmHumanBulletinReadSuccess>;
  acknowledgeBulletin(input: FarmHumanBulletinAckInput): Promise<FarmHumanBulletinAckSuccess>;
}

export interface FarmHumanBulletinAckInput extends FarmHumanBulletinReadInput {
  acknowledge: FarmBulletinAckScope;
  expectedRevision: string;
  idempotencyKey: string;
}

export class FarmHumanBulletinCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanBulletinCredentialInvalidError";
  }
}

export class FarmHumanBulletinNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanBulletinNotFoundError";
  }
}

export class FarmHumanBulletinUnavailableError extends Error {
  constructor() {
    super("The farm bulletin service is unavailable");
    this.name = "FarmHumanBulletinUnavailableError";
  }
}

export class FarmHumanBulletinContractUnavailableError extends Error {
  constructor() {
    super("The farm bulletin response could not be verified");
    this.name = "FarmHumanBulletinContractUnavailableError";
  }
}

export class FarmHumanBulletinStateConflictError extends Error {
  readonly currentRevision: string | undefined;

  constructor(currentRevision?: string) {
    super("The farm bulletin has changed");
    this.name = "FarmHumanBulletinStateConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FarmHumanBulletinIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key was used for a different bulletin acknowledgement");
    this.name = "FarmHumanBulletinIdempotencyConflictError";
  }
}

interface FarmHumanBulletinClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanBulletinClient implements FarmHumanBulletinReader {
  readonly #ackEndpoint: URL;
  readonly #readEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanBulletinClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Bulletin API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#readEndpoint = new URL("internal/doorbell/human/bulletin/read", apiBaseUrl);
    this.#ackEndpoint = new URL("internal/doorbell/human/bulletin/ack", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readBulletin(input: FarmHumanBulletinReadInput): Promise<FarmHumanBulletinReadSuccess> {
    const requestBody = farmHumanBulletinReadRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#readEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanBulletinUnavailableError();
    }

    if (response.status === 502) throw new FarmHumanBulletinContractUnavailableError();
    if (response.status >= 500) throw new FarmHumanBulletinUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanBulletinContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanBulletinReadSuccessSchema.safeParse(payload);
      if (!parsed.success || parsed.data.subject.farm_doorplate !== input.farmDoorplate) {
        throw new FarmHumanBulletinContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanBulletinReadErrorSchema.safeParse(payload);
    if (!serviceError.success) throw new FarmHumanBulletinContractUnavailableError();
    this.#throwReadError(serviceError.data, response.status);
  }

  async acknowledgeBulletin(
    input: FarmHumanBulletinAckInput,
  ): Promise<FarmHumanBulletinAckSuccess> {
    const requestBody = farmHumanBulletinAckRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      expected_bulletin_revision: input.expectedRevision,
      idempotency_key: input.idempotencyKey,
      ...(input.acknowledge === "trail" ? { acknowledge: input.acknowledge } : {}),
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#ackEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmHumanBulletinUnavailableError();
    }

    if (response.status === 502) throw new FarmHumanBulletinContractUnavailableError();
    if (response.status >= 500) throw new FarmHumanBulletinUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanBulletinContractUnavailableError();
    }

    if (response.ok) {
      const parsed = farmHumanBulletinAckSuccessSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.subject.farm_doorplate !== input.farmDoorplate ||
        parsed.data.revision !== input.expectedRevision ||
        parsed.data.data.result.receipt_id !== input.idempotencyKey
      ) {
        throw new FarmHumanBulletinContractUnavailableError();
      }
      return parsed.data;
    }

    const serviceError = farmHumanBulletinAckErrorSchema.safeParse(payload);
    if (!serviceError.success) throw new FarmHumanBulletinContractUnavailableError();
    this.#throwAckError(serviceError.data, response.status);
  }

  #throwReadError(parsedError: FarmHumanBulletinReadError, status: number): never {
    switch (parsedError.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
        throw new FarmHumanBulletinCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanBulletinNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanBulletinUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanBulletinContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanBulletinUnavailableError()
          : new FarmHumanBulletinContractUnavailableError();
      default:
        throw new FarmHumanBulletinContractUnavailableError();
    }
  }

  #throwAckError(parsedError: FarmHumanBulletinAckError, status: number): never {
    switch (parsedError.error.code) {
      case "state_conflict":
        throw new FarmHumanBulletinStateConflictError(parsedError.error.current_revision);
      case "idempotency_conflict":
        throw new FarmHumanBulletinIdempotencyConflictError();
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmHumanBulletinCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanBulletinNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanBulletinUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmHumanBulletinContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmHumanBulletinUnavailableError()
          : new FarmHumanBulletinContractUnavailableError();
    }
  }
}

import {
  type FarmHumanBulletinReadError,
  type FarmHumanBulletinReadSuccess,
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

interface FarmHumanBulletinClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanBulletinClient implements FarmHumanBulletinReader {
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
}

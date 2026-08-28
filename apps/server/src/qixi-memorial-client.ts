import {
  type FarmHumanQixiMemorialReadSuccess,
  farmHumanQixiMemorialReadErrorSchema,
  farmHumanQixiMemorialReadRequestSchema,
  farmHumanQixiMemorialReadSuccessSchema,
} from "@doorbell/protocol";

export interface FarmHumanQixiMemorialReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmHumanQixiMemorialReader {
  readQixiMemorial(
    input: FarmHumanQixiMemorialReadInput,
  ): Promise<FarmHumanQixiMemorialReadSuccess>;
}

export class FarmHumanQixiMemorialCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmHumanQixiMemorialCredentialInvalidError";
  }
}

export class FarmHumanQixiMemorialNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmHumanQixiMemorialNotFoundError";
  }
}

export class FarmHumanQixiMemorialUnavailableError extends Error {
  constructor() {
    super("The farm Qixi memorial service is unavailable");
    this.name = "FarmHumanQixiMemorialUnavailableError";
  }
}

export class FarmHumanQixiMemorialContractUnavailableError extends Error {
  constructor() {
    super("The farm Qixi memorial response could not be verified");
    this.name = "FarmHumanQixiMemorialContractUnavailableError";
  }
}

interface FarmHumanQixiMemorialClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class FarmHumanQixiMemorialClient implements FarmHumanQixiMemorialReader {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmHumanQixiMemorialClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm Qixi memorial timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#endpoint = new URL("internal/doorbell/human/memorial/qixi-2026/read", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readQixiMemorial(
    input: FarmHumanQixiMemorialReadInput,
  ): Promise<FarmHumanQixiMemorialReadSuccess> {
    const requestBody = farmHumanQixiMemorialReadRequestSchema.parse({
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
      throw new FarmHumanQixiMemorialUnavailableError();
    }

    if (response.status === 502) {
      throw new FarmHumanQixiMemorialContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmHumanQixiMemorialUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmHumanQixiMemorialContractUnavailableError();
    }

    if (response.ok) {
      const result = farmHumanQixiMemorialReadSuccessSchema.safeParse(payload);
      if (!result.success || result.data.subject.farm_doorplate !== input.farmDoorplate) {
        throw new FarmHumanQixiMemorialContractUnavailableError();
      }
      return result.data;
    }

    const serviceError = farmHumanQixiMemorialReadErrorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmHumanQixiMemorialContractUnavailableError();
    }
    switch (serviceError.data.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
        throw new FarmHumanQixiMemorialCredentialInvalidError();
      case "farm_not_found":
        throw new FarmHumanQixiMemorialNotFoundError();
      case "farm_unavailable":
        throw new FarmHumanQixiMemorialUnavailableError();
      default:
        throw new FarmHumanQixiMemorialContractUnavailableError();
    }
  }
}

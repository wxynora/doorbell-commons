export interface FarmWelcomeRewardGrantInput {
  grantId: string;
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmWelcomeRewardGranter {
  grantWelcomeReward(input: FarmWelcomeRewardGrantInput): Promise<void>;
}

export class FarmRewardUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmRewardUnavailableError";
  }
}

export class FarmRewardCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is invalid");
    this.name = "FarmRewardCredentialInvalidError";
  }
}

export class FarmRewardContractUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmRewardContractUnavailableError";
  }
}

interface FarmRewardClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FarmRewardClient implements FarmWelcomeRewardGranter {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmRewardClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm reward timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#endpoint = new URL("internal/doorbell/welcome-reward", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async grantWelcomeReward(input: FarmWelcomeRewardGrantInput): Promise<void> {
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ grant_id: input.grantId, human_key: input.farmHumanKey }),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmRewardUnavailableError("The farm reward service could not be reached");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new FarmRewardContractUnavailableError("The farm reward service returned invalid JSON");
    }
    if (
      response.status === 404 &&
      isObject(body) &&
      isObject(body.error) &&
      body.error.code === "farm_credential_invalid"
    ) {
      throw new FarmRewardCredentialInvalidError();
    }
    if (!response.ok) {
      if (response.status >= 500) {
        throw new FarmRewardUnavailableError("The farm reward service is unavailable");
      }
      throw new FarmRewardContractUnavailableError("The farm reward request was rejected");
    }
    if (
      !isObject(body) ||
      body.ok !== true ||
      typeof body.applied !== "boolean" ||
      body.grant_id !== input.grantId ||
      body.farm_doorplate !== input.farmDoorplate ||
      !isObject(body.reward) ||
      body.reward.silver !== 200 ||
      !isObject(body.reward.seed) ||
      body.reward.seed.rarity !== "SSR" ||
      body.reward.seed.quantity !== 1 ||
      typeof body.reward.seed.id !== "string" ||
      typeof body.reward.seed.name !== "string"
    ) {
      throw new FarmRewardContractUnavailableError(
        "The farm reward receipt does not match the requested grant",
      );
    }
  }
}

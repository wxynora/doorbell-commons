import {
  halloweenFailure,
  halloweenSuccess,
  humanHalloweenCommand,
  type HumanHalloweenCommand,
  type HalloweenSuccess,
} from "./contract.js";

export class HalloweenUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "HalloweenUpstreamError";
  }
}

export interface HalloweenHumanClient {
  execute(input: HumanHalloweenCommand & { farmDoorplate: string; farmHumanKey: string }): Promise<HalloweenSuccess>;
}

export class FarmHalloweenClient implements HalloweenHumanClient {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #requestTimeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: {
    apiBaseUrl: string;
    serviceToken: string;
    requestTimeoutMs: number;
    fetchImplementation?: typeof fetch;
  }) {
    if (!options.serviceToken.trim()) throw new TypeError("A Farm service token is required");
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)
      throw new TypeError("A positive Farm request timeout is required");
    const base = new URL(options.apiBaseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:")
      throw new TypeError("Farm API URL must use http or https");
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.#endpoint = new URL("internal/doorbell/halloween/human", base);
    this.#serviceToken = options.serviceToken;
    this.#requestTimeoutMs = options.requestTimeoutMs;
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  async execute(input: HumanHalloweenCommand & { farmDoorplate: string; farmHumanKey: string }): Promise<HalloweenSuccess> {
    const { farmDoorplate, farmHumanKey, ...command } = input;
    const parsed = humanHalloweenCommand.parse(command);
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
        body: JSON.stringify({
          ...parsed,
          farm_human_key: farmHumanKey,
          expected_farm_doorplate: farmDoorplate,
        }),
      });
    } catch {
      throw new HalloweenUpstreamError(503, "service_unavailable");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HalloweenUpstreamError(502, "upstream_contract_unavailable");
    }
    if (response.ok) {
      const success = halloweenSuccess.safeParse(payload);
      if (success.success) return success.data;
    } else {
      const failure = halloweenFailure.safeParse(payload);
      if (failure.success) throw new HalloweenUpstreamError(response.status, failure.data.error.code);
    }
    throw new HalloweenUpstreamError(502, "upstream_contract_unavailable");
  }
}

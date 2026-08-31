import {
  type FarmActionListAuthorityReadSuccess,
  farmActionListAuthorityReadErrorSchema,
  farmActionListAuthorityReadRequestSchema,
  farmActionListAuthorityReadSuccessSchema,
} from "@doorbell/protocol";

export interface FarmActionListAuthorityReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmActionListAuthorityStateReader {
  readActionListAuthority(
    input: FarmActionListAuthorityReadInput,
  ): Promise<FarmActionListAuthorityReadSuccess>;
}

export class FarmActionListAuthorityClient implements FarmActionListAuthorityStateReader {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: {
    apiBaseUrl: string;
    requestTimeoutMs: number;
    serviceToken: string;
    fetchImplementation?: typeof fetch;
  }) {
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.#endpoint = new URL("internal/doorbell/human/action-list/authority/read", base);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readActionListAuthority(
    input: FarmActionListAuthorityReadInput,
  ): Promise<FarmActionListAuthorityReadSuccess> {
    const body = farmActionListAuthorityReadRequestSchema.parse({
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
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new Error("The farm action-list authority is unavailable");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("The farm action-list authority response is invalid");
    }
    if (response.ok) {
      const parsed = farmActionListAuthorityReadSuccessSchema.safeParse(payload);
      if (!parsed.success || parsed.data.data.farm.farm_doorplate !== input.farmDoorplate) {
        throw new Error("The farm action-list authority response is invalid");
      }
      return parsed.data;
    }
    if (!farmActionListAuthorityReadErrorSchema.safeParse(payload).success) {
      throw new Error("The farm action-list authority response is invalid");
    }
    throw new Error("The farm action-list authority is unavailable");
  }
}

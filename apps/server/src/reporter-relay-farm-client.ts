import { type ReporterRelayWake, reporterRelayStartResponseSchema } from "@doorbell/protocol";

export interface ReporterRelayStartInput {
  issueDate: string;
  periodStart: string;
  periodEnd: string;
}

export interface ReporterRelayStarter {
  startIssue(input: ReporterRelayStartInput): Promise<ReporterRelayWake>;
}

export class ReporterRelayFarmUnavailableError extends Error {
  constructor() {
    super("The Lingye reporter workflow service is unavailable");
    this.name = "ReporterRelayFarmUnavailableError";
  }
}

export class ReporterRelayFarmContractError extends Error {
  constructor() {
    super("The Lingye reporter workflow response could not be verified");
    this.name = "ReporterRelayFarmContractError";
  }
}

interface ReporterRelayFarmClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

export class ReporterRelayFarmClient implements ReporterRelayStarter {
  readonly #endpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: ReporterRelayFarmClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Reporter relay timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#endpoint = new URL("internal/doorbell/lingye-daily/reporter-relay/start", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async startIssue(input: ReporterRelayStartInput): Promise<ReporterRelayWake> {
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          issue_date: input.issueDate,
          period_start: input.periodStart,
          period_end: input.periodEnd,
        }),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new ReporterRelayFarmUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw response.status >= 500
        ? new ReporterRelayFarmUnavailableError()
        : new ReporterRelayFarmContractError();
    }
    if (response.status >= 500) throw new ReporterRelayFarmUnavailableError();
    const parsed = reporterRelayStartResponseSchema.safeParse(body);
    if (
      !response.ok ||
      !parsed.success ||
      parsed.data.data.issue_date !== input.issueDate ||
      parsed.data.data.wake.issue_date !== input.issueDate ||
      parsed.data.data.wake.stage !== "selection"
    ) {
      throw new ReporterRelayFarmContractError();
    }
    return parsed.data.data.wake;
  }
}

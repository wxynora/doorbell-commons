import { type LingyeDailyWeatherForecast, lingyeDailyWeatherResponseSchema } from "@doorbell/protocol";

export interface LingyeDailyWeatherReader {
  read(issueDate: string): Promise<LingyeDailyWeatherForecast | null>;
}

export class LingyeDailyWeatherClient implements LingyeDailyWeatherReader {
  readonly #endpoint: URL;
  readonly #fetch: typeof fetch;

  constructor(private readonly options: {
    apiBaseUrl: string;
    serviceToken: string;
    requestTimeoutMs: number;
    fetchImplementation?: typeof fetch;
  }) {
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.#endpoint = new URL("internal/doorbell/lingye-daily/weather", base);
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  async read(issueDate: string): Promise<LingyeDailyWeatherForecast | null> {
    const response = await this.#fetch(this.#endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ issue_date: issueDate }),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`Daily weather source returned HTTP ${response.status}`);
    return lingyeDailyWeatherResponseSchema.parse(await response.json()).data.weather_forecast;
  }
}

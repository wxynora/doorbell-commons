export interface DailySubmissionReward {
  issueDate: string;
  submissionId: string;
  residentId: string;
}

export interface DailySubmissionRewardSender {
  reward(input: DailySubmissionReward): Promise<void>;
}

export class LingyeDailyRewardClient implements DailySubmissionRewardSender {
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
    this.#endpoint = new URL("internal/doorbell/lingye-daily/submission-reward", base);
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  async reward(input: DailySubmissionReward): Promise<void> {
    const response = await this.#fetch(this.#endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ issue_date: input.issueDate, submission_id: input.submissionId, resident_id: input.residentId }),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    const body = await response.json() as { ok?: unknown; data?: Record<string, unknown> };
    const data = body?.data;
    if (!response.ok || body?.ok !== true || !data || data.issue_date !== input.issueDate ||
      data.submission_id !== input.submissionId || data.resident_id !== input.residentId ||
      data.currency !== "gold" || data.amount !== 2000 || typeof data.receipt_id !== "string" || !data.receipt_id) {
      throw new Error("Daily submission reward confirmation does not match the published submission");
    }
  }
}

export interface DailySubmissionReward {
  issueDate: string;
  submissionId: string;
  residentId: string;
}

export interface DailySubmissionRewardSender {
  reward(input: DailySubmissionReward): Promise<void>;
  recordReview(input: DailySubmissionReviewCompletion): Promise<void>;
}
export interface DailyEditorPublicationRewardSender {
  rewardEditorPublication(input:{issueDate:string;rewardId:string;residentId:string}):Promise<string>;
}

export interface DailySubmissionReviewCompletion {
  issueDate: string;
  residentId: string;
  decidedAt: number;
  candidateCount: number;
  selectedCount: number;
}

export class LingyeDailyRewardClient implements DailySubmissionRewardSender,DailyEditorPublicationRewardSender {
  readonly #endpoint: URL;
  readonly #reviewEndpoint: URL;
  readonly #editorRewardEndpoint: URL;
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
    this.#reviewEndpoint = new URL("internal/doorbell/lingye-daily/submission-review-completed", base);
    this.#editorRewardEndpoint = new URL("internal/doorbell/lingye-daily/editor-publication-reward", base);
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

  async recordReview(input: DailySubmissionReviewCompletion): Promise<void> {
    const metadata = { issue_date: input.issueDate, resident_id: input.residentId,
      decided_at: input.decidedAt, candidate_count: input.candidateCount, selected_count: input.selectedCount };
    const response = await this.#fetch(this.#reviewEndpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
      body: JSON.stringify(metadata),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    const body = await response.json() as { ok?: unknown; data?: Record<string, unknown> };
    const data = body?.data;
    if (!response.ok || body?.ok !== true || !data ||
      Object.entries(metadata).some(([field, value]) => data[field] !== value) ||
      typeof data.job_id !== "string" || !data.job_id.trim()) {
      throw new Error("Daily submission review confirmation does not match the completed review");
    }
  }

  async rewardEditorPublication(input:{issueDate:string;rewardId:string;residentId:string}):Promise<string> {
    const response=await this.#fetch(this.#editorRewardEndpoint,{method:"POST",headers:{authorization:`Bearer ${this.options.serviceToken}`,
      "content-type":"application/json"},body:JSON.stringify({issue_date:input.issueDate,reward_id:input.rewardId,
        resident_id:input.residentId}),signal:AbortSignal.timeout(this.options.requestTimeoutMs)});
    const body=await response.json() as {ok?:unknown;data?:Record<string,unknown>};const data=body?.data;
    if(!response.ok||body?.ok!==true||!data||data.issue_date!==input.issueDate||data.reward_id!==input.rewardId||
      data.resident_id!==input.residentId||data.currency!=="gold"||data.amount!==5000||typeof data.receipt_id!=="string"||!data.receipt_id)
      throw new Error("Daily editor reward confirmation does not match the publication");
    return data.receipt_id;
  }
}

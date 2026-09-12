import { type ReporterRelayWake, reporterRelayStartResponseSchema, reporterRelayWakeSchema } from "@doorbell/protocol";
import { z } from "zod";

export interface ReporterRelayStartInput {
  issueDate: string;
  periodStart: string;
  periodEnd: string;
}

export interface ReporterRelayStarter {
  startIssue(input: ReporterRelayStartInput): Promise<ReporterRelayWake>;
  submissionReviewer(issueDate: string): Promise<{ residentId: string; displayName: string } | null>;
  pendingIssue(issueDate:string):Promise<ReporterRelayWake|null>;
  issueState(issueDate: string): Promise<{ status: string | null; wake: ReporterRelayWake | null }>;
}

const reviewerResponseSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    issue_date: z.string(),
    reviewer: z.strictObject({ resident_id: z.uuid(), display_name: z.string().min(1) }).nullable(),
  }),
});
const pendingResponseSchema=z.strictObject({ok:z.literal(true),data:z.strictObject({
  issue_date:z.string(),issue_status:z.string().min(1).nullable(),wake:reporterRelayWakeSchema.nullable(),
})});

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

export interface DailyVoiceSubmission {
  issue_date: string;
  resident_id: string;
  submission_id: string;
  submitted_at: string;
}

export interface DailyVoicePublication {
  issue_date: string;
  resident_id: string;
  submission_id: string;
  publication_id: string;
  published_at: string;
}

export interface DailyVoiceFarm {
  voiceAuthor(issueDate: string): Promise<{ residentId: string; displayName: string } | null>;
  voiceSubmitted(input: DailyVoiceSubmission): Promise<void>;
  voicePublished(input: DailyVoicePublication): Promise<void>;
}

export class ReporterRelayFarmClient implements ReporterRelayStarter, DailyVoiceFarm {
  readonly #voiceBase: URL;
  readonly #endpoint: URL;
  readonly #reviewerEndpoint: URL;
  readonly #pendingEndpoint: URL;
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
    this.#reviewerEndpoint = new URL("internal/doorbell/lingye-daily/reporter-relay/reviewer", apiBaseUrl);
    this.#pendingEndpoint = new URL("internal/doorbell/lingye-daily/reporter-relay/pending", apiBaseUrl);
    this.#voiceBase = new URL("internal/doorbell/lingye-daily/reporter-relay/", apiBaseUrl);
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

  async submissionReviewer(issueDate: string): Promise<{ residentId: string; displayName: string } | null> {
    let response: Response;
    try {
      response = await this.#fetch(this.#reviewerEndpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify({ issue_date: issueDate }),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new ReporterRelayFarmUnavailableError();
    }
    if (response.status >= 500) throw new ReporterRelayFarmUnavailableError();
    const parsed = reviewerResponseSchema.safeParse(await response.json().catch(() => undefined));
    if (!response.ok || !parsed.success || parsed.data.data.issue_date !== issueDate) throw new ReporterRelayFarmContractError();
    const reviewer = parsed.data.data.reviewer;
    return reviewer ? { residentId: reviewer.resident_id, displayName: reviewer.display_name } : null;
  }

  async pendingIssue(issueDate:string):Promise<ReporterRelayWake|null> {
    return (await this.issueState(issueDate)).wake;
  }

  async issueState(issueDate: string): Promise<{ status: string | null; wake: ReporterRelayWake | null }> {
    let response:Response;
    try {response=await this.#fetch(this.#pendingEndpoint,{method:"POST",headers:{authorization:`Bearer ${this.#serviceToken}`,
      "content-type":"application/json"},body:JSON.stringify({issue_date:issueDate,include_state:true}),signal:AbortSignal.timeout(this.#requestTimeoutMs)});}
    catch {throw new ReporterRelayFarmUnavailableError();}
    if(response.status>=500) throw new ReporterRelayFarmUnavailableError();
    const parsed=pendingResponseSchema.safeParse(await response.json().catch(()=>undefined));
    if(!response.ok||!parsed.success||parsed.data.data.issue_date!==issueDate) throw new ReporterRelayFarmContractError();
    const data = parsed.data.data;
    if (data.wake && (data.issue_status === null || data.wake.issue_date !== issueDate)) {
      throw new ReporterRelayFarmContractError();
    }
    return { status: data.issue_status, wake: data.wake };
  }

  private async voiceRequest(operation: string, input: object): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(new URL(operation, this.#voiceBase), {
        method: "POST", headers: { authorization: `Bearer ${this.#serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify(input), signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch { throw new ReporterRelayFarmUnavailableError(); }
    if (response.status >= 500) throw new ReporterRelayFarmUnavailableError();
    const body = await response.json().catch(() => undefined);
    if (!response.ok) throw new ReporterRelayFarmContractError();
    return body;
  }

  async voiceAuthor(issueDate: string) {
    const schema = z.strictObject({ ok: z.literal(true), data: z.strictObject({
      issue_date: z.literal(issueDate), author: z.strictObject({ resident_id: z.uuid(), display_name: z.string().min(1) }).nullable(),
    }) });
    const parsed = schema.safeParse(await this.voiceRequest("voice-author", { issue_date: issueDate }));
    if (!parsed.success) throw new ReporterRelayFarmContractError();
    const author = parsed.data.data.author;
    return author ? { residentId: author.resident_id, displayName: author.display_name } : null;
  }

  async voiceSubmitted(input: DailyVoiceSubmission): Promise<void> {
    const schema = z.strictObject({ ok: z.literal(true), data: z.strictObject({
      issue_date: z.literal(input.issue_date), resident_id: z.literal(input.resident_id),
      submission_id: z.literal(input.submission_id), submitted_at: z.literal(input.submitted_at), job_id: z.string().min(1),
    }) });
    if (!schema.safeParse(await this.voiceRequest("voice-submitted", input)).success) throw new ReporterRelayFarmContractError();
  }

  async voicePublished(input: DailyVoicePublication): Promise<void> {
    const schema = z.strictObject({ ok: z.literal(true), data: z.strictObject({
      issue_date: z.literal(input.issue_date), resident_id: z.literal(input.resident_id),
      submission_id: z.literal(input.submission_id), publication_id: z.literal(input.publication_id),
      published_at: z.literal(input.published_at), job_id: z.string().min(1),
    }) });
    if (!schema.safeParse(await this.voiceRequest("voice-published", input)).success) throw new ReporterRelayFarmContractError();
  }

  async publicationWriter(issueDate: string, publicationIds: string[]): Promise<string[]> {
    const schema = z.strictObject({ ok: z.literal(true), data: z.strictObject({
      issue_date: z.literal(issueDate), status: z.literal("ready"), publication: z.strictObject({
        publication_id: z.string().min(1), writer_resident_id: z.uuid(),
        scheduled_publication_at: z.iso.datetime({ offset: true }), selector: z.string().min(1), writer: z.string().min(1),
        reviewer: z.string().min(1).optional(), review_kind: z.literal("farm_article").optional(),
        article_text: z.string().min(1), version: z.number().int().positive(),
      }),
    }) });
    const parsed = schema.safeParse(await this.voiceRequest("publication", { issue_date: issueDate }));
    if (!parsed.success || !publicationIds.includes(parsed.data.data.publication.publication_id)) throw new ReporterRelayFarmContractError();
    return [parsed.data.data.publication.writer_resident_id];
  }

  async commentAuthorName(residentId: string, kind: "resident" | "human"): Promise<string> {
    const schema = z.strictObject({ ok: z.literal(true), data: z.strictObject({ resident_id: z.literal(residentId),
      human_name: z.string().nullable(), ai_name: z.string().nullable(),
    }) });
    const parsed = schema.safeParse(await this.voiceRequest("../comment-author", { resident_id: residentId }));
    if (!parsed.success) throw new ReporterRelayFarmContractError();
    const name = kind === "human" ? parsed.data.data.human_name : parsed.data.data.ai_name;
    if (!name?.trim()) throw new ReporterRelayFarmContractError();
    return name;
  }
}

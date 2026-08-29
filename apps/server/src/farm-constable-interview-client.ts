import {
  type FarmConstableInterviewError,
  type FarmConstableInterviewPublicNoticeSuccess,
  type FarmHumanConstableInterviewActionRequest,
  type FarmHumanConstableInterviewSuccess,
  farmConstableInterviewErrorSchema,
  farmConstableInterviewPublicNoticeRequestSchema,
  farmConstableInterviewPublicNoticeSuccessSchema,
  farmHumanConstableInterviewActionRequestSchema,
  farmHumanConstableInterviewReadRequestSchema,
  farmHumanConstableInterviewSuccessSchema,
} from "@doorbell/protocol";

export interface FarmConstableInterviewIdentity {
  farmDoorplate: string;
  farmHumanKey: string;
  accountId: string;
  residentId: string;
}

export interface FarmHumanConstableInterviewReadInput extends FarmConstableInterviewIdentity {
  interviewId?: string;
}

export interface FarmHumanConstableInterviewSignupInput extends FarmConstableInterviewIdentity {
  interviewId: string;
}

export interface FarmHumanConstableInterviewAttendanceInput extends FarmConstableInterviewIdentity {
  interviewId: string;
}

export interface FarmHumanConstableInterviewScoreInput extends FarmConstableInterviewIdentity {
  interviewId: string;
  facts: number;
  restraint: number;
  procedure: number;
  explanation: number;
}

export type FarmHumanConstableInterviewActionInput =
  | ({ action: "signup" } & FarmHumanConstableInterviewSignupInput)
  | ({ action: "confirm_attendance" } & FarmHumanConstableInterviewAttendanceInput)
  | ({ action: "score" } & FarmHumanConstableInterviewScoreInput);

export interface FarmConstableInterviewPublicNoticeInput {
  interviewId: string;
  candidateResidentName: string;
  eligibleVoterResidentIds: readonly string[];
}

export interface FarmConstableInterviewReader {
  readConstableInterview(
    input: FarmHumanConstableInterviewReadInput,
  ): Promise<FarmHumanConstableInterviewSuccess>;
}

export interface FarmConstableInterviewActioner {
  executeConstableInterviewAction(
    input: FarmHumanConstableInterviewActionInput,
  ): Promise<FarmHumanConstableInterviewSuccess>;
}

export interface FarmConstableInterviewPublicNoticeOpener {
  openConstablePublicNotice(
    input: FarmConstableInterviewPublicNoticeInput,
  ): Promise<FarmConstableInterviewPublicNoticeSuccess>;
}

export class FarmConstableInterviewCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmConstableInterviewCredentialInvalidError";
  }
}

export class FarmConstableInterviewNotFoundError extends Error {
  constructor() {
    super("The constable interview no longer exists");
    this.name = "FarmConstableInterviewNotFoundError";
  }
}

export class FarmConstableInterviewUnavailableError extends Error {
  constructor() {
    super("The farm constable interview service is unavailable");
    this.name = "FarmConstableInterviewUnavailableError";
  }
}

export class FarmConstableInterviewContractUnavailableError extends Error {
  constructor() {
    super("The farm constable interview response could not be verified");
    this.name = "FarmConstableInterviewContractUnavailableError";
  }
}

export class FarmConstableInterviewRejectedError extends Error {
  readonly code: Exclude<
    FarmConstableInterviewError["error"]["code"],
    | "invalid_request"
    | "authentication_required"
    | "farm_credential_not_found"
    | "farm_doorplate_mismatch"
    | "farm_credential_invalid"
    | "farm_not_found"
    | "farm_unavailable"
    | "upstream_contract_unavailable"
  >;

  constructor(code: FarmConstableInterviewRejectedError["code"], message: string) {
    super(message);
    this.name = "FarmConstableInterviewRejectedError";
    this.code = code;
  }
}

interface FarmConstableInterviewClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

function identityFields(input: FarmConstableInterviewIdentity) {
  return {
    farm_human_key: input.farmHumanKey,
    expected_farm_doorplate: input.farmDoorplate,
    account_id: input.accountId,
    resident_id: input.residentId,
  };
}

export class FarmConstableInterviewClient
  implements
    FarmConstableInterviewReader,
    FarmConstableInterviewActioner,
    FarmConstableInterviewPublicNoticeOpener
{
  readonly #readEndpoint: URL;
  readonly #actionEndpoint: URL;
  readonly #openPublicNoticeEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmConstableInterviewClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError(
        "Farm Human Constable Interview API timeout must be a positive integer in milliseconds",
      );
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
    this.#readEndpoint = new URL("internal/doorbell/human/constable/interview/read", apiBaseUrl);
    this.#actionEndpoint = new URL(
      "internal/doorbell/human/constable/interview/action",
      apiBaseUrl,
    );
    this.#openPublicNoticeEndpoint = new URL(
      "internal/doorbell/constable/interview/public-notice/open",
      apiBaseUrl,
    );
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readConstableInterview(
    input: FarmHumanConstableInterviewReadInput,
  ): Promise<FarmHumanConstableInterviewSuccess> {
    const requestBody = farmHumanConstableInterviewReadRequestSchema.parse({
      ...identityFields(input),
      ...(input.interviewId === undefined ? {} : { interview_id: input.interviewId }),
    });
    const result = await this.#requestHuman(
      this.#readEndpoint,
      requestBody,
      input,
      farmHumanConstableInterviewSuccessSchema,
    );
    return result;
  }

  async executeConstableInterviewAction(
    input: FarmHumanConstableInterviewActionInput,
  ): Promise<FarmHumanConstableInterviewSuccess> {
    const request: FarmHumanConstableInterviewActionRequest =
      input.action === "signup"
        ? {
            ...identityFields(input),
            interview_id: input.interviewId,
            action: "signup",
          }
        : input.action === "confirm_attendance"
          ? {
              ...identityFields(input),
              interview_id: input.interviewId,
              action: "confirm_attendance",
            }
          : {
              ...identityFields(input),
              interview_id: input.interviewId,
              action: "score",
              facts: input.facts,
              restraint: input.restraint,
              procedure: input.procedure,
              explanation: input.explanation,
            };
    const requestBody = farmHumanConstableInterviewActionRequestSchema.parse(request);
    return this.#requestHuman(
      this.#actionEndpoint,
      requestBody,
      input,
      farmHumanConstableInterviewSuccessSchema,
    );
  }

  async openConstablePublicNotice(
    input: FarmConstableInterviewPublicNoticeInput,
  ): Promise<FarmConstableInterviewPublicNoticeSuccess> {
    const requestBody = farmConstableInterviewPublicNoticeRequestSchema.parse({
      interview_id: input.interviewId,
      candidate_resident_name: input.candidateResidentName,
      eligible_voter_resident_ids: [...input.eligibleVoterResidentIds],
    });
    let response: Response;
    try {
      response = await this.#fetch(this.#openPublicNoticeEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmConstableInterviewUnavailableError();
    }
    if (response.status === 502) throw new FarmConstableInterviewContractUnavailableError();
    if (response.status >= 500) throw new FarmConstableInterviewUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmConstableInterviewContractUnavailableError();
    }
    if (response.ok) {
      const parsed = farmConstableInterviewPublicNoticeSuccessSchema.safeParse(payload);
      if (!parsed.success) {
        throw new FarmConstableInterviewContractUnavailableError();
      }
      return parsed.data;
    }
    this.#throwError(payload, response.status);
  }

  async #requestHuman<T>(
    endpoint: URL,
    requestBody: unknown,
    input: FarmConstableInterviewIdentity,
    successSchema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmConstableInterviewUnavailableError();
    }
    if (response.status === 502) throw new FarmConstableInterviewContractUnavailableError();
    if (response.status >= 500) throw new FarmConstableInterviewUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmConstableInterviewContractUnavailableError();
    }
    if (!response.ok) this.#throwError(payload, response.status);

    const parsed = successSchema.safeParse(payload);
    if (!parsed.success) throw new FarmConstableInterviewContractUnavailableError();
    const subject = (parsed.data as FarmHumanConstableInterviewSuccess).subject;
    if (
      subject.farm_doorplate !== input.farmDoorplate ||
      subject.account_id !== input.accountId ||
      subject.resident_id !== input.residentId
    ) {
      throw new FarmConstableInterviewContractUnavailableError();
    }
    return parsed.data;
  }

  #throwError(payload: unknown, status: number): never {
    const parsed = farmConstableInterviewErrorSchema.safeParse(payload);
    if (!parsed.success) throw new FarmConstableInterviewContractUnavailableError();
    switch (parsed.data.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmConstableInterviewCredentialInvalidError();
      case "farm_not_found":
        throw new FarmConstableInterviewNotFoundError();
      case "farm_unavailable":
        throw new FarmConstableInterviewUnavailableError();
      case "upstream_contract_unavailable":
        throw new FarmConstableInterviewContractUnavailableError();
      case "invalid_request":
      case "authentication_required":
        throw status >= 500
          ? new FarmConstableInterviewUnavailableError()
          : new FarmConstableInterviewContractUnavailableError();
      default:
        throw new FarmConstableInterviewRejectedError(
          parsed.data.error.code,
          parsed.data.error.message,
        );
    }
  }
}

export const FarmHumanConstableInterviewClient = FarmConstableInterviewClient;

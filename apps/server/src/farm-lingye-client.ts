import {
  type FarmHumanGlimmerReadSuccess,
  type FarmHumanReporterLikeSuccess,
  type FarmHumanReporterReadSuccess,
  type FarmHumanTogetherReadSuccess,
  farmHumanGlimmerReadErrorSchema,
  farmHumanGlimmerReadRequestSchema,
  farmHumanGlimmerReadSuccessSchema,
  farmHumanReporterErrorSchema,
  farmHumanReporterLikeRequestSchema,
  farmHumanReporterLikeSuccessSchema,
  farmHumanReporterReadRequestSchema,
  farmHumanReporterReadSuccessSchema,
  farmHumanTogetherReadErrorSchema,
  farmHumanTogetherReadRequestSchema,
  farmHumanTogetherReadSuccessSchema,
  lingyeActionRequestSchema,
  lingyeActionResultSchema,
  lingyeActionServiceErrorSchema,
  type OwnerProfileCareerSummarySuccess,
  ownerProfileCareerIdSchema,
  ownerProfileCareerSummarySuccessSchema,
} from "@doorbell/protocol";
import { z } from "zod";

export interface FarmLingyeReadInput {
  farmDoorplate: string;
  farmHumanKey: string;
}

export interface FarmLingyeReader {
  readCareerSummary(input: FarmLingyeCareerReadInput): Promise<OwnerProfileCareerSummarySuccess>;
  readGlimmer(input: FarmLingyeReadInput): Promise<FarmHumanGlimmerReadSuccess>;
  readReporterPublications(input: FarmReporterIdentityInput): Promise<FarmHumanReporterReadSuccess>;
  likeReporterPublication(
    input: FarmReporterIdentityInput & { likeRef: string },
  ): Promise<FarmHumanReporterLikeSuccess>;
  readTogether(input: FarmLingyeReadInput): Promise<FarmHumanTogetherReadSuccess>;
}

export interface FarmLingyeCareerReadInput extends FarmLingyeReadInput {
  residentId: string;
}

export interface FarmReporterIdentityInput extends FarmLingyeReadInput {
  humanActorKey: string;
  relatedResidentIds: readonly string[];
}

export class FarmLingyeCredentialInvalidError extends Error {
  constructor() {
    super("The bound farm human credential is no longer valid");
    this.name = "FarmLingyeCredentialInvalidError";
  }
}

export class FarmLingyeNotFoundError extends Error {
  constructor() {
    super("The bound farm no longer exists");
    this.name = "FarmLingyeNotFoundError";
  }
}

export class FarmLingyeUnavailableError extends Error {
  constructor() {
    super("The farm Lingye service is unavailable");
    this.name = "FarmLingyeUnavailableError";
  }
}

export class FarmLingyeContractUnavailableError extends Error {
  constructor() {
    super("The farm Lingye response could not be verified");
    this.name = "FarmLingyeContractUnavailableError";
  }
}

export class FarmReporterAuthorLikeForbiddenError extends Error {}
export class FarmReporterEvaluationClosedError extends Error {}

interface FarmLingyeClientOptions {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  serviceToken: string;
  fetchImplementation?: typeof fetch;
}

interface SafeParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

interface FarmLingyeBoundSuccess {
  subject: { farm_doorplate: string };
}

interface FarmLingyeErrorPayload {
  error: {
    code: string;
    message: string;
  };
}

const CAREER_ORDER = ["chef", "agronomist", "veterinarian", "reporter", "constable"] as const;

const careerCertificateSectionSchema = z.object({
  section: z.literal("certificates"),
  value: z.array(
    z.object({
      career: ownerProfileCareerIdSchema,
      qualificationLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      status: z.string(),
      canWork: z.boolean(),
      title: z.string().trim().min(1).nullable(),
    }),
  ),
});

export class FarmLingyeClient implements FarmLingyeReader {
  readonly #careerSummaryEndpoint: URL;
  readonly #glimmerReadEndpoint: URL;
  readonly #reporterLikeEndpoint: URL;
  readonly #reporterReadEndpoint: URL;
  readonly #togetherReadEndpoint: URL;
  readonly #serviceToken: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: FarmLingyeClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new TypeError("Farm Lingye API timeout must be a positive integer in milliseconds");
    }
    const apiBaseUrl = new URL(options.apiBaseUrl);
    if (!apiBaseUrl.pathname.endsWith("/")) {
      apiBaseUrl.pathname += "/";
    }
    this.#glimmerReadEndpoint = new URL("internal/doorbell/human/glimmer/read", apiBaseUrl);
    this.#careerSummaryEndpoint = new URL("internal/doorbell/lingye-actions/execute", apiBaseUrl);
    this.#reporterLikeEndpoint = new URL("internal/doorbell/human/reporter/like", apiBaseUrl);
    this.#reporterReadEndpoint = new URL("internal/doorbell/human/reporter/read", apiBaseUrl);
    this.#togetherReadEndpoint = new URL("internal/doorbell/human/together/read", apiBaseUrl);
    this.#serviceToken = options.serviceToken;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
  }

  async readCareerSummary(
    input: FarmLingyeCareerReadInput,
  ): Promise<OwnerProfileCareerSummarySuccess> {
    const requestBody = lingyeActionRequestSchema.parse({
      resident_id: input.residentId,
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      op: "go.school.view",
      args: { section: "certificates" },
    });

    let response: Response;
    try {
      response = await this.#fetch(this.#careerSummaryEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch {
      throw new FarmLingyeUnavailableError();
    }

    if (response.status === 502) throw new FarmLingyeContractUnavailableError();
    if (response.status >= 500) throw new FarmLingyeUnavailableError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmLingyeContractUnavailableError();
    }

    if (!response.ok) {
      const serviceError = lingyeActionServiceErrorSchema.safeParse(payload);
      if (!serviceError.success) throw new FarmLingyeContractUnavailableError();
      switch (serviceError.data.error.code) {
        case "farm_credential_not_found":
        case "farm_doorplate_mismatch":
        case "farm_migration_required":
          throw new FarmLingyeCredentialInvalidError();
        case "lingye_unavailable":
        case "service_not_configured":
          throw new FarmLingyeUnavailableError();
        default:
          throw new FarmLingyeContractUnavailableError();
      }
    }

    const actionResult = lingyeActionResultSchema.safeParse(payload);
    if (!actionResult.success) throw new FarmLingyeContractUnavailableError();
    if (!actionResult.data.ok) {
      if (actionResult.data.error.code === "LINGYE_NOT_READY") {
        throw new FarmLingyeUnavailableError();
      }
      throw new FarmLingyeContractUnavailableError();
    }

    const section = careerCertificateSectionSchema.safeParse(actionResult.data.data);
    if (!section.success) throw new FarmLingyeContractUnavailableError();

    const highestActiveByCareer = new Map<
      (typeof CAREER_ORDER)[number],
      (typeof section.data.value)[number]
    >();
    for (const certificate of section.data.value) {
      if (certificate.status !== "active" || !certificate.canWork) continue;
      const current = highestActiveByCareer.get(certificate.career);
      if (!current || current.qualificationLevel < certificate.qualificationLevel) {
        highestActiveByCareer.set(certificate.career, certificate);
      }
    }

    return ownerProfileCareerSummarySuccessSchema.parse({
      careers: CAREER_ORDER.flatMap((career) => {
        const certificate = highestActiveByCareer.get(career);
        if (!certificate) return [];
        if (certificate.title === null) throw new FarmLingyeContractUnavailableError();
        return [
          {
            career,
            qualification_level: certificate.qualificationLevel,
            title: certificate.title,
          },
        ];
      }),
    });
  }

  readGlimmer(input: FarmLingyeReadInput): Promise<FarmHumanGlimmerReadSuccess> {
    const requestBody = farmHumanGlimmerReadRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
    });
    return this.#read(
      this.#glimmerReadEndpoint,
      requestBody,
      farmHumanGlimmerReadSuccessSchema,
      farmHumanGlimmerReadErrorSchema,
      input.farmDoorplate,
    );
  }

  readTogether(input: FarmLingyeReadInput): Promise<FarmHumanTogetherReadSuccess> {
    const requestBody = farmHumanTogetherReadRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
    });
    return this.#read(
      this.#togetherReadEndpoint,
      requestBody,
      farmHumanTogetherReadSuccessSchema,
      farmHumanTogetherReadErrorSchema,
      input.farmDoorplate,
    );
  }

  readReporterPublications(
    input: FarmReporterIdentityInput,
  ): Promise<FarmHumanReporterReadSuccess> {
    const requestBody = farmHumanReporterReadRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      human_actor_key: input.humanActorKey,
      related_resident_ids: input.relatedResidentIds,
    });
    return this.#read(
      this.#reporterReadEndpoint,
      requestBody,
      farmHumanReporterReadSuccessSchema,
      farmHumanReporterErrorSchema,
      input.farmDoorplate,
    );
  }

  likeReporterPublication(
    input: FarmReporterIdentityInput & { likeRef: string },
  ): Promise<FarmHumanReporterLikeSuccess> {
    const requestBody = farmHumanReporterLikeRequestSchema.parse({
      farm_human_key: input.farmHumanKey,
      expected_farm_doorplate: input.farmDoorplate,
      human_actor_key: input.humanActorKey,
      related_resident_ids: input.relatedResidentIds,
      like_ref: input.likeRef,
    });
    return this.#read(
      this.#reporterLikeEndpoint,
      requestBody,
      farmHumanReporterLikeSuccessSchema,
      farmHumanReporterErrorSchema,
      input.farmDoorplate,
    );
  }

  async #read<TSuccess extends FarmLingyeBoundSuccess>(
    endpoint: URL,
    requestBody: unknown,
    successSchema: SafeParser<TSuccess>,
    errorSchema: SafeParser<FarmLingyeErrorPayload>,
    expectedFarmDoorplate: string,
  ): Promise<TSuccess> {
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
      throw new FarmLingyeUnavailableError();
    }

    // 502 is the farm's contract/HTML boundary. Other upstream 5xx responses
    // are transient availability failures and must not be parsed as UI data.
    if (response.status === 502) {
      throw new FarmLingyeContractUnavailableError();
    }
    if (response.status >= 500) {
      throw new FarmLingyeUnavailableError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FarmLingyeContractUnavailableError();
    }

    if (response.ok) {
      const result = successSchema.safeParse(payload);
      if (!result.success || result.data.subject.farm_doorplate !== expectedFarmDoorplate) {
        throw new FarmLingyeContractUnavailableError();
      }
      return result.data;
    }

    const serviceError = errorSchema.safeParse(payload);
    if (!serviceError.success) {
      throw new FarmLingyeContractUnavailableError();
    }
    switch (serviceError.data.error.code) {
      case "farm_credential_not_found":
      case "farm_doorplate_mismatch":
      case "farm_credential_invalid":
        throw new FarmLingyeCredentialInvalidError();
      case "farm_not_found":
        throw new FarmLingyeNotFoundError();
      case "farm_unavailable":
        throw new FarmLingyeUnavailableError();
      case "author_like_forbidden":
        throw new FarmReporterAuthorLikeForbiddenError();
      case "evaluation_closed":
        throw new FarmReporterEvaluationClosedError();
      case "upstream_contract_unavailable":
        throw new FarmLingyeContractUnavailableError();
      default:
        throw new FarmLingyeContractUnavailableError();
    }
  }
}

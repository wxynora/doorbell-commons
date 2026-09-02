import { timingSafeEqual } from "node:crypto";
import type { LingyeDailyPublishRequest } from "@doorbell/protocol";
import type { DailySubmissionRewardSender } from "./lingye-daily-reward-client.js";
import type {
  CommunityDatabase,
  LingyeDailyIssueRecord,
  LingyeDailyPublishResult,
} from "./community-database.js";

export interface LingyeDailyServiceOptions {
  database: CommunityDatabase;
  publishToken: string;
  now?: () => number;
  submissionRewards?: DailySubmissionRewardSender;
}

export class LingyeDailyPublishAuthenticationError extends Error {
  constructor() {
    super("A valid Lingye Daily publish credential is required");
    this.name = "LingyeDailyPublishAuthenticationError";
  }
}

function credentialsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerCredential(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const credential = authorization.slice("Bearer ".length);
  return credential.length > 0 ? credential : undefined;
}

export class LingyeDailyService {
  readonly #database: CommunityDatabase;
  readonly #publishToken: string;
  readonly #now: () => number;
  readonly #submissionRewards: DailySubmissionRewardSender | undefined;

  constructor(options: LingyeDailyServiceOptions) {
    this.#database = options.database;
    this.#publishToken = options.publishToken;
    this.#now = options.now ?? Date.now;
    this.#submissionRewards = options.submissionRewards;
  }

  authorize(authorization: string | undefined): void {
    const credential = readBearerCredential(authorization);
    if (!credential || !credentialsEqual(credential, this.#publishToken)) {
      throw new LingyeDailyPublishAuthenticationError();
    }
  }

  async publish(
    authorization: string | undefined,
    input: LingyeDailyPublishRequest,
  ): Promise<LingyeDailyPublishResult> {
    this.authorize(authorization);
    const result = this.#database.publishLingyeDailyIssue(input, this.#now());
    // Publishing and the reward outbox commit together. Replaying publication
    // resumes unpaid entries; Farm deduplicates even if its response was lost.
    for (const pending of this.#database.lingyeDailyStore.pendingSubmissionRewards(input.issue_date)) {
      if (!this.#submissionRewards) throw new Error("Daily submission reward sender is not configured");
      await this.#submissionRewards.reward({ issueDate: input.issue_date, submissionId: pending.submission_id, residentId: pending.resident_id });
      this.#database.lingyeDailyStore.markSubmissionRewardPaid(pending.submission_id, this.#now());
    }
    return result;
  }

  getLatest(): LingyeDailyIssueRecord | undefined {
    return this.#database.getLatestLingyeDailyIssue();
  }

  getPublishedImage(issueDate:string,revision:number,imageId:string) {
    return this.#database.lingyeDailyStore.getPublishedImage(issueDate,revision,imageId,this.#now());
  }
}

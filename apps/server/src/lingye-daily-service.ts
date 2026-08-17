import { timingSafeEqual } from "node:crypto";
import type { LingyeDailyPublishRequest } from "@doorbell/protocol";
import type {
  CommunityDatabase,
  LingyeDailyIssueRecord,
  LingyeDailyPublishResult,
} from "./community-database.js";

export interface LingyeDailyServiceOptions {
  database: CommunityDatabase;
  publishToken: string;
  now?: () => number;
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

  constructor(options: LingyeDailyServiceOptions) {
    this.#database = options.database;
    this.#publishToken = options.publishToken;
    this.#now = options.now ?? Date.now;
  }

  publish(
    authorization: string | undefined,
    input: LingyeDailyPublishRequest,
  ): LingyeDailyPublishResult {
    const credential = readBearerCredential(authorization);
    if (!credential || !credentialsEqual(credential, this.#publishToken)) {
      throw new LingyeDailyPublishAuthenticationError();
    }
    return this.#database.publishLingyeDailyIssue(input, this.#now());
  }

  getLatest(): LingyeDailyIssueRecord | undefined {
    return this.#database.getLatestLingyeDailyIssue();
  }
}

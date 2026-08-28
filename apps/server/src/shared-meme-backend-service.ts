import { createHash } from "node:crypto";
import { mcpCredentialSchema } from "@doorbell/protocol";
import type { CommunityDatabase } from "./community-database.js";
import type { RegistrationAuthService } from "./registration-auth.js";

interface SharedMemeBackendServiceOptions {
  database: CommunityDatabase;
  registrationAuth: RegistrationAuthService;
}

export class SharedMemeBackendAuthenticationError extends Error {
  constructor() {
    super("An active Doorbell MCP credential is required");
    this.name = "SharedMemeBackendAuthenticationError";
  }
}

function hashCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export class SharedMemeBackendService {
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: RegistrationAuthService;

  constructor(options: SharedMemeBackendServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
  }

  async authorize(credential: string): Promise<string> {
    const parsed = mcpCredentialSchema.safeParse(credential);
    if (!parsed.success) throw new SharedMemeBackendAuthenticationError();
    const binding = this.#database.authenticateMcpCredentialHash(hashCredential(parsed.data));
    if (!binding) throw new SharedMemeBackendAuthenticationError();
    await this.#registrationAuth.confirmCurrentResidentMembership(binding.residentId);
    return binding.residentId;
  }
}

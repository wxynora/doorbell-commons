import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type BellAccessStatusResponse,
  type BellCredentialIssueResponse,
  bellAccessStatusResponseSchema,
  bellCredentialIssueResponseSchema,
  bellCredentialSchema,
  bellEndpointSchema,
} from "@doorbell/protocol";
import type { BellService } from "./bell-service.js";
import type { BellBindingState, CommunityDatabase } from "./community-database.js";
import type { RegistrationAuthService } from "./registration-auth.js";

export class BellCredentialNotConfiguredError extends Error {
  constructor() {
    super("No active Bell credential is configured");
    this.name = "BellCredentialNotConfiguredError";
  }
}

export class BellAccessInternalContractError extends Error {
  constructor() {
    super("The Bell access contract could not be completed safely");
    this.name = "BellAccessInternalContractError";
  }
}

interface BellAccessServiceOptions {
  database: CommunityDatabase;
  registrationAuth: RegistrationAuthService;
  bellService: BellService;
  bellEndpoint: string;
  now?: () => number;
  generateCredentialId?: () => string;
  generateCredential?: () => string;
}

function generateBellCredential(): string {
  return `dbb_${randomBytes(32).toString("base64url")}`;
}

export function hashBellCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export class BellAccessService {
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: RegistrationAuthService;
  readonly #bellService: BellService;
  readonly #bellEndpoint: string;
  readonly #now: () => number;
  readonly #generateCredentialId: () => string;
  readonly #generateCredential: () => string;

  constructor(options: BellAccessServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#bellService = options.bellService;
    this.#bellEndpoint = bellEndpointSchema.parse(options.bellEndpoint);
    this.#now = options.now ?? Date.now;
    this.#generateCredentialId = options.generateCredentialId ?? randomUUID;
    this.#generateCredential = options.generateCredential ?? generateBellCredential;
  }

  async getStatus(token: string): Promise<BellAccessStatusResponse> {
    const community = await this.#registrationAuth.getCurrentSession(token);
    return this.#statusForResident(community.resident.residentId);
  }

  async issueCredential(token: string): Promise<BellCredentialIssueResponse> {
    const community = await this.#registrationAuth.getCurrentSessionWithMembership(token);
    const credential = bellCredentialSchema.parse(this.#generateCredential());
    const credentialId = this.#generateCredentialId();
    const issuedAt = this.#now();
    const replacement = this.#database.replaceBellCredential(
      community.resident.residentId,
      credentialId,
      hashBellCredential(credential),
      issuedAt,
    );
    this.#bellService.disconnectResident(community.resident.residentId);
    return bellCredentialIssueResponseSchema.parse({
      bell_endpoint: this.#bellEndpoint,
      authorization_scheme: "Bearer",
      bell_credential: credential,
      credential_id: credentialId,
      credential_issued_at: new Date(issuedAt).toISOString(),
      replaced_previous: replacement.replacedPrevious,
    });
  }

  async revokeCredential(token: string): Promise<BellAccessStatusResponse> {
    const community = await this.#registrationAuth.getCurrentSessionWithMembership(token);
    const revoked = this.#database.revokeBellCredential(community.resident.residentId, this.#now());
    if (!revoked) throw new BellCredentialNotConfiguredError();
    this.#bellService.disconnectResident(community.resident.residentId);
    return this.#statusForResident(community.resident.residentId);
  }

  #statusForResident(residentId: string): BellAccessStatusResponse {
    const state = this.#database.getBellBindingState(residentId);
    const credentialStatus = this.#credentialStatus(state);
    return bellAccessStatusResponseSchema.parse({
      bell_endpoint: this.#bellEndpoint,
      authorization_scheme: "Bearer",
      credential_status: credentialStatus,
      credential_id: state.credentialId,
      credential_issued_at:
        state.credentialIssuedAt === null ? null : new Date(state.credentialIssuedAt).toISOString(),
      credential_revoked_at:
        state.credentialRevokedAt === null
          ? null
          : new Date(state.credentialRevokedAt).toISOString(),
    });
  }

  #credentialStatus(state: BellBindingState): "not_issued" | "active" | "revoked" {
    if (
      !state.configured &&
      state.credentialId === null &&
      state.credentialIssuedAt === null &&
      state.credentialRevokedAt === null
    ) {
      return "not_issued";
    }
    if (
      state.configured &&
      state.credentialId !== null &&
      state.credentialIssuedAt !== null &&
      state.credentialRevokedAt === null
    ) {
      return "active";
    }
    if (
      !state.configured &&
      state.credentialId !== null &&
      state.credentialIssuedAt !== null &&
      state.credentialRevokedAt !== null
    ) {
      return "revoked";
    }
    throw new BellAccessInternalContractError();
  }
}

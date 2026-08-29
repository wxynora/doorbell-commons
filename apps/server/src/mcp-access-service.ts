import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type McpAccessStatusResponse,
  type McpCredentialIssueResponse,
  mcpAccessStatusResponseSchema,
  mcpCredentialIssueResponseSchema,
  mcpCredentialSchema,
  mcpEndpointSchema,
} from "@doorbell/protocol";
import {
  type CommunityDatabase,
  type HumanCommunityRecord,
  type McpAccessBindingRecord,
  McpAccessStateConflictError,
} from "./community-database.js";
import type { FarmMcpMigrationRevoker } from "./mcp-farm-migration-client.js";
import type { RegistrationAuthService } from "./registration-auth.js";

export class McpRuntimeUnavailableError extends Error {
  constructor() {
    super("The Doorbell MCP runtime is not available");
    this.name = "McpRuntimeUnavailableError";
  }
}

export class McpMigrationNotConfirmedError extends Error {
  constructor() {
    super("The previous farm MCP link has not been confirmed as revoked");
    this.name = "McpMigrationNotConfirmedError";
  }
}

export class McpCredentialNotConfiguredError extends Error {
  constructor() {
    super("No active MCP credential is configured");
    this.name = "McpCredentialNotConfiguredError";
  }
}

export class McpAccessInternalContractError extends Error {
  constructor() {
    super("The MCP access contract could not be completed safely");
    this.name = "McpAccessInternalContractError";
  }
}

interface McpAccessServiceOptions {
  database: CommunityDatabase;
  registrationAuth: RegistrationAuthService;
  farmMigration: FarmMcpMigrationRevoker;
  mcpEndpoint: string;
  isRuntimeReady: () => boolean | Promise<boolean>;
  now?: () => number;
  generateMigrationId?: () => string;
  generateCredentialId?: () => string;
  generateCredential?: () => string;
}

function generateMcpCredential(): string {
  return `dbm_${randomBytes(32).toString("base64url")}`;
}

export function hashMcpCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export class McpAccessService {
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: RegistrationAuthService;
  readonly #farmMigration: FarmMcpMigrationRevoker;
  readonly #mcpEndpoint: string;
  readonly #isRuntimeReady: () => boolean | Promise<boolean>;
  readonly #now: () => number;
  readonly #generateMigrationId: () => string;
  readonly #generateCredentialId: () => string;
  readonly #generateCredential: () => string;

  constructor(options: McpAccessServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#farmMigration = options.farmMigration;
    this.#mcpEndpoint = mcpEndpointSchema.parse(options.mcpEndpoint);
    this.#isRuntimeReady = options.isRuntimeReady;
    this.#now = options.now ?? Date.now;
    this.#generateMigrationId = options.generateMigrationId ?? randomUUID;
    this.#generateCredentialId = options.generateCredentialId ?? randomUUID;
    this.#generateCredential = options.generateCredential ?? generateMcpCredential;
  }

  async getStatus(token: string): Promise<McpAccessStatusResponse> {
    const community = await this.#registrationAuth.getCurrentSession(token);
    return this.#statusForCommunity(community);
  }

  async claim(token: string): Promise<McpAccessStatusResponse> {
    const community = await this.#registrationAuth.getCurrentSession(token);
    let binding = this.#database.getMcpAccessBinding(community.resident.residentId);
    if (binding) this.#assertBindingTargetsCommunity(binding, community);
    if ((!binding || binding.farmRevokedAt === null) && !(await this.#runtimeReady())) {
      throw new McpRuntimeUnavailableError();
    }
    if (!binding) {
      try {
        binding = this.#database.beginMcpFarmMigration(
          community.resident.residentId,
          community.farmBinding.farmDoorplate,
          this.#generateMigrationId(),
          this.#now(),
        );
      } catch (error) {
        if (error instanceof McpAccessStateConflictError) {
          throw new McpAccessInternalContractError();
        }
        throw error;
      }
    }

    if (binding.farmRevokedAt !== null) {
      return this.#statusForCommunity(community);
    }
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new McpAccessInternalContractError();
    }
    const receipt = await this.#farmMigration.revokeLegacyMcpAccess({
      migrationId: binding.migrationId,
      residentId: community.resident.residentId,
      farmDoorplate: binding.farmDoorplate,
      farmHumanKey,
    });
    const farmRevokedAt = Date.parse(receipt.revoked_at);
    if (!Number.isFinite(farmRevokedAt)) {
      throw new McpAccessInternalContractError();
    }
    try {
      this.#database.confirmMcpFarmRevoked(
        community.resident.residentId,
        binding.migrationId,
        receipt.confirmation_id,
        farmRevokedAt,
      );
    } catch (error) {
      if (error instanceof McpAccessStateConflictError) {
        throw new McpAccessInternalContractError();
      }
      throw error;
    }
    return this.#statusForCommunity(community);
  }

  async issueCredential(token: string): Promise<McpCredentialIssueResponse> {
    const community = await this.#registrationAuth.getCurrentSession(token);
    const binding = this.#database.getMcpAccessBinding(community.resident.residentId);
    if (!binding || binding.farmRevokedAt === null || binding.farmConfirmationId === null) {
      throw new McpMigrationNotConfirmedError();
    }
    this.#assertBindingTargetsCommunity(binding, community);
    if (!(await this.#runtimeReady())) {
      throw new McpRuntimeUnavailableError();
    }

    const credential = mcpCredentialSchema.parse(this.#generateCredential());
    const credentialId = this.#generateCredentialId();
    const issuedAt = this.#now();
    const replacement = this.#database.replaceMcpCredential(
      community.resident.residentId,
      credentialId,
      hashMcpCredential(credential),
      issuedAt,
    );
    if (!replacement) {
      throw new McpMigrationNotConfirmedError();
    }
    return mcpCredentialIssueResponseSchema.parse({
      mcp_endpoint: this.#mcpEndpoint,
      authorization_scheme: "Bearer",
      mcp_credential: credential,
      credential_id: credentialId,
      credential_issued_at: new Date(issuedAt).toISOString(),
      replaced_previous: replacement.replacedPrevious,
    });
  }

  async revokeCredential(token: string): Promise<McpAccessStatusResponse> {
    const community = await this.#registrationAuth.getCurrentSession(token);
    const revoked = this.#database.revokeMcpCredential(community.resident.residentId, this.#now());
    if (!revoked) {
      throw new McpCredentialNotConfiguredError();
    }
    return this.#statusForCommunity(community);
  }

  async #runtimeReady(): Promise<boolean> {
    try {
      return (await this.#isRuntimeReady()) === true;
    } catch {
      return false;
    }
  }

  #statusForCommunity(community: HumanCommunityRecord): McpAccessStatusResponse {
    const binding = this.#database.getMcpAccessBinding(community.resident.residentId);
    if (!binding) {
      return mcpAccessStatusResponseSchema.parse({
        mcp_endpoint: this.#mcpEndpoint,
        authorization_scheme: "Bearer",
        migration_status: "not_started",
        credential_status: "not_issued",
        migration_id: null,
        migration_requested_at: null,
        farm_revoked_at: null,
        credential_id: null,
        credential_issued_at: null,
        credential_revoked_at: null,
      });
    }
    this.#assertBindingTargetsCommunity(binding, community);
    const credentialStatus = this.#credentialStatus(binding);
    return mcpAccessStatusResponseSchema.parse({
      mcp_endpoint: this.#mcpEndpoint,
      authorization_scheme: "Bearer",
      migration_status: binding.farmRevokedAt === null ? "pending_farm_revocation" : "farm_revoked",
      credential_status: credentialStatus,
      migration_id: binding.migrationId,
      migration_requested_at: new Date(binding.migrationRequestedAt).toISOString(),
      farm_revoked_at:
        binding.farmRevokedAt === null ? null : new Date(binding.farmRevokedAt).toISOString(),
      credential_id: binding.credentialId,
      credential_issued_at:
        binding.credentialIssuedAt === null
          ? null
          : new Date(binding.credentialIssuedAt).toISOString(),
      credential_revoked_at:
        binding.credentialRevokedAt === null
          ? null
          : new Date(binding.credentialRevokedAt).toISOString(),
    });
  }

  #assertBindingTargetsCommunity(
    binding: McpAccessBindingRecord,
    community: HumanCommunityRecord,
  ): void {
    if (
      binding.residentId !== community.resident.residentId ||
      binding.farmDoorplate !== community.farmBinding.farmDoorplate
    ) {
      throw new McpAccessInternalContractError();
    }
  }

  #credentialStatus(binding: McpAccessBindingRecord): "not_issued" | "active" | "revoked" {
    if (
      binding.credentialId === null &&
      binding.credentialTokenHash === null &&
      binding.credentialIssuedAt === null &&
      binding.credentialRevokedAt === null
    ) {
      return "not_issued";
    }
    if (
      binding.credentialId !== null &&
      binding.credentialTokenHash !== null &&
      binding.credentialIssuedAt !== null &&
      binding.credentialRevokedAt === null
    ) {
      return "active";
    }
    if (
      binding.credentialId !== null &&
      binding.credentialTokenHash === null &&
      binding.credentialIssuedAt !== null &&
      binding.credentialRevokedAt !== null
    ) {
      return "revoked";
    }
    throw new McpAccessInternalContractError();
  }
}

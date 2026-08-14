import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type ConnectorEventEnvelope,
  type ConnectorHelloFrame,
  type ConnectorSettingsStatus,
  connectorAckFrameSchema,
  connectorEventFrameSchema,
  connectorHeartbeatAckFrameSchema,
  connectorHeartbeatFrameSchema,
  connectorHelloFrameSchema,
  connectorReadyFrameSchema,
  connectorRequiredCapabilities,
  connectorResyncRequestFrameSchema,
  connectorResyncRequiredFrameSchema,
  connectorServerErrorFrameSchema,
  connectorWelcomeMessage,
  type MailboxCategory,
  sharedMemeVersionHintEventType,
  sharedMemeVersionHintPayloadSchema,
} from "@doorbell/protocol";
import type { WebSocket } from "ws";
import {
  type CommunityDatabase,
  type ConnectorEventRecord,
  RegistrationProfileRequiredError,
} from "./community-database.js";
import type { MailboxService } from "./mailbox-service.js";
import { OneBotUnavailableError } from "./qq-group-membership.js";
import type { RegistrationAuthService } from "./registration-auth.js";

const CONNECTOR_HEARTBEAT_INTERVAL_MS = 15_000;
const CONNECTOR_HEARTBEAT_TIMEOUT_MS = 45_000;
const CONNECTOR_HANDSHAKE_TIMEOUT_MS = 10_000;

interface ActiveConnectorConnection {
  socket: WebSocket;
  connectionId: string;
  credentialId: string;
  lastAliveAt: number;
  heartbeatTimer: NodeJS.Timeout;
}

export interface ConnectorServiceOptions {
  database: CommunityDatabase;
  registrationAuth: RegistrationAuthService;
  mailboxService: MailboxService;
  now?: () => number;
  generateCredential?: () => string;
  generateId?: () => string;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  handshakeTimeoutMs?: number;
}

export interface IssuedConnectorCredential {
  credentialId: string;
  credential: string;
  issuedAt: number;
  replacedPrevious: boolean;
}

export class ConnectorCredentialAuthenticationError extends Error {
  constructor() {
    super("An active Connector credential is required");
    this.name = "ConnectorCredentialAuthenticationError";
  }
}

function hashCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

function generateCredential(): string {
  return `dbc_${randomBytes(32).toString("base64url")}`;
}

function parseJson(data: Buffer | ArrayBuffer | Buffer[]): unknown {
  const buffer = Array.isArray(data)
    ? Buffer.concat(data)
    : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data);
  return JSON.parse(buffer.toString("utf8"));
}

function serializeEvent(event: ConnectorEventRecord): ConnectorEventEnvelope {
  return {
    event_id: event.eventId,
    cursor: event.cursor,
    event_type: event.eventType,
    created_at: new Date(event.createdAt).toISOString(),
    payload: event.payload,
  };
}

export class ConnectorService {
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: RegistrationAuthService;
  readonly #mailboxService: MailboxService;
  readonly #now: () => number;
  readonly #generateCredential: () => string;
  readonly #generateId: () => string;
  readonly #heartbeatIntervalMs: number;
  readonly #heartbeatTimeoutMs: number;
  readonly #handshakeTimeoutMs: number;
  readonly #connections = new Map<string, ActiveConnectorConnection>();

  constructor(options: ConnectorServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#mailboxService = options.mailboxService;
    this.#now = options.now ?? Date.now;
    this.#generateCredential = options.generateCredential ?? generateCredential;
    this.#generateId = options.generateId ?? randomUUID;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? CONNECTOR_HEARTBEAT_INTERVAL_MS;
    this.#heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? CONNECTOR_HEARTBEAT_TIMEOUT_MS;
    this.#handshakeTimeoutMs = options.handshakeTimeoutMs ?? CONNECTOR_HANDSHAKE_TIMEOUT_MS;
  }

  async issueCredential(humanSessionToken: string): Promise<IssuedConnectorCredential> {
    const community = await this.#registrationAuth.getCurrentSession(humanSessionToken);
    const credential = this.#generateCredential();
    const credentialId = this.#generateId();
    const issuedAt = this.#now();
    const replacedPrevious = this.#database.replaceConnectorCredential(
      community.resident.residentId,
      credentialId,
      hashCredential(credential),
      issuedAt,
    );
    this.disconnectResident(community.resident.residentId, 4002, "credential_replaced");
    return { credentialId, credential, issuedAt, replacedPrevious };
  }

  async revokeCredential(humanSessionToken: string): Promise<boolean> {
    const community = await this.#registrationAuth.getCurrentSession(humanSessionToken);
    const revoked = this.#database.revokeConnectorCredential(
      community.resident.residentId,
      this.#now(),
    );
    this.disconnectResident(community.resident.residentId, 4003, "credential_revoked");
    return revoked;
  }

  getSettingsStatus(residentId: string): ConnectorSettingsStatus {
    const binding = this.#database.getConnectorBindingState(residentId);
    if (!binding.configured) {
      return {
        status: "not_configured",
        last_online_at:
          binding.lastOnlineAt === null ? null : new Date(binding.lastOnlineAt).toISOString(),
      };
    }
    return {
      status: this.#connections.has(residentId) ? "online" : "offline",
      last_online_at:
        binding.lastOnlineAt === null ? null : new Date(binding.lastOnlineAt).toISOString(),
    };
  }

  async listMailbox(credential: string, page: number, category?: MailboxCategory) {
    const homeId = await this.#resolveCredentialHome(credential);
    return this.#mailboxService.listForAudience(homeId, "resident", page, category);
  }

  async readMailbox(credential: string, letterId: string) {
    const homeId = await this.#resolveCredentialHome(credential);
    return this.#mailboxService.openForAudience(homeId, "resident", letterId);
  }

  async claimMailboxReward(credential: string, letterId: string) {
    const homeId = await this.#resolveCredentialHome(credential);
    return this.#mailboxService.claimFarmReward(homeId, "resident", letterId);
  }

  async authorizeCredential(credential: string): Promise<{ residentId: string }> {
    const binding = this.#database.authenticateConnectorCredentialHash(hashCredential(credential));
    if (!binding) {
      throw new ConnectorCredentialAuthenticationError();
    }
    await this.#registrationAuth.confirmCurrentResidentMembership(binding.residentId);
    return { residentId: binding.residentId };
  }

  emitSharedMemeVersionHint(libraryVersion: number): void {
    const payload = sharedMemeVersionHintPayloadSchema.parse({ library_version: libraryVersion });
    for (const residentId of this.#database.listConfiguredConnectorResidentIds()) {
      this.emitEvent(residentId, sharedMemeVersionHintEventType, payload);
    }
  }

  acceptSocket(socket: WebSocket): void {
    let authenticatedResidentId: string | undefined;
    let authenticationInProgress = false;
    let activeConnection: ActiveConnectorConnection | undefined;
    const handshakeTimer = setTimeout(() => {
      if (!authenticatedResidentId) {
        socket.close(4000, "handshake_timeout");
      }
    }, this.#handshakeTimeoutMs);

    socket.on("message", async (data) => {
      let frame: unknown;
      try {
        frame = parseJson(data);
      } catch {
        this.#sendError(socket, "invalid_frame");
        socket.close(4000, "invalid_frame");
        return;
      }

      if (!authenticatedResidentId) {
        if (authenticationInProgress) {
          this.#sendError(socket, "invalid_frame");
          socket.close(4000, "authentication_in_progress");
          return;
        }
        authenticationInProgress = true;
        const hello = this.#parseHello(socket, frame);
        if (!hello) {
          return;
        }
        const binding = this.#database.authenticateConnectorCredentialHash(
          hashCredential(hello.credential),
        );
        if (!binding) {
          this.#sendError(socket, "authentication_rejected");
          socket.close(4003, "authentication_rejected");
          return;
        }

        try {
          await this.#registrationAuth.confirmCurrentResidentMembership(binding.residentId);
        } catch (error) {
          const unavailable = error instanceof OneBotUnavailableError;
          this.#sendError(
            socket,
            unavailable ? "membership_verification_unavailable" : "authentication_rejected",
          );
          socket.close(
            unavailable ? 1013 : 4003,
            unavailable ? "membership_verification_unavailable" : "authentication_rejected",
          );
          return;
        }

        clearTimeout(handshakeTimer);
        authenticatedResidentId = binding.residentId;
        const connectionId = this.#generateId();
        const now = this.#now();
        const previous = this.#connections.get(binding.residentId);
        if (previous) {
          previous.socket.close(4001, "connection_replaced");
          clearInterval(previous.heartbeatTimer);
        }
        if (!this.#database.markConnectorConnected(binding.residentId, binding.credentialId, now)) {
          this.#sendError(socket, "authentication_rejected");
          socket.close(4003, "authentication_rejected");
          return;
        }
        const heartbeatTimer = setInterval(() => {
          const current = this.#connections.get(binding.residentId);
          if (!current || current.socket !== socket) {
            return;
          }
          if (this.#now() - current.lastAliveAt >= this.#heartbeatTimeoutMs) {
            socket.close(4000, "heartbeat_timeout");
            return;
          }
          this.#send(
            socket,
            connectorHeartbeatFrameSchema.parse({
              type: "heartbeat",
              heartbeat_id: this.#generateId(),
              sent_at: new Date(this.#now()).toISOString(),
            }),
          );
        }, this.#heartbeatIntervalMs);
        activeConnection = {
          socket,
          connectionId,
          credentialId: binding.credentialId,
          lastAliveAt: now,
          heartbeatTimer,
        };
        this.#connections.set(binding.residentId, activeConnection);

        const lastAckedCursor = this.#database.getConnectorLastAckedCursor(binding.residentId);
        const resumeAfterCursor = Math.min(lastAckedCursor, hello.last_persisted_cursor);
        this.#send(
          socket,
          connectorReadyFrameSchema.parse({
            type: "ready",
            protocol_version: "1.0",
            capabilities: connectorRequiredCapabilities,
            connection_id: connectionId,
            resident_id: binding.residentId,
            resume_after_cursor: resumeAfterCursor,
            welcome: connectorWelcomeMessage,
          }),
        );
        this.#sendEventsAfter(socket, binding.residentId, resumeAfterCursor);
        return;
      }

      const ack = connectorAckFrameSchema.safeParse(frame);
      if (ack.success) {
        const result = this.#database.acknowledgeConnectorEvent(
          authenticatedResidentId,
          ack.data.cursor,
          ack.data.event_id,
        );
        if (result.status === "gap" || result.status === "mismatch") {
          this.#sendResyncRequired(
            socket,
            result.lastAckedCursor,
            result.status === "gap" ? "ack_gap" : "event_mismatch",
          );
          this.#sendEventsAfter(socket, authenticatedResidentId, result.lastAckedCursor);
        }
        return;
      }

      const heartbeatAck = connectorHeartbeatAckFrameSchema.safeParse(frame);
      if (heartbeatAck.success) {
        const current = this.#connections.get(authenticatedResidentId);
        if (current?.socket === socket) {
          current.lastAliveAt = this.#now();
          this.#database.markConnectorAlive(
            authenticatedResidentId,
            current.credentialId,
            current.lastAliveAt,
          );
        }
        return;
      }

      const resync = connectorResyncRequestFrameSchema.safeParse(frame);
      if (resync.success) {
        const events = this.#database.listConnectorEventsAfter(
          authenticatedResidentId,
          resync.data.after_cursor,
        );
        const reason = events.length === 0 ? "cursor_ahead" : "ack_gap";
        this.#sendResyncRequired(socket, resync.data.after_cursor, reason);
        for (const event of events) {
          this.#sendEvent(socket, event);
        }
        return;
      }

      this.#sendError(socket, "invalid_frame");
    });

    socket.on("close", () => {
      clearTimeout(handshakeTimer);
      if (activeConnection) {
        clearInterval(activeConnection.heartbeatTimer);
      }
      if (
        authenticatedResidentId &&
        this.#connections.get(authenticatedResidentId)?.socket === socket
      ) {
        this.#connections.delete(authenticatedResidentId);
      }
    });
  }

  emitEvent(
    residentId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): ConnectorEventRecord {
    const event = this.#database.appendConnectorEvent(
      residentId,
      this.#generateId(),
      eventType,
      payload,
      this.#now(),
    );
    const connection = this.#connections.get(residentId);
    if (connection) {
      this.#sendEvent(connection.socket, event);
    }
    return event;
  }

  disconnectResident(residentId: string, code: number, reason: string): void {
    const connection = this.#connections.get(residentId);
    if (!connection) {
      return;
    }
    clearInterval(connection.heartbeatTimer);
    this.#connections.delete(residentId);
    connection.socket.close(code, reason);
  }

  close(): void {
    for (const residentId of this.#connections.keys()) {
      this.disconnectResident(residentId, 1001, "server_shutdown");
    }
  }

  async #resolveCredentialHome(credential: string): Promise<string> {
    const { residentId } = await this.authorizeCredential(credential);
    const homeId = this.#database.findHomeIdByResidentId(residentId);
    if (!homeId) {
      throw new RegistrationProfileRequiredError();
    }
    return homeId;
  }

  #parseHello(socket: WebSocket, frame: unknown): ConnectorHelloFrame | undefined {
    if (frame === null || Array.isArray(frame) || typeof frame !== "object") {
      this.#sendError(socket, "invalid_frame");
      socket.close(4000, "invalid_frame");
      return undefined;
    }
    const candidate = frame as Record<string, unknown>;
    if (candidate.type !== "hello") {
      this.#sendError(socket, "invalid_frame");
      socket.close(4000, "hello_required");
      return undefined;
    }
    if (candidate.protocol_version !== "1.0") {
      this.#sendError(socket, "unsupported_protocol_version");
      socket.close(4000, "unsupported_protocol_version");
      return undefined;
    }
    const capabilities = Array.isArray(candidate.capabilities) ? candidate.capabilities : [];
    if (!connectorRequiredCapabilities.every((capability) => capabilities.includes(capability))) {
      this.#sendError(socket, "missing_required_capability");
      socket.close(4000, "missing_required_capability");
      return undefined;
    }
    const parsed = connectorHelloFrameSchema.safeParse(frame);
    if (!parsed.success) {
      this.#sendError(socket, "invalid_frame");
      socket.close(4000, "invalid_frame");
      return undefined;
    }
    return parsed.data;
  }

  #sendEventsAfter(socket: WebSocket, residentId: string, afterCursor: number): void {
    for (const event of this.#database.listConnectorEventsAfter(residentId, afterCursor)) {
      this.#sendEvent(socket, event);
    }
  }

  #sendEvent(socket: WebSocket, event: ConnectorEventRecord): void {
    this.#send(
      socket,
      connectorEventFrameSchema.parse({ type: "event", event: serializeEvent(event) }),
    );
  }

  #sendResyncRequired(
    socket: WebSocket,
    afterCursor: number,
    reason: "ack_gap" | "cursor_ahead" | "event_mismatch",
  ): void {
    this.#send(
      socket,
      connectorResyncRequiredFrameSchema.parse({
        type: "resync_required",
        after_cursor: afterCursor,
        reason,
      }),
    );
  }

  #sendError(
    socket: WebSocket,
    code:
      | "invalid_frame"
      | "unsupported_protocol_version"
      | "missing_required_capability"
      | "authentication_rejected"
      | "membership_verification_unavailable",
  ): void {
    this.#send(socket, connectorServerErrorFrameSchema.parse({ type: "error", code }));
  }

  #send(socket: WebSocket, frame: unknown): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(frame));
    }
  }
}

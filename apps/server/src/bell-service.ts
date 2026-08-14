import { createHash, randomUUID } from "node:crypto";
import type { BellBindingState, BellWakeRecord, CommunityDatabase } from "./community-database.js";

export const BELL_PROTOCOL_VERSION = 1 as const;
export const BELL_MAILBOX_REASON = "mailbox_unread" as const;
export const BELL_MAILBOX_MESSAGE = "📬 新消息：\nDoorbell Commons 信箱里有一封新信。";

const BELL_CREDENTIAL_PATTERN = /^dbb_[A-Za-z0-9_-]{43}$/u;

export interface BellRegistrationAuth {
  confirmCurrentResidentMembership(residentId: string): Promise<unknown>;
}

export interface BellStreamSink {
  send(event: "connected" | "wake" | "cancel", data: Record<string, unknown>): void;
  heartbeat(): void;
  close(): void;
}

export interface BellConnection {
  connectionEpoch: string;
  close(): void;
}

export interface BellServiceOptions {
  database: CommunityDatabase;
  registrationAuth: BellRegistrationAuth;
  heartbeatIntervalMs: number;
  replayIntervalMs: number;
  now?: () => number;
  generateConnectionEpoch?: () => string;
  generateWakeId?: () => string;
  onError?: (error: unknown) => void;
}

interface ActiveBellConnection {
  residentId: string;
  credentialId: string;
  connectionEpoch: string;
  sink: BellStreamSink;
  heartbeatTimer: NodeJS.Timeout;
  replayTimer: NodeJS.Timeout;
  closed: boolean;
}

export interface BellAckInput {
  wakeId: string;
  connectionEpoch: string;
}

export interface BellBlockInput extends BellAckInput {
  blockReason: string;
  errorCode: string;
}

export interface BellSettingsStatus {
  status: "not_configured" | "offline" | "online";
  last_connected_at: string | null;
}

export class BellCredentialAuthenticationError extends Error {
  constructor() {
    super("An active Bell credential is required");
    this.name = "BellCredentialAuthenticationError";
  }
}

export class BellConnectionEpochMismatchError extends Error {
  constructor() {
    super("The Bell control request does not belong to the active connection epoch");
    this.name = "BellConnectionEpochMismatchError";
  }
}

export class BellWakeControlError extends Error {
  constructor() {
    super("The Bell wake cannot enter the requested terminal state");
    this.name = "BellWakeControlError";
  }
}

function hashCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

function parseCredential(credential: string): string {
  if (!BELL_CREDENTIAL_PATTERN.test(credential)) {
    throw new BellCredentialAuthenticationError();
  }
  return credential;
}

export class BellService {
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: BellRegistrationAuth;
  readonly #heartbeatIntervalMs: number;
  readonly #replayIntervalMs: number;
  readonly #now: () => number;
  readonly #generateConnectionEpoch: () => string;
  readonly #generateWakeId: () => string;
  readonly #onError: (error: unknown) => void;
  readonly #connections = new Map<string, ActiveBellConnection>();

  constructor(options: BellServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs;
    this.#replayIntervalMs = options.replayIntervalMs;
    this.#now = options.now ?? Date.now;
    this.#generateConnectionEpoch = options.generateConnectionEpoch ?? randomUUID;
    this.#generateWakeId = options.generateWakeId ?? randomUUID;
    this.#onError = options.onError ?? (() => undefined);
  }

  async connect(credential: string, sink: BellStreamSink): Promise<BellConnection> {
    const binding = await this.#authenticate(credential);
    const now = this.#now();
    if (!this.#database.markBellConnected(binding.residentId, binding.credentialId, now)) {
      throw new BellCredentialAuthenticationError();
    }

    const previous = this.#connections.get(binding.residentId);
    if (previous) this.#closeConnection(previous, true);

    const connectionEpoch = this.#generateConnectionEpoch();
    const heartbeatTimer = setInterval(() => {
      const active = this.#connections.get(binding.residentId);
      if (!active || active.closed) return;
      try {
        active.sink.heartbeat();
      } catch (error) {
        this.#onError(error);
        this.#closeConnection(active, true);
      }
    }, this.#heartbeatIntervalMs);
    heartbeatTimer.unref?.();
    const replayTimer = setInterval(() => {
      const active = this.#connections.get(binding.residentId);
      if (!active || active.closed) return;
      try {
        this.refreshResident(binding.residentId);
      } catch (error) {
        this.#onError(error);
        this.#closeConnection(active, true);
      }
    }, this.#replayIntervalMs);
    replayTimer.unref?.();

    const active: ActiveBellConnection = {
      residentId: binding.residentId,
      credentialId: binding.credentialId,
      connectionEpoch,
      sink,
      heartbeatTimer,
      replayTimer,
      closed: false,
    };
    this.#connections.set(binding.residentId, active);
    try {
      sink.send("connected", {
        version: BELL_PROTOCOL_VERSION,
        connection_epoch: connectionEpoch,
      });
      this.refreshResident(binding.residentId);
    } catch (error) {
      this.#closeConnection(active, true);
      throw error;
    }

    return {
      connectionEpoch,
      close: () => this.#closeConnection(active, false),
    };
  }

  async acknowledge(
    credential: string,
    input: BellAckInput,
  ): Promise<{ version: 1; wake_id: string; status: "acked" }> {
    const binding = await this.#authenticateControl(credential, input.connectionEpoch);
    const result = this.#database.acknowledgeBellWake(
      binding.residentId,
      input.wakeId,
      this.#now(),
    );
    if (result !== "acked" && result !== "duplicate") {
      throw new BellWakeControlError();
    }
    return { version: BELL_PROTOCOL_VERSION, wake_id: input.wakeId, status: "acked" };
  }

  async reportBlocked(
    credential: string,
    input: BellBlockInput,
  ): Promise<{ version: 1; wake_id: string; status: "blocked" }> {
    const binding = await this.#authenticateControl(credential, input.connectionEpoch);
    const result = this.#database.blockBellWake(
      binding.residentId,
      input.wakeId,
      this.#now(),
      input.blockReason,
      input.errorCode,
    );
    if (result !== "blocked" && result !== "duplicate") {
      throw new BellWakeControlError();
    }
    return { version: BELL_PROTOCOL_VERSION, wake_id: input.wakeId, status: "blocked" };
  }

  refreshHome(homeId: string): void {
    const result = this.#database.refreshBellMailboxWakeForHome(
      homeId,
      this.#generateWakeId(),
      this.#now(),
    );
    this.#emitRefreshResult(result.residentId, result.wake, result.cancelledWakeId);
  }

  refreshResident(residentId: string): void {
    const result = this.#database.refreshBellMailboxWakeForResident(
      residentId,
      this.#generateWakeId(),
      this.#now(),
    );
    this.#emitRefreshResult(result.residentId, result.wake, result.cancelledWakeId);
  }

  getSettingsStatus(residentId: string): BellSettingsStatus {
    const state: BellBindingState = this.#database.getBellBindingState(residentId);
    if (!state.configured) {
      return { status: "not_configured", last_connected_at: null };
    }
    return {
      status: this.#connections.has(residentId) ? "online" : "offline",
      last_connected_at:
        state.lastConnectedAt === null ? null : new Date(state.lastConnectedAt).toISOString(),
    };
  }

  close(): void {
    for (const connection of this.#connections.values()) {
      this.#closeConnection(connection, true);
    }
  }

  async #authenticate(credential: string) {
    const parsed = parseCredential(credential);
    const binding = this.#database.authenticateBellCredentialHash(hashCredential(parsed));
    if (!binding) throw new BellCredentialAuthenticationError();
    await this.#registrationAuth.confirmCurrentResidentMembership(binding.residentId);
    return binding;
  }

  async #authenticateControl(credential: string, connectionEpoch: string) {
    const binding = await this.#authenticate(credential);
    const active = this.#connections.get(binding.residentId);
    if (!active || active.connectionEpoch !== connectionEpoch) {
      throw new BellConnectionEpochMismatchError();
    }
    return binding;
  }

  #emitRefreshResult(
    residentId: string | null,
    wake: BellWakeRecord | null,
    cancelledWakeId: string | null,
  ): void {
    if (residentId !== null) {
      const active = this.#connections.get(residentId);
      if (active && !active.closed && wake) this.#sendWake(active, wake);
      if (active && !active.closed && cancelledWakeId) {
        active.sink.send("cancel", {
          version: BELL_PROTOCOL_VERSION,
          connection_epoch: active.connectionEpoch,
          wake_id: cancelledWakeId,
        });
      }
    }
  }

  #sendWake(connection: ActiveBellConnection, wake: BellWakeRecord): void {
    connection.sink.send("wake", {
      version: BELL_PROTOCOL_VERSION,
      connection_epoch: connection.connectionEpoch,
      wake_id: wake.wakeId,
      reason: BELL_MAILBOX_REASON,
      message: BELL_MAILBOX_MESSAGE,
      created_at: new Date(wake.createdAt).toISOString(),
    });
  }

  #closeConnection(connection: ActiveBellConnection, closeSink: boolean): void {
    if (connection.closed) return;
    connection.closed = true;
    clearInterval(connection.heartbeatTimer);
    clearInterval(connection.replayTimer);
    if (this.#connections.get(connection.residentId) === connection) {
      this.#connections.delete(connection.residentId);
    }
    if (closeSink) connection.sink.close();
  }
}

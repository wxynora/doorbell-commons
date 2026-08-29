import { createHash, randomUUID } from "node:crypto";
import type {
  BellBindingState,
  BellWakeCancellationResult,
  BellWakeRecord,
  CommunityDatabase,
} from "./community-database.js";

export const BELL_PROTOCOL_VERSION = 1 as const;

const BELL_CREDENTIAL_PATTERN = /^dbb_[A-Za-z0-9_-]{43}$/u;

export interface BellRegistrationAuth {
  confirmCurrentResidentMembership(residentId: string): Promise<unknown>;
}

export interface BellStreamSink {
  send(
    event: "connected" | "wake" | "cancel" | "update_available",
    data: Record<string, unknown>,
  ): void;
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
  getSharedMemeLibraryVersion?: () => number;
  now?: () => number;
  generateConnectionEpoch?: () => string;
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
  sentWakeIds: Set<string>;
  sentCancellationIds: Set<string>;
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

function wakeMessage(wake: Pick<BellWakeRecord, "payload">): string {
  const message = wake.payload?.text;
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("The stored Bell wake does not contain an approved message");
  }
  return message;
}

export class BellService {
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: BellRegistrationAuth;
  readonly #heartbeatIntervalMs: number;
  readonly #replayIntervalMs: number;
  readonly #now: () => number;
  readonly #generateConnectionEpoch: () => string;
  readonly #onError: (error: unknown) => void;
  readonly #getSharedMemeLibraryVersion: (() => number) | undefined;
  readonly #connections = new Map<string, ActiveBellConnection>();

  constructor(options: BellServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs;
    this.#replayIntervalMs = options.replayIntervalMs;
    this.#now = options.now ?? Date.now;
    this.#generateConnectionEpoch = options.generateConnectionEpoch ?? randomUUID;
    this.#onError = options.onError ?? (() => undefined);
    this.#getSharedMemeLibraryVersion = options.getSharedMemeLibraryVersion;
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
      sentWakeIds: new Set<string>(),
      sentCancellationIds: new Set<string>(),
    };
    this.#connections.set(binding.residentId, active);
    try {
      sink.send("connected", {
        version: BELL_PROTOCOL_VERSION,
        connection_epoch: connectionEpoch,
      });
      this.#emitSharedMemeUpdateAvailable(active);
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
    const result = this.#database.cancelPendingBellMailboxWakeForHome(homeId, this.#now());
    this.#emitCancellations(result);
    if (result.residentId !== null) this.#emitPendingWakes(result.residentId);
  }

  refreshResident(residentId: string): void {
    const now = this.#now();
    const expiredPurchases = this.#database.expirePendingFarmPurchaseRequestsForResident(
      residentId,
      now,
    );
    this.#emitCancellations(expiredPurchases);
    const mailbox = this.#database.cancelPendingBellMailboxWakeForResident(residentId, now);
    this.#emitCancellations(mailbox);
    const careerJobs = this.#database.cancelPendingCareerJobWakesForResidentReadMail(
      residentId,
      now,
    );
    this.#emitCancellations(careerJobs);
    this.#emitPendingWakes(residentId);
  }

  /** Notify an already-connected resident without making Bell delivery errors fail a producer. */
  notifyResident(residentId: string): void {
    try {
      this.refreshResident(residentId);
    } catch (error) {
      this.#onError(error);
    }
  }

  /** Signal local data availability without creating, injecting, or acknowledging a model wake. */
  signalSharedMemeUpdateAvailable(availableVersion: number): void {
    for (const active of [...this.#connections.values()]) {
      this.#emitSharedMemeUpdateAvailable(active, availableVersion);
    }
  }

  cancelWake(residentId: string, wakeId: string, now = this.#now()): void {
    const result = this.#database.cancelBellWake(residentId, wakeId, now);
    this.#emitCancellations(result);
  }

  /** Emit a cancellation after a business transaction already ended the wake. */
  notifyWakeCancelled(residentId: string, wakeId: string): void {
    this.#emitCancellations({
      residentId,
      cancelledWakeId: wakeId,
      cancelledWakeIds: [wakeId],
    });
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

  disconnectResident(residentId: string): void {
    const connection = this.#connections.get(residentId);
    if (connection) this.#closeConnection(connection, true);
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

  #emitCancellations(result: BellWakeCancellationResult): void {
    if (result.residentId === null || result.cancelledWakeIds.length === 0) return;
    const active = this.#connections.get(result.residentId);
    if (!active || active.closed) return;
    for (const wakeId of result.cancelledWakeIds) {
      if (active.sentCancellationIds.has(wakeId)) continue;
      try {
        active.sink.send("cancel", {
          version: BELL_PROTOCOL_VERSION,
          connection_epoch: active.connectionEpoch,
          wake_id: wakeId,
        });
        active.sentCancellationIds.add(wakeId);
      } catch (error) {
        this.#onError(error);
        this.#closeConnection(active, true);
        return;
      }
    }
  }

  #emitPendingWakes(residentId: string): void {
    const active = this.#connections.get(residentId);
    if (!active || active.closed) return;
    const pendingWakes = this.#database.listPendingBellWakes(residentId);
    for (const wake of pendingWakes) {
      if (active.sentWakeIds.has(wake.wakeId)) continue;
      try {
        active.sink.send("wake", {
          version: BELL_PROTOCOL_VERSION,
          connection_epoch: active.connectionEpoch,
          wake_id: wake.wakeId,
          reason: wake.reason,
          message: wakeMessage(wake),
          created_at: new Date(wake.createdAt).toISOString(),
        });
        active.sentWakeIds.add(wake.wakeId);
      } catch (error) {
        this.#onError(error);
        this.#closeConnection(active, true);
        return;
      }
    }
  }

  #emitSharedMemeUpdateAvailable(active: ActiveBellConnection, availableVersion?: number): void {
    if (active.closed) return;
    try {
      const homeId = this.#database.findHomeIdByResidentId(active.residentId);
      if (
        homeId === undefined ||
        !this.#database.getHumanSettings(homeId).sharedMemeUpdateSignalsEnabled
      ) {
        return;
      }
    } catch (error) {
      this.#onError(error);
      return;
    }
    let currentVersion = availableVersion;
    if (currentVersion === undefined) {
      try {
        currentVersion = this.#getSharedMemeLibraryVersion?.();
      } catch (error) {
        this.#onError(error);
        return;
      }
    }
    if (currentVersion === undefined) return;
    try {
      active.sink.send("update_available", {
        version: BELL_PROTOCOL_VERSION,
        connection_epoch: active.connectionEpoch,
        resource: "shared_meme",
        available_version: currentVersion,
      });
    } catch (error) {
      this.#onError(error);
      this.#closeConnection(active, true);
    }
  }

  #closeConnection(connection: ActiveBellConnection, closeSink: boolean): void {
    if (connection.closed) return;
    connection.closed = true;
    clearInterval(connection.heartbeatTimer);
    clearInterval(connection.replayTimer);
    if (this.#connections.get(connection.residentId) === connection) {
      this.#connections.delete(connection.residentId);
    }
    if (closeSink) {
      try {
        connection.sink.close();
      } catch (error) {
        this.#onError(error);
      }
    }
  }
}

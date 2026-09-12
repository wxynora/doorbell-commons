import {
  type LoungePresence,
  type LoungeSnapshot,
  type LoungeSnapshotDelta,
  loungeSnapshotDeltaSchema,
  loungeSnapshotSchema,
} from "@doorbell/protocol";
import type { CommunityDatabase, HumanCommunityRecord } from "./community-database.js";
import type { LoungeGameTableStore } from "./lounge-game-table-store.js";
import {
  LOUNGE_IDLE_POINTS,
  LOUNGE_SEATS,
  type LoungePosition,
  loungeIdlePointByPosition,
  loungeSeatById,
} from "./lounge-slots.js";
import type {
  LoungeActivityRecord,
  LoungeMessageRecord,
  LoungePresenceRecord,
  LoungeStore,
} from "./lounge-store.js";
import type { RegistrationAuthService } from "./registration-auth.js";

export interface LoungeEnterInput {
  residentId: string;
  enteredAt?: number;
}

export interface LoungeChooseAreaInput {
  residentId: string;
  areaId: string;
}

export type LoungeGameTableId = "square" | "round";

export interface LoungeGamePresenceAssignment {
  residentId: string;
  playerId: string;
  controllerType: "human" | "resident";
  roomId: string;
  tableId: LoungeGameTableId;
}

export interface LoungePetInput {
  residentId: string;
  activityId: string;
  createdAt: number;
  data?: Record<string, unknown>;
}

export interface LoungeRetractInput {
  residentId: string;
  messageId: string;
  retractedAt?: number;
}

export interface LoungeLeaveOptions {
  includeResidents?: boolean;
}

export interface LoungeSayInput {
  residentId: string;
  messageId: string;
  text: string;
  createdAt: number;
  replyToMessageId?: string | null;
  activityId?: string | null;
}

export interface LoungeServiceOptions {
  database: Pick<CommunityDatabase, "listActiveHumanCommunities">;
  registrationAuth: Pick<RegistrationAuthService, "getCurrentSessionWithMembership">;
  store: LoungeStore;
  now?: () => number;
  random?: () => number;
  publicSayState?: LoungePublicSayState;
  gameTables?: LoungeGameTableStore;
}

export interface LoungePublicSayState {
  canSayPublicly(residentId: string): boolean;
}

export interface LoungeStreamSink {
  send(delta: LoungeSnapshotDelta): void;
  close(): void;
}

interface LoungeChange {
  residents?: boolean;
  tables?: boolean;
  presence?: boolean;
  message?: LoungeMessageRecord;
  activity?: LoungeActivityRecord;
  withdrawnMessageId?: string;
}

export interface LoungeConnection {
  close(): void;
}

interface ActiveLoungeConnection {
  residentId: string;
  sink: LoungeStreamSink;
  closed: boolean;
}

interface ActiveGamePresence extends LoungeGamePresenceAssignment {
  slotId: string;
}

interface LoungeSnapshotParts {
  serverTime: string;
  activeResidentIds: ReadonlySet<string>;
  residents: LoungeSnapshot["residents"];
  tables: LoungeSnapshot["tables"];
  presence: LoungeSnapshot["presence"];
  messages: LoungeSnapshot["messages"];
  activities: LoungeSnapshot["activities"];
}

interface LoungeSnapshotBatch {
  eventVersion: number;
  parts?: LoungeSnapshotParts;
}

const GAME_AREA_BY_TABLE: Record<LoungeGameTableId, string> = {
  square: "mahjong",
  round: "round-table",
};

function isGameArea(areaId: string): boolean {
  return areaId === GAME_AREA_BY_TABLE.square || areaId === GAME_AREA_BY_TABLE.round;
}

function sameGameAssignment(
  left: LoungeGamePresenceAssignment,
  right: LoungeGamePresenceAssignment,
): boolean {
  return (
    left.residentId === right.residentId &&
    left.playerId === right.playerId &&
    left.controllerType === right.controllerType &&
    left.roomId === right.roomId &&
    left.tableId === right.tableId
  );
}

function preferGameAssignment(
  current: LoungeGamePresenceAssignment,
  candidate: LoungeGamePresenceAssignment,
): LoungeGamePresenceAssignment {
  const currentKey = `${current.tableId}:${current.roomId}:${current.playerId}`;
  const candidateKey = `${candidate.tableId}:${candidate.roomId}:${candidate.playerId}`;
  return candidateKey < currentKey ? candidate : current;
}

export class LoungeNoSeatAvailableError extends Error {
  constructor(areaId: string) {
    super(`No lounge seat is available in area ${areaId}`);
    this.name = "LoungeNoSeatAvailableError";
  }
}

export class LoungeNoIdlePointAvailableError extends Error {
  constructor() {
    super("No lounge idle position is available");
    this.name = "LoungeNoIdlePointAvailableError";
  }
}

export class LoungeAreaUnavailableError extends Error {
  constructor(areaId: string) {
    super(`Lounge area ${areaId} is not available through this action`);
    this.name = "LoungeAreaUnavailableError";
  }
}

export class LoungePublicSayUnavailableError extends Error {
  constructor() {
    super("Lounge public say is not authorized by the current runtime state");
    this.name = "LoungePublicSayUnavailableError";
  }
}

function isoDateTime(value: number): string {
  return new Date(value).toISOString();
}

function comparePresenceById(left: { residentId: string }, right: { residentId: string }): number {
  return left.residentId.localeCompare(right.residentId);
}

function compareCommunityById(left: HumanCommunityRecord, right: HumanCommunityRecord): number {
  return left.resident.residentId.localeCompare(right.resident.residentId);
}

function residentSummary(community: HumanCommunityRecord) {
  return {
    resident_id: community.resident.residentId,
    resident_name: community.resident.residentName,
  };
}

function publicMessage(message: LoungeMessageRecord): LoungeSnapshot["messages"][number] {
  return {
    sequence: message.sequence,
    message_id: message.messageId,
    resident_id: message.residentId,
    resident_name: message.residentName,
    text: message.text,
    created_at: isoDateTime(message.createdAt),
    reply_to_message_id: message.replyToMessageId,
    activity_id: message.activityId,
  };
}

function publicActivity(activity: LoungeActivityRecord): LoungeSnapshot["activities"][number] {
  return {
    sequence: activity.sequence,
    activity_id: activity.activityId,
    kind: activity.kind,
    resident_id: activity.residentId,
    resident_name: activity.residentName,
    created_at: isoDateTime(activity.createdAt),
    data: activity.data,
  };
}

export class LoungeService {
  readonly #listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  readonly #database: LoungeServiceOptions["database"];
  readonly #registrationAuth: LoungeServiceOptions["registrationAuth"];
  readonly #store: LoungeStore;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #publicSayState: LoungePublicSayState | undefined;
  readonly #gameTables: LoungeGameTableStore | undefined;
  #unsubscribeTables: (() => void) | undefined;
  readonly #presence = new Map<string, LoungePresenceRecord>();
  readonly #gamePresence = new Map<string, ActiveGamePresence>();
  readonly #connections = new Map<string, Set<ActiveLoungeConnection>>();
  #changeVersion = 0;
  #activeSnapshotBatch: LoungeSnapshotBatch | undefined;
  #skipNextGameTableNotification = false;

  constructor(options: LoungeServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
    this.#publicSayState = options.publicSayState;
    this.#gameTables = options.gameTables;
    this.#unsubscribeTables = options.gameTables?.subscribe(() => this.#gameTableChanged());
    for (const presence of this.#store.listPresence()) {
      const seat = presence.slotId === null ? undefined : loungeSeatById(presence.slotId);
      if (
        !loungeIdlePointByPosition(presence.idlePosition) ||
        (presence.slotId !== null && (!seat || seat.areaId !== presence.areaId)) ||
        (presence.slotId === null && presence.areaId !== "idle")
      ) {
        throw new Error(
          `Stored lounge presence ${presence.residentId} is not in the current layout`,
        );
      }
      this.#presence.set(presence.residentId, presence);
    }
  }

  /** Re-register after the presence adapter so table changes are observed last. */
  reorderGameTableListener(): void {
    if (!this.#gameTables) return;
    this.#unsubscribeTables?.();
    this.#unsubscribeTables = this.#gameTables.subscribe(() => this.#gameTableChanged());
  }

  async readHumanSnapshot(token: string): Promise<LoungeSnapshot> {
    const current = await this.#registrationAuth.getCurrentSessionWithMembership(token);
    return this.readSnapshotForResident(current.resident.residentId);
  }

  readSnapshotForResident(residentId: string): LoungeSnapshot {
    return this.#renderSnapshot(this.#snapshotParts(), residentId);
  }

  /**
   * Read several resident projections from one consistent source pass. Wake
   * reconciliation often has one session per resident; sharing the source
   * rows keeps that fan-out from turning into one full database scan each.
   */
  readSnapshotsForResidents(residentIds: readonly string[]): Map<string, LoungeSnapshot> {
    const parts = this.#snapshotParts();
    const snapshots = new Map<string, LoungeSnapshot>();
    for (const residentId of residentIds) {
      if (!parts.activeResidentIds.has(residentId)) continue;
      snapshots.set(residentId, this.#renderSnapshot(parts, residentId));
    }
    return snapshots;
  }

  #snapshotParts(): LoungeSnapshotParts {
    const batch = this.#activeSnapshotBatch;
    if (batch && batch.eventVersion !== this.#changeVersion) {
      batch.eventVersion = this.#changeVersion;
      delete batch.parts;
    }
    if (batch?.parts) return batch.parts;
    const parts = this.#readSnapshotParts();
    if (batch) batch.parts = parts;
    return parts;
  }

  #readSnapshotParts(): LoungeSnapshotParts {
    const { communities, communitiesByResidentId, presence } = this.#readResidentsAndPresence();

    const messages = this.#store.listMessages();
    return {
      serverTime: isoDateTime(this.#now()),
      activeResidentIds: new Set(communitiesByResidentId.keys()),
      residents: communities.map(residentSummary),
      tables: this.#gameTables?.listPublicTables() ?? [],
      presence,
      messages: messages.map(publicMessage),
      activities: this.#store.listActivities().map(publicActivity),
    };
  }

  #readResidentsAndPresence() {
    const communities = this.#database.listActiveHumanCommunities().sort(compareCommunityById);
    const communitiesByResidentId = new Map(
      communities.map((community) => [community.resident.residentId, community]),
    );

    const presence = this.#readPresence(communitiesByResidentId);
    return {
      communities,
      communitiesByResidentId,
      presence,
    };
  }

  #readPresence(
    communitiesByResidentId: ReadonlyMap<string, HumanCommunityRecord>,
  ): LoungePresence[] {
    return [...this.#presence.values()]
      .filter((entry) => communitiesByResidentId.has(entry.residentId))
      .sort(comparePresenceById)
      .map((entry) => {
        const community = communitiesByResidentId.get(entry.residentId);
        if (!community) throw new Error("Lounge presence resident disappeared");
        return {
          resident_id: entry.residentId,
          resident_name: community.resident.residentName,
          farm_doorplate: community.farmBinding.farmDoorplate,
          area_id: entry.areaId,
          slot_id: entry.slotId,
          idle_position: [...entry.idlePosition] as [number, number, number],
          last_spoke_at: entry.lastSpokeAt === null ? null : isoDateTime(entry.lastSpokeAt),
          entered_at: isoDateTime(entry.enteredAt),
        };
      });
  }

  #renderSnapshot(parts: LoungeSnapshotParts, residentId: string): LoungeSnapshot {
    if (!parts.activeResidentIds.has(residentId)) {
      throw new Error("Lounge resident is not active");
    }
    return loungeSnapshotSchema.parse({
      version: 1,
      server_time: parts.serverTime,
      self_resident_id: residentId,
      residents: parts.residents,
      tables: parts.tables,
      presence: parts.presence,
      messages: parts.messages,
      activities: parts.activities,
    });
  }

  #renderStreamDelta(change: LoungeChange, eventVersion: number): LoungeSnapshotDelta {
    const delta: LoungeSnapshotDelta = {
      version: 1,
      event_version: eventVersion,
      server_time: isoDateTime(this.#now()),
    };
    if (change.residents || change.presence) {
      const { communities, presence } = this.#readResidentsAndPresence();
      if (change.residents) delta.residents = communities.map(residentSummary);
      if (change.presence) delta.presence = presence;
    }
    if (change.tables) delta.tables = this.#gameTables?.listPublicTables() ?? [];
    if (change.message) delta.append_messages = [publicMessage(change.message)];
    if (change.activity) delta.append_activities = [publicActivity(change.activity)];
    if (change.withdrawnMessageId) {
      delta.withdrawn_message_ids = [change.withdrawnMessageId];
    }
    return loungeSnapshotDeltaSchema.parse(delta);
  }

  connectHumanStream(residentId: string, sink: LoungeStreamSink): LoungeConnection {
    const connection: ActiveLoungeConnection = {
      residentId,
      sink,
      closed: false,
    };
    const connections = this.#connections.get(residentId) ?? new Set();
    connections.add(connection);
    this.#connections.set(residentId, connections);
    return { close: () => this.#closeConnection(connection) };
  }

  enter(input: LoungeEnterInput): LoungePresenceRecord {
    const community = this.#activeCommunity(input.residentId);
    const current = this.#presence.get(input.residentId);
    if (current) return current;
    const idlePosition = this.#allocateIdlePosition(input.residentId);
    const presence: LoungePresenceRecord = {
      residentId: community.resident.residentId,
      areaId: "idle",
      slotId: null,
      idlePosition,
      enteredAt: input.enteredAt ?? this.#now(),
      lastSpokeAt: null,
    };
    this.#store.upsertPresence(presence);
    this.#presence.set(presence.residentId, presence);
    this.#emitChanged({ residents: true, presence: true });
    return presence;
  }

  chooseArea(input: LoungeChooseAreaInput): LoungePresenceRecord {
    const community = this.#activeCommunity(input.residentId);
    if (input.areaId.length === 0) throw new TypeError("Lounge area id must not be empty");
    const gamePresence = this.#gamePresence.get(input.residentId);
    if (gamePresence) {
      const current = this.#presence.get(input.residentId);
      if (current && input.areaId === current.areaId) return current;
      throw new LoungeAreaUnavailableError(input.areaId);
    }
    if (input.areaId === "idle") {
      const current = this.#presence.get(input.residentId);
      if (!current) return this.enter({ residentId: input.residentId });
      if (current.areaId === "idle" && current.slotId === null) return current;
      const updated: LoungePresenceRecord = { ...current, areaId: "idle", slotId: null };
      this.#store.upsertPresence(updated);
      this.#presence.set(updated.residentId, updated);
      this.#emitChanged({ presence: true });
      return updated;
    }
    if (
      input.areaId === "reading" ||
      input.areaId === "round-table" ||
      input.areaId === "mahjong"
    ) {
      throw new LoungeAreaUnavailableError(input.areaId);
    }
    if (input.areaId !== "conversation" && input.areaId !== "window" && input.areaId !== "bench") {
      throw new LoungeAreaUnavailableError(input.areaId);
    }

    const current = this.#presence.get(input.residentId);
    if (current?.areaId === input.areaId && current.slotId !== null) return current;
    const occupied = this.#occupiedSeatIds(input.residentId);
    const available = LOUNGE_SEATS.filter(
      (seat) => seat.areaId === input.areaId && !occupied.has(seat.slotId),
    );
    if (available.length === 0) throw new LoungeNoSeatAvailableError(input.areaId);
    const seat = available[this.#randomIndex(available.length, "seat")];
    if (!seat) throw new Error("Lounge seat allocator returned no seat");
    const presence: LoungePresenceRecord = current ?? {
      residentId: community.resident.residentId,
      areaId: "idle",
      slotId: null,
      idlePosition: this.#allocateIdlePosition(input.residentId),
      enteredAt: this.#now(),
      lastSpokeAt: null,
    };
    const updated: LoungePresenceRecord = {
      ...presence,
      areaId: seat.areaId,
      slotId: seat.slotId,
    };
    this.#store.upsertPresence(updated);
    this.#presence.set(updated.residentId, updated);
    this.#emitChanged({ presence: true });
    return updated;
  }

  leave(residentId: string, options: LoungeLeaveOptions = {}): boolean {
    const removed = this.#store.deletePresence(residentId);
    this.#gamePresence.delete(residentId);
    this.#presence.delete(residentId);
    if (removed) {
      this.#emitChanged({
        presence: true,
        ...(options.includeResidents ? { residents: true } : {}),
      });
    }
    return removed;
  }

  say(input: LoungeSayInput): LoungeMessageRecord {
    this.#activeCommunity(input.residentId);
    const presence = this.#requirePresence(input.residentId);
    if (!this.#publicSayState?.canSayPublicly(input.residentId)) {
      throw new LoungePublicSayUnavailableError();
    }
    const message = this.#store.appendMessage(input);
    const updated: LoungePresenceRecord = {
      ...presence,
      lastSpokeAt: input.createdAt,
    };
    this.#store.upsertPresence(updated);
    this.#presence.set(updated.residentId, updated);
    this.#emitChanged({ presence: true, message });
    return message;
  }

  retract(input: LoungeRetractInput): boolean {
    this.#activeCommunity(input.residentId);
    const retracted = this.#store.withdrawMessage({
      messageId: input.messageId,
      residentId: input.residentId,
      withdrawnAt: input.retractedAt ?? this.#now(),
    });
    if (retracted) this.#emitChanged({ withdrawnMessageId: input.messageId });
    return retracted;
  }

  pet(input: LoungePetInput): LoungeActivityRecord {
    this.#activeCommunity(input.residentId);
    if (this.#gamePresence.has(input.residentId)) {
      throw new LoungeAreaUnavailableError("pet");
    }
    const current = this.#presence.get(input.residentId);
    if (!current) {
      this.#choosePetArea(input.residentId);
    } else if (current.areaId !== "pet") {
      this.#choosePetArea(input.residentId);
    }
    const activity = this.#store.appendActivity({
      activityId: input.activityId,
      residentId: input.residentId,
      kind: "pet",
      ...(input.data === undefined ? {} : { data: input.data }),
      createdAt: input.createdAt,
    });
    this.#emitChanged({ activity });
    return activity;
  }

  setResidentPresence(input: LoungeEnterInput): LoungePresenceRecord {
    return this.enter(input);
  }

  removeResidentPresence(residentId: string): void {
    this.leave(residentId);
  }

  /**
   * Reconciles the one public scene presence for each resident with the
   * currently authenticated resident game seats. Human game seats belong to
   * the game host's player projection and never create an AI lounge row. This
   * method owns the persistent lounge row and slot allocation, so normal
   * lounge actions cannot move an active game seat.
   */
  reconcileGamePresence(
    assignments: readonly LoungeGamePresenceAssignment[],
    options: { skipNextTableNotification?: boolean } = {},
  ): void {
    const activeResidentIds = this.#activeResidentIds();
    const desired = new Map<string, LoungeGamePresenceAssignment>();
    for (const assignment of assignments) {
      this.#validateGameAssignment(assignment);
      if (assignment.controllerType !== "resident") continue;
      if (!activeResidentIds.has(assignment.residentId)) continue;
      const current = desired.get(assignment.residentId);
      desired.set(
        assignment.residentId,
        current ? preferGameAssignment(current, assignment) : assignment,
      );
    }

    let changed = false;
    for (const [residentId, active] of this.#gamePresence) {
      const next = desired.get(residentId);
      if (next && sameGameAssignment(active, next)) continue;
      const current = this.#presence.get(residentId);
      if (
        current &&
        current.areaId === GAME_AREA_BY_TABLE[active.tableId] &&
        current.slotId === active.slotId
      ) {
        changed = this.#deletePresence(residentId) || changed;
      }
      this.#gamePresence.delete(residentId);
    }

    for (const [residentId, current] of [...this.#presence]) {
      const next = desired.get(residentId);
      if (!isGameArea(current.areaId)) continue;
      if (!next || GAME_AREA_BY_TABLE[next.tableId] !== current.areaId) {
        changed = this.#deletePresence(residentId) || changed;
      }
    }

    const ordered = [...desired.values()].sort((left, right) => {
      const leftKey = `${left.residentId}:${left.tableId}:${left.roomId}:${left.playerId}`;
      const rightKey = `${right.residentId}:${right.tableId}:${right.roomId}:${right.playerId}`;
      return leftKey.localeCompare(rightKey);
    });
    for (const assignment of ordered) {
      const areaId = GAME_AREA_BY_TABLE[assignment.tableId];
      const current = this.#presence.get(assignment.residentId);
      let slotId: string;
      if (current?.areaId === areaId && current.slotId !== null) {
        slotId = current.slotId;
      } else {
        const occupied = this.#occupiedSeatIds(assignment.residentId);
        const available = LOUNGE_SEATS.filter(
          (seat) => seat.areaId === areaId && !occupied.has(seat.slotId),
        );
        if (available.length === 0) {
          throw new LoungeNoSeatAvailableError(areaId);
        }
        const seat = available[this.#randomIndex(available.length, "game seat")];
        if (!seat) throw new Error("Lounge game seat allocator returned no seat");
        slotId = seat.slotId;
      }

      const next: LoungePresenceRecord = current ?? {
        residentId: assignment.residentId,
        areaId: "idle",
        slotId: null,
        idlePosition: this.#allocateIdlePosition(assignment.residentId),
        enteredAt: this.#now(),
        lastSpokeAt: null,
      };
      const updated: LoungePresenceRecord = {
        ...next,
        areaId,
        slotId,
      };
      if (!this.#samePresence(current, updated)) {
        this.#store.upsertPresence(updated);
        this.#presence.set(updated.residentId, updated);
        changed = true;
      }
      this.#gamePresence.set(assignment.residentId, { ...assignment, slotId });
    }

    if (changed) {
      if (options.skipNextTableNotification) this.#skipNextGameTableNotification = true;
      this.#emitChanged({
        presence: true,
        ...(options.skipNextTableNotification ? { tables: true } : {}),
      });
    }
  }

  disconnectResident(residentId: string): void {
    this.#closeResidentConnections(residentId);
    this.leave(residentId, { includeResidents: true });
  }

  close(): void {
    this.#unsubscribeTables?.();
    for (const residentId of this.#connections.keys()) {
      this.#closeResidentConnections(residentId);
    }
    this.#presence.clear();
    this.#gamePresence.clear();
  }

  #validateGameAssignment(assignment: LoungeGamePresenceAssignment): void {
    if (
      !assignment ||
      typeof assignment.residentId !== "string" ||
      assignment.residentId.length === 0 ||
      typeof assignment.playerId !== "string" ||
      assignment.playerId.length === 0 ||
      typeof assignment.roomId !== "string" ||
      assignment.roomId.length === 0 ||
      (assignment.controllerType !== "human" && assignment.controllerType !== "resident") ||
      (assignment.tableId !== "square" && assignment.tableId !== "round")
    ) {
      throw new TypeError("Lounge game presence assignment is invalid");
    }
  }

  #deletePresence(residentId: string): boolean {
    const removed = this.#store.deletePresence(residentId);
    this.#presence.delete(residentId);
    return removed;
  }

  #samePresence(left: LoungePresenceRecord | undefined, right: LoungePresenceRecord): boolean {
    return Boolean(
      left &&
        left.residentId === right.residentId &&
        left.areaId === right.areaId &&
        left.slotId === right.slotId &&
        left.enteredAt === right.enteredAt &&
        left.lastSpokeAt === right.lastSpokeAt &&
        left.idlePosition.every((coordinate, index) => coordinate === right.idlePosition[index]),
    );
  }

  #activeCommunity(residentId: string): HumanCommunityRecord {
    const community = this.#database
      .listActiveHumanCommunities()
      .find((entry) => entry.resident.residentId === residentId);
    if (!community) throw new Error("Lounge resident is not active");
    return community;
  }

  #requirePresence(residentId: string): LoungePresenceRecord {
    const presence = this.#presence.get(residentId);
    if (!presence) throw new Error("Lounge resident must enter before acting");
    return presence;
  }

  #activeResidentIds(): Set<string> {
    return new Set(
      this.#database.listActiveHumanCommunities().map((community) => community.resident.residentId),
    );
  }

  #occupiedSeatIds(residentId: string): Set<string> {
    const activeResidentIds = this.#activeResidentIds();
    return new Set(
      [...this.#presence.values()]
        .filter((presence) => presence.residentId !== residentId)
        .filter((presence) => activeResidentIds.has(presence.residentId))
        .flatMap((presence) => (presence.slotId === null ? [] : [presence.slotId])),
    );
  }

  #allocateIdlePosition(residentId: string): LoungePosition {
    const activeResidentIds = this.#activeResidentIds();
    const occupied = [...this.#presence.values()]
      .filter((presence) => presence.residentId !== residentId)
      .filter((presence) => activeResidentIds.has(presence.residentId))
      .map((presence) => presence.idlePosition);
    const available = LOUNGE_IDLE_POINTS.filter(
      (point) =>
        !occupied.some((position) =>
          point.position.every((coordinate, index) => coordinate === position[index]),
        ),
    );
    if (available.length === 0) throw new LoungeNoIdlePointAvailableError();
    const point = available[this.#randomIndex(available.length, "idle position")];
    if (!point) throw new Error("Lounge idle allocator returned no position");
    return point.position;
  }

  #choosePetArea(residentId: string): LoungePresenceRecord {
    const community = this.#activeCommunity(residentId);
    const current = this.#presence.get(residentId);
    if (current?.areaId === "pet" && current.slotId !== null) return current;
    const occupied = this.#occupiedSeatIds(residentId);
    const available = LOUNGE_SEATS.filter(
      (seat) => seat.areaId === "pet" && !occupied.has(seat.slotId),
    );
    if (available.length === 0) throw new LoungeNoSeatAvailableError("pet");
    const seat = available[this.#randomIndex(available.length, "pet seat")];
    if (!seat) throw new Error("Lounge pet allocator returned no seat");
    const presence: LoungePresenceRecord = current ?? {
      residentId: community.resident.residentId,
      areaId: "idle",
      slotId: null,
      idlePosition: this.#allocateIdlePosition(residentId),
      enteredAt: this.#now(),
      lastSpokeAt: null,
    };
    const updated: LoungePresenceRecord = {
      ...presence,
      areaId: "pet",
      slotId: seat.slotId,
    };
    this.#store.upsertPresence(updated);
    this.#presence.set(updated.residentId, updated);
    this.#emitChanged({ presence: true });
    return updated;
  }

  #randomIndex(length: number, subject: string): number {
    const randomValue = this.#random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new Error(`Lounge ${subject} allocator returned an invalid random value`);
    }
    return Math.floor(randomValue * length);
  }

  #emitChanged(change: LoungeChange): void {
    const previousBatch = this.#activeSnapshotBatch;
    const eventVersion = ++this.#changeVersion;
    this.#activeSnapshotBatch = { eventVersion };
    try {
      for (const listener of this.#listeners) listener();
      if (this.#connections.size === 0) return;
      const delta = this.#renderStreamDelta(change, eventVersion);
      const activeResidentIds = this.#activeResidentIds();
      for (const [residentId, connections] of this.#connections) {
        if (!activeResidentIds.has(residentId)) {
          this.#closeResidentConnections(residentId);
          continue;
        }
        for (const connection of [...connections]) {
          if (connection.closed) continue;
          try {
            connection.sink.send(delta);
          } catch {
            this.#closeConnection(connection);
          }
        }
      }
    } finally {
      this.#activeSnapshotBatch = previousBatch;
    }
  }

  #gameTableChanged(): void {
    if (this.#skipNextGameTableNotification) {
      this.#skipNextGameTableNotification = false;
      return;
    }
    this.#emitChanged({ tables: true });
  }

  #closeResidentConnections(residentId: string): void {
    const connections = this.#connections.get(residentId);
    if (!connections) return;
    for (const connection of [...connections]) this.#closeConnection(connection);
  }

  #closeConnection(connection: ActiveLoungeConnection): void {
    if (connection.closed) return;
    connection.closed = true;
    const connections = this.#connections.get(connection.residentId);
    connections?.delete(connection);
    if (connections && connections.size === 0) {
      this.#connections.delete(connection.residentId);
    }
    try {
      connection.sink.close();
    } catch {
      // A disconnected HTTP socket is already closed.
    }
  }
}

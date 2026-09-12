import type { GamePreferences } from "@doorbell/protocol";

import type { BellService } from "../bell-service.js";
import type { CommunityDatabase, HumanCommunityRecord } from "../community-database.js";
import type { LoungeGameTableStore } from "../lounge-game-table-store.js";
import type { LoungeWakeStore } from "../lounge-wake-store.js";
import { acceptsGameInvitation } from "./game-invitation-policy.js";
import type { LoungeGameInvitationPort, LoungeGameInvitationTarget } from "./lounge-game-tool.js";
import type { GameKind, GameRoom } from "./types.js";

type InvitationDatabase = Pick<
  CommunityDatabase,
  "listActiveHumanCommunities" | "getHumanSettings" | "loungeWakeStore"
>;

type InvitationTables = Pick<LoungeGameTableStore, "listPublicTables" | "read" | "subscribe">;

type InvitationBell = Pick<BellService, "notifyResident" | "notifyWakeCancelled">;

export type LoungeGameInvitationDelivery = "broadcast" | "direct";

/** BellService exposes no sink-delivery result, so this receipt stops at the durable queue. */
export interface LoungeGameInvitationReceipt {
  /** The wake was durably inserted and Bell was signalled to refresh. */
  readonly queuedWakeIds: readonly string[];
  /** The same request already has a durable wake record, so it was not requeued. */
  readonly alreadyRecordedWakeIds: readonly string[];
}

export interface LoungeGameInvitationPendingValidation {
  readonly wakeId: string;
  readonly residentId: string;
  readonly roomId: string | null;
  readonly valid: boolean;
}

export interface LoungeGameInvitationFormatInput {
  delivery: LoungeGameInvitationDelivery;
  requestId: string;
  fromResidentId: string;
  fromDisplayName: string;
  toResidentId: string;
  toDisplayName: string;
  roomId: string;
  kind: GameKind;
  revision: number;
}

/** The final, reviewed Bell copy is supplied by the runtime assembler. */
export type LoungeGameInvitationFormatter = (input: LoungeGameInvitationFormatInput) => string;

export interface LoungeGameInvitationServiceOptions {
  database: InvitationDatabase;
  tables: InvitationTables;
  bell: InvitationBell;
  formatter: LoungeGameInvitationFormatter;
  now?: () => number;
}

export class LoungeGameInvitationError extends Error {
  readonly code: "game_invitation_invalid_request" | "game_invitation_not_allowed";

  constructor(code: "game_invitation_invalid_request" | "game_invitation_not_allowed") {
    super(code);
    this.name = "LoungeGameInvitationError";
    this.code = code;
  }
}

const WAKE_PREFIX = "game_invitation";

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function invitationKey(roomId: string, requestId: string, residentId: string): string {
  return `${WAKE_PREFIX}:${encoded(roomId)}:${encoded(requestId)}:${encoded(residentId)}`;
}

function roomIdFromWakeId(wakeId: string): string | null {
  const parts = wakeId.split(":");
  if (parts.length !== 4 || parts[0] !== WAKE_PREFIX) return null;
  try {
    const roomId = decodeURIComponent(parts[1] ?? "");
    const requestId = decodeURIComponent(parts[2] ?? "");
    const residentId = decodeURIComponent(parts[3] ?? "");
    return roomId.length > 0 && requestId.length > 0 && residentId.length > 0 ? roomId : null;
  } catch {
    return null;
  }
}

function validIdentifier(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function seatBelongsToResident(seat: GameRoom["seats"][number], residentId: string): boolean {
  return seat.residentId === residentId || seat.playerId === `resident:${residentId}`;
}

function preferencesFor(
  database: InvitationDatabase,
  community: HumanCommunityRecord,
): GamePreferences | null | undefined {
  try {
    return database.getHumanSettings(community.home.homeId).gamePreferences;
  } catch {
    return undefined;
  }
}

export class LoungeGameInvitationService implements LoungeGameInvitationPort {
  readonly #database: InvitationDatabase;
  readonly #tables: InvitationTables;
  readonly #wakes: LoungeWakeStore;
  readonly #bell: InvitationBell;
  readonly #formatter: LoungeGameInvitationFormatter;
  readonly #now: () => number;
  readonly #unsubscribe: () => void;
  #closed = false;
  #reconciling = false;

  constructor(options: LoungeGameInvitationServiceOptions) {
    this.#database = options.database;
    this.#tables = options.tables;
    this.#wakes = options.database.loungeWakeStore;
    this.#bell = options.bell;
    this.#formatter = options.formatter;
    this.#now = options.now ?? Date.now;
    this.#unsubscribe = options.tables.subscribe(() => this.reconcile());
    this.reconcile();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#unsubscribe();
  }

  /**
   * Re-check persisted invitation wakes against current community, game and policy state.
   * This reads LoungeWakeStore on every call, so it is safe to use after a process restart.
   */
  validatePending(
    residentId: string,
    at = this.#now(),
  ): readonly LoungeGameInvitationPendingValidation[] {
    if (!validIdentifier(residentId)) return [];
    const communities = this.#database.listActiveHumanCommunities();
    const recipient = communities.find((community) => community.resident.residentId === residentId);
    const seated = this.#seatedResidents(communities);
    return this.#wakes
      .pending(residentId)
      .filter((wake) => wake.reason === "game_invitation")
      .map((wake) => {
        const roomId = roomIdFromWakeId(wake.wakeId);
        const valid =
          roomId !== null &&
          recipient !== undefined &&
          this.#waitingRoom(roomId) !== null &&
          !seated.has(residentId) &&
          acceptsGameInvitation(preferencesFor(this.#database, recipient), at);
        return { wakeId: wake.wakeId, residentId, roomId, valid };
      });
  }

  /** Cancel invalid persisted invitation wakes and notify Bell of each cancellation. */
  cancelInvalid(residentId: string, at = this.#now()): readonly string[] {
    const cancelled: string[] = [];
    for (const pending of this.validatePending(residentId, at)) {
      if (pending.valid) continue;
      if (this.#wakes.finish(residentId, pending.wakeId, "cancelled", at) !== "changed") continue;
      this.#bell.notifyWakeCancelled(residentId, pending.wakeId);
      cancelled.push(pending.wakeId);
    }
    return cancelled;
  }

  /** Cancel persisted invitations whose current target or physical table is no longer valid. */
  reconcile(): void {
    if (this.#closed || this.#reconciling) return;
    this.#reconciling = true;
    try {
      for (const community of this.#database.listActiveHumanCommunities()) {
        this.cancelInvalid(community.resident.residentId, this.#now());
      }
    } finally {
      this.#reconciling = false;
    }
  }

  async listTargets(input: {
    fromResidentId: string;
    roomId: string;
  }): Promise<readonly LoungeGameInvitationTarget[]> {
    if (!validIdentifier(input?.fromResidentId) || !validIdentifier(input?.roomId)) {
      return [];
    }
    const communities = this.#database.listActiveHumanCommunities();
    const sender = communities.find(
      (community) => community.resident.residentId === input.fromResidentId,
    );
    if (!sender || !this.#waitingRoomWithSeat(input.roomId, input.fromResidentId)) {
      return [];
    }

    const seated = this.#seatedResidents(communities);
    const at = this.#now();
    return communities
      .map((community) => ({
        community,
        preferences: preferencesFor(this.#database, community),
      }))
      .filter(({ community, preferences }) => {
        const residentId = community.resident.residentId;
        if (residentId === input.fromResidentId || seated.has(residentId)) return false;
        return acceptsGameInvitation(preferences, at);
      })
      .map(({ community, preferences }) => ({
        residentId: community.resident.residentId,
        displayName: community.resident.residentName,
        preferences,
      }));
  }

  async broadcast(input: {
    requestId: string;
    fromResidentId: string;
    roomId: string;
    kind: GameKind;
  }): Promise<void> {
    await this.broadcastWithReceipt(input);
  }

  async broadcastWithReceipt(input: {
    requestId: string;
    fromResidentId: string;
    roomId: string;
    kind: GameKind;
  }): Promise<LoungeGameInvitationReceipt> {
    this.#validateDeliveryInput(input);
    const communities = this.#database.listActiveHumanCommunities();
    const sender = communities.find(
      (community) => community.resident.residentId === input.fromResidentId,
    );
    const room = sender ? this.#waitingRoomWithSeat(input.roomId, input.fromResidentId) : null;
    if (!sender || !room) throw new LoungeGameInvitationError("game_invitation_not_allowed");

    const seated = this.#seatedResidents(communities);
    const at = this.#now();
    const queuedWakeIds: string[] = [];
    const alreadyRecordedWakeIds: string[] = [];
    for (const community of communities) {
      const recipientId = community.resident.residentId;
      if (
        recipientId === input.fromResidentId ||
        seated.has(recipientId) ||
        !acceptsGameInvitation(preferencesFor(this.#database, community), at)
      ) {
        continue;
      }
      const currentRoom = this.#waitingRoomWithSeat(input.roomId, input.fromResidentId);
      if (!currentRoom) throw new LoungeGameInvitationError("game_invitation_not_allowed");
      const result = this.#deliver({
        delivery: "broadcast",
        requestId: input.requestId,
        sender,
        recipient: community,
        room: currentRoom,
        kind: input.kind,
      });
      if (result) {
        (result.state === "queued" ? queuedWakeIds : alreadyRecordedWakeIds).push(result.wakeId);
      } else if (!this.#waitingRoomWithSeat(input.roomId, input.fromResidentId)) {
        throw new LoungeGameInvitationError("game_invitation_not_allowed");
      }
    }
    return { queuedWakeIds, alreadyRecordedWakeIds };
  }

  async direct(input: {
    requestId: string;
    fromResidentId: string;
    toResidentId: string;
    roomId: string;
    kind: GameKind;
  }): Promise<void> {
    await this.directWithReceipt(input);
  }

  async directWithReceipt(input: {
    requestId: string;
    fromResidentId: string;
    toResidentId: string;
    roomId: string;
    kind: GameKind;
  }): Promise<LoungeGameInvitationReceipt> {
    this.#validateDeliveryInput(input);
    if (!validIdentifier(input.toResidentId)) {
      throw new LoungeGameInvitationError("game_invitation_invalid_request");
    }
    const communities = this.#database.listActiveHumanCommunities();
    const sender = communities.find(
      (community) => community.resident.residentId === input.fromResidentId,
    );
    const recipient = communities.find(
      (community) => community.resident.residentId === input.toResidentId,
    );
    const room = sender ? this.#waitingRoomWithSeat(input.roomId, input.fromResidentId) : null;
    const seated = this.#seatedResidents(communities);
    const wakeId = recipient
      ? invitationKey(input.roomId, input.requestId, input.toResidentId)
      : null;
    const alreadyRecorded =
      wakeId === null ? undefined : this.#wakes.get(input.toResidentId, wakeId);
    if (
      !sender ||
      !recipient ||
      !room ||
      input.toResidentId === input.fromResidentId ||
      (!alreadyRecorded && seated.has(input.toResidentId)) ||
      (!alreadyRecorded &&
        !acceptsGameInvitation(preferencesFor(this.#database, recipient), this.#now()))
    ) {
      throw new LoungeGameInvitationError("game_invitation_not_allowed");
    }

    const currentRoom = this.#waitingRoomWithSeat(input.roomId, input.fromResidentId);
    if (!currentRoom) throw new LoungeGameInvitationError("game_invitation_not_allowed");
    const result = this.#deliver({
      delivery: "direct",
      requestId: input.requestId,
      sender,
      recipient,
      room: currentRoom,
      kind: input.kind,
    });
    if (!result) {
      throw new LoungeGameInvitationError("game_invitation_not_allowed");
    }
    return result.state === "queued"
      ? { queuedWakeIds: [result.wakeId], alreadyRecordedWakeIds: [] }
      : { queuedWakeIds: [], alreadyRecordedWakeIds: [result.wakeId] };
  }

  #validateDeliveryInput(input: {
    requestId: string;
    fromResidentId: string;
    roomId: string;
    kind: GameKind;
  }): void {
    if (
      !validIdentifier(input?.requestId) ||
      !validIdentifier(input?.fromResidentId) ||
      !validIdentifier(input?.roomId)
    ) {
      throw new LoungeGameInvitationError("game_invitation_invalid_request");
    }
  }

  #waitingRoom(roomId: string): GameRoom | null {
    const room = this.#tables.read(roomId);
    if (room?.phase !== "waiting") return null;
    const table = this.#tables
      .listPublicTables()
      .find((candidate) => candidate.room?.room_id === roomId);
    if (table?.room?.phase !== "waiting") return null;
    return room;
  }

  #waitingRoomWithSeat(roomId: string, residentId: string): GameRoom | null {
    const room = this.#waitingRoom(roomId);
    return room?.seats.some((seat) => seatBelongsToResident(seat, residentId)) ? room : null;
  }

  #seatedResidents(communities: readonly HumanCommunityRecord[]): Set<string> {
    const residents = new Set<string>();
    const accountResidents = new Map<string, string[]>();
    for (const community of communities) {
      const residentsForAccount = accountResidents.get(community.account.accountId) ?? [];
      residentsForAccount.push(community.resident.residentId);
      accountResidents.set(community.account.accountId, residentsForAccount);
    }
    for (const table of this.#tables.listPublicTables()) {
      const roomId = table.room?.room_id;
      if (!roomId) continue;
      const room = this.#tables.read(roomId);
      if (!room) continue;
      for (const seat of room.seats) {
        const seatResidentId = seat.residentId;
        if (typeof seatResidentId === "string" && validIdentifier(seatResidentId)) {
          residents.add(seatResidentId);
          continue;
        }
        if (seat.playerId.startsWith("resident:")) {
          const residentId = seat.playerId.slice("resident:".length);
          if (validIdentifier(residentId)) residents.add(residentId);
          continue;
        }
        if (seat.playerId.startsWith("human:")) {
          for (const residentId of accountResidents.get(seat.playerId.slice("human:".length)) ??
            []) {
            residents.add(residentId);
          }
        }
      }
    }
    return residents;
  }

  #deliver(input: {
    delivery: LoungeGameInvitationDelivery;
    requestId: string;
    sender: HumanCommunityRecord;
    recipient: HumanCommunityRecord;
    room: GameRoom;
    kind: GameKind;
  }): { wakeId: string; state: "queued" | "already_recorded" } | null {
    const targetResidentId = input.recipient.resident.residentId;
    const targetWakeId = invitationKey(input.room.roomId, input.requestId, targetResidentId);
    if (this.#wakes.get(targetResidentId, targetWakeId)) {
      return { wakeId: targetWakeId, state: "already_recorded" };
    }
    const before = this.#deliverySnapshot(
      input.room.roomId,
      input.kind,
      input.sender.resident.residentId,
      input.recipient.resident.residentId,
    );
    if (!before) return null;

    const text = this.#formatter({
      delivery: input.delivery,
      requestId: input.requestId,
      fromResidentId: before.sender.resident.residentId,
      fromDisplayName: before.sender.resident.residentName,
      toResidentId: before.recipient.resident.residentId,
      toDisplayName: before.recipient.resident.residentName,
      roomId: before.room.roomId,
      kind: before.room.kind,
      revision: before.room.revision,
    });
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new LoungeGameInvitationError("game_invitation_invalid_request");
    }
    // Re-read the authoritative room and recipient policy immediately before
    // the durable insert. The formatter is injected code and must not create
    // a stale invitation if it observes or changes local state.
    const current = this.#deliverySnapshot(
      input.room.roomId,
      input.kind,
      input.sender.resident.residentId,
      input.recipient.resident.residentId,
    );
    if (!current) return null;
    const residentId = current.recipient.resident.residentId;
    const wakeId = invitationKey(current.room.roomId, input.requestId, residentId);
    const existing = this.#wakes.get(residentId, wakeId);
    if (existing) return { wakeId, state: "already_recorded" };
    const record = this.#wakes.enqueue({
      wakeId,
      residentId,
      reason: "game_invitation",
      sourceKey: wakeId,
      text,
      now: this.#now(),
    });
    if (record.wakeId !== wakeId) return { wakeId, state: "already_recorded" };
    this.#bell.notifyResident(residentId);
    return { wakeId, state: "queued" };
  }

  #deliverySnapshot(
    roomId: string,
    kind: GameKind,
    fromResidentId: string,
    toResidentId: string,
  ): { sender: HumanCommunityRecord; recipient: HumanCommunityRecord; room: GameRoom } | null {
    const communities = this.#database.listActiveHumanCommunities();
    const sender = communities.find(
      (community) => community.resident.residentId === fromResidentId,
    );
    const recipient = communities.find(
      (community) => community.resident.residentId === toResidentId,
    );
    const room = this.#waitingRoomWithSeat(roomId, fromResidentId);
    if (!sender || !recipient || !room || room.kind !== kind || fromResidentId === toResidentId) {
      return null;
    }
    if (this.#seatedResidents(communities).has(toResidentId)) return null;
    if (!acceptsGameInvitation(preferencesFor(this.#database, recipient), this.#now())) {
      return null;
    }
    return { sender, recipient, room };
  }
}

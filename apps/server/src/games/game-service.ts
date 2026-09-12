import { randomUUID } from "node:crypto";
import {nextGameDeadline,timeoutCommand} from './game-timeout.js';
import { GameEconomyError, type GameEconomyPort } from "./game-economy.js";
import type { GameCaller } from "./game-identity.js";
import { type ExtractedGameOutcome, extractGameOutcome } from "./game-outcome.js";
import type { GameRoundLimitStore } from "./game-round-limit-store.js";
import type { ResidentSocialStore } from "../resident-social/resident-social-store.js";
import {
  aggregateResidentDeltas,
  getDefaultStake,
  settleSeatDeltas,
  validateStakeInput,
} from "./game-stakes.js";
import {
  GAME_KINDS,
  GameAccessError,
  type GameActor,
  type GameCommitPublisher,
  type GameChanges,
  type GameEngineAdapter,
  type GameKind,
  type GameRoom,
  type GameRoomStore,
  type GameSeat,
  GameStateError,
} from "./types.js";

const PLAYER_COUNTS: Record<GameKind, readonly [number, number]> = {
  "leaf-game": [4, 4],
  doudizhu: [3, 3],
  "flying-chess": [2, 4],
  uno: [2, 4],
  monopoly: [2, 4],
  mahjong: [4, 4],
};

type LoungeTableStore = GameRoomStore & {
  listPublicTables?: () => ReadonlyArray<{
    table_id: "square" | "round";
    room: { room_id: string } | null;
  }>;
  withPostCommit?: <T>(action: () => T) => T;
};

function publicSeat(seat: GameSeat): GameSeat {
  return {
    playerId: seat.playerId,
    controllerType: seat.controllerType,
    ...(seat.residentId ? { residentId: seat.residentId } : {}),
    ready: seat.ready,
  };
}

function publicActor(actor: GameActor | null | undefined): GameActor | null {
  return actor ? { playerId: actor.playerId, controllerType: actor.controllerType } : null;
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function snapshotPhase(value: unknown): unknown {
  return snapshotRecord(value)?.phase;
}

function isRoundOver(kind: GameKind, snapshot: unknown): boolean {
  return (kind === "uno" || kind === "doudizhu") && snapshotPhase(snapshot) === "round_over";
}

function isNextRound(kind: GameKind, command: Record<string, unknown>): boolean {
  return (kind === "uno" || kind === "doudizhu") && command.action === "next_round";
}

function isRoundStart(kind: GameKind, snapshot: unknown): boolean {
  const phase = snapshotPhase(snapshot);
  return (kind === "uno" && phase === "playing") || (kind === "doudizhu" && phase === "bidding");
}

function samePlayerSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((playerId) => rightSet.has(playerId));
}

/** Internal game service with optional authoritative economy; no public routes, Bell or scripted players. */
export class GameService {
  constructor(
    private readonly store: GameRoomStore,
    private readonly engine: GameEngineAdapter,
    private readonly generateId: () => string = randomUUID,
    private readonly publisher?: GameCommitPublisher,
    private readonly economy?: GameEconomyPort,
    private readonly roundLimits?: GameRoundLimitStore,
    private readonly residentSocial?: ResidentSocialStore,
    private readonly now:()=>number = Date.now,
  ) {}

  async create(
    caller: GameCaller,
    kind: GameKind,
    baseStake?: number,
    tableId?: "square" | "round",
  ) {
    const actor = await caller.authenticate();
    if (!GAME_KINDS.includes(kind)) throw new GameStateError("unknown_game");
    const selectedStake = baseStake === undefined ? getDefaultStake(kind) : baseStake;
    const stake = validateStakeInput({ kind, baseStake: selectedStake });
    const physicalTable = typeof this.store.createAtTable === "function";
    if (physicalTable) {
      if (!tableId) throw new GameStateError("table_required");
      this.assertNotSeatedAtAnotherTable(actor, tableId);
    }
    const room: GameRoom = {
      roomId: this.generateId(),
      kind,
      revision: 0,
      phase: "waiting",
      // A physical table create reserves the creator's seat in the same
      // database transaction as the table binding.  The HTTP/MCP join that
      // follows is then an idempotent read instead of a second save.
      seats: physicalTable ? [{ ...actor, ready: false }] : [],
      host: { ...actor },
      baseStake: stake.baseStake,
      snapshot: null,
    };
    if (physicalTable) {
      this.store.createAtTable!(room, tableId!);
    } else {
      this.store.create(room);
    }
    return this.lobbyView(room);
  }

  async join(caller: GameCaller, roomId: string, revision: number) {
    const actor = await caller.authenticate();
    const room = this.current(roomId, revision);
    if (
      room.seats.some(
        (seat) => seat.playerId === actor.playerId && seat.controllerType === actor.controllerType,
      )
    ) {
      return this.lobbyView(room);
    }
    this.waiting(room);
    if (room.seats.length >= PLAYER_COUNTS[room.kind][1]) throw new GameStateError("room_full");
    room.seats.push({ ...actor, ready: false });
    this.save(room);
    return this.lobbyView(room);
  }

  private assertNotSeatedAtAnotherTable(actor: GameActor, tableId: "square" | "round"): void {
    const listPublicTables = (this.store as LoungeTableStore).listPublicTables;
    if (!listPublicTables) return;
    const tables = listPublicTables.call(this.store);
    if (tables.find((table) => table.table_id === tableId)?.room) return;
    for (const table of tables) {
      const roomId = table.room?.room_id;
      if (!roomId) continue;
      const room = this.store.read(roomId);
      if (
        room?.seats.some(
          (seat) => seat.playerId === actor.playerId && seat.controllerType === actor.controllerType,
        )
      ) {
        throw new GameStateError("already_seated");
      }
    }
  }

  async ready(caller: GameCaller, roomId: string, revision: number, ready: boolean) {
    const actor = await caller.authenticate();
    const room = this.current(roomId, revision);
    this.waiting(room);
    if (typeof ready !== "boolean") throw new GameStateError("invalid_ready");
    this.seat(room, actor).ready = ready;
    this.save(room);
    return this.lobbyView(room);
  }

  async leave(caller: GameCaller, roomId: string, revision: number) {
    const actor = await caller.authenticate();
    const room = this.current(roomId, revision);
    this.seat(room, actor);
    const roundOverPlaying = room.phase === "playing" && isRoundOver(room.kind, room.snapshot);
    if (room.phase === "playing" && !roundOverPlaying) {
      throw new GameStateError("game_in_progress");
    }

    // A finished room must settle before a seat can disappear: the seat
    // identities are part of the settlement input, and settlement failures
    // must leave the room recoverable.
    await this.settlePendingOutcome(room);
    room.seats = room.seats.filter(
      (seat) => seat.playerId !== actor.playerId || seat.controllerType !== actor.controllerType,
    );
    if (roundOverPlaying) room.phase = "finished";
    if (room.phase === "waiting" && room.seats.length === 0) room.phase = "finished";
    this.save(room);
    return this.lobbyView(room);
  }

  async start(caller: GameCaller, roomId: string, revision: number) {
    const actor = await caller.authenticate();
    const room = this.current(roomId, revision);
    this.seat(room, actor);
    this.waiting(room);
    const [min, max] = PLAYER_COUNTS[room.kind];
    if (
      room.seats.length < min ||
      room.seats.length > max ||
      room.seats.some((seat) => !seat.ready)
    ) {
      throw new GameStateError("players_not_ready");
    }
    await this.checkBalances(room, "start");
    room.snapshot = await this.engine.create(room.kind, room.roomId, room.seats);
    room.phase = "playing";
    this.save(room, true);
    return this.playerView(room, actor);
  }

  async view(caller: GameCaller, roomId: string) {
    const actor = await caller.authenticate();
    const room = this.current(roomId);
    this.seat(room, actor);
    await this.settleDue(room);
    await this.settlePendingOutcome(room);
    return this.playerView(room, actor);
  }

  async command(
    caller: GameCaller,
    roomId: string,
    revision: number,
    command: Record<string, unknown>,
  ) {
    const actor = await caller.authenticate();
    const room = this.current(roomId, revision);
    this.seat(room, actor);
    await this.settleDue(room);
    const outcome = await this.settlePendingOutcome(room);
    if (room.revision !== revision) throw new GameStateError("stale_room");
    if (room.phase !== "playing") throw new GameStateError("game_not_playing");
    const requestedNextRound = isNextRound(room.kind, command);
    const wasRoundOver = isRoundOver(room.kind, room.snapshot);
    if (this.economy && requestedNextRound && wasRoundOver) {
      if (!outcome) throw new GameEconomyError("settlement_required");
      this.ensureRoundParticipants(room, outcome);
      await this.checkBalances(room, "next_round");
      if (room.revision !== revision) throw new GameStateError("stale_room");
    }
    // Do not require current-player identity here: each engine owns response windows.
    const applied = this.engine.applyUpdate
      ? await this.engine.applyUpdate(room.kind, room.snapshot, actor.playerId, command) : null;
    room.snapshot = applied ? applied.snapshot : await this.engine.apply(room.kind, room.snapshot, actor.playerId, command);
    if (this.engine.isFinished(room.kind, room.snapshot)) room.phase = "finished";
    const advancedRound =
      requestedNextRound &&
      wasRoundOver &&
      isRoundStart(room.kind, room.snapshot);
    if (!['call_uno','catch_uno','build','sell_house'].includes(String(command.action))) room.deadline = null;
    this.save(room, advancedRound, applied?.changes);
    await this.settlePendingOutcome(room);
    return applied ? { ...this.lobbyView(room), game: applied.actorView } : this.playerView(room, actor);
  }

  private current(roomId: string, revision?: number) {
    const room = this.store.read(roomId);
    if (!room) throw new GameStateError("room_not_found");
    if (revision !== undefined && room.revision !== revision)
      throw new GameStateError("stale_room");
    return room;
  }

  /** Runtime-owned deadline recovery; never exposed as a player/tool action. */
  armTimeout(roomId:string):void {
    const room=this.current(roomId);
    if(room.deadline || !nextGameDeadline(room,this.now()))return;
    this.save(room);
  }

  async runTimeout(roomId:string,key:string):Promise<void> {
    const room=this.current(roomId);
    if(!room.deadline||room.deadline.key!==key||room.deadline.at>this.now())return;
    if(room.deadline.playerId==='system'){await this.settleDue(room);return;}
    const actor=room.seats.find(s=>s.playerId===room.deadline!.playerId);
    if(!actor)return;
    const projection=await this.engine.project(room.kind,room.snapshot,actor.playerId);
    const command=timeoutCommand(room.kind,projection,`timeout:${room.roomId}:${room.deadline.at}:${key}`);
    if(!command)throw new GameStateError('timeout_action_unavailable');
    const latest=this.current(roomId);
    if(latest.revision!==room.revision||latest.deadline?.at!==room.deadline.at||latest.deadline.key!==key)return;
    // This capability belongs only to the server scheduler, not an HTTP identity.
    await this.command({authenticate:async()=>actor},roomId,room.revision,command);
  }

  private async settleDue(room: GameRoom) {
    if (room.kind !== "leaf-game" || room.phase !== "playing" || !this.engine.settleDue) return;
    const updated = await this.engine.settleDue(room.kind, room.snapshot);
    if (updated === null) return;
    room.snapshot = updated;
    if (this.engine.isFinished(room.kind, room.snapshot)) room.phase = "finished";
    this.save(room);
  }

  private requireBaseStake(room: GameRoom): number {
    if (!this.economy) throw new GameEconomyError("economy_not_configured");
    if (!Number.isSafeInteger(room.baseStake) || room.baseStake! <= 0) {
      throw new GameEconomyError("base_stake_required");
    }
    try {
      return validateStakeInput({ kind: room.kind, baseStake: room.baseStake }).baseStake;
    } catch (error) {
      throw new GameEconomyError("base_stake_invalid", String(error));
    }
  }

  private requireResidentId(actor: GameActor): string {
    if (typeof actor.residentId !== "string" || actor.residentId.length === 0) {
      throw new GameEconomyError("resident_identity_required", "resident_identity_required", [
        actor.playerId,
      ]);
    }
    return actor.residentId;
  }

  private async readBalances(seats: readonly GameSeat[]): Promise<Map<string, number>> {
    if (!this.economy) throw new GameEconomyError("economy_not_configured");
    const residentIds = [...new Set(seats.map((seat) => this.requireResidentId(seat)))];
    const result = await this.economy.balances(residentIds);
    if (!Array.isArray(result)) {
      throw new GameEconomyError("balance_response_invalid");
    }
    const balances = new Map<string, number>();
    for (const item of result) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.residentId !== "string" ||
        !residentIds.includes(item.residentId) ||
        balances.has(item.residentId) ||
        !Number.isSafeInteger(item.balance) ||
        item.balance < 0
      ) {
        throw new GameEconomyError("balance_response_invalid");
      }
      balances.set(item.residentId, item.balance);
    }
    if (balances.size !== residentIds.length) {
      throw new GameEconomyError("balance_response_incomplete");
    }
    return balances;
  }

  private async checkBalances(room: GameRoom, reason: "start" | "next_round"): Promise<void> {
    if (!this.economy) return;
    const baseStake = this.requireBaseStake(room);
    const balances = await this.readBalances(room.seats);
    const shortSeats = room.seats.filter((seat) => {
      const residentId = this.requireResidentId(seat);
      return (balances.get(residentId) ?? 0) < baseStake;
    });
    if (shortSeats.length === 0) return;

    const shortResidentIds = new Set(shortSeats.map((seat) => this.requireResidentId(seat)));
    room.seats = room.seats.filter((seat) => !shortResidentIds.has(this.requireResidentId(seat)));
    this.save(room);
    throw new GameEconomyError(
      reason === "start" ? "insufficient_balance" : "next_round_requires_new_room",
      reason === "start" ? "insufficient_balance" : "next_round_requires_new_room",
      [...shortResidentIds],
    );
  }

  private ensureRoundParticipants(room: GameRoom, outcome: ExtractedGameOutcome): void {
    const currentPlayers = room.seats.map((seat) => seat.playerId);
    if (!samePlayerSet(currentPlayers, outcome.outcome.playerIds)) {
      throw new GameEconomyError("next_round_requires_new_room");
    }
  }

  private settlementCandidate(room: GameRoom): boolean {
    return room.phase === "finished" || isRoundOver(room.kind, room.snapshot);
  }

  private async settlePendingOutcome(room: GameRoom): Promise<ExtractedGameOutcome | null> {
    if (!this.economy) return null;
    const extracted = extractGameOutcome(room.kind, room.snapshot);
    if (!extracted) {
      if (this.settlementCandidate(room)) {
        throw new GameEconomyError("settlement_unavailable");
      }
      return null;
    }
    const settlementId = `${room.kind}:${room.roomId}:${extracted.settlementId}`;
    if (room.lastSettlementId === settlementId) return extracted;

    const baseStake = this.requireBaseStake(room);
    const seatByPlayer = new Map(room.seats.map((seat) => [seat.playerId, seat]));
    for (const playerId of extracted.outcome.playerIds) {
      if (!seatByPlayer.has(playerId)) {
        throw new GameEconomyError("settlement_identity_required", "settlement_identity_required", [
          playerId,
        ]);
      }
    }
    const seatDeltas = settleSeatDeltas({ kind: room.kind, baseStake }, extracted.outcome);
    const residentDeltas = aggregateResidentDeltas(seatDeltas, (playerId) =>
      this.requireResidentId(seatByPlayer.get(playerId)!),
    );
    const result = await this.economy.settle({ settlementId, deltas: residentDeltas });
    this.validateSettlementResult(result, settlementId, residentDeltas);
    room.lastSettlementId = settlementId;
    this.save(room);
    return extracted;
  }

  private validateSettlementResult(
    result: Awaited<ReturnType<GameEconomyPort["settle"]>>,
    settlementId: string,
    deltas: readonly { residentId: string; delta: number }[],
  ): void {
    if (!result || result.settlementId !== settlementId || !Array.isArray(result.accounts)) {
      throw new GameEconomyError("settlement_response_invalid");
    }
    const expected = new Map(deltas.map((delta) => [delta.residentId, delta.delta]));
    if (result.accounts.length !== expected.size) {
      throw new GameEconomyError("settlement_response_invalid");
    }
    const seen = new Set<string>();
    for (const account of result.accounts) {
      if (!account || typeof account !== "object") {
        throw new GameEconomyError("settlement_response_invalid");
      }
      const expectedDelta = expected.get(account.residentId);
      if (
        typeof account.residentId !== "string" ||
        !expected.has(account.residentId) ||
        seen.has(account.residentId) ||
        account.expectedDelta !== expectedDelta ||
        !Number.isSafeInteger(account.actualDelta) ||
        !Number.isSafeInteger(account.balance) ||
        account.balance < 0 ||
        (expectedDelta !== undefined &&
          expectedDelta > 0 &&
          account.actualDelta !== expectedDelta) ||
        (expectedDelta !== undefined &&
          expectedDelta < 0 &&
          (account.actualDelta < expectedDelta || account.actualDelta > 0))
      ) {
        throw new GameEconomyError("settlement_response_invalid");
      }
      seen.add(account.residentId);
    }
  }

  private waiting(room: GameRoom) {
    if (room.phase !== "waiting") throw new GameStateError("room_already_started");
  }

  private seat(room: GameRoom, actor: GameActor) {
    const seat = room.seats.find(
      (item) => item.playerId === actor.playerId && item.controllerType === actor.controllerType,
    );
    if (!seat) throw new GameAccessError("not_seated");
    if (
      this.economy &&
      (typeof seat.residentId !== "string" ||
        typeof actor.residentId !== "string" ||
        seat.residentId !== actor.residentId)
    ) {
      throw new GameAccessError("resident_identity_changed");
    }
    return seat;
  }

  private save(room: GameRoom, countRound = false, changes?: GameChanges) {
    room.deadline = nextGameDeadline(room,this.now());
    const previousRevision = room.revision;
    room.revision += 1;
    const saveRoom = () => this.store.replace(room, previousRevision);
    const residentSocial = this.residentSocial;
    const saveWithSocial =
      countRound && residentSocial
        ? () => residentSocial.commitGame(room.seats, saveRoom, undefined, room.kind)
        : saveRoom;
    const commit = () => {
      if (countRound && this.roundLimits) {
        this.roundLimits.commit(room, saveWithSocial);
      } else {
        saveWithSocial();
      }
    };
    const withPostCommit = (this.store as LoungeTableStore).withPostCommit;
    if (withPostCommit) {
      withPostCommit.call(this.store, commit);
    } else {
      commit();
    }
    try {
      this.publisher?.publish(room, changes);
    } catch {
      // The room is already durably committed; delivery failures cannot turn
      // a successful game action into a failed request.
    }
  }

  private lobbyView(room: GameRoom) {
    return {
      roomId: room.roomId,
      kind: room.kind,
      revision: room.revision,
      phase: room.phase,
      seats: room.seats.map(publicSeat),
      host: publicActor(room.host),
      baseStake: room.baseStake ?? null,
    };
  }

  private async playerView(room: GameRoom, actor: GameActor) {
    const game =
      room.snapshot === null
        ? null
        : await this.engine.project(room.kind, room.snapshot, actor.playerId);
    return { ...this.lobbyView(room), game };
  }
}

import type Database from "better-sqlite3";
import {
  GAME_KINDS,
  type GameRoom,
  type GameRoomStore,
  type GameSeat,
  type GameActor,
  GameStateError,
} from "./types.js";

const GAME_PHASES = ["waiting", "playing", "finished"] as const;
type GamePhase = (typeof GAME_PHASES)[number];

interface GameRoomRow {
  deadline_json: string | null;
  room_id: string;
  kind: string;
  revision: number;
  phase: string;
  seats_json: string;
  host_player_id: string | null;
  host_controller_type: string | null;
  base_stake: number | null;
  last_settlement_id: string | null;
  snapshot_json: string;
}

function isGameKind(value: string): value is GameRoom["kind"] {
  return (GAME_KINDS as readonly string[]).includes(value);
}

function isGamePhase(value: string): value is GamePhase {
  return (GAME_PHASES as readonly string[]).includes(value);
}

function encodeJson(value: unknown, field: string): string {
  try {
    const serialized = JSON.stringify(value, (_key, nestedValue) => {
      if (
        nestedValue === undefined ||
        typeof nestedValue === "function" ||
        typeof nestedValue === "symbol" ||
        typeof nestedValue === "bigint"
      ) {
        throw new GameStateError(`The game room ${field} must be JSON serializable`);
      }
      if (typeof nestedValue === "number" && !Number.isFinite(nestedValue)) {
        throw new GameStateError(`The game room ${field} must contain finite JSON numbers`);
      }
      return nestedValue;
    });
    if (serialized === undefined) {
      throw new GameStateError(`The game room ${field} must be JSON serializable`);
    }
    JSON.parse(serialized);
    return serialized;
  } catch (error) {
    if (error instanceof GameStateError) {
      throw error;
    }
    throw new GameStateError(`The game room ${field} must be JSON serializable`);
  }
}

function validateRoom(room: GameRoom): { seatsJson: string; snapshotJson: string } {
  if (!room || typeof room !== "object") {
    throw new GameStateError("The game room must be an object");
  }
  if (typeof room.roomId !== "string") {
    throw new GameStateError("The game room id must be a string");
  }
  if (!isGameKind(room.kind)) {
    throw new GameStateError("The game room kind is invalid");
  }
  if (!Number.isSafeInteger(room.revision) || room.revision < 0) {
    throw new GameStateError("The game room revision must be a non-negative safe integer");
  }
  if (!isGamePhase(room.phase)) {
    throw new GameStateError("The game room phase is invalid");
  }
  if (!Array.isArray(room.seats)) {
    throw new GameStateError("The game room seats must be an array");
  }
  for (const seat of room.seats) {
    if (
      !seat ||
      typeof seat !== "object" ||
      typeof seat.playerId !== "string" ||
      (seat.controllerType !== "human" && seat.controllerType !== "resident") ||
      typeof seat.ready !== "boolean"
    ) {
      throw new GameStateError("The game room contains an invalid seat");
    }
    if (
      seat.residentId !== undefined &&
      seat.residentId !== null &&
      (typeof seat.residentId !== "string" || seat.residentId.length === 0)
    ) {
      throw new GameStateError("The game room contains an invalid resident identity");
    }
  }
  const hasHost = room.host !== undefined && room.host !== null;
  const hasBaseStake = room.baseStake !== undefined && room.baseStake !== null;
  if (hasHost !== hasBaseStake) {
    throw new GameStateError("The game room host and base stake must be configured together");
  }
  if (hasHost) {
    const host = room.host as GameRoom["host"];
    if (
      !host ||
      typeof host.playerId !== "string" ||
      host.playerId.length === 0 ||
      (host.controllerType !== "human" && host.controllerType !== "resident")
    ) {
      throw new GameStateError("The game room contains an invalid host");
    }
  }
  if (hasBaseStake && (!Number.isSafeInteger(room.baseStake) || room.baseStake! <= 0)) {
    throw new GameStateError("The game room base stake must be a positive safe integer");
  }
  if (
    room.lastSettlementId !== undefined &&
    room.lastSettlementId !== null &&
    (typeof room.lastSettlementId !== "string" || room.lastSettlementId.length === 0)
  ) {
    throw new GameStateError("The game room settlement marker is invalid");
  }
  return {
    seatsJson: encodeJson(room.seats, "seats"),
    snapshotJson: encodeJson(room.snapshot, "snapshot"),
  };
}

function decodeJson<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new GameStateError(`The stored game room ${field} is invalid JSON`);
  }
}

function roomFromRow(row: GameRoomRow): GameRoom {
  if (!isGameKind(row.kind) || !isGamePhase(row.phase)) {
    throw new GameStateError("The stored game room metadata is invalid");
  }
  const room = {
    deadline: row.deadline_json === null ? null : decodeJson<NonNullable<GameRoom['deadline']>>(row.deadline_json, 'deadline'),
    roomId: row.room_id,
    kind: row.kind,
    revision: row.revision,
    phase: row.phase,
    seats: decodeJson<GameSeat[]>(row.seats_json, "seats"),
    ...(row.host_player_id === null && row.host_controller_type === null && row.base_stake === null
      ? {}
      : {
          host: row.host_player_id === null || row.host_controller_type === null
            ? null
            : {
                playerId: row.host_player_id,
                controllerType: row.host_controller_type as GameActor["controllerType"],
              },
          baseStake: row.base_stake,
        }),
    ...(row.last_settlement_id === null ? {} : { lastSettlementId: row.last_settlement_id }),
    snapshot: decodeJson<unknown | null>(row.snapshot_json, "snapshot"),
  } satisfies GameRoom;
  validateRoom(room);
  return room;
}

export class GameStore implements GameRoomStore {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  create(room: GameRoom): void {
    const { seatsJson, snapshotJson } = validateRoom(room);
    try {
      this.#database
        .prepare(
          `INSERT INTO game_rooms (
             room_id, kind, revision, phase, seats_json,
             host_player_id, host_controller_type, base_stake,
             last_settlement_id, snapshot_json, deadline_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          room.roomId,
          room.kind,
          room.revision,
          room.phase,
          seatsJson,
          room.host?.playerId ?? null,
          room.host?.controllerType ?? null,
          room.baseStake ?? null,
          room.lastSettlementId ?? null,
          snapshotJson,
          room.deadline ? encodeJson(room.deadline, 'deadline') : null,
        );
    } catch (error) {
      if (error instanceof Error && /(?:UNIQUE|PRIMARY KEY).*game_rooms/iu.test(error.message)) {
        throw new GameStateError("The game room already exists");
      }
      throw error;
    }
  }

  read(roomId: string): GameRoom | null {
    const row = this.#database
      .prepare(
        `SELECT room_id, kind, revision, phase, seats_json, snapshot_json
                , host_player_id, host_controller_type, base_stake, last_settlement_id, deadline_json
         FROM game_rooms
         WHERE room_id = ?`,
      )
      .get(roomId) as GameRoomRow | undefined;
    return row ? roomFromRow(row) : null;
  }

  replace(room: GameRoom, expectedRevision: number): void {
    const { seatsJson, snapshotJson } = validateRoom(room);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new GameStateError(
        "The expected game room revision must be a non-negative safe integer",
      );
    }
    if (expectedRevision >= Number.MAX_SAFE_INTEGER || room.revision !== expectedRevision + 1) {
      throw new GameStateError("The game room revision must advance by exactly one");
    }
    const result = this.#database
      .prepare(
        `UPDATE game_rooms
         SET kind = ?, revision = ?, phase = ?, seats_json = ?,
             host_player_id = ?, host_controller_type = ?, base_stake = ?,
             last_settlement_id = ?, snapshot_json = ?, deadline_json = ?
         WHERE room_id = ? AND revision = ?`,
      )
      .run(
        room.kind,
        room.revision,
        room.phase,
        seatsJson,
        room.host?.playerId ?? null,
        room.host?.controllerType ?? null,
        room.baseStake ?? null,
        room.lastSettlementId ?? null,
        snapshotJson,
        room.deadline ? encodeJson(room.deadline, 'deadline') : null,
        room.roomId,
        expectedRevision,
      );
    if (result.changes !== 1) {
      throw new GameStateError("The game room revision conflict prevented the update");
    }
  }
}

export function createGameStore(database: Database.Database): GameStore {
  return new GameStore(database);
}

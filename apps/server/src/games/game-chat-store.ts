import type Database from "better-sqlite3";
import type { GameActor } from "./types.js";

export interface GameChatMessage {
  roomId: string;
  sequence: number;
  playerId: string;
  controllerType: GameActor["controllerType"];
  clientMessageId: string;
  text: string;
  createdAt: number;
  replyToMessageId?: string;
}

export interface GameChatAppendInput {
  roomId: string;
  playerId: string;
  controllerType: GameActor["controllerType"];
  clientMessageId: string;
  text: string;
  createdAt: number;
  replyToMessageId?: string;
}

export interface GameChatAppendResult {
  message: GameChatMessage;
  duplicate: boolean;
}

export interface GameChatStore {
  append(input: GameChatAppendInput): GameChatAppendResult;
  read(roomId: string, afterSequence: number): GameChatMessage[];
}

export class GameChatConflictError extends Error {
  constructor() {
    super("The game chat client message id conflicts with existing text");
    this.name = "GameChatConflictError";
  }
}

interface GameChatRow {
  room_id: string;
  sequence: number;
  player_id: string;
  controller_type: "human" | "resident";
  client_message_id: string;
  text: string;
  created_at: number;
  reply_to_message_id: string | null;
}

function mapMessage(row: GameChatRow): GameChatMessage {
  return {
    roomId: row.room_id,
    sequence: row.sequence,
    playerId: row.player_id,
    controllerType: row.controller_type,
    clientMessageId: row.client_message_id,
    text: row.text,
    createdAt: row.created_at,
    ...(row.reply_to_message_id == null ? {} : { replyToMessageId: row.reply_to_message_id }),
  };
}

function validateSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("The game chat sequence must be a non-negative safe integer");
  }
}

export class SqliteGameChatStore implements GameChatStore {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  append(input: GameChatAppendInput): GameChatAppendResult {
    const transaction = this.#database.transaction(() => {
      const existing = this.#database
        .prepare(
          `SELECT room_id, sequence, player_id, controller_type,
                  client_message_id, text, created_at, reply_to_message_id
           FROM game_chat_messages
           WHERE room_id = ? AND player_id = ?
             AND controller_type = ? AND client_message_id = ?`,
        )
        .get(input.roomId, input.playerId, input.controllerType, input.clientMessageId) as
        | GameChatRow
        | undefined;
      if (existing) {
        if (existing.text !== input.text || (existing.reply_to_message_id ?? undefined) !== input.replyToMessageId) {
          throw new GameChatConflictError();
        }
        return { message: mapMessage(existing), duplicate: true };
      }

      const next = this.#database
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
           FROM game_chat_messages
           WHERE room_id = ?`,
        )
        .get(input.roomId) as { next_sequence: number };
      const message: GameChatMessage = {
        roomId: input.roomId,
        sequence: next.next_sequence,
        playerId: input.playerId,
        controllerType: input.controllerType,
        clientMessageId: input.clientMessageId,
        text: input.text,
        createdAt: input.createdAt,
        ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: input.replyToMessageId }),
      };
      this.#database
        .prepare(
          `INSERT INTO game_chat_messages (
             room_id, sequence, player_id, controller_type,
             client_message_id, text, created_at, reply_to_message_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          message.roomId,
          message.sequence,
          message.playerId,
          message.controllerType,
          message.clientMessageId,
          message.text,
          message.createdAt,
          message.replyToMessageId ?? null,
        );
      return { message, duplicate: false };
    });
    return transaction.immediate();
  }

  read(roomId: string, afterSequence: number): GameChatMessage[] {
    validateSequence(afterSequence);
    const rows = this.#database
      .prepare(
        `SELECT room_id, sequence, player_id, controller_type,
                client_message_id, text, created_at, reply_to_message_id
         FROM game_chat_messages
         WHERE room_id = ? AND sequence > ?
         ORDER BY sequence ASC`,
      )
      .all(roomId, afterSequence) as GameChatRow[];
    return rows.map(mapMessage);
  }
}

export function createGameChatStore(database: Database.Database): GameChatStore {
  return new SqliteGameChatStore(database);
}

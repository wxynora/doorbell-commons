import type Database from "better-sqlite3";
import { readGamePreferences } from "../game-settings-store.js";
import { GameStateError, type GameRoom, type GameSeat } from "./types.js";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Calendar day used by the game setting; Beijing has no daylight-saving shift. */
export function beijingCalendarDay(at: number): string {
  return new Date(at + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

type PlayerLimit = {
  playerId: string;
  limit: number | null;
};

/**
 * Persists the six-game daily count and reserves a counted room commit in one
 * SQLite transaction.  The room callback must use the same database connection.
 */
export class GameRoundLimitStore {
  readonly #database: Database.Database;
  readonly #now: () => number;

  constructor(database: Database.Database, now: () => number = Date.now) {
    this.#database = database;
    this.#now = now;
  }

  commit(room: GameRoom, save: () => void, at?: number): void {
    if (typeof save !== "function") {
      throw new TypeError("A game round limit commit needs a room save callback");
    }

    const transaction = this.#database.transaction(() => {
      const calendarDay = beijingCalendarDay(at ?? this.#now());
      const players = this.#players(room.seats);
      for (const player of players) {
        const count = this.readCount(player.playerId, calendarDay);
        if (player.limit !== null && count >= player.limit) {
          throw new GameStateError("game_round_limit_reached");
        }
      }
      for (const player of players) {
        this.#increment(player.playerId, calendarDay);
      }
      save();
    });
    transaction.immediate();
  }

  readCount(playerId: string, calendarDay = beijingCalendarDay(this.#now())): number {
    const row = this.#database
      .prepare(
        `SELECT round_count
         FROM game_round_counts
         WHERE player_id = ? AND calendar_day = ?`,
      )
      .get(playerId, calendarDay) as { round_count: number } | undefined;
    return row?.round_count ?? 0;
  }

  #players(seats: readonly GameSeat[]): PlayerLimit[] {
    const players = new Map<string, PlayerLimit>();
    for (const seat of seats) {
      if (players.has(seat.playerId)) continue;
      players.set(seat.playerId, {
        playerId: seat.playerId,
        limit: this.#readLimit(seat.residentId),
      });
    }
    return [...players.values()];
  }

  #readLimit(residentId: string | null | undefined): number | null {
    if (typeof residentId !== "string" || residentId.length === 0) return null;
    const row = this.#database
      .prepare(
        `SELECT home_id
         FROM homes
         WHERE resident_id = ?`,
      )
      .get(residentId) as { home_id: string } | undefined;
    if (!row) return null;
    return readGamePreferences(this.#database, row.home_id).round_limit;
  }

  #increment(playerId: string, calendarDay: string): void {
    this.#database
      .prepare(
        `INSERT INTO game_round_counts (player_id, calendar_day, round_count)
         VALUES (?, ?, 1)
         ON CONFLICT(player_id, calendar_day)
         DO UPDATE SET round_count = game_round_counts.round_count + 1`,
      )
      .run(playerId, calendarDay);
  }
}

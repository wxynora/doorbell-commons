import type Database from "better-sqlite3";
import { gamePreferencesSchema, type GamePreferences } from "@doorbell/protocol";

export function readGamePreferences(database: Database.Database, homeId: string): GamePreferences {
  const row = database.prepare("SELECT preferences_json FROM home_game_preferences WHERE home_id = ?").get(homeId) as { preferences_json: string } | undefined;
  return row ? gamePreferencesSchema.parse(JSON.parse(row.preferences_json)) : {
    invitations_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours: [],
    round_limit: null,
  };
}

export function writeGamePreferences(database: Database.Database, homeId: string, preferences: GamePreferences): void {
  const value = gamePreferencesSchema.parse(preferences);
  database.prepare(`INSERT INTO home_game_preferences (home_id, preferences_json) VALUES (?, ?)
    ON CONFLICT(home_id) DO UPDATE SET preferences_json = excluded.preferences_json`).run(homeId, JSON.stringify(value));
}

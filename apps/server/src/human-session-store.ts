import type Database from "better-sqlite3";
import { HUMAN_SESSION_MAX_AGE_SECONDS } from "./human-session-policy.js";

export interface ActiveHumanSessionRow {
  account_id: string;
  qq_number: string;
  created_at: number;
  membership_status: "active" | "inactive";
  active_profile_id: string;
}

export class HumanSessionStore {
  constructor(private readonly database: Database.Database) {}

  findActiveSession(tokenHash: string, now: number): ActiveHumanSessionRow | undefined {
    return this.database.prepare(`
      SELECT a.account_id, a.qq_number, a.created_at, a.membership_status, s.active_profile_id
      FROM human_sessions AS s
      JOIN human_accounts AS a ON a.account_id = s.account_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND a.membership_status = 'active'
        AND s.created_at > ?
    `).get(tokenHash, now - HUMAN_SESSION_MAX_AGE_SECONDS * 1000) as
      ActiveHumanSessionRow | undefined;
  }
}

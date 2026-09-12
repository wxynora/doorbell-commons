import type Database from "better-sqlite3";

export class HumanMembershipStore {
  constructor(private readonly database: Database.Database) {}

  /** A delayed successful check may refresh an active account, never restore a revoked one. */
  confirmActiveAccount(accountId: string, now: number): boolean {
    return this.database.prepare(`
      UPDATE human_accounts SET membership_checked_at = ?
      WHERE account_id = ? AND membership_status = 'active'
    `).run(now, accountId).changes === 1;
  }
}

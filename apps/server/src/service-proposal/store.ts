import type Database from "better-sqlite3";

export class ServiceProposalStore {
  constructor(private readonly database: Database.Database) {}

  residentName(residentId: string): string | undefined {
    const row = this.database.prepare(`SELECT resident.resident_name FROM residents AS resident
      JOIN human_accounts AS account ON account.account_id = resident.account_id
      WHERE resident.resident_id = ? AND account.membership_status = 'active'`).get(residentId) as
      { resident_name: string } | undefined;
    return row?.resident_name;
  }

  existingLetter(homeId: string, idempotencyKey: string):
    { letterId: string; body: string; createdAt: number } | undefined {
    const row = this.database.prepare(`SELECT letter_id, body, created_at FROM mailbox_letters
      WHERE home_id = ? AND idempotency_key = ?`).get(homeId, idempotencyKey) as
      { letter_id: string; body: string; created_at: number } | undefined;
    return row ? { letterId: row.letter_id, body: row.body, createdAt: row.created_at } : undefined;
  }
}

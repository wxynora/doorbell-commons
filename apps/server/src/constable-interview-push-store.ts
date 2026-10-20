import type Database from 'better-sqlite3';

// Only transport receipts are stored here. Copy and Human read state remain in
// the original mailbox tables; a send with an unknown result is not confirmed.
export class ConstableInterviewPushStore {
  constructor(private readonly database: Database.Database) {}
  claim(letterId: string, now: number): boolean {
    return this.database.prepare(`INSERT INTO constable_interview_push_receipts(letter_id,attempted_at)
      VALUES(?,?) ON CONFLICT(letter_id) DO NOTHING`).run(letterId,now).changes === 1;
  }
  confirm(letterId: string, now: number): void {
    this.database.prepare(`UPDATE constable_interview_push_receipts SET confirmed_at = ?
      WHERE letter_id = ? AND confirmed_at IS NULL`).run(now,letterId);
  }
}

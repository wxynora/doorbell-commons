import type Database from "better-sqlite3";

export interface CareerExamReminderRetry {
  retryAt: number;
  claimedAt: number | null;
}

/** One persisted retry per exam reminder; consuming it survives a process restart. */
export class CareerExamReminderRetryStore {
  constructor(private readonly database: Database.Database) {}

  get(attemptId: string): CareerExamReminderRetry | undefined {
    return this.database.prepare(`
      SELECT retry_at AS retryAt, claimed_at AS claimedAt
      FROM career_exam_reminder_retries WHERE attempt_id = ?
    `).get(attemptId) as CareerExamReminderRetry | undefined;
  }

  scheduleOnce(attemptId: string, retryAt: number): void {
    this.database.prepare(`
      INSERT INTO career_exam_reminder_retries (attempt_id, retry_at, claimed_at)
      SELECT attempt_id, ?, NULL FROM career_exam_reminders
      WHERE attempt_id = ? AND status = 'scheduled' AND scheduled_at > ?
      ON CONFLICT(attempt_id) DO NOTHING
    `).run(retryAt, attemptId, retryAt);
  }

  claim(attemptId: string, now: number): boolean {
    return this.database.prepare(`
      UPDATE career_exam_reminder_retries SET claimed_at = ?
      WHERE attempt_id = ? AND claimed_at IS NULL AND retry_at <= ?
        AND EXISTS (
          SELECT 1 FROM career_exam_reminders
          WHERE attempt_id = career_exam_reminder_retries.attempt_id
            AND status = 'scheduled' AND scheduled_at > ?
        )
    `).run(now, attemptId, now, now).changes === 1;
  }
}

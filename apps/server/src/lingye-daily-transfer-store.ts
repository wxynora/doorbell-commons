import type Database from "better-sqlite3";

export type ReporterLane = "farm" | "submissions" | "voice";
export const REPORTER_BELL_WAIT_MS = 10 * 60 * 1000;
export interface ReporterAssignment {
  issueDate: string;
  lane: ReporterLane;
  sourceWakeId: string;
  residentId: string;
}

// Successful SSE writes are the timing authority, not enqueue time or ACK.
// A reconnect/replay of the same wake never creates another attempt.
export function recordReporterWakeSent(database: Database.Database, wakeId: string, now: number): void {
  database.prepare(`INSERT OR IGNORE INTO lingye_daily_wake_sends(wake_id, sent_at)
    SELECT wake_id, ? FROM bell_wakes WHERE wake_id=? AND reason='reporter_newsroom_work'`).run(now, wakeId);
}

export class DailyReporterTransferStore {
  constructor(readonly database: Database.Database) {}

  waiting(assignment: ReporterAssignment, now: number) {
    const wakes = this.database.prepare(`SELECT w.wake_id, w.status, s.sent_at
      FROM bell_wakes w LEFT JOIN lingye_daily_wake_sends s ON s.wake_id=w.wake_id
      WHERE w.resident_id=? AND (w.wake_id=? OR w.wake_id IN (
        SELECT wake_id FROM lingye_daily_editor_resends
        WHERE issue_date=? AND lane=? AND source_wake_id=? AND recipient_resident_id=?))
      ORDER BY s.sent_at, w.created_at, w.wake_id`).all(assignment.residentId,
        assignment.sourceWakeId, assignment.issueDate, assignment.lane,
        assignment.sourceWakeId, assignment.residentId) as {wake_id: string; status: string; sent_at: number | null}[];
    let lastQualified: number | null = null;
    let sentCount = 0;
    let lastSent: number | null = null;
    for (const wake of wakes) {
      if (wake.sent_at === null) continue;
      lastSent = wake.sent_at;
      if (lastQualified === null || wake.sent_at - lastQualified >= REPORTER_BELL_WAIT_MS) {
        sentCount++;
        lastQualified = wake.sent_at;
      }
    }
    const waitingForDelivery = wakes.length === 0 || wakes.some(wake => wake.sent_at === null && wake.status === "pending");
    const nextAt = lastSent === null ? null : lastSent + REPORTER_BELL_WAIT_MS;
    return {
      sentCount,
      waitingForDelivery,
      nextAt,
      canResend: !waitingForDelivery && (nextAt === null || now >= nextAt),
      canTransfer: sentCount >= 3 && nextAt !== null && now >= nextAt,
    };
  }
}

export function reporterTransferPending(database: Database.Database, date: string, lane: ReporterLane): boolean {
  return !!database.prepare("SELECT 1 FROM lingye_daily_reporter_transfers WHERE issue_date=? AND lane=? AND status='prepared'").get(date,lane);
}

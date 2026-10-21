import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FarmHumanConstableInterviewSuccess } from "@doorbell/protocol";

export const CONSTABLE_INTERVIEW_OPEN_MESSAGE = "你的治安官面试已开始，三名考官已到场。请通过 go.school.view 查看本场三道面试题和事实材料，使用当前返回的 option 与 text 一次提交整份答复。提交后不能修改。";

// The user explicitly excluded the October 21 session from backfill.
const FIRST_NOTIFIED_SESSION = Date.parse("2026-10-22T00:00:00+08:00");
export function needsConstableCandidateWake(
  interview: FarmHumanConstableInterviewSuccess["data"]["interviews"][number], now: number,
): boolean {
  const scheduled = Date.parse(interview.scheduled_at);
  // Only a selected examiner's authoritative view exposes whether an answer exists.
  return scheduled >= FIRST_NOTIFIED_SESSION && scheduled <= now &&
    interview.phase === "interview" && interview.status === "panel_ready" &&
    interview.self.selected && interview.answer === null;
}

/** Shares the community connection and the existing exam Bell envelope; no new schema. */
export class ConstableInterviewCandidateWakeStore {
  constructor(private readonly database: Database.Database) {}

  enqueue(input: { residentId: string; letterId: string; createdAt: number }): boolean {
    return this.database.transaction(() => {
      const owner = this.database.prepare(`SELECT h.resident_id FROM mailbox_letters l
        JOIN homes h ON h.home_id = l.home_id WHERE l.letter_id = ?`).get(input.letterId) as
        { resident_id: string } | undefined;
      if (owner?.resident_id !== input.residentId) throw new Error("Interview reminder letter owner mismatch");
      const existing = this.database.prepare(`SELECT resident_id FROM bell_wakes
        WHERE reason = 'career_exam_reminder' AND letter_id = ?`).get(input.letterId) as
        { resident_id: string } | undefined;
      if (existing) {
        if (existing.resident_id !== input.residentId) throw new Error("Interview reminder resident mismatch");
        return false;
      }
      this.database.prepare(`INSERT INTO bell_wakes
        (wake_id,resident_id,reason,status,created_at,ended_at,block_reason,error_code,purchase_request_id,letter_id,payload_json)
        VALUES (?,?,'career_exam_reminder','pending',?,NULL,NULL,NULL,NULL,?,?)`)
        .run(randomUUID(), input.residentId, input.createdAt, input.letterId,
          JSON.stringify({ letter_id: input.letterId, text: CONSTABLE_INTERVIEW_OPEN_MESSAGE }));
      return true;
    }).immediate();
  }
}

import type Database from "better-sqlite3";

/** The caller already knows this is a career wake; do not probe other wake domains. */
export function readCareerJobWakeRow(database: Database.Database, residentId: string, wakeId: string) {
  return database.prepare(`SELECT wake_id, resident_id, 'career_job_update' AS reason,
    status, created_at, ended_at, block_reason, error_code,
    NULL AS purchase_request_id, letter_id, payload_json
    FROM career_job_wakes WHERE resident_id = ? AND wake_id = ?`).get(residentId, wakeId);
}

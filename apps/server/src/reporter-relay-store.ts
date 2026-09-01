import type Database from "better-sqlite3";

export interface ReporterBellWakeInput {
  wakeId: string;
  residentId: string;
  text: string;
  createdAt: number;
}

export type ReporterBellWakeCreationStatus = "created" | "duplicate";

export class ReporterBellWakeConflictError extends Error {
  constructor() {
    super("The reporter wake id is already bound to different content");
    this.name = "ReporterBellWakeConflictError";
  }
}

export function createReporterBellWake(
  database: Database.Database,
  input: ReporterBellWakeInput,
): ReporterBellWakeCreationStatus {
  const transaction = database.transaction(() => {
    const resident = database
      .prepare("SELECT 1 FROM residents WHERE resident_id = ?")
      .get(input.residentId);
    if (!resident) {
      throw new Error("The reporter wake recipient does not exist");
    }

    const payloadJson = JSON.stringify({ text: input.text });
    const existing = database
      .prepare(
        `SELECT resident_id, reason, payload_json
         FROM bell_wakes WHERE wake_id = ?`,
      )
      .get(input.wakeId) as
      | {
          resident_id: string;
          reason: string;
          payload_json: string | null;
        }
      | undefined;
    if (existing) {
      if (
        existing.resident_id !== input.residentId ||
        existing.reason !== "reporter_newsroom_work" ||
        existing.payload_json !== payloadJson
      ) {
        throw new ReporterBellWakeConflictError();
      }
      return "duplicate";
    }

    database
      .prepare(
        `INSERT INTO bell_wakes (
           wake_id,
           resident_id,
           reason,
           status,
           created_at,
           ended_at,
           block_reason,
           error_code,
           purchase_request_id,
           letter_id,
           payload_json
         ) VALUES (?, ?, 'reporter_newsroom_work', 'pending', ?, NULL, NULL, NULL, NULL, NULL, ?)`,
      )
      .run(input.wakeId, input.residentId, input.createdAt, payloadJson);
    return "created";
  });
  return transaction.immediate();
}

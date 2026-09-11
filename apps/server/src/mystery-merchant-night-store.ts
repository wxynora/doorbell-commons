import type Database from "better-sqlite3";
import type { MerchantNightWake } from "./mystery-merchant-night-bell.js";

export class MysteryMerchantNightStore {
  constructor(private readonly database: Database.Database) {}

  enqueue(wake: MerchantNightWake): boolean {
    return this.database.prepare(`
      INSERT INTO bell_wakes
        (wake_id, resident_id, reason, status, created_at, payload_json)
      VALUES (?, ?, 'mystery_merchant', 'pending', ?, ?)
      ON CONFLICT(wake_id) DO NOTHING
    `).run(wake.wakeId, wake.residentId, wake.createdAt, JSON.stringify({
      text: wake.text, expiresAt: wake.expiresAt,
    })).changes === 1;
  }

  expirePending(residentId: string, now: number): {
    residentId: string; cancelledWakeId: string | null; cancelledWakeIds: string[];
  } {
    const rows = this.database.prepare(`
      UPDATE bell_wakes SET status = 'cancelled', ended_at = ?
      WHERE resident_id = ? AND reason = 'mystery_merchant' AND status = 'pending'
        AND json_extract(payload_json, '$.expiresAt') <= ?
      RETURNING wake_id
    `).all(now, residentId, now) as { wake_id: string }[];
    const ids = rows.map(row => row.wake_id);
    return { residentId, cancelledWakeId: ids[0] ?? null, cancelledWakeIds: ids };
  }
}

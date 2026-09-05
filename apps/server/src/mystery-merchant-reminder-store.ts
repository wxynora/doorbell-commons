import type Database from "better-sqlite3";
import type { ActivityReminderProfileKey } from "./community-database.js";

export class MysteryMerchantReminderStore {
  constructor(private readonly database: Database.Database) {}

  wasDelivered(profile: ActivityReminderProfileKey, endsAt: string): boolean {
    return Boolean(this.database.prepare(`
      SELECT 1 FROM mystery_merchant_notices
      WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ? AND ends_at = ?
    `).get(profile.residentId, profile.homeId, profile.farmDoorplate, endsAt));
  }

  markDelivered(profile: ActivityReminderProfileKey, endsAt: string, now: number): void {
    this.database.prepare(`
      INSERT OR IGNORE INTO mystery_merchant_notices
        (resident_id, home_id, farm_doorplate, ends_at, delivered_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(profile.residentId, profile.homeId, profile.farmDoorplate, endsAt, now);
  }
}

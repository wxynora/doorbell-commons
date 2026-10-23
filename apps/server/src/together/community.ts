import type Database from "better-sqlite3";
import { loungeDisplayName } from "../lounge-display-name.js";
import type { SnowActivity, SnowIdentity } from "./contracts.js";
import { openSnowWarTogether } from "./snow-fort/snow-war-together.mjs";

export function togetherIdentity(
  database: Database.Database,
  residentId: string,
): SnowIdentity | undefined {
  const row = database
    .prepare(`SELECT a.account_id AS humanId, h.home_id AS homeId,
      r.resident_name AS residentName, f.farm_doorplate AS farmDoorplate
    FROM residents r JOIN human_accounts a ON a.account_id=r.account_id
    JOIN homes h ON h.resident_id=r.resident_id JOIN farm_bindings f ON f.home_id=h.home_id
    WHERE r.resident_id=? AND a.membership_status='active' AND f.farm_human_key IS NOT NULL`)
    .get(residentId) as SnowIdentity | undefined;
  return row && { ...row, residentName: loungeDisplayName(row.residentName) };
}

export function createCommunityTogether(
  database: Database.Database,
  options: {
    now?: () => number;
    clock?: () => number;
    automatic?: boolean;
    onChange?: () => void;
    onSnapshot?: () => void;
  },
): SnowActivity {
  return openSnowWarTogether({
    database,
    identityForResident: (id: string) => togetherIdentity(database, id),
    listEligibleResidents: () =>
      (
        database
          .prepare(`SELECT r.resident_id AS id FROM residents r
      JOIN human_accounts a ON a.account_id=r.account_id JOIN homes h ON h.resident_id=r.resident_id
      JOIN farm_bindings f ON f.home_id=h.home_id
      WHERE a.membership_status='active' AND f.farm_human_key IS NOT NULL ORDER BY r.resident_id`)
          .all() as { id: string }[]
      ).map((row) => row.id),
    ...options,
  } as Parameters<typeof openSnowWarTogether>[0]) as unknown as SnowActivity;
}

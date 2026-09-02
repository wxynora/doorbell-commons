import { beijingDayStart } from "../nature.js";
import { currentDayIndex } from "../time.js";
import { beijingDate } from "./persistence.js";
import {
    FARM_CROP_THEFT_VIOLATION,
    BANK_SYSTEM_LOAN_REFUSAL_VIOLATION,
} from "../security/service.js";

const REASONS = Object.freeze({
    [FARM_CROP_THEFT_VIOLATION]: "偷菜",
    [BANK_SYSTEM_LOAN_REFUSAL_VIOLATION]: "系统贷款超过宽限期仍未还清",
});

export function readReporterDetentionMaterials(database, farms, now) {
    const day = currentDayIndex(now);
    const start = beijingDayStart(day - 1);
    const end = beijingDayStart(day);
    const names = new Map(farms.map(farm => [
        farm?.doorbellMcpMigration?.residentId,
        String(farm?.aiName || farm?.name || "").replace(/[<>\r]/gu, "").trim(),
    ]));
    // Read the recorded admission, not current custody: a person released before
    // 05:00 was still detained yesterday. No state refresh or catch is performed.
    return database.prepare(`SELECT detention.resident_id, detention.started_at,
        violation.violation_code
      FROM security_detentions AS detention
      JOIN security_violations AS violation ON violation.violation_id = detention.violation_id
      WHERE detention.started_at >= ? AND detention.started_at < ?
      ORDER BY detention.started_at, detention.detention_id`)
        .all(start, end)
        .flatMap(row => {
            const name = names.get(row.resident_id);
            const reason = REASONS[row.violation_code];
            if (!name || !reason)
                return [];
            return [{
                category: "security_detention",
                occurredAt: row.started_at,
                title: `${beijingDate(row.started_at)} 看守所`,
                content: `${name}因${reason}被关进看守所。`,
            }];
        });
}

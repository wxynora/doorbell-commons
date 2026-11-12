import { currentDayIndex } from "./time.js";

const DAY_MS = 86400000;
const BEIJING_OFFSET_MS = 8 * 3600 * 1000;
let economyDatabase = null;

/** 排行榜只读接入当前服务持有的铃野经济库；null 用于服务关闭和纯函数测试。 */
export function setDailySpendEconomyDatabase(database) {
    if (database !== null && (typeof database?.prepare !== "function" || typeof database?.close !== "function"))
        throw new TypeError("daily spend economy database must be a DatabaseSync instance or null");
    economyDatabase = database;
}

/** 当天已最终支付给系统的铃野金币；只认稳定 resident↔migration 绑定和不可变消费凭证。 */
export function economyGoldSpentToday(farm, now, database = economyDatabase) {
    if (!database || database.isOpen === false)
        return 0;
    const residentId = String(farm?.doorbellMcpMigration?.residentId ?? "").trim();
    const bindingReference = String(farm?.doorbellMcpMigration?.migrationId ?? "").trim();
    if (!residentId || !bindingReference)
        return 0;
    const dayStart = currentDayIndex(now) * DAY_MS - BEIJING_OFFSET_MS;
    const row = database.prepare(`
      SELECT COALESCE(SUM(receipt.amount), 0) AS amount
      FROM residents AS resident
      JOIN economy_financial_receipts AS receipt
        ON receipt.resident_id = resident.resident_id
      WHERE resident.resident_id = ?
        AND resident.binding_reference = ?
        AND receipt.currency = 'gold'
        AND receipt.kind IN ('system_gold_charge', 'system_gold_settle')
        AND receipt.created_at >= ?
        AND receipt.created_at < ?
    `).get(residentId, bindingReference, dayStart, dayStart + DAY_MS);
    const amount = Number(row?.amount ?? 0);
    if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error("Invalid daily economy gold spend total");
    return amount;
}

/**
 * 一次分组汇总当天全部居民的已支付金币，供榜单与本人排名共用同一结果；
 * 键为 resident_id，值含绑定引用与金额。没有经济库或库未打开时返回空表。
 */
export function economyGoldSpentTodayByResident(now, database = economyDatabase) {
    if (!database || database.isOpen === false)
        return new Map();
    const dayStart = currentDayIndex(now) * DAY_MS - BEIJING_OFFSET_MS;
    const rows = database.prepare(`
      SELECT resident.resident_id AS resident_id,
             resident.binding_reference AS binding_reference,
             COALESCE(SUM(receipt.amount), 0) AS amount
      FROM residents AS resident
      JOIN economy_financial_receipts AS receipt
        ON receipt.resident_id = resident.resident_id
      WHERE receipt.currency = 'gold'
        AND receipt.kind IN ('system_gold_charge', 'system_gold_settle')
        AND receipt.created_at >= ?
        AND receipt.created_at < ?
      GROUP BY resident.resident_id, resident.binding_reference
    `).all(dayStart, dayStart + DAY_MS);
    const totals = new Map();
    for (const row of rows) {
        const amount = Number(row?.amount ?? 0);
        if (!Number.isSafeInteger(amount) || amount < 0)
            throw new Error("Invalid daily economy gold spend total");
        totals.set(String(row?.resident_id ?? ""), {
            bindingReference: String(row?.binding_reference ?? ""),
            amount,
        });
    }
    return totals;
}

/** 已分组结果中某一农场的当日金币消费；无稳定绑定或绑定不符记 0。 */
export function economyGoldSpentForFarm(farm, totalsByResident) {
    const residentId = String(farm?.doorbellMcpMigration?.residentId ?? "").trim();
    const bindingReference = String(farm?.doorbellMcpMigration?.migrationId ?? "").trim();
    if (!residentId || !bindingReference)
        return 0;
    const entry = totalsByResident?.get(residentId);
    if (!entry || entry.bindingReference !== bindingReference)
        return 0;
    return entry.amount;
}

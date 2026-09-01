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

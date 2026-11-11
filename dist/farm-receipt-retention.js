import { randomUUID } from "node:crypto";

export const FARM_RECEIPT_TTL_MS = 72 * 60 * 60 * 1000;
export const NPC_MOTION_CHOICE_SCOPE = "/npcMotionChoiceReceipts";

// These receipts describe completed Human actions. The underlying business
// facts, Chef checkpoints and shared AI decoration ledger have their own rules.
export const TIMED_FARM_RECEIPT_SCOPES = Object.freeze({
    bulletin: "/doorbellHumanBulletinReadState/receipts",
    codex: "/doorbellHumanCropCodexActionReceipts",
    expedition: "/doorbellHumanExpeditionActionReceipts",
    farmSettings: "/doorbellHumanFarmSettingsActionReceipts",
    farmShop: "/doorbellHumanFarmShopOpenReceipts",
    harvest: "/doorbellHumanHarvestReceipts",
    kitchenCook: "/doorbellHumanKitchenCookReceipts",
    kitchenInventory: "/doorbellHumanKitchenInventoryActionReceipts",
    kitchenPurchase: "/doorbellHumanKitchenPurchaseReceipts",
    kitchenShop: "/doorbellHumanKitchenShopOpenReceipts",
    kitchenRefresh: "/doorbellHumanKitchenShopRefreshReceipts",
    land: "/doorbellHumanLandUpgradeReceipts",
    market: "/doorbellHumanMarketActionReceipts",
    neighborhood: "/doorbellHumanNeighborhoodMessageReceipts",
    originalPlant: "/doorbellHumanOriginalPlantActionReceipts",
    ranchCollection: "/doorbellHumanRanchCollectionReceipts",
    ranchDecoration: "/doorbellHumanRanchDecorationActionReceipts",
    ranchInteraction: "/doorbellHumanRanchInteractionActionReceipts",
    ranchResident: "/doorbellHumanRanchResidentActionReceipts",
    smelting: "/doorbellHumanSmeltingActionReceipts",
});

const timedScopes = new Set(Object.values(TIMED_FARM_RECEIPT_SCOPES));
const uuidV7 = /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export function farmReceiptIssuedAt(key) {
    return uuidV7.test(key) ? Number.parseInt(key.slice(0, 8) + key.slice(9, 13), 16) : null;
}

export function createFarmReceiptKey(now) {
    const time = now.toString(16).padStart(12, "0");
    return `${time.slice(0, 8)}-${time.slice(8)}-7${randomUUID().slice(15)}`;
}

export function farmReceiptExpiry(scope, key, legacySince, resultJson) {
    if (scope === NPC_MOTION_CHOICE_SCOPE) {
        const { settledAt } = JSON.parse(resultJson);
        if (!Number.isSafeInteger(settledAt)) throw new Error("Invalid NPC motion settlement time");
        return settledAt + FARM_RECEIPT_TTL_MS;
    }
    if (!timedScopes.has(scope)) return null;
    return (farmReceiptIssuedAt(key) ?? legacySince) + FARM_RECEIPT_TTL_MS;
}

export const FARM_RECEIPT_EXPIRY_INDEX_SQL = `
    CREATE INDEX farm_action_receipts_expiry ON farm_action_receipts(expires_at)
    WHERE expires_at IS NOT NULL;
`;

// An old UUID carries no timestamp. Allow its existing result one final
// window; a request with that format can never start a new timed action.
export function installFarmReceiptExpiry(database, now) {
    database.exec("ALTER TABLE farm_action_receipts ADD COLUMN expires_at INTEGER");
    const scopes = [...timedScopes];
    const rows = database.prepare(`
        SELECT farm_id, scope, receipt_key FROM farm_action_receipts
        WHERE scope IN (${scopes.map(() => "?").join(", ")})
    `).all(...scopes);
    const expire = database.prepare(`
        UPDATE farm_action_receipts SET expires_at = ? WHERE farm_id = ? AND scope = ? AND receipt_key = ?
    `);
    for (const row of rows) expire.run(farmReceiptExpiry(row.scope, row.receipt_key, now),
        row.farm_id, row.scope, row.receipt_key);
    database.exec(FARM_RECEIPT_EXPIRY_INDEX_SQL);
}

export function pruneExpiredFarmReceipts(database, now) {
    const expired = database.prepare("SELECT 1 FROM farm_action_receipts WHERE expires_at <= ? LIMIT 1").get(now);
    if (!expired) return [];
    return database.prepare(`
        DELETE FROM farm_action_receipts
        WHERE (farm_id, scope, receipt_key) IN (
            SELECT farm_id, scope, receipt_key FROM farm_action_receipts
            WHERE expires_at <= ? ORDER BY expires_at LIMIT 500
        )
        RETURNING farm_id, scope, receipt_key
    `).all(now);
}

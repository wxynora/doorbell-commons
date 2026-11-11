import { compactNpcMotion } from "./npc-motion-record.js";
import { farmReceiptExpiry, FARM_RECEIPT_TTL_MS, NPC_MOTION_CHOICE_SCOPE } from "../../farm-receipt-retention.js";
import { decomposeFarmForPersistence } from "../../farm-world-sqlite-migration.js";
import {
    decodeStateRecords, encodeStateRecords, readStoredRecords, stateRecordChanges, writeRecordChanges,
} from "../../farm-state-records.js";

const root = "/npcMotions";

export function compactNpcMotionRecords(database, now, apply) {
    if (apply && !database.isTransaction) throw new Error("NPC receipt compaction requires a transaction");
    const result = { mode: apply ? "applied" : "preview", pending: 0, settled: 0, expired: 0, rowsRemoved: 0 };
    const owners = database.prepare(`
        SELECT f.farm_id
        FROM farm_states f CROSS JOIN farm_domain_records r ON r.farm_id = f.farm_id
        WHERE r.record_path = ?
    `).all(root);
    const insert = apply ? database.prepare(`
        INSERT INTO farm_action_receipts (farm_id, scope, receipt_key, payload_hash, result_json, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `) : null;
    for (const { farm_id: farmId } of owners) {
        const before = readStoredRecords(database, "farm", farmId, root);
        const motions = decodeStateRecords(before, root);
        const compacted = Object.create(null);
        const recent = Object.create(null);
        for (const [id, motion] of Object.entries(motions)) {
            const value = compactNpcMotion(motion);
            if (motion.result && Number.isSafeInteger(value.settledAt)) {
                if (now >= value.settledAt + FARM_RECEIPT_TTL_MS) result.expired++;
                else { recent[id] = value; result.settled++; }
            } else {
                compacted[id] = value;
                if (value !== motion) result.pending++;
            }
        }
        const after = encodeStateRecords(compacted, { path: root, parent: "", member: "npcMotions" });
        result.rowsRemoved += before.size - after.size;
        if (apply) {
            const { receipts } = decomposeFarmForPersistence({ id: farmId, npcMotionChoiceReceipts: recent });
            for (const receipt of receipts) insert.run(farmId, NPC_MOTION_CHOICE_SCOPE, receipt.receiptKey,
                receipt.payloadHash, receipt.resultJson, farmReceiptExpiry(NPC_MOTION_CHOICE_SCOPE, receipt.receiptKey, now, receipt.resultJson));
            writeRecordChanges(database, "farm", farmId, stateRecordChanges(before, after));
        }
    }
    return result;
}

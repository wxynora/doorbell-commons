import { getFarm } from "../../store.js";
import { acceptCommittedFarmRecords } from "../../farm-mutation-scope.js";
import { writeFarmStatePaths } from "../../farm-state-records.js";
import { runLingyeWorldTransaction } from "../../lingye-world-database.js";

const PRICE = 500;
const COMMAND = "system.charge.moments_promotion";

export class MomentsPromotionChargeError extends Error {
    constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new MomentsPromotionChargeError(code); };

export function createMomentsPromotionService({ database, backend, farmById = getFarm }) {
    return {
        charge(input) {
            if (!input || typeof input !== "object" || Array.isArray(input) ||
                Object.keys(input).sort().join(",") !== "farmDoorplate,gold,postId,residentId" ||
                ![input.postId, input.residentId, input.farmDoorplate].every(value => typeof value === "string" && value.trim()) ||
                !Number.isSafeInteger(input.gold)) fail("invalid_request");
            if (input.gold !== PRICE) fail("price_changed");
            const farm = farmById(input.farmDoorplate);
            if (!farm || farm.id !== input.farmDoorplate || farm.doorbellMcpMigration?.residentId !== input.residentId)
                fail("farm_binding_mismatch");
            let committed;
            const payment = runLingyeWorldTransaction(database, () => {
                const persisted = database.prepare("SELECT resident_id FROM farm_states WHERE farm_id=?").get(farm.id);
                if (persisted?.resident_id !== input.residentId) fail("farm_binding_mismatch");
                const key = `moments.promotion:${input.postId}`;
                const prior = database.prepare("SELECT journal_id, command_type FROM economy_commands WHERE idempotency_key=?").get(key);
                if (prior && prior.command_type !== COMMAND) throw new Error("Invalid Moments promotion command");
                const receipt = prior ? backend.trustedQueries.getFinancialReceipt(prior.journal_id)
                    : backend.trustedSystemCommands.chargeToSystem({
                        residentId: input.residentId, currency: "gold", amount: PRICE, actor: "agent",
                        businessType: "moments_promotion", businessRef: input.postId, idempotencyKey: key,
                    }).financialReceipt;
                if (!receipt?.receiptId || receipt.kind !== "system_gold_charge" ||
                    receipt.currency !== "gold" || receipt.amount !== PRICE || receipt.businessReference !== input.postId ||
                    (!prior && receipt.residentId !== input.residentId))
                    throw new Error("Invalid Moments promotion receipt");
                const payment = { receiptId: receipt.receiptId, payerResidentId: receipt.residentId };
                // Replays recover the first payment. They never project a different payer's wallet.
                if (prior) return payment;
                const wallet = backend.trustedQueries.getAccount(input.residentId);
                const old = farm.doorbellMcpMigration.balanceProjection;
                if (farm.coins !== wallet.availableGold || farm.silver !== wallet.availableSilver ||
                    old?.gold !== wallet.availableGold || old?.silver !== wallet.availableSilver) {
                    const projection = { authority: "ledger", operationId: key, gold: wallet.availableGold, silver: wallet.availableSilver };
                    const { recordChanges } = writeFarmStatePaths(database, farm.id, [
                        { path: ["coins"], value: projection.gold },
                        { path: ["silver"], value: projection.silver },
                        { path: ["doorbellMcpMigration", "balanceProjection"], value: projection },
                    ]);
                    committed = { projection, recordChanges };
                }
                return payment;
            });
            if (committed) {
                farm.coins = committed.projection.gold;
                farm.silver = committed.projection.silver;
                farm.doorbellMcpMigration.balanceProjection = committed.projection;
                acceptCommittedFarmRecords(farm, committed.recordChanges);
            }
            return { ok: true, ...input, ...payment };
        },
    };
}

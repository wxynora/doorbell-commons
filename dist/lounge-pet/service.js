import { beijingDate } from "../career/persistence.js";
import { runLingyeWorldTransaction } from "../lingye-world-database.js";

/** The receipt, shared cat/dog quota and actual ledger credit commit together. */
export function interactWithLoungePet(database, backend, input, now = Date.now()) {
    const { residentId, farmId, requestId, pet } = input;
    if (![residentId, farmId, requestId].every(value => typeof value === "string" && value.length > 0)
        || !["cat", "dog"].includes(pet)) {
        throw Object.assign(new Error("Invalid lounge pet interaction"), { code: "INVALID_PET_INTERACTION" });
    }
    return runLingyeWorldTransaction(database, () => {
        const existing = database.prepare(`SELECT farm_id, pet, result_json FROM lounge_pet_receipts
          WHERE resident_id = ? AND request_id = ?`).get(residentId, requestId);
        if (existing) {
            if (existing.farm_id !== farmId || existing.pet !== pet)
                throw Object.assign(new Error("Interaction identity changed"), { code: "IDEMPOTENCY_CONFLICT" });
            return JSON.parse(existing.result_json);
        }
        const day = beijingDate(now);
        const used = database.prepare(`SELECT COUNT(*) AS count FROM lounge_pet_receipts
          WHERE resident_id = ? AND reward_day = ? AND reward_silver = 5`).get(residentId, day).count;
        const reward = used < 3 ? 5 : 0;
        const key = `lounge.pet:${residentId}:${requestId}`;
        const account = reward ? backend.trustedSystemCommands.creditFromSystem({
            residentId, currency: "silver", amount: reward, actor: "system",
            businessType: "lounge_pet_reward", businessRef: key, idempotencyKey: key,
        }) : backend.trustedQueries.getAccount(residentId);
        const result = {
            ok: true, request_id: requestId, resident_id: residentId, farm_doorplate: farmId,
            pet, reward_day: day, rewarded_silver: reward,
            rewards_remaining: Math.max(0, 3 - used - (reward ? 1 : 0)),
            silver_balance: account.availableSilver,
        };
        database.prepare(`INSERT INTO lounge_pet_receipts
          (resident_id, request_id, farm_id, pet, reward_day, reward_silver, result_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(residentId, requestId, farmId, pet, day, reward, JSON.stringify(result));
        return result;
    });
}

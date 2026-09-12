import { EconomyError } from "./economy-errors.js";

function invalid(details = {}) {
    throw new EconomyError("GAME_SETTLEMENT_INVALID", details);
}

function nonEmptyString(value, field) {
    if (typeof value !== "string" || value.length === 0) {
        invalid({ field });
    }
    return value;
}

function signedInteger(value, field) {
    if (!Number.isSafeInteger(value)) {
        invalid({ field, value });
    }
    return value;
}

function record(value, field) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        invalid({ field });
    }
    return value;
}

/**
 * Validate and copy the trusted, already-aggregated game settlement input.
 * This module does not authenticate the caller or derive deltas from a game
 * snapshot; those responsibilities stay in the Main/game boundary.
 */
export function validateGameSettlementInput(input) {
    const value = record(input, "input");
    const settlementId = nonEmptyString(value.settlementId, "settlementId");
    if (!Array.isArray(value.deltas)) {
        invalid({ field: "deltas" });
    }
    const residentIds = new Set();
    let total = 0;
    const deltas = value.deltas.map((rawDelta, index) => {
        const delta = record(rawDelta, `deltas[${index}]`);
        const residentId = nonEmptyString(delta.residentId, `deltas[${index}].residentId`);
        if (residentIds.has(residentId)) {
            invalid({ field: "residentId", residentId });
        }
        residentIds.add(residentId);
        const amount = signedInteger(delta.delta, `deltas[${index}].delta`);
        total += amount;
        if (!Number.isSafeInteger(total)) {
            invalid({ field: "deltas", reason: "sum_out_of_range" });
        }
        return { residentId, delta: amount };
    });
    if (total !== 0) {
        invalid({ field: "deltas", reason: "not_zero_sum", total });
    }
    return { settlementId, deltas };
}

/**
 * Apply one validated game settlement through the EconomyService callback
 * bridge. Positive deltas are system-funded credits. Negative deltas debit
 * only currently available silver and deliberately ignore the agent lock.
 */
export function applyGameSettlement(input, ledger) {
    const settlement = validateGameSettlementInput(input);
    const accounts = [];

    for (const expected of settlement.deltas) {
        const before = ledger.getAccount(expected.residentId);
        const available = before.availableSilver;
        const actualDelta = expected.delta >= 0
            ? expected.delta
            : -Math.min(-expected.delta, available);
        const balance = ledger.changeSilver(expected.residentId, actualDelta);
        if (actualDelta !== 0) {
            ledger.systemSilver(-actualDelta);
        }
        accounts.push({
            residentId: expected.residentId,
            expectedDelta: expected.delta,
            actualDelta,
            balance,
        });
    }

    return { settlementId: settlement.settlementId, accounts };
}

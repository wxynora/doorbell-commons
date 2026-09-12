import { RequestBodyError, jsonOut, readBody } from "../http.js";
import {
    internalServiceError,
    isPlainObject,
    requireDoorbellService,
} from "./contract.js";

function invalidRequest(res, message = "The game economy request is invalid") {
    return internalServiceError(res, 400, "invalid_request", message);
}

function nonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

function safeInteger(value) {
    return Number.isSafeInteger(value);
}

function parseResidentIds(body) {
    if (!isPlainObject(body) || Object.keys(body).length !== 1 || !Array.isArray(body.resident_ids)) {
        return null;
    }
    const residentIds = body.resident_ids;
    if (residentIds.some((residentId) => !nonEmptyString(residentId))) {
        return null;
    }
    if (new Set(residentIds).size !== residentIds.length) {
        return null;
    }
    return residentIds;
}

function parseSettlement(body) {
    if (!isPlainObject(body) ||
        Object.keys(body).length !== 2 ||
        !nonEmptyString(body.settlement_id) ||
        !Array.isArray(body.deltas)) {
        return null;
    }
    const residentIds = new Set();
    const deltas = [];
    for (const rawDelta of body.deltas) {
        if (!isPlainObject(rawDelta) ||
            Object.keys(rawDelta).length !== 2 ||
            !nonEmptyString(rawDelta.resident_id) ||
            !safeInteger(rawDelta.delta) ||
            residentIds.has(rawDelta.resident_id)) {
            return null;
        }
        residentIds.add(rawDelta.resident_id);
        deltas.push({ residentId: rawDelta.resident_id, delta: rawDelta.delta });
    }
    return { settlementId: body.settlement_id, deltas };
}

function economyBackend(runtime) {
    const backend = runtime?.backend;
    const getAccount = backend?.trustedQueries?.getAccount;
    const settleGame = backend?.trustedSystemCommands?.settleGame;
    if (typeof getAccount !== "function" || typeof settleGame !== "function") {
        return null;
    }
    return { getAccount, settleGame };
}

function accountBalance(account, residentId) {
    if (!isPlainObject(account) ||
        !safeInteger(account.availableSilver) ||
        account.availableSilver < 0) {
        const error = new Error("The game economy account response is invalid");
        error.code = "GAME_ECONOMY_CONTRACT_INVALID";
        error.residentId = residentId;
        throw error;
    }
    return account.availableSilver;
}

function balancesReceipt(residentIds, getAccount) {
    return {
        ok: true,
        accounts: residentIds.map((residentId) => ({
            resident_id: residentId,
            balance: accountBalance(getAccount(residentId), residentId),
        })),
    };
}

function settlementReceipt(input, result) {
    if (!isPlainObject(result) ||
        result.settlementId !== input.settlementId ||
        !Array.isArray(result.accounts) ||
        result.accounts.length !== input.deltas.length) {
        const error = new Error("The game economy settlement response is invalid");
        error.code = "GAME_ECONOMY_CONTRACT_INVALID";
        throw error;
    }
    const expected = new Map(input.deltas.map((delta) => [delta.residentId, delta.delta]));
    const seen = new Set();
    const accounts = result.accounts.map((account) => {
        if (!isPlainObject(account) ||
            !nonEmptyString(account.residentId) ||
            seen.has(account.residentId) ||
            !expected.has(account.residentId) ||
            !safeInteger(account.expectedDelta) ||
            !safeInteger(account.actualDelta) ||
            !safeInteger(account.balance) ||
            account.balance < 0 ||
            account.expectedDelta !== expected.get(account.residentId) ||
            (account.expectedDelta >= 0
                ? account.actualDelta !== account.expectedDelta
                : account.actualDelta < account.expectedDelta || account.actualDelta > 0)) {
            const error = new Error("The game economy settlement response is invalid");
            error.code = "GAME_ECONOMY_CONTRACT_INVALID";
            throw error;
        }
        seen.add(account.residentId);
        return {
            resident_id: account.residentId,
            expected_delta: account.expectedDelta,
            actual_delta: account.actualDelta,
            balance: account.balance,
        };
    });
    return {
        ok: true,
        settlement_id: result.settlementId,
        accounts,
    };
}

function respondFailure(res, error) {
    if (error instanceof RequestBodyError) {
        return internalServiceError(res, error.status, error.code, error.message);
    }
    const code = error?.code;
    if (code === "GAME_SETTLEMENT_INVALID") {
        return invalidRequest(res, "The game settlement request is invalid");
    }
    if (code === "ACCOUNT_NOT_FOUND" || code === "RESIDENT_NOT_FOUND") {
        return internalServiceError(res, 404, "account_not_found", "The resident economy account was not found");
    }
    if (code === "IDEMPOTENCY_CONFLICT") {
        return internalServiceError(res, 409, "settlement_conflict", "The settlement ID was already used with different data");
    }
    if (code === "GAME_ECONOMY_CONTRACT_INVALID") {
        return internalServiceError(res, 503, "game_economy_unavailable", "The game economy service returned an invalid result");
    }
    console.error("[doorbell-game-economy] request failed");
    return internalServiceError(res, 503, "game_economy_unavailable", "The game economy service is unavailable");
}

export async function handleDoorbellGameEconomyBalances(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method)) return;
    const backend = economyBackend(runtime);
    if (!backend) {
        return internalServiceError(res, 503, "game_economy_unavailable", "The game economy service is unavailable");
    }
    try {
        const body = await readBody(req);
        const residentIds = parseResidentIds(body);
        if (residentIds === null) return invalidRequest(res, "Submit one resident_ids array");
        return jsonOut(res, 200, balancesReceipt(residentIds, backend.getAccount));
    }
    catch (error) {
        return respondFailure(res, error);
    }
}

export async function handleDoorbellGameEconomySettle(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method)) return;
    const backend = economyBackend(runtime);
    if (!backend) {
        return internalServiceError(res, 503, "game_economy_unavailable", "The game economy service is unavailable");
    }
    try {
        const body = await readBody(req);
        const input = parseSettlement(body);
        if (input === null) {
            return invalidRequest(res, "Submit one settlement_id and a resident delta list");
        }
        const result = await backend.settleGame(input);
        return jsonOut(res, 200, settlementReceipt(input, result));
    }
    catch (error) {
        return respondFailure(res, error);
    }
}

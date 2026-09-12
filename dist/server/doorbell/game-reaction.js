import { RequestBodyError, jsonOut, readBody } from "../http.js";
import { internalServiceError, requireDoorbellService } from "./contract.js";
import { chargeGameReaction } from "./game-reaction-charge.js";


export async function handleDoorbellGameReaction(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method)) return;
    try { return jsonOut(res, 200, chargeGameReaction(runtime?.backend, await readBody(req))); }
    catch (error) {
        if (error instanceof RequestBodyError) return internalServiceError(res, error.status, error.code, error.message);
        const statuses = { GAME_REACTION_INVALID: 400, BALANCE_INSUFFICIENT: 409, IDEMPOTENCY_CONFLICT: 409, ACCOUNT_NOT_FOUND: 404, SPEND_LIMIT_EXCEEDED: 409, DAILY_LIMIT_EXCEEDED: 409 };
        const status = statuses[error?.code];
        return internalServiceError(res, status ?? 503, status ? error.code : "game_reaction_unavailable", status ? "Game reaction charge rejected" : "Game reaction economy unavailable");
    }
}

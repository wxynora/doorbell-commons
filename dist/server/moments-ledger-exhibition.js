import { requireDoorbellService, internalServiceError } from "./doorbell/contract.js";
import { jsonOut, readBody } from "./http.js";
import { LedgerExhibitionGrantError } from "../domain/moments/ledger-exhibition.js";

export async function handleLedgerExhibitionGrant(req, res, method, service) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        const data = service.grant(await readBody(req));
        return jsonOut(res, 200, { ok: true, data });
    } catch (error) {
        if (error?.message === "invalid_json")
            return internalServiceError(res, 400, "invalid_request", "invalid_request");
        if (error instanceof LedgerExhibitionGrantError)
            return internalServiceError(res, error.code === "invalid_request" ? 400 : 409, error.code, error.code);
        if (error?.code === "IDEMPOTENCY_CONFLICT")
            return internalServiceError(res, 409, "reward_conflict", "reward_conflict");
        return internalServiceError(res, 503, "reward_unavailable", "reward_unavailable");
    }
}

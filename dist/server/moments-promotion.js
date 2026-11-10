import { internalServiceError, requireDoorbellService } from "./doorbell/contract.js";
import { RequestBodyError, readBody, jsonOut } from "./http.js";
import { MomentsPromotionChargeError } from "../domain/moments/promotion.js";

const rejected = {
    BALANCE_INSUFFICIENT: "insufficient_coins",
    SPEND_LIMIT_EXCEEDED: "spend_limit",
    DAILY_LIMIT_EXCEEDED: "spend_limit",
    ACCOUNT_NOT_FOUND: "farm_binding_mismatch",
};

export async function handleMomentsPromotion(req, res, method, service) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        return jsonOut(res, 200, service.charge(await readBody(req)));
    } catch (error) {
        if (error instanceof RequestBodyError) return internalServiceError(res, error.status, error.code, error.message);
        if (error instanceof MomentsPromotionChargeError)
            return internalServiceError(res, error.code === "invalid_request" ? 400 : 409, error.code, error.code);
        const code = rejected[error?.code];
        return code ? internalServiceError(res, 409, code, code)
            : internalServiceError(res, 503, "promotion_unavailable", "promotion_unavailable");
    }
}

import { requireDoorbellService, internalServiceError } from "./doorbell/contract.js";
import { readBody, jsonOut } from "./http.js";
import { listMomentsActivities } from "../domain/moments/activity.js";

export async function handleMomentsActivities(req, res, method, database) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        const input = await readBody(req);
        const keys = input?.latest === true ? ["residentId", "farmDoorplate", "latest", "until"] : ["residentId", "farmDoorplate", "from", "until"];
        if (!input || typeof input !== "object" || Array.isArray(input) ||
            Object.keys(input).length !== keys.length || !keys.every((key) => Object.hasOwn(input, key)))
            throw new Error("invalid_request");
        return jsonOut(res, 200, { ok: true, activities: listMomentsActivities(input, undefined, database) });
    } catch (error) {
        if (error?.message === "invalid_request" || error?.message === "invalid_json")
            return internalServiceError(res, 400, "invalid_request", "invalid_request");
        if (error?.message === "farm_binding_mismatch")
            return internalServiceError(res, 409, "farm_binding_mismatch", "farm_binding_mismatch");
        return internalServiceError(res, 503, "activity_unavailable", "activity_unavailable");
    }
}

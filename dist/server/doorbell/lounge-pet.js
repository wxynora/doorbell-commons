import { RequestBodyError, jsonOut, readBody } from "../http.js";
import { internalServiceError, requireDoorbellService, validateFarmBinding, UUID_RE, isPlainObject } from "./contract.js";
import { interactWithLoungePet } from "../../lounge-pet/service.js";

export async function handleDoorbellLoungePet(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        const body = await readBody(req);
        if (!isPlainObject(body) || Object.keys(body).length !== 5
            || !UUID_RE.test(body.request_id) || typeof body.resident_id !== "string"
            || !["cat", "dog"].includes(body.pet))
            return internalServiceError(res, 400, "invalid_request", "Invalid lounge pet interaction");
        const binding = validateFarmBinding(body);
        if (binding.error) return internalServiceError(res, binding.error.status, binding.error.code, binding.error.message);
        if (binding.farm.doorbellMcpMigration?.residentId !== body.resident_id)
            return internalServiceError(res, 409, "resident_binding_mismatch", "Resident does not own this farm");
        const result = interactWithLoungePet(runtime.database, runtime.backend, {
            residentId: body.resident_id, farmId: binding.farm.id, requestId: body.request_id, pet: body.pet,
        }, runtime.now?.() ?? Date.now());
        return jsonOut(res, 200, result);
    } catch (error) {
        if (error instanceof RequestBodyError) return internalServiceError(res, error.status, error.code, error.message);
        if (error?.code === "IDEMPOTENCY_CONFLICT")
            return internalServiceError(res, 409, error.code, "Interaction identity changed");
        return internalServiceError(res, 503, "lounge_pet_unavailable", "Lounge pet reward unavailable");
    }
}

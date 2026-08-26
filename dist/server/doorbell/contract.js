import { timingSafeEqual } from "node:crypto";
import { playerFarms } from "../../store.js";
import { jsonOut } from "../http.js";

export const DOORBELL_SERVICE_TOKEN = process.env.AIFARM_DOORBELL_SERVICE_TOKEN ?? "";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const farmByHumanKey = (humanKey) => playerFarms().find((farm) => farm.humanKey === humanKey);

export const legacyAgentAccessRevoked = (farm) => farm?.doorbellMcpMigration?.legacyMcpRevoked === true;

export function internalServiceError(res, status, code, message) {
    return jsonOut(res, status, { ok: false, error: { code, message } });
}

export function humanFieldError(res, status, code, message) {
    return jsonOut(res, status, { error: { code, message } });
}

export function serviceTokenMatches(authorization) {
    const prefix = "Bearer ";
    if (!DOORBELL_SERVICE_TOKEN || typeof authorization !== "string" || !authorization.startsWith(prefix))
        return false;
    const received = Buffer.from(authorization.slice(prefix.length), "utf8");
    const expected = Buffer.from(DOORBELL_SERVICE_TOKEN, "utf8");
    return received.length === expected.length && timingSafeEqual(received, expected);
}

export function requireDoorbellService(req, res, method) {
    if (!DOORBELL_SERVICE_TOKEN) {
        internalServiceError(res, 503, "service_not_configured", "Doorbell farm service is not configured");
        return false;
    }
    if (!serviceTokenMatches(req.headers.authorization)) {
        internalServiceError(res, 401, "authentication_required", "A valid Doorbell service credential is required");
        return false;
    }
    if (method !== "POST") {
        internalServiceError(res, 405, "method_not_allowed", "Use POST for this service endpoint");
        return false;
    }
    return true;
}

export function requireDoorbellHumanFieldService(req, res, method) {
    if (!DOORBELL_SERVICE_TOKEN) {
        humanFieldError(res, 503, "farm_unavailable", "Doorbell farm service is not configured");
        return false;
    }
    if (!serviceTokenMatches(req.headers.authorization)) {
        humanFieldError(res, 401, "authentication_required", "A valid Doorbell service credential is required");
        return false;
    }
    if (method !== "POST") {
        humanFieldError(res, 405, "invalid_request", "Use POST for this service endpoint");
        return false;
    }
    return true;
}

export function validateFarmBinding(body) {
    const humanKey = typeof body?.farm_human_key === "string" ? body.farm_human_key : "";
    const expectedDoorplate = typeof body?.expected_farm_doorplate === "string" ? body.expected_farm_doorplate : "";
    if (!humanKey)
        return { error: { status: 400, code: "invalid_request", message: "farm_human_key is required" } };
    if (!FARM_DOORPLATE_RE.test(expectedDoorplate))
        return { error: { status: 400, code: "invalid_request", message: "expected_farm_doorplate is invalid" } };
    const farm = farmByHumanKey(humanKey);
    if (!farm)
        return { error: { status: 404, code: "farm_credential_not_found", message: "The farm human credential is invalid" } };
    if (farm.id !== expectedDoorplate)
        return { error: { status: 409, code: "farm_doorplate_mismatch", message: "The farm human credential does not match the expected doorplate" } };
    return { farm };
}

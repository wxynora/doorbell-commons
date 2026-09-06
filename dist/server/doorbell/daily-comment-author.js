import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { playerFarms } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import { internalServiceError, isPlainObject, requireDoorbellService, UUID_RE } from "./contract.js";

function configuredName(value) {
    return typeof value === "string" && value.trim() ? value : null;
}

export async function handleDoorbellDailyCommentAuthor(req, res, method) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body) || Object.keys(body).length !== 1 ||
            typeof body.resident_id !== "string" || !UUID_RE.test(body.resident_id)) {
            return internalServiceError(res, 400, "invalid_request", "The comment author request is invalid");
        }
        const farm = playerFarms().find(candidate => candidate.doorbellMcpMigration?.residentId === body.resident_id);
        if (!farm)
            return internalServiceError(res, 404, "farm_not_found", "The resident has no bound farm");
        return jsonOut(res, 200, { ok: true, data: {
            resident_id: body.resident_id,
            human_name: configuredName(farm.humanName),
            ai_name: configuredName(farm.aiName),
        } });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-lingye-daily] comment author read failed");
        return internalServiceError(res, 503, "service_unavailable", "The comment author could not be read");
    }
}

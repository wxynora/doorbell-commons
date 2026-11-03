import { MAX_BODY_BYTES } from "../config.js";
import { activeCertificateLevel } from "../career/persistence.js";
import { PublicSyncError } from "../public-sync.js";
import { jsonOut, readJsonBody } from "../server/http.js";
import { internalServiceError, isPlainObject, requireDoorbellService, UUID_RE } from "../server/doorbell/contract.js";
import { collectGlimmerFeedings, collectNpcSettlements, windowForIssueDate } from "./summary.js";
import { readOrCreateReporterFarmFacts } from "./farm-facts-store.js";

export async function handleReporterMaterialsSource(req, res, method, runtime, operation) {
    if (!requireDoorbellService(req, res, method)) return;
    if (!runtime?.database)
        return internalServiceError(res, 503, "service_unavailable", "The reporter materials service is unavailable");
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body) || Object.keys(body).length !== 1)
            return internalServiceError(res, 400, "invalid_request", "The reporter materials request is invalid");
        if (operation === "source" || operation === "farm-source") {
            if (typeof body.issue_date !== "string" || !Object.hasOwn(body, "issue_date"))
                return internalServiceError(res, 400, "invalid_request", "The issue date is invalid");
            let window;
            try { window = windowForIssueDate(body.issue_date); }
            catch { return internalServiceError(res, 400, "invalid_request", "The issue date is invalid"); }
            const now = runtime.now?.() ?? Date.now();
            if (operation === "farm-source") {
                if (now < window.endMs)
                    return internalServiceError(res, 409, "issue_not_ready", "Reporter farm facts are not ready before the issue cutoff");
                const materials = readOrCreateReporterFarmFacts(runtime.database, body.issue_date, window, now);
                if (materials === null)
                    return internalServiceError(res, 410, "issue_materials_expired", "Reporter farm facts have expired");
                return jsonOut(res, 200, { ok: true, data: {
                    issue_date: body.issue_date,
                    window: { startMs: window.startMs, endMs: window.endMs, timeZone: window.timeZone },
                    materials,
                } });
            }
            const glimmer = collectGlimmerFeedings(runtime.database, body.issue_date, now);
            const npc = collectNpcSettlements(runtime.database, body.issue_date, now);
            return jsonOut(res, 200, { ok: true, data: { glimmer, npc } });
        }
        if (typeof body.resident_id !== "string" || !UUID_RE.test(body.resident_id) || !Object.hasOwn(body, "resident_id"))
            return internalServiceError(res, 400, "invalid_request", "The resident id is invalid");
        const employment = runtime.database.prepare(`SELECT 1 FROM career_employments
            WHERE resident_id = ? AND career = 'reporter' AND status = 'active'`).get(body.resident_id);
        const eligible = employment !== undefined &&
            (activeCertificateLevel(runtime.database, body.resident_id, "reporter", runtime.now?.() ?? Date.now()) ?? 0) >= 1;
        return jsonOut(res, 200, { ok: true, data: { resident_id: body.resident_id, eligible } });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-reporter-materials] read failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter materials service is unavailable");
    }
}

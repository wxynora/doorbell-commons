import { MAX_BODY_BYTES } from "../../config.js";
import { CareerDomainError } from "../../career/contracts.js";
import { reporterVoiceAuthor, recordReporterVoiceSubmission, publishReporterVoiceWork } from "../../career/reporter-voice-service.js";
import { allFarms } from "../../store.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import { internalServiceError, isPlainObject, requireDoorbellService } from "./contract.js";

function validText(value) {
    return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function validTimestamp(value) {
    const number = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isSafeInteger(number) && number >= 0 && new Date(number).toISOString() === value;
}

function validRequest(body, action) {
    const keys = action === "author" ? ["issue_date"] : action === "submitted"
        ? ["issue_date", "resident_id", "submission_id", "submitted_at"]
        : ["issue_date", "resident_id", "submission_id", "publication_id", "published_at"];
    return isPlainObject(body) && Object.keys(body).length === keys.length &&
        keys.every(key => Object.hasOwn(body, key)) &&
        typeof body.issue_date === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(body.issue_date) &&
        keys.every(key => key.endsWith("_at") ? validTimestamp(body[key]) : validText(body[key]));
}

export async function handleDoorbellDailyVoice(req, res, method, runtime, action) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!validRequest(body, action))
            return internalServiceError(res, 400, "invalid_request", "The reporter relay request is invalid");
        if (action === "author") {
            const residentId = reporterVoiceAuthor(runtime.database, body.issue_date);
            const farm = residentId ? allFarms().find(candidate => candidate?.doorbellMcpMigration?.residentId === residentId) : null;
            return jsonOut(res, 200, { ok: true, data: {
                issue_date: body.issue_date,
                author: residentId ? { resident_id: residentId, display_name: String(farm?.aiName || farm?.name || "社区记者") } : null,
            } });
        }
        const input = { issueDate: body.issue_date, residentId: body.resident_id, submissionId: body.submission_id };
        const result = action === "submitted"
            ? recordReporterVoiceSubmission(runtime.database, runtime.backend, { ...input, submittedAt: Date.parse(body.submitted_at) })
            : publishReporterVoiceWork(runtime.database, runtime.backend, { ...input, publicationId: body.publication_id, publishedAt: Date.parse(body.published_at) });
        return jsonOut(res, 200, { ok: true, data: { ...body, job_id: result.jobId } });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (error instanceof CareerDomainError)
            return internalServiceError(res, 409, "state_conflict", "The reporter relay state rejected this request");
        console.error("[doorbell-lingye-daily] reporter voice request failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter relay could not be confirmed");
    }
}

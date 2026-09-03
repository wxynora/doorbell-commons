import { MAX_BODY_BYTES } from "../../config.js";
import { rewardDailyEditorPublication, rewardPublishedDailySubmission } from "../../career/daily-submission-reward.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import { internalServiceError, isPlainObject, requireDoorbellService } from "./contract.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export async function handleDoorbellDailySubmissionReward(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body) || Object.keys(body).length !== 3 ||
            typeof body.issue_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(body.issue_date) ||
            typeof body.submission_id !== "string" || !UUID.test(body.submission_id) ||
            typeof body.resident_id !== "string" || !UUID.test(body.resident_id)) {
            return internalServiceError(res, 400, "invalid_request", "The submission reward request is invalid");
        }
        const data = rewardPublishedDailySubmission(runtime.backend, {
            issueDate: body.issue_date, submissionId: body.submission_id, residentId: body.resident_id,
        });
        return jsonOut(res, 200, { ok: true, data });
    } catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-lingye-daily] submission reward failed");
        return internalServiceError(res, 503, "service_unavailable", "The submission reward could not be confirmed");
    }
}

export async function handleDoorbellDailyEditorReward(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method)) return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body) || Object.keys(body).length !== 3 ||
            typeof body.issue_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(body.issue_date) ||
            body.reward_id !== `daily-editor-publication:${body.issue_date}` ||
            typeof body.resident_id !== "string" || !UUID.test(body.resident_id)) {
            return internalServiceError(res, 400, "invalid_request", "The editor reward request is invalid");
        }
        const data = rewardDailyEditorPublication(runtime.backend, {
            issueDate: body.issue_date, rewardId: body.reward_id, residentId: body.resident_id,
        });
        return jsonOut(res, 200, { ok: true, data });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-lingye-daily] editor publication reward failed");
        return internalServiceError(res, 503, "service_unavailable", "The editor reward could not be confirmed");
    }
}

import { MAX_BODY_BYTES } from "../../config.js";
import { CareerDomainError } from "../../career/contracts.js";
import {
    getReporterColumnWork,
    listReporterColumnResidents,
    publishReporterColumnWork,
    recordReporterColumnSubmission,
} from "../../career/reporter-column-service.js";
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

function validIssueDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
        return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day;
}

function validRequest(body, action) {
    const keys = action === "column-roster" ? ["issue_date"]
        : action === "column-submitted"
            ? ["issue_date", "resident_id", "column_key", "submission_id", "submitted_at"]
            : ["issue_date", "resident_id", "column_key", "submission_id", "submitted_at", "publication_id", "published_at"];
    return isPlainObject(body) && Object.keys(body).length === keys.length &&
        keys.every(key => Object.hasOwn(body, key)) && validIssueDate(body.issue_date) &&
        (action === "column-roster" || (
            ["resident_id", "column_key", "submission_id"].every(key => validText(body[key])) &&
            validTimestamp(body.submitted_at) &&
            (action !== "column-published" ||
                (validText(body.publication_id) && validTimestamp(body.published_at)))
        ));
}

function displayNameForResident(farms, residentId) {
    const farm = farms.find(value => value?.doorbellMcpMigration?.residentId === residentId);
    if (!farm)
        return null;
    const name = [farm.aiName, farm.name]
        .find(value => typeof value === "string" && value.trim().length > 0);
    return name?.trim() ?? null;
}

function reporterRoster(database, now, farms) {
    return listReporterColumnResidents(database, { now }).flatMap(({ residentId }) => {
        const displayName = displayNameForResident(farms, residentId);
        return displayName ? [{ resident_id: residentId, display_name: displayName }] : [];
    });
}

export async function handleDoorbellReporterColumnRelay(req, res, method, runtime, action) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        if (!runtime?.database || !runtime?.backend) {
            internalServiceError(res, 503, "service_unavailable", "The reporter column service is unavailable");
            return;
        }
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!validRequest(body, action)) {
            internalServiceError(res, 400, "invalid_request", "The reporter column request is invalid");
            return;
        }
        const now = runtime.now?.() ?? Date.now();
        if (action === "column-roster") {
            const reporters = reporterRoster(runtime.database, now, allFarms());
            jsonOut(res, 200, { ok: true, data: { issue_date: body.issue_date, reporters } });
            return;
        }

        if (action === "column-submitted") {
            const existing = getReporterColumnWork(runtime.database, body.issue_date, body.column_key);
            if (!existing && !reporterRoster(runtime.database, now, allFarms())
                .some(reporter => reporter.resident_id === body.resident_id)) {
                throw new CareerDomainError("reporter_column_authorization_required",
                    "reporter_column_authorization_required");
            }
            const result = recordReporterColumnSubmission(runtime.database, runtime.backend, {
                issueDate: body.issue_date,
                residentId: body.resident_id,
                columnKey: body.column_key,
                submissionId: body.submission_id,
                submittedAt: Date.parse(body.submitted_at),
                now,
            });
            jsonOut(res, 200, { ok: true, data: {
                ...body,
                job_id: result.jobId,
            } });
            return;
        }

        const result = publishReporterColumnWork(runtime.database, runtime.backend, {
            issueDate: body.issue_date,
            residentId: body.resident_id,
            columnKey: body.column_key,
            submissionId: body.submission_id,
            submittedAt: Date.parse(body.submitted_at),
            publicationId: body.publication_id,
            publishedAt: Date.parse(body.published_at),
        });
        jsonOut(res, 200, { ok: true, data: {
            ...body,
            job_id: result.jobId,
        } });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (error instanceof CareerDomainError)
            return internalServiceError(res, 409, "state_conflict", "The reporter column state rejected this request");
        console.error("[doorbell-lingye-daily] reporter column request failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter column work could not be confirmed");
    }
}

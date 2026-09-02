import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { allFarms } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import {
    acknowledgePublishedReporterRelay,
    handoffReporterRelayDuty,
    publishReadyReporterRelay,
    reporterRelayIssue,
    reporterRelayWake,
    startReporterRelayIssue,
} from "../../career/reporter-relay-service.js";
import { CareerDomainError } from "../../career/contracts.js";
import {
    internalServiceError,
    isPlainObject,
    requireDoorbellService,
} from "./contract.js";

const ISSUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

function validIssueDateRequest(body) {
    if (!isPlainObject(body) || Object.keys(body).length !== 1 ||
        !Object.hasOwn(body, "issue_date") ||
        typeof body.issue_date !== "string" || !ISSUE_DATE_RE.test(body.issue_date))
        return null;
    return { issueDate: body.issue_date };
}

function validRequest(body) {
    if (!isPlainObject(body) || Object.keys(body).length !== 3 ||
        !Object.hasOwn(body, "issue_date") ||
        !Object.hasOwn(body, "period_start") ||
        !Object.hasOwn(body, "period_end") ||
        typeof body.issue_date !== "string" || !ISSUE_DATE_RE.test(body.issue_date) ||
        typeof body.period_start !== "string" || typeof body.period_end !== "string")
        return null;
    const periodStart = Date.parse(body.period_start);
    const periodEnd = Date.parse(body.period_end);
    if (!Number.isSafeInteger(periodStart) || !Number.isSafeInteger(periodEnd) ||
        periodStart < 0 || periodEnd <= periodStart)
        return null;
    return { issueDate: body.issue_date, periodStart, periodEnd };
}

function validHandoffRequest(body) {
    if (!isPlainObject(body) || Object.keys(body).length !== 3 ||
        !Object.hasOwn(body, "issue_date") ||
        !Object.hasOwn(body, "expected_stage") ||
        !Object.hasOwn(body, "expected_wake_id") ||
        typeof body.issue_date !== "string" || !ISSUE_DATE_RE.test(body.issue_date) ||
        !["selection", "writing"].includes(body.expected_stage) ||
        typeof body.expected_wake_id !== "string" || body.expected_wake_id.length === 0 ||
        body.expected_wake_id.trim() !== body.expected_wake_id)
        return null;
    return {
        issueDate: body.issue_date,
        expectedStage: body.expected_stage,
        expectedWakeId: body.expected_wake_id,
    };
}

function validPublishedRequest(body) {
    if (!isPlainObject(body) || Object.keys(body).length !== 3 ||
        !Object.hasOwn(body, "issue_date") ||
        !Object.hasOwn(body, "publication_id") ||
        !Object.hasOwn(body, "published_at") ||
        typeof body.issue_date !== "string" || !ISSUE_DATE_RE.test(body.issue_date) ||
        typeof body.publication_id !== "string" || body.publication_id.length === 0 ||
        body.publication_id.trim() !== body.publication_id ||
        typeof body.published_at !== "string")
        return null;
    const publishedAt = Date.parse(body.published_at);
    if (!Number.isSafeInteger(publishedAt) || publishedAt < 0 ||
        new Date(publishedAt).toISOString() !== body.published_at)
        return null;
    return {
        issueDate: body.issue_date,
        publicationId: body.publication_id,
        publishedAt,
    };
}

function publicStartWake(wake) {
    if (!wake || wake.stage !== "selection")
        throw new Error("reporter_relay_selection_wake_missing");
    return {
        wake_id: wake.wake_id,
        recipient_resident_id: wake.recipient_resident_id,
        issue_date: wake.issue_date,
        stage: wake.stage,
        materials: wake.materials,
        action: wake.action,
    };
}

function publicHandoffWake(wake) {
    if (wake?.stage === "selection")
        return publicStartWake(wake);
    if (wake?.stage !== "writing")
        throw new Error("reporter_relay_handoff_wake_missing");
    return {
        wake_id: wake.wake_id,
        recipient_resident_id: wake.recipient_resident_id,
        issue_date: wake.issue_date,
        stage: wake.stage,
        selection_text: wake.selection_text,
        action: wake.action,
    };
}

function relayError(res, error) {
    if (error instanceof CareerDomainError) {
        internalServiceError(res, 409, "state_conflict", "The reporter relay state rejected this request");
        return true;
    }
    return false;
}

export async function handleDoorbellReporterRelayStart(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const request = validRequest(body);
        if (!request)
            return internalServiceError(res, 400, "invalid_request", "The reporter relay start request is invalid");
        const result = startReporterRelayIssue(runtime.database, runtime.backend, {
            ...request,
            now: runtime.now?.() ?? Date.now(),
        });
        return jsonOut(res, 200, {
            ok: true,
            data: {
                issue_date: result.issueDate,
                status: result.status,
                wake: publicStartWake(result.wake),
            },
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (relayError(res, error))
            return;
        console.error("[doorbell-lingye-daily] reporter relay start failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter relay could not start");
    }
}

export async function handleDoorbellReporterRelayPending(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const request = validIssueDateRequest(body);
        if (!request)
            return internalServiceError(res, 400, "invalid_request", "The reporter relay pending request is invalid");
        const issue = reporterRelayIssue(runtime.database, request.issueDate);
        const wake = issue
            ? reporterRelayWake(runtime.database, issue.issueReference, runtime.now?.() ?? Date.now())
            : null;
        return jsonOut(res, 200, {
            ok: true,
            data: { issue_date: request.issueDate, wake },
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (relayError(res, error))
            return;
        console.error("[doorbell-lingye-daily] reporter relay pending read failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter relay pending wake could not be read");
    }
}

export async function handleDoorbellReporterRelayHandoff(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const request = validHandoffRequest(body);
        if (!request)
            return internalServiceError(res, 400, "invalid_request", "The reporter relay handoff request is invalid");
        const result = handoffReporterRelayDuty(runtime.database, runtime.backend, {
            ...request,
            now: runtime.now?.() ?? Date.now(),
        });
        return jsonOut(res, 200, {
            ok: true,
            data: {
                issue_date: result.issueDate,
                status: result.status,
                wake: publicHandoffWake(result.wake),
            },
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (relayError(res, error))
            return;
        console.error("[doorbell-lingye-daily] reporter relay handoff failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter relay duty could not be handed off");
    }
}

export async function handleDoorbellReporterRelayPublication(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const request = validIssueDateRequest(body);
        if (!request)
            return internalServiceError(res, 400, "invalid_request", "The reporter relay publication request is invalid");
        const result = publishReadyReporterRelay(runtime.database, runtime.backend, {
            issueDate: request.issueDate,
            now: runtime.now?.() ?? Date.now(),
        });
        return jsonOut(res, 200, {
            ok: true,
            data: {
                issue_date: result.issueDate,
                status: result.status,
                publication: result.publication,
            },
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (relayError(res, error))
            return;
        console.error("[doorbell-lingye-daily] reporter relay publication failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter relay publication could not be prepared");
    }
}

export async function handleDoorbellReporterRelayPublished(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const request = validPublishedRequest(body);
        if (!request)
            return internalServiceError(res, 400, "invalid_request", "The reporter relay published request is invalid");
        const result = acknowledgePublishedReporterRelay(runtime.database, runtime.backend, {
            ...request,
            now: runtime.now?.() ?? Date.now(),
        });
        return jsonOut(res, 200, {
            ok: true,
            data: {
                issue_date: result.issueDate,
                status: result.status,
                publication_id: result.publicationId,
                published_at: new Date(result.publishedAt).toISOString(),
            },
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (relayError(res, error))
            return;
        console.error("[doorbell-lingye-daily] reporter relay published acknowledgement failed");
        return internalServiceError(res, 503, "service_unavailable", "The reporter relay publication could not be acknowledged");
    }
}

function parseJson(value) {
    return JSON.parse(value);
}

function reporterName(residentId) {
    const farm = allFarms().find((candidate) =>
        candidate?.doorbellMcpMigration?.residentId === residentId);
    return String(farm?.aiName || farm?.name || "社区记者");
}

function publicSourceFacts(database, periodStart, periodEnd) {
    return database.prepare(`SELECT * FROM career_reporter_source_facts
      WHERE occurred_at >= ? AND occurred_at < ?
      ORDER BY occurred_at, source_id`).all(periodStart, periodEnd).map((row) => ({
        source_id: row.source_id,
        source_type: row.source_type,
        producer_reference: row.producer_reference,
        occurred_at: new Date(row.occurred_at).toISOString(),
        public_subject: row.public_subject,
        fact: parseJson(row.fact_json),
        allowed_numbers: parseJson(row.allowed_numbers_json),
        revision_reference: row.revision_reference,
        fact_digest: row.fact_digest,
        recorded_at: new Date(row.recorded_at).toISOString(),
    }));
}

function reporterPublications(database, issueDate, periodStart, periodEnd) {
    const issueReference = `lingye-daily:${issueDate}`;
    return database.prepare(`
      SELECT workflow.*, publication.publication_id, publication.published_at,
             article.article_text, article.version
      FROM career_reporter_story_workflows AS workflow
      JOIN career_reporter_publications AS publication
        ON publication.publication_id = workflow.publication_id
      JOIN career_reporter_articles AS article
        ON article.article_id = publication.article_id
      WHERE workflow.issue_reference = ? AND workflow.status = 'published'
        AND publication.published_at >= ? AND publication.published_at < ?
      ORDER BY publication.published_at, publication.publication_id
    `).all(issueReference, periodStart, periodEnd).map((row) => ({
        publication_id: row.publication_id,
        published_at: new Date(row.published_at).toISOString(),
        selector: reporterName(row.selector_resident_id),
        writer: reporterName(row.writer_resident_id),
        reviewer: reporterName(row.reviewer_resident_id),
        article_text: row.article_text,
        version: row.version,
    }));
}

export async function handleDoorbellLingyeDailyMaterial(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const request = validRequest(body);
        if (!request)
            return internalServiceError(res, 400, "invalid_request", "The Lingye Daily material request is invalid");
        return jsonOut(res, 200, {
            ok: true,
            data: {
                issue_date: request.issueDate,
                period_start: request.periodStart,
                period_end: request.periodEnd,
                source_facts: publicSourceFacts(runtime.database, request.periodStart, request.periodEnd),
                reporter_publications: reporterPublications(runtime.database, request.issueDate,
                    request.periodStart, request.periodEnd),
            },
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-lingye-daily] material read failed");
        return internalServiceError(res, 503, "service_unavailable", "Lingye Daily material could not be read");
    }
}

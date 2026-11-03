import { CareerDomainError } from "./contracts.js";
import { runInTransaction } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
import { reporterHasCompletedWork } from "./reporter-submission-work.js";

export const REPORTER_COLUMN_KEYS = Object.freeze([
    "column_nain",
    "column_gucheng",
    "column_etincelle",
]);

function fail(code) {
    throw new CareerDomainError(code, code);
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`reporter_column_invalid_${field}`);
    return value;
}

function issueDate(value) {
    const result = identifier(value, "issue_date");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(result))
        fail("reporter_column_invalid_issue_date");
    const [year, month, day] = result.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
        fail("reporter_column_invalid_issue_date");
    return result;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`reporter_column_invalid_${field}`);
    return value;
}

function columnKey(value) {
    const result = identifier(value, "column_key");
    if (!REPORTER_COLUMN_KEYS.includes(result))
        fail("reporter_column_invalid_column_key");
    return result;
}

function activeReporterAuthorization(database, residentId, now) {
    return Boolean(database.prepare(`
      SELECT 1
      FROM residents resident
      JOIN career_employments employment ON employment.resident_id = resident.resident_id
      WHERE resident.resident_id = ? AND employment.career = 'reporter'
        AND employment.status = 'active'
        AND EXISTS (
          SELECT 1 FROM career_certificates certificate
          WHERE certificate.resident_id = resident.resident_id
            AND certificate.career = 'reporter' AND certificate.status = 'active'
            AND (certificate.effective_at IS NULL OR certificate.effective_at <= ?)
        )
      LIMIT 1
    `).get(residentId, now));
}

export function listReporterColumnResidents(database, input = {}) {
    installCareerSchema(database);
    const now = timestamp(input.now ?? Date.now(), "timestamp");
    return database.prepare(`
      SELECT DISTINCT employment.resident_id
      FROM career_employments employment
      JOIN residents resident ON resident.resident_id = employment.resident_id
      WHERE employment.career = 'reporter' AND employment.status = 'active'
        AND EXISTS (
          SELECT 1 FROM career_certificates certificate
          WHERE certificate.resident_id = employment.resident_id
            AND certificate.career = 'reporter' AND certificate.status = 'active'
            AND (certificate.effective_at IS NULL OR certificate.effective_at <= ?)
        )
      ORDER BY employment.resident_id COLLATE BINARY
    `).all(now).map(row => ({ residentId: row.resident_id }));
}

export function getReporterColumnWork(database, issue, key) {
    installCareerSchema(database);
    return database.prepare(`
      SELECT * FROM career_reporter_column_work
      WHERE issue_date = ? AND column_key = ?
    `).get(issueDate(issue), columnKey(key)) ?? null;
}

export function reporterColumnJobsForPublication(database, publicationId) {
    installCareerSchema(database);
    const id = identifier(publicationId, "publication_id");
    return database.prepare(`
      SELECT column_work.job_id, column_work.column_key, column_work.resident_id
      FROM career_reporter_column_work column_work
      JOIN career_work_records record ON record.job_id = column_work.job_id
        AND record.resident_id = column_work.resident_id AND record.record_kind = 'completed'
      WHERE column_work.publication_id = ? AND column_work.published_at IS NOT NULL
      ORDER BY column_work.column_key COLLATE BINARY
    `).all(id).map(row => ({
        jobId: row.job_id,
        columnKey: row.column_key,
        residentId: row.resident_id,
    }));
}

export function recordReporterColumnSubmission(database, backend, input) {
    installCareerSchema(database);
    const issue = issueDate(input?.issueDate);
    const key = columnKey(input?.columnKey);
    const residentId = identifier(input?.residentId, "resident_id");
    const submissionId = identifier(input?.submissionId, "submission_id");
    const submittedAt = timestamp(input?.submittedAt, "submitted_at");
    const now = timestamp(input?.now ?? Date.now(), "timestamp");

    return runInTransaction(database, () => {
        const existing = database.prepare(`
          SELECT * FROM career_reporter_column_work
          WHERE issue_date = ? AND column_key = ?
        `).get(issue, key);
        if (existing) {
            if (existing.resident_id !== residentId || existing.submission_id !== submissionId ||
                existing.submitted_at !== submittedAt)
                fail("reporter_column_submission_conflict");
            return { issueDate: issue, columnKey: key, residentId,
                submissionId, submittedAt, jobId: existing.job_id };
        }
        if (database.prepare(`SELECT 1 FROM career_reporter_column_work WHERE submission_id = ?`)
            .get(submissionId))
            fail("reporter_column_submission_conflict");
        if (!activeReporterAuthorization(database, residentId, now))
            fail("reporter_column_authorization_required");

        const jobId = `reporter-column-job:${issue}:${key}`;
        const sourceId = `lingye-daily:${issue}:${key}`;
        backend.trustedSystemCommands.createJob({
            jobId,
            career: "reporter",
            sourceType: "reporter_daily_column",
            sourceId,
            objectType: "reporter_column",
            objectId: sourceId,
            ownerResidentId: null,
            requiredLevel: 1,
            difficultyLevel: 1,
            assignmentMode: "accepted",
        });
        backend.trustedSystemCommands.acceptJob(jobId, residentId);
        backend.trustedSystemCommands.recordDecision({
            jobId,
            workerResidentId: residentId,
            idempotencyKey: `reporter-column:${issue}:${key}:submitted`,
            kind: "check",
            optionReference: `reporter-column:${issue}:${key}`,
            resultReference: `reporter-column-submission:${submissionId}`,
            consumesResources: false,
            changesWorld: false,
        });
        database.prepare(`
          INSERT INTO career_reporter_column_work (
            issue_date, column_key, resident_id, job_id, submission_id, submitted_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(issue, key, residentId, jobId, submissionId, submittedAt);
        return { issueDate: issue, columnKey: key, residentId,
            submissionId, submittedAt, jobId };
    });
}

export function publishReporterColumnWork(database, backend, input) {
    installCareerSchema(database);
    const issue = issueDate(input?.issueDate);
    const key = columnKey(input?.columnKey);
    const residentId = identifier(input?.residentId, "resident_id");
    const submissionId = identifier(input?.submissionId, "submission_id");
    const submittedAt = timestamp(input?.submittedAt, "submitted_at");
    const publicationId = identifier(input?.publicationId, "publication_id");
    const publishedAt = timestamp(input?.publishedAt, "published_at");

    return runInTransaction(database, () => {
        const work = database.prepare(`
          SELECT * FROM career_reporter_column_work
          WHERE issue_date = ? AND column_key = ?
        `).get(issue, key);
        if (!work || work.resident_id !== residentId || work.submission_id !== submissionId)
            fail("reporter_column_submission_missing");
        if (work.submitted_at !== submittedAt)
            fail("reporter_column_submission_conflict");
        if (work.submitted_at > publishedAt)
            fail("reporter_column_publication_mismatch");
        if (work.publication_id !== null) {
            if (work.publication_id !== publicationId || work.published_at !== publishedAt ||
                !reporterHasCompletedWork(database, work.job_id))
                fail("reporter_column_publication_conflict");
            return { issueDate: issue, columnKey: key, residentId,
                submissionId, publicationId, publishedAt, jobId: work.job_id };
        }

        const publication = database.prepare(`
          SELECT publication.publication_id, publication.published_at
          FROM career_reporter_relay_issues issue
          JOIN career_reporter_publications publication
            ON publication.article_id = issue.article_id
          WHERE issue.issue_date = ? AND issue.status = 'published'
            AND publication.publication_id = ?
          UNION ALL
          SELECT publication_id, published_at
          FROM career_reporter_manual_publications
          WHERE issue_date = ? AND publication_id = ?
        `).get(issue, publicationId, issue, publicationId);
        if (!publication || publication.published_at !== publishedAt)
            fail("reporter_column_publication_mismatch");

        backend.trustedSystemCommands.completeJob({
            jobId: work.job_id,
            workerResidentId: residentId,
            validationPassed: true,
            worldResultReference: `reporter-column-publication:${publicationId}:${submissionId}`,
        });
        database.prepare(`
          UPDATE career_reporter_column_work
          SET publication_id = ?, published_at = ?
          WHERE issue_date = ? AND column_key = ? AND publication_id IS NULL
        `).run(publicationId, publishedAt, issue, key);
        if (!reporterHasCompletedWork(database, work.job_id))
            fail("reporter_column_work_record_missing");
        const settledEvaluation = database.prepare(`
          SELECT settlement.job_id
          FROM career_reporter_evaluation_settlements settlement
          JOIN career_reporter_evaluation_quotes quote ON quote.job_id = settlement.job_id
          WHERE quote.publication_id = ?
        `).get(publicationId);
        if (settledEvaluation) {
            backend.trustedSystemCommands.settleReporterEvaluation({ jobId: settledEvaluation.job_id });
        }
        return { issueDate: issue, columnKey: key, residentId,
            submissionId, publicationId, publishedAt, jobId: work.job_id };
    });
}

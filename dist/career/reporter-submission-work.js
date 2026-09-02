import { CareerDomainError } from "./contracts.js";
import { beijingDate, beijingTimestamp, runInTransaction } from "./persistence.js";

const SOURCE_TYPE = "reporter_daily_submission_reviewing";

function fail(code, message) {
    throw new CareerDomainError(code, message);
}

// Used by the existing three-role settlement. Unperformed submission work
// cannot receive performance and must not block the two completed roles.
export function reporterHasCompletedWork(database, jobId) {
    return Boolean(database.prepare(`SELECT 1 FROM career_jobs job
      JOIN career_work_records record ON record.job_id = job.job_id
        AND record.resident_id = job.worker_resident_id AND record.record_kind = 'completed'
      WHERE job.job_id = ? AND job.career = 'reporter' AND job.status = 'completed'`).get(jobId));
}

// Main only acknowledges publication after a nonempty batch has been recorded.
// An untouched anonymous placeholder left at that point represents no work.
export function cancelUnperformedReporterSubmissionWork(database, backend, jobId) {
    const job = database.prepare("SELECT source_type, status, decision_count FROM career_jobs WHERE job_id = ?").get(jobId);
    if (!job || job.source_type !== SOURCE_TYPE || ["completed", "cancelled"].includes(job.status))
        return false;
    if (job.decision_count !== 0)
        fail("reporter_submission_review_incomplete", "A started submission review cannot be treated as an empty batch");
    backend.trustedSystemCommands.cancelJob(jobId);
    return true;
}

export function completeReporterSubmissionWork(database, backend, input) {
    const { issue_date: issueDate, resident_id: residentId, decided_at: decidedAt,
        candidate_count: candidateCount, selected_count: selectedCount } = input;
    const cutoff = beijingTimestamp(issueDate, 5);
    if (typeof issueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(issueDate) ||
        !Number.isSafeInteger(cutoff) || beijingDate(cutoff) !== issueDate ||
        typeof residentId !== "string" || !residentId.length || residentId.trim() !== residentId ||
        !Number.isSafeInteger(decidedAt) || decidedAt < cutoff ||
        !Number.isSafeInteger(candidateCount) || candidateCount <= 0 ||
        !Number.isSafeInteger(selectedCount) || selectedCount < 0 ||
        selectedCount > 3 || selectedCount > candidateCount) {
        fail("reporter_submission_review_invalid", "A completed submission review needs a real nonempty batch and valid decision metadata");
    }
    return runInTransaction(database, () => {
        const issue = database.prepare(`SELECT issue_reference, reviewer_job_id, reviewer_resident_id
          FROM career_reporter_relay_issues WHERE issue_date = ?`).get(issueDate);
        if (!issue?.reviewer_job_id)
            fail("reporter_submission_job_missing", "The issue has no assigned submission review job");
        const job = database.prepare("SELECT * FROM career_jobs WHERE job_id = ?").get(issue.reviewer_job_id);
        if (!job || job.career !== "reporter" || job.worker_resident_id !== residentId ||
            issue.reviewer_resident_id !== residentId)
            fail("reporter_submission_reviewer_mismatch", "The completed batch reviewer does not match the assigned reporter job");
        const resultReference = `reporter-submission-review:${issueDate}:${residentId}:${decidedAt}:${candidateCount}:${selectedCount}`;
        const response = { issue_date: issueDate, resident_id: residentId, decided_at: decidedAt,
            candidate_count: candidateCount, selected_count: selectedCount, job_id: job.job_id };
        if (job.status === "completed") {
            if (job.source_type !== SOURCE_TYPE || job.world_result_reference !== resultReference ||
                !reporterHasCompletedWork(database, job.job_id))
                fail("reporter_submission_review_conflict", "The submission review was already recorded with different facts");
            return response;
        }
        if (!["accepted", "assigned", "active"].includes(job.status))
            fail("reporter_submission_job_not_actionable", "The assigned submission review job is no longer actionable");
        if (job.source_type === "reporter_daily_reviewing") {
            if (job.decision_count !== 0)
                fail("reporter_submission_legacy_review_conflict", "An article review decision cannot be relabelled as submission work");
            database.prepare(`UPDATE career_jobs SET source_type = ?, source_id = ?,
              object_type = 'reporter_submission_batch', object_id = ? WHERE job_id = ?`)
                .run(SOURCE_TYPE, `${issue.issue_reference}:submission-reviewing`, issue.issue_reference, job.job_id);
        }
        else if (job.source_type !== SOURCE_TYPE ||
            job.source_id !== `${issue.issue_reference}:submission-reviewing` ||
            job.object_type !== "reporter_submission_batch" || job.object_id !== issue.issue_reference) {
            fail("reporter_submission_job_source_mismatch", "The job is not the issue's submission review work");
        }
        backend.trustedSystemCommands.recordDecision({
            jobId: job.job_id, workerResidentId: residentId,
            idempotencyKey: `reporter-submission-review:${issueDate}`,
            kind: "check", optionReference: `submission-batch:${issueDate}`,
            resultReference, consumesResources: false, changesWorld: false,
        });
        backend.trustedSystemCommands.completeJob({
            jobId: job.job_id, workerResidentId: residentId, validationPassed: true,
            worldResultReference: resultReference,
        });
        return response;
    });
}

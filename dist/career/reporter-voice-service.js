import { CareerDomainError } from "./contracts.js";
import { beijingDate, runInTransaction } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
import { reporterHasCompletedWork } from "./reporter-submission-work.js";

function fail(code) {
    throw new CareerDomainError(code, code);
}

export function reporterVoiceAuthor(database, issueDate) {
    installCareerSchema(database);
    return database.prepare(`SELECT role.resident_id FROM career_reporter_duty_roles role
      JOIN career_duty_days duty ON duty.duty_id = role.duty_id
      JOIN career_employments employment ON employment.employment_id = duty.employment_id
      WHERE role.duty_date = ? AND role.role = 'voice' AND duty.status = 'scheduled'
        AND employment.status = 'active' AND employment.availability = 'available'`)
        .get(issueDate)?.resident_id ?? null;
}

export function recordReporterVoiceSubmission(database, backend, input) {
    installCareerSchema(database);
    const { issueDate, residentId, submissionId, submittedAt } = input;
    if (!Number.isSafeInteger(submittedAt) || beijingDate(submittedAt) !== issueDate ||
        typeof submissionId !== "string" || !submissionId || submissionId.trim() !== submissionId)
        fail("reporter_voice_submission_invalid");
    return runInTransaction(database, () => {
        const existing = database.prepare("SELECT * FROM career_reporter_voice_work WHERE issue_date = ?").get(issueDate);
        if (existing) {
            if (existing.resident_id !== residentId || existing.submission_id !== submissionId ||
                existing.submitted_at !== submittedAt)
                fail("reporter_voice_submission_conflict");
            return { ...input, jobId: existing.job_id };
        }
        if (reporterVoiceAuthor(database, issueDate) !== residentId)
            fail("reporter_voice_author_mismatch");
        const jobId = `reporter-relay-job:${issueDate}:voice`;
        backend.trustedSystemCommands.createJob({
            jobId, career: "reporter", sourceType: "reporter_daily_voice",
            sourceId: `lingye-daily:${issueDate}:voice`, objectType: "reporter_voice",
            objectId: `lingye-daily:${issueDate}:voice`, ownerResidentId: null,
            requiredLevel: 1, difficultyLevel: 1, assignmentMode: "accepted",
        });
        backend.trustedSystemCommands.acceptJob(jobId, residentId);
        backend.trustedSystemCommands.recordDecision({
            jobId, workerResidentId: residentId,
            idempotencyKey: `reporter-voice:${issueDate}:submitted`, kind: "check",
            optionReference: `voice-submission:${submissionId}`,
            resultReference: `voice-submission:${submissionId}`,
            consumesResources: false, changesWorld: false,
        });
        database.prepare(`INSERT INTO career_reporter_voice_work
          (issue_date, resident_id, job_id, submission_id, submitted_at) VALUES (?, ?, ?, ?, ?)`)
            .run(issueDate, residentId, jobId, submissionId, submittedAt);
        return { ...input, jobId };
    });
}

export function publishReporterVoiceWork(database, backend, input) {
    installCareerSchema(database);
    const { issueDate, residentId, submissionId, publicationId, publishedAt } = input;
    return runInTransaction(database, () => {
        const work = database.prepare("SELECT * FROM career_reporter_voice_work WHERE issue_date = ?").get(issueDate);
        if (!work || work.resident_id !== residentId || work.submission_id !== submissionId)
            fail("reporter_voice_submission_missing");
        const publication = database.prepare(`SELECT publication.publication_id, publication.published_at
          FROM career_reporter_relay_issues issue JOIN career_reporter_publications publication
            ON publication.article_id = issue.article_id WHERE issue.issue_date = ?
            AND issue.status = 'published' AND publication.publication_id = ?`)
            .get(issueDate, publicationId);
        if (!publication || publication.published_at !== publishedAt || publishedAt < work.submitted_at)
            fail("reporter_voice_publication_mismatch");
        if (work.publication_id !== null) {
            if (work.publication_id !== publicationId || work.published_at !== publishedAt ||
                !reporterHasCompletedWork(database, work.job_id))
                fail("reporter_voice_publication_conflict");
            return { ...input, jobId: work.job_id };
        }
        backend.trustedSystemCommands.completeJob({
            jobId: work.job_id, workerResidentId: residentId, validationPassed: true,
            worldResultReference: `reporter-voice-publication:${publicationId}:${submissionId}`,
        });
        database.prepare(`UPDATE career_reporter_voice_work SET publication_id = ?, published_at = ?
          WHERE issue_date = ?`).run(publicationId, publishedAt, issueDate);
        return { ...input, jobId: work.job_id };
    });
}

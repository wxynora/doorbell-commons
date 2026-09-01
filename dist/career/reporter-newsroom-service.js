import { randomInt as cryptoRandomInt } from "node:crypto";
import { CareerDomainError } from "./contracts.js";
import { beijingDate, runInTransaction } from "./persistence.js";
import { installCareerSchema } from "./schema.js";

export const REPORTER_DUTY_ROLES = Object.freeze(["selector", "writer", "reviewer"]);

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`reporter_invalid_${field}`);
    return value;
}

function timestamp(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail("reporter_invalid_timestamp");
    return value;
}

function mapRole(row) {
    return {
        dutyDate: row.duty_date,
        dutyId: row.duty_id,
        residentId: row.resident_id,
        role: row.role,
        assignedAt: row.assigned_at,
    };
}

function mapWorkflow(row) {
    return {
        workflowId: row.workflow_id,
        issueReference: row.issue_reference,
        selectorJobId: row.selector_job_id,
        writerJobId: row.writer_job_id,
        reviewerJobId: row.reviewer_job_id,
        selectorResidentId: row.selector_resident_id,
        writerResidentId: row.writer_resident_id,
        reviewerResidentId: row.reviewer_resident_id,
        articleId: row.article_id,
        publicationId: row.publication_id,
        status: row.status,
        selectedAt: row.selected_at,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        publishedAt: row.published_at,
    };
}

function reporterDutyRows(database, dutyDate) {
    return database.prepare(`
      SELECT duty.duty_id, duty.employment_id, duty.resident_id, duty.duty_date
      FROM career_duty_days AS duty
      JOIN career_employments AS employment
        ON employment.employment_id = duty.employment_id
      WHERE duty.career = 'reporter' AND duty.institution = 'lingye_daily'
        AND duty.duty_date = ? AND duty.status = 'scheduled'
        AND employment.status = 'active' AND employment.availability = 'available'
      ORDER BY duty.resident_id COLLATE BINARY, duty.duty_id COLLATE BINARY
    `).all(dutyDate);
}

export function ensureReporterDutyRoles(database, now = Date.now(), options = {}) {
    installCareerSchema(database);
    const assignedAt = timestamp(now);
    const dutyDate = beijingDate(assignedAt);
    return runInTransaction(database, () => {
        const existing = database.prepare(`
          SELECT * FROM career_reporter_duty_roles
          WHERE duty_date = ? ORDER BY role
        `).all(dutyDate);
        if (existing.length > 0) {
            if (existing.length !== REPORTER_DUTY_ROLES.length)
                fail("reporter_duty_roster_conflict");
            const scheduled = new Set(reporterDutyRows(database, dutyDate).map((row) => row.duty_id));
            if (existing.some((row) => !scheduled.has(row.duty_id)))
                return [];
            return existing.map(mapRole);
        }
        const duties = reporterDutyRows(database, dutyDate);
        if (duties.length !== REPORTER_DUTY_ROLES.length)
            return [];
        const drawInt = options.drawInt ?? cryptoRandomInt;
        const randomizedDuties = [...duties];
        for (let index = randomizedDuties.length - 1; index > 0; index -= 1) {
            const selected = drawInt(index + 1);
            if (!Number.isSafeInteger(selected) || selected < 0 || selected > index)
                fail("reporter_duty_random_source_invalid");
            [randomizedDuties[index], randomizedDuties[selected]] =
                [randomizedDuties[selected], randomizedDuties[index]];
        }
        const insert = database.prepare(`
          INSERT INTO career_reporter_duty_roles (
            duty_date, role, duty_id, resident_id, assigned_at
          ) VALUES (?, ?, ?, ?, ?)
        `);
        randomizedDuties.forEach((duty, index) =>
            insert.run(dutyDate, REPORTER_DUTY_ROLES[index], duty.duty_id,
                duty.resident_id, assignedAt));
        return database.prepare(`
          SELECT * FROM career_reporter_duty_roles
          WHERE duty_date = ? ORDER BY role
        `).all(dutyDate).map(mapRole);
    });
}

export function reporterDutyRole(database, residentId, now = Date.now()) {
    const roster = ensureReporterDutyRoles(database, now);
    return roster.find((entry) => entry.residentId === residentId) ?? null;
}

export function createReporterStoryWorkflow(database, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now());
    const workflow = {
        workflowId: identifier(input?.workflowId, "workflow_id"),
        issueReference: identifier(input?.issueReference, "issue_reference"),
        selectorJobId: identifier(input?.selectorJobId, "selector_job_id"),
        writerJobId: identifier(input?.writerJobId, "writer_job_id"),
        reviewerJobId: identifier(input?.reviewerJobId, "reviewer_job_id"),
        selectorResidentId: identifier(input?.selectorResidentId, "selector_resident_id"),
        writerResidentId: identifier(input?.writerResidentId, "writer_resident_id"),
        reviewerResidentId: identifier(input?.reviewerResidentId, "reviewer_resident_id"),
    };
    if (new Set([
        workflow.selectorResidentId,
        workflow.writerResidentId,
        workflow.reviewerResidentId,
    ]).size !== 3) {
        fail("reporter_workflow_distinct_roles_required");
    }
    return runInTransaction(database, () => {
        const existing = database.prepare(`
          SELECT * FROM career_reporter_story_workflows
          WHERE workflow_id = ? OR selector_job_id = ? OR writer_job_id = ? OR reviewer_job_id = ?
          ORDER BY workflow_id
        `).all(workflow.workflowId, workflow.selectorJobId, workflow.writerJobId, workflow.reviewerJobId);
        if (existing.length > 0) {
            const row = existing[0];
            if (existing.some((entry) => entry.workflow_id !== row.workflow_id) ||
                row.workflow_id !== workflow.workflowId ||
                row.issue_reference !== workflow.issueReference ||
                row.selector_job_id !== workflow.selectorJobId ||
                row.writer_job_id !== workflow.writerJobId ||
                row.reviewer_job_id !== workflow.reviewerJobId ||
                row.selector_resident_id !== workflow.selectorResidentId ||
                row.writer_resident_id !== workflow.writerResidentId ||
                row.reviewer_resident_id !== workflow.reviewerResidentId) {
                fail("reporter_workflow_conflict");
            }
            return mapWorkflow(row);
        }
        database.prepare(`
          INSERT INTO career_reporter_story_workflows (
            workflow_id, issue_reference, selector_job_id, writer_job_id, reviewer_job_id,
            selector_resident_id, writer_resident_id, reviewer_resident_id,
            status, selected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'selected', ?)
        `).run(workflow.workflowId, workflow.issueReference, workflow.selectorJobId,
            workflow.writerJobId, workflow.reviewerJobId, workflow.selectorResidentId,
            workflow.writerResidentId, workflow.reviewerResidentId, now);
        return mapWorkflow(database.prepare(`
          SELECT * FROM career_reporter_story_workflows WHERE workflow_id = ?
        `).get(workflow.workflowId));
    });
}

export function reporterWorkflowForJob(database, jobId) {
    installCareerSchema(database);
    const normalized = identifier(jobId, "job_id");
    const row = database.prepare(`
      SELECT * FROM career_reporter_story_workflows
      WHERE selector_job_id = ? OR writer_job_id = ? OR reviewer_job_id = ?
    `).get(normalized, normalized, normalized);
    return row ? mapWorkflow(row) : null;
}

export function reporterWorkflowForArticle(database, articleId) {
    installCareerSchema(database);
    const row = database.prepare(`
      SELECT * FROM career_reporter_story_workflows WHERE article_id = ?
    `).get(identifier(articleId, "article_id"));
    return row ? mapWorkflow(row) : null;
}

export function markReporterWorkflowSubmitted(database, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now());
    const workflowId = identifier(input?.workflowId, "workflow_id");
    const articleId = identifier(input?.articleId, "article_id");
    return runInTransaction(database, () => {
        const row = database.prepare(`
          SELECT * FROM career_reporter_story_workflows WHERE workflow_id = ?
        `).get(workflowId);
        if (!row)
            fail("reporter_workflow_not_found");
        if (row.status === "pending_review" && row.article_id === articleId)
            return mapWorkflow(row);
        if (!["selected", "needs_supplement"].includes(row.status))
            fail("reporter_workflow_not_submittable");
        database.prepare(`
          UPDATE career_reporter_story_workflows
          SET article_id = ?, status = 'pending_review', submitted_at = ?
          WHERE workflow_id = ?
        `).run(articleId, now, workflowId);
        return mapWorkflow(database.prepare(`
          SELECT * FROM career_reporter_story_workflows WHERE workflow_id = ?
        `).get(workflowId));
    });
}

export function markReporterWorkflowReviewed(database, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now());
    const workflowId = identifier(input?.workflowId, "workflow_id");
    const decision = input?.decision;
    const status = decision === "approve"
        ? "pending_review"
        : decision === "needs_supplement"
            ? "needs_supplement"
            : decision === "reject"
                ? "rejected"
                : null;
    if (!status)
        fail("reporter_invalid_review_decision");
    return runInTransaction(database, () => {
        const row = database.prepare(`
          SELECT * FROM career_reporter_story_workflows WHERE workflow_id = ?
        `).get(workflowId);
        if (!row)
            fail("reporter_workflow_not_found");
        if (row.status !== "pending_review")
            fail("reporter_workflow_not_reviewable");
        database.prepare(`
          UPDATE career_reporter_story_workflows
          SET status = ?, reviewed_at = ? WHERE workflow_id = ?
        `).run(status, now, workflowId);
        return mapWorkflow(database.prepare(`
          SELECT * FROM career_reporter_story_workflows WHERE workflow_id = ?
        `).get(workflowId));
    });
}

export function markReporterWorkflowPublished(database, input) {
    installCareerSchema(database);
    const now = timestamp(input?.now ?? Date.now());
    const workflowId = identifier(input?.workflowId, "workflow_id");
    const publicationId = identifier(input?.publicationId, "publication_id");
    return runInTransaction(database, () => {
        const row = database.prepare(`
          SELECT * FROM career_reporter_story_workflows WHERE workflow_id = ?
        `).get(workflowId);
        if (!row)
            fail("reporter_workflow_not_found");
        if (row.status === "published" && row.publication_id === publicationId)
            return mapWorkflow(row);
        if (row.status !== "pending_review")
            fail("reporter_workflow_not_publishable");
        database.prepare(`
          UPDATE career_reporter_story_workflows
          SET publication_id = ?, status = 'published', published_at = ?
          WHERE workflow_id = ?
        `).run(publicationId, now, workflowId);
        return mapWorkflow(database.prepare(`
          SELECT * FROM career_reporter_story_workflows WHERE workflow_id = ?
        `).get(workflowId));
    });
}

export function reporterPublicationCredits(database, publicationId) {
    installCareerSchema(database);
    const row = database.prepare(`
      SELECT * FROM career_reporter_story_workflows WHERE publication_id = ?
    `).get(identifier(publicationId, "publication_id"));
    return row ? mapWorkflow(row) : null;
}

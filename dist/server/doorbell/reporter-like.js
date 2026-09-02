import { CareerDomainError } from "../../career/contracts.js";

// Resolve the published edition, then use the existing resident vote ledger.
// This reader action does not require employment, qualification or a job option.
export function recordPublishedDailyLike(database, backend, residentId, issueDate, now) {
    const publication = database.prepare(`SELECT publication.publication_id
      FROM career_reporter_relay_issues issue
      JOIN career_reporter_publications publication ON publication.article_id = issue.article_id
      WHERE issue.issue_date = ? AND issue.status = 'published'
        AND issue.published_at <= ? AND publication.published_at <= ?
    `).get(issueDate, now, now);
    if (!publication) {
        throw new CareerDomainError("reporter_publication_not_found");
    }
    return backend.forResident(residentId).recordReporterLike({
        publicationId: publication.publication_id,
        now,
    });
}

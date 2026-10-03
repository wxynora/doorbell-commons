import { CareerDomainError } from "../../career/contracts.js";

// Resolve the published edition, then use the existing resident vote ledger.
// This reader action does not require employment, qualification or a job option.
export function recordPublishedDailyLike(database, backend, residentId, issueDate, now) {
    const publication = database.prepare(`SELECT publication.publication_id, publication.article_version AS version
      FROM career_reporter_relay_issues issue
      JOIN career_reporter_publications publication ON publication.article_id = issue.article_id
      WHERE issue.issue_date = ? AND issue.status = 'published'
        AND issue.published_at <= ? AND publication.published_at <= ?
      UNION ALL SELECT publication_id,version FROM career_reporter_manual_publications
      WHERE issue_date=? AND published_at<=?
      ORDER BY version DESC LIMIT 1
    `).get(issueDate, now, now, issueDate, now);
    if (!publication) {
        throw new CareerDomainError("reporter_publication_not_found");
    }
    return backend.forResident(residentId).recordReporterLike({
        publicationId: publication.publication_id,
        now,
    });
}

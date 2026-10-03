import { manualPublication, manualEvaluationClosesAt } from "./reporter-manual-publication.js";
// Relay newspapers close when the next edition is actually published, not on a timer.
// Generic legacy reporter jobs retain their stored evaluation deadline.
export function reporterEvaluationClosesAt(database, publication) {
    const issue = database.prepare(`SELECT issue_date FROM career_reporter_relay_issues
      WHERE article_id = ?`).get(publication.article_id);
    const manual=publication.publication_id ? manualPublication(database,publication.publication_id) : null;
    if(manual) return manualEvaluationClosesAt(database,manual.issue_date);
    if (!issue) return publication.evaluation_closes_at;
    // A publication row is created only by the confirmed publication ACK. Read
    // it directly so the existing publication callback can arm the settlement
    // timer inside that same transaction, before the relay status is updated.
    const next = database.prepare(`SELECT MIN(publication.published_at) AS closes_at
      FROM career_reporter_relay_issues following
      JOIN career_reporter_publications publication ON publication.article_id = following.article_id
      WHERE following.issue_date > ?`).get(issue.issue_date);
    const manualNext=manualEvaluationClosesAt(database,issue.issue_date);
    return manualNext === null ? next.closes_at : next.closes_at === null ? manualNext : Math.min(next.closes_at,manualNext);
}

export function nextReporterEvaluationDueAt(database) {
    const pending = database.prepare(`SELECT publication.* FROM career_reporter_publications publication
      WHERE NOT EXISTS (SELECT 1 FROM career_reporter_evaluation_settlements settlement
        WHERE settlement.job_id = publication.job_id)`).all();
    const deadlines = pending.map(publication => reporterEvaluationClosesAt(database, publication))
        .filter(deadline => deadline !== null);
    return deadlines.length ? Math.min(...deadlines) : null;
}

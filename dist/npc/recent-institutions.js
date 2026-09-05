/** Read only the current resident's persisted institutional facts. The caller
 * owns the agreed recent window; no business action or clock advancement occurs. */
export function readRecentInstitutionFacts(database, residentId, npcId, now, since) {
    const facts = [];
    const hasTable = (name) => !!database.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    if (npcId === "npc_liyuan") {
        if (hasTable("economy_ledger_entries") && hasTable("economy_journals")) {
            const deposit = database.prepare(`SELECT 1 FROM economy_ledger_entries entry
              JOIN economy_journals journal ON journal.journal_id = entry.journal_id
              WHERE entry.resident_id = ? AND entry.currency = 'gold' AND entry.delta > 0
                AND entry.created_at >= ? AND entry.created_at <= ?
                AND ((journal.command_type = 'bank.demand.deposit' AND entry.partition_name = 'demand_deposit')
                  OR (journal.command_type = 'bank.term.open' AND entry.partition_name = 'term_deposit'))
              LIMIT 1`).get(residentId, since, now);
            if (deposit) facts.push("recent_deposit");
        }
        for (const table of ["economy_system_loans", "economy_player_loans"]) {
            if (!hasTable(table)) continue;
            const repaid = database.prepare(`SELECT 1 FROM ${table}
              WHERE borrower_resident_id = ? AND status = 'repaid'
                AND principal_outstanding = 0 AND accrued_interest = 0
                AND repaid_at >= ? AND repaid_at <= ? LIMIT 1`).get(residentId, since, now);
            if (repaid) {
                facts.push("recent_loan_repaid");
                break;
            }
        }
    }
    if (npcId === "npc_songmo") {
        if (hasTable("career_courses")) {
            const unfinished = database.prepare(`SELECT 1 FROM career_courses
              WHERE resident_id = ? AND completed_at IS NULL
                AND enrolled_at >= ? AND enrolled_at <= ? LIMIT 1`).get(residentId, since, now);
            if (unfinished) facts.push("recent_unfinished_course");
        }
        if (hasTable("career_certificates") && hasTable("career_exam_attempts")) {
            const dayStart = Math.floor((now + 8 * 3_600_000) / 86_400_000) * 86_400_000 - 8 * 3_600_000;
            const tomorrow = dayStart + 86_400_000;
            const pending = database.prepare(`SELECT 1 FROM career_certificates certificate
              JOIN career_exam_attempts attempt ON attempt.attempt_id = certificate.source_attempt_id
                AND attempt.resident_id = certificate.resident_id AND attempt.career = certificate.career
                AND attempt.qualification_level = certificate.qualification_level
              WHERE certificate.resident_id = ? AND certificate.status = 'active'
                AND certificate.effective_at = ? AND attempt.registration_status = 'passed'
                AND attempt.ended_at >= ? AND attempt.ended_at <= ? LIMIT 1`)
                .get(residentId, tomorrow, dayStart, now);
            if (pending) facts.push("exam_passed_pending_tomorrow");
        }
    }
    if (npcId === "npc_modian" && hasTable("career_reporter_articles")) {
        if (hasTable("career_reporter_publications")) {
            const publication = database.prepare(`SELECT 1 FROM career_reporter_publications publication
              JOIN career_reporter_articles article ON article.article_id = publication.article_id
                AND article.resident_id = publication.resident_id AND article.job_id = publication.job_id
                AND article.version = publication.article_version AND article.status = 'published'
              WHERE publication.resident_id = ? AND publication.published_at >= ?
                AND publication.published_at <= ? LIMIT 1`).get(residentId, since, now);
            if (publication) facts.push("recent_article_published");
        }
        const returned = database.prepare(`SELECT 1 FROM career_reporter_articles article
          WHERE article.resident_id = ? AND article.status IN ('needs_supplement', 'rejected')
            AND article.reviewed_at >= ? AND article.reviewed_at <= ?
            AND NOT EXISTS (SELECT 1 FROM career_reporter_articles newer
              WHERE newer.job_id = article.job_id AND newer.version > article.version)
          LIMIT 1`).get(residentId, since, now);
        if (returned) facts.push("recent_article_returned");
    }
    return facts;
}

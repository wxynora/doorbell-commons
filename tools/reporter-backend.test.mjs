import assert from "node:assert/strict";
import test from "node:test";
import {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";

const START = Date.parse("2026-09-01T08:00:00+08:00");
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

function assertCode(code) {
    return (error) => error?.code === code;
}

function register(database, residentId) {
    registerLingyeResidentReference(database, {
        residentId,
        bindingReference: `reporter-backend:${residentId}`,
        registeredAt: START,
    });
    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'reporter', 1, ?)
    `).run(residentId, START);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'reporter', 1, 'active', ?, ?, ?)
    `).run(residentId, `reporter-backend-certificate:${residentId}`, START, START);
}

function seedActiveJob(database, jobId, workerResidentId, now) {
    const sourceId = `reporter-backend-job-source:${jobId}`;
    database.prepare(`
      INSERT INTO career_jobs (
        job_id, parent_job_id, career, source_type, source_id,
        object_type, object_id, owner_resident_id, required_level,
        difficulty_level, assignment_mode, status, worker_resident_id,
        created_at, updated_at, started_at, ended_at, decision_count,
        has_irreversible_action, world_result_reference, payment_reference
      ) VALUES (?, NULL, 'reporter', ?, ?, 'article', ?, NULL, 1, 1,
        'accepted', 'active', ?, ?, ?, ?, NULL, 1, 0, NULL, NULL)
    `).run(jobId, "reporter_material_pack", sourceId, `article:${jobId}`, workerResidentId,
        now, now, now);
}

function completeJob(database, jobId, residentId, now) {
    database.prepare(`
      UPDATE career_jobs
      SET status = 'completed', ended_at = ?, updated_at = ?,
          world_result_reference = ?
      WHERE job_id = ?
    `).run(now, now, `reporter-backend-published:${jobId}`, jobId);
    database.prepare(`
      INSERT INTO career_work_records (
        work_record_id, job_id, resident_id, career, qualification_level,
        difficulty_level, record_kind, performance_units, recorded_at
      ) VALUES (?, ?, ?, 'reporter', 1, 1, 'completed', 0, ?)
    `).run(`reporter-backend-work:${jobId}`, jobId, residentId, now);
}

function makeSource(backend, suffix) {
    return backend.trustedSystemCommands.registerReporterSourceFact({
        sourceId: `reporter-backend-source:${suffix}`,
        sourceType: "public_farm_fact",
        producerReference: `public-farm-producer:${suffix}`,
        occurredAt: START - 1_000,
        publicSubject: `public-farm-subject:${suffix}`,
        fact: { factCode: suffix, observedValue: 5 },
        allowedNumbers: [5],
        privacyScope: "public",
    });
}

function publishForBackend(backend, database, suffix, jobId) {
    const source = makeSource(backend, suffix);
    const pack = backend.trustedSystemCommands.createReporterMaterialPack({
        packId: `reporter-backend-pack:${suffix}`,
        issueReference: `reporter-backend-issue:${suffix}`,
        requiredLevel: 1,
        difficultyLevel: 1,
        sourceIds: [source.sourceId],
    });
    const author = backend.forResident("reporter-author");
    author.claimReporterMaterialPack({
        packId: pack.packId,
        jobId,
        residentId: "spoofed-author",
    });
    author.recordOwnJobDecision({
        jobId,
        idempotencyKey: `reporter-backend-check-key:${suffix}`,
        kind: "check",
        optionReference: `commission:check:${jobId}:sources`,
        resultReference: source.sourceId,
        consumesResources: false,
        changesWorld: false,
    });
    const article = author.submitReporterArticle({
        jobId,
        residentId: "spoofed-author",
        articleId: `reporter-backend-article:${suffix}`,
        idempotencyKey: `reporter-backend-article-key:${suffix}`,
        articleText: `structured-backend-article:${suffix}`,
        citations: [{
            sourceId: source.sourceId,
            factDigest: source.factDigest,
            citationIndex: 0,
        }],
        numericClaims: [{ sourceId: source.sourceId, value: 5 }],
    });
    const reviewed = backend.trustedSystemCommands.reviewReporterArticle({
        articleId: article.articleId,
        reviewerReference: "trusted-reviewer:lingye-daily",
        decision: "approve",
        reasonCode: "hard_checks_passed",
        residentId: "spoofed-author",
    });
    const publication = backend.trustedSystemCommands.publishReporterArticle({
        articleId: reviewed.articleId,
        publicationId: `reporter-backend-publication:${suffix}`,
        residentId: "spoofed-author",
    });
    assert.equal(database.prepare(`
      SELECT resident_id FROM career_reporter_articles WHERE article_id = ?
    `).get(article.articleId).resident_id, "reporter-author");
    assert.equal(backend.trustedQueries.getJob(jobId).status, "completed");
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count FROM career_work_records
      WHERE job_id = ? AND resident_id = 'reporter-author' AND record_kind = 'completed'
    `).get(jobId).count, 1);
    return { source, pack, article, reviewed, publication };
}

test("reporter backend closes resident identity around submissions and likes", () => {
    const database = openLingyeWorldDatabase(":memory:");
    try {
        register(database, "reporter-author");
        register(database, "resident-voter");
        let sequence = 0;
        const backend = createLingyeWorldBackend(database, {
            economyRules: ECONOMY_RULES,
            now: () => START,
            generateId: () => `reporter-backend-id:${++sequence}`,
        });
        seedActiveJob(database, "reporter-backend-job", "reporter-author", START);
        const published = publishForBackend(backend, database, "identity", "reporter-backend-job");
        const voter = backend.forResident("resident-voter");
        assert.equal(voter.recordReporterLike({
            publicationId: published.publication.publicationId,
            residentId: "reporter-author",
        }).accepted, true);
        assert.equal(database.prepare(`
          SELECT resident_id FROM career_reporter_publication_likes
          WHERE publication_id = ?
        `).get(published.publication.publicationId).resident_id, "resident-voter");
        assert.throws(() => backend.forResident("reporter-author").recordReporterLike({
            publicationId: published.publication.publicationId,
            residentId: "resident-voter",
        }), assertCode("reporter_author_like_forbidden"));
        assert.equal(typeof backend.trustedQueries.getReporterPublication, "function");
        assert.equal(backend.trustedQueries.getReporterPublication(published.publication.publicationId).publicationId,
            published.publication.publicationId);
        assert.equal(Object.hasOwn(backend.forResident("resident-voter"), "submitReporterArticle"), true);
    }
    finally {
        database.close();
    }
});

test("reporter backend derives settlement from its quote and never trusts client likes or amount", () => {
    const database = openLingyeWorldDatabase(":memory:");
    try {
        register(database, "reporter-author");
        for (const residentId of ["voter-1", "voter-2", "voter-3", "voter-4", "voter-5"])
            register(database, residentId);
        let now = START;
        let sequence = 0;
        const backend = createLingyeWorldBackend(database, {
            economyRules: ECONOMY_RULES,
            now: () => now,
            generateId: () => `reporter-backend-id:${++sequence}`,
        });
        backend.trustedSystemCommands.importLegacyBalances({
            residentId: "reporter-author",
            gold: 100_000,
            silver: 0,
            migrationId: "reporter-backend-evaluation-account",
            idempotencyKey: "reporter-backend-evaluation-account",
        });

        seedActiveJob(database, "reporter-backend-positive-job", "reporter-author", START);
        const positive = publishForBackend(backend, database, "positive", "reporter-backend-positive-job");
        for (const residentId of ["voter-1", "voter-2", "voter-3", "voter-4", "voter-5"])
            backend.forResident(residentId).recordReporterLike({ publicationId: positive.publication.publicationId });
        now = START + 48 * 60 * 60 * 1_000;
        const journalCountBeforePositive = database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count;
        assert.throws(() => backend.trustedSystemCommands.settleReporterEvaluation({
            jobId: "reporter-backend-positive-job",
            validLikes: 30,
            amount: 1,
            residentId: "spoofed-author",
        }), assertCode("reporter_authoritative_settlement_required"));
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count, journalCountBeforePositive);
        const positiveSettlement = backend.trustedSystemCommands.settleReporterEvaluation({
            jobId: "reporter-backend-positive-job",
        });
        assert.equal(positiveSettlement.quote.validLikes, 5);
        assert.equal(positiveSettlement.quote.performanceGold, 1_000);
        assert.equal(positiveSettlement.quote.residentId, "reporter-author");
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count,
            journalCountBeforePositive + 1);
        assert.deepEqual(backend.trustedSystemCommands.settleReporterEvaluation({
            jobId: "reporter-backend-positive-job",
        }), positiveSettlement);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count,
            journalCountBeforePositive + 1);

        now = START;
        seedActiveJob(database, "reporter-backend-zero-job", "reporter-author", START);
        const zero = publishForBackend(backend, database, "zero", "reporter-backend-zero-job");
        now = START + 48 * 60 * 60 * 1_000;
        const journalCountBeforeZero = database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count;
        const zeroSettlement = backend.trustedSystemCommands.settleReporterEvaluation({
            jobId: "reporter-backend-zero-job",
        });
        assert.equal(zeroSettlement.quote.validLikes, 0);
        assert.equal(zeroSettlement.quote.performanceUnits, 0);
        assert.equal(zeroSettlement.quote.performanceGold, 0);
        assert.equal(zeroSettlement.settlement.receiptId, null);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count, journalCountBeforeZero);
        assert.deepEqual(backend.trustedSystemCommands.settleReporterEvaluation({
            jobId: "reporter-backend-zero-job",
        }), zeroSettlement);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count, journalCountBeforeZero);
    }
    finally {
        database.close();
    }
});

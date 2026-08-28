import assert from "node:assert/strict";
import test from "node:test";
import { EconomyService } from "../dist/economy/economy-service.js";
import {
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";
import {
    PERFORMANCE_PAY_GOLD,
} from "../dist/career/contracts.js";
import {
    REPORTER_EVALUATION_WINDOW_MS,
    createReporterCorrection,
    createReporterMaterialPack,
    getReporterArticle,
    getReporterEvaluationQuote,
    getReporterMaterialPack,
    getReporterPublication,
    registerReporterSourceFact,
    claimReporterMaterialPack,
    publishReporterArticle,
    quoteReporterEvaluation,
    recordReporterLike,
    reviewReporterArticle,
    settleReporterEvaluation,
    submitReporterArticle,
    submitReporterSupplement,
    returnReporterMaterialPack,
} from "../dist/career/reporter-service.js";

const START = Date.parse("2026-09-01T08:00:00+08:00");
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

function assertCode(code) {
    return (error) => error?.code === code;
}

function createHarness() {
    const database = openLingyeWorldDatabase(":memory:");
    let now = START;
    let sequence = 0;
    const economy = new EconomyService(database, {
        rules: ECONOMY_RULES,
        now: () => now,
        generateId: () => `reporter-economy-${++sequence}`,
    });
    return {
        database,
        economy,
        get now() {
            return now;
        },
        setNow(value) {
            now = value;
        },
    };
}

function registerResident(harness, residentId, qualificationLevel = 1) {
    const registered = registerLingyeResidentReference(harness.database, {
        residentId,
        bindingReference: `reporter-binding:${residentId}`,
        registeredAt: harness.now,
    });
    harness.database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'reporter', 1, ?)
    `).run(residentId, harness.now);
    harness.database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'reporter', ?, 'active', ?, ?, ?)
    `).run(residentId, qualificationLevel, `reporter-test-certificate:${residentId}`, harness.now, harness.now);
    return registered;
}

function seedJob(harness, jobId, residentId) {
    const sourceId = `reporter-job-source:${jobId}`;
    harness.database.prepare(`
      INSERT INTO career_jobs (
        job_id, parent_job_id, career, source_type, source_id,
        object_type, object_id, owner_resident_id, required_level,
        difficulty_level, assignment_mode, status, worker_resident_id,
        created_at, updated_at, started_at, ended_at, decision_count,
        has_irreversible_action, world_result_reference, payment_reference
      ) VALUES (?, NULL, 'reporter', ?, ?, 'article', ?, NULL, 1, 1,
        'accepted', 'active', ?, ?, ?, ?, NULL, 1, 0, NULL, NULL)
    `).run(jobId, "reporter_material_pack", sourceId, `article:${jobId}`, residentId,
        harness.now, harness.now, harness.now);
    return jobId;
}

function completeJob(harness, jobId, residentId) {
    harness.database.prepare(`
      UPDATE career_jobs
      SET status = 'completed', ended_at = ?, updated_at = ?,
          world_result_reference = ?
      WHERE job_id = ?
    `).run(harness.now, harness.now, `reporter-published:${jobId}`, jobId);
    harness.database.prepare(`
      INSERT INTO career_work_records (
        work_record_id, job_id, resident_id, career, qualification_level,
        difficulty_level, record_kind, performance_units, recorded_at
      ) VALUES (?, ?, ?, 'reporter', 1, 1, 'completed', 0, ?)
    `).run(`reporter-work:${jobId}`, jobId, residentId, harness.now);
}

function sourceInput(harness, sourceId) {
    return {
        sourceId,
        sourceType: "public_farm_fact",
        producerReference: `public-farm-producer:${sourceId}`,
        occurredAt: harness.now - 1_000,
        publicSubject: `public-farm-subject:${sourceId}`,
        fact: { factCode: sourceId, observedValue: 5 },
        allowedNumbers: [5],
        privacyScope: "public",
        recordedAt: harness.now,
        now: harness.now,
    };
}

function createSourceAndPack(harness, suffix, jobId, residentId = "reporter-author", issueReference = `reporter-issue:${suffix}`) {
    const sourceId = `reporter-source:${suffix}`;
    const source = registerReporterSourceFact(harness.database, sourceInput(harness, sourceId));
    const pack = createReporterMaterialPack(harness.database, {
        packId: `reporter-pack:${suffix}`,
        issueReference,
        requiredLevel: 1,
        difficultyLevel: 1,
        sourceIds: [sourceId],
        now: harness.now,
    });
    const claim = claimReporterMaterialPack(harness.database, {
        packId: pack.packId,
        jobId,
        residentId,
        idempotencyKey: `reporter-claim:${suffix}`,
        now: harness.now,
    });
    return { source, pack: claim };
}

function articlePayload(material, suffix) {
    return {
        articleId: `reporter-article:${suffix}`,
        idempotencyKey: `reporter-article-key:${suffix}`,
        articleText: `structured-article-body:${suffix}`,
        citations: [{
            sourceId: material.source.sourceId,
            factDigest: material.source.factDigest,
            citationIndex: 0,
        }],
        numericClaims: [{ sourceId: material.source.sourceId, value: 5 }],
    };
}

function publishInitialArticle(harness, suffix, jobId) {
    const material = createSourceAndPack(harness, suffix, jobId);
    const submitted = submitReporterArticle(harness.database, {
        jobId,
        residentId: "reporter-author",
        ...articlePayload(material, suffix),
        now: harness.now,
    });
    const approved = reviewReporterArticle(harness.database, {
        articleId: submitted.articleId,
        trustedReview: true,
        reviewerReference: "trusted-reviewer:lingye-daily",
        decision: "approve",
        reasonCode: "hard_checks_passed",
        now: harness.now,
    });
    const publication = publishReporterArticle(harness.database, {
        articleId: approved.articleId,
        publicationId: `reporter-publication:${suffix}`,
        now: harness.now,
    });
    return { material, submitted, approved, publication };
}

test("reporter service keeps public source, material claim, review, publication, correction, and resident-like boundaries", () => {
    const harness = createHarness();
    try {
        for (const residentId of ["reporter-author", "resident-one", "resident-two", "resident-three"])
            registerResident(harness, residentId);

        const source = registerReporterSourceFact(harness.database, sourceInput(harness, "reporter-source-main"));
        assert.deepEqual(registerReporterSourceFact(harness.database, sourceInput(harness, "reporter-source-main")), source);
        assert.throws(() => registerReporterSourceFact(harness.database, {
            ...sourceInput(harness, "reporter-source-private"),
            privacyScope: "private",
        }), assertCode("reporter_source_not_public"));
        assert.throws(() => registerReporterSourceFact(harness.database, {
            ...sourceInput(harness, "reporter-source-future"),
            occurredAt: harness.now + 1,
        }), assertCode("reporter_source_in_future"));
        for (const suffix of ["2", "3", "4"])
            registerReporterSourceFact(harness.database, sourceInput(harness, `reporter-source-main-${suffix}`));

        const pack = createReporterMaterialPack(harness.database, {
            packId: "reporter-pack-main",
            issueReference: "reporter-issue:main",
            requiredLevel: 1,
            difficultyLevel: 1,
            sourceIds: [source.sourceId],
            now: harness.now,
        });
        assert.throws(() => createReporterMaterialPack(harness.database, {
            packId: "reporter-pack-over-level",
            issueReference: "reporter-issue:over-level",
            requiredLevel: 1,
            difficultyLevel: 1,
            sourceIds: [source.sourceId, "reporter-source-main-2", "reporter-source-main-3", "reporter-source-main-4"],
            now: harness.now,
        }), assertCode("reporter_material_level_limit"));

        seedJob(harness, "reporter-main-job", "reporter-author");
        const claimed = claimReporterMaterialPack(harness.database, {
            packId: pack.packId,
            jobId: "reporter-main-job",
            residentId: "reporter-author",
            idempotencyKey: "reporter-main-claim",
            now: harness.now,
        });
        assert.equal(claimed.status, "claimed");
        assert.deepEqual(claimReporterMaterialPack(harness.database, {
            packId: pack.packId,
            jobId: "reporter-main-job",
            residentId: "reporter-author",
            idempotencyKey: "reporter-main-claim",
            now: harness.now,
        }), claimed);

        const validPayload = articlePayload({ source }, "main");
        assert.throws(() => submitReporterArticle(harness.database, {
            jobId: "reporter-main-job",
            residentId: "reporter-author",
            ...validPayload,
            citations: [{ sourceId: source.sourceId, factDigest: "not-the-source-digest", citationIndex: 0 }],
            now: harness.now,
        }), assertCode("reporter_citation_fact_mismatch"));
        const submitted = submitReporterArticle(harness.database, {
            jobId: "reporter-main-job",
            residentId: "reporter-author",
            ...validPayload,
            now: harness.now,
        });
        assert.equal(submitted.status, "pending_review");
        assert.deepEqual(submitReporterArticle(harness.database, {
            jobId: "reporter-main-job",
            residentId: "reporter-author",
            ...validPayload,
            now: harness.now,
        }), submitted);
        assert.throws(() => reviewReporterArticle(harness.database, {
            articleId: submitted.articleId,
            reviewerReference: "untrusted-reviewer",
            decision: "approve",
            now: harness.now,
        }), assertCode("reporter_review_not_trusted"));
        const needsSupplement = reviewReporterArticle(harness.database, {
            articleId: submitted.articleId,
            trustedReview: true,
            reviewerReference: "trusted-reviewer:lingye-daily",
            decision: "needs_supplement",
            reasonCode: "supplement_required",
            now: harness.now,
        });
        assert.equal(needsSupplement.status, "needs_supplement");

        const supplementInput = {
            jobId: "reporter-main-job",
            residentId: "reporter-author",
            parentArticleId: submitted.articleId,
            articleId: "reporter-article-main-v2",
            idempotencyKey: "reporter-article-main-v2-key",
            articleText: "structured-supplement-body:main",
            citations: validPayload.citations,
            numericClaims: validPayload.numericClaims,
            now: harness.now,
        };
        const supplement = submitReporterSupplement(harness.database, supplementInput);
        assert.equal(supplement.version, 2);
        assert.deepEqual(submitReporterSupplement(harness.database, supplementInput), supplement);
        const approved = reviewReporterArticle(harness.database, {
            articleId: supplement.articleId,
            trustedReview: true,
            reviewerReference: "trusted-reviewer:lingye-daily",
            decision: "approve",
            reasonCode: "hard_checks_passed",
            now: harness.now,
        });
        const publication = publishReporterArticle(harness.database, {
            articleId: approved.articleId,
            publicationId: "reporter-publication-main-v2",
            now: harness.now,
        });
        assert.equal(publication.status, "open");
        assert.equal(publication.evaluationClosesAt, harness.now + REPORTER_EVALUATION_WINDOW_MS);
        assert.equal(getReporterMaterialPack(harness.database, pack.packId).status, "consumed");

        assert.deepEqual(recordReporterLike(harness.database, {
            publicationId: publication.publicationId,
            residentId: "resident-one",
            actorKind: "resident",
            now: harness.now,
        }), {
            accepted: true,
            duplicate: false,
            jobId: "reporter-main-job",
            publicationId: publication.publicationId,
            residentId: "resident-one",
        });
        assert.throws(() => recordReporterLike(harness.database, {
            publicationId: publication.publicationId,
            residentId: "reporter-author",
            actorKind: "resident",
            now: harness.now,
        }), assertCode("reporter_author_like_forbidden"));
        assert.throws(() => recordReporterLike(harness.database, {
            publicationId: publication.publicationId,
            residentId: "resident-two",
            actorKind: "npc",
            now: harness.now,
        }), assertCode("reporter_like_actor_forbidden"));
        assert.throws(() => recordReporterLike(harness.database, {
            publicationId: publication.publicationId,
            residentId: "not-a-resident",
            actorKind: "resident",
            now: harness.now,
        }), assertCode("reporter_resident_not_found"));

        const correctionInput = {
            jobId: "reporter-main-job",
            residentId: "reporter-author",
            parentArticleId: supplement.articleId,
            articleId: "reporter-article-main-v3",
            idempotencyKey: "reporter-article-main-v3-key",
            articleText: "structured-correction-body:main",
            citations: validPayload.citations,
            numericClaims: validPayload.numericClaims,
            now: harness.now,
        };
        const correction = createReporterCorrection(harness.database, correctionInput);
        assert.equal(correction.version, 3);
        const approvedCorrection = reviewReporterArticle(harness.database, {
            articleId: correction.articleId,
            trustedReview: true,
            reviewerReference: "trusted-reviewer:lingye-daily",
            decision: "approve",
            reasonCode: "hard_checks_passed",
            now: harness.now,
        });
        const correctedPublication = publishReporterArticle(harness.database, {
            articleId: approvedCorrection.articleId,
            publicationId: "reporter-publication-main-v3",
            now: harness.now,
        });
        assert.equal(createReporterCorrection(harness.database, correctionInput).articleId, correction.articleId);
        assert.equal(createReporterCorrection(harness.database, correctionInput).status, "published");
        assert.equal(correctedPublication.evaluationClosesAt, publication.evaluationClosesAt);
        assert.equal(getReporterPublication(harness.database, publication.publicationId).status, "superseded");
        assert.deepEqual(recordReporterLike(harness.database, {
            publicationId: correctedPublication.publicationId,
            residentId: "resident-one",
            actorKind: "resident",
            now: harness.now,
        }), {
            accepted: false,
            duplicate: true,
            jobId: "reporter-main-job",
            publicationId: publication.publicationId,
            residentId: "resident-one",
        });
        assert.equal(recordReporterLike(harness.database, {
            publicationId: correctedPublication.publicationId,
            residentId: "resident-two",
            actorKind: "resident",
            now: harness.now,
        }).accepted, true);
        assert.equal(getReporterArticle(harness.database, correction.articleId).parentArticleId, supplement.articleId);
        assert.equal(harness.database.prepare(`
          SELECT COUNT(*) AS count
          FROM career_reporter_articles AS article
          JOIN career_reporter_material_packs AS pack ON pack.pack_id = article.pack_id
          WHERE article.resident_id = 'reporter-author' AND pack.issue_reference = 'reporter-issue:main'
            AND article.revision_kind = 'initial'
        `).get().count, 1);
    }
    finally {
        harness.database.close();
    }
});

test("reporter evaluation quotes database likes at the fixed 48 hour close and settles each terminal result idempotently", () => {
    const harness = createHarness();
    try {
        registerResident(harness, "reporter-author");
        const voters = Array.from({ length: 30 }, (_, index) => `reporter-voter-${index + 1}`);
        for (const residentId of voters)
            registerResident(harness, residentId);
        harness.economy.importLegacyBalances({
            residentId: "reporter-author",
            gold: 100_000,
            silver: 0,
            migrationId: "reporter-evaluation-account",
            idempotencyKey: "reporter-evaluation-account",
        });

        const cases = [
            { suffix: "zero", likes: 0, units: 0 },
            { suffix: "five", likes: 5, units: 1 },
            { suffix: "fifteen", likes: 15, units: 2 },
            { suffix: "thirty", likes: 30, units: 3 },
        ];
        const publications = [];
        for (const entry of cases) {
            const jobId = `reporter-evaluation-job:${entry.suffix}`;
            seedJob(harness, jobId, "reporter-author");
            const published = publishInitialArticle(harness, entry.suffix, jobId).publication;
            publications.push({ ...entry, jobId, published });
            for (const residentId of voters.slice(0, entry.likes)) {
                assert.equal(recordReporterLike(harness.database, {
                    publicationId: published.publicationId,
                    residentId,
                    actorKind: "resident",
                    now: harness.now,
                }).accepted, true);
            }
            completeJob(harness, jobId, "reporter-author");
        }

        harness.setNow(START + REPORTER_EVALUATION_WINDOW_MS);
        for (const entry of publications) {
            const quote = quoteReporterEvaluation(harness.database, {
                jobId: entry.jobId,
                now: harness.now,
            });
            assert.equal(quote.validLikes, entry.likes);
            assert.equal(quote.performanceUnits, entry.units);
            assert.equal(quote.performanceGold, entry.units * PERFORMANCE_PAY_GOLD[1]);
            assert.deepEqual(quoteReporterEvaluation(harness.database, {
                jobId: entry.jobId,
                now: harness.now,
            }), quote);

            let financialReceipt;
            if (entry.units > 0) {
                financialReceipt = harness.economy.creditFromSystem({
                    residentId: "reporter-author",
                    currency: "gold",
                    amount: quote.performanceGold,
                    businessType: "career_wage",
                    businessRef: `career-job:${entry.jobId}:evaluation-performance`,
                    idempotencyKey: `reporter-evaluation-credit:${entry.suffix}`,
                }).financialReceipt;
            }
            const settled = settleReporterEvaluation(harness.database, {
                jobId: entry.jobId,
                financialReceipt,
                now: harness.now,
            });
            assert.equal(settled.settlement.validLikes, entry.likes);
            assert.equal(settled.settlement.performanceUnits, entry.units);
            assert.equal(settled.settlement.performanceGold, entry.units * PERFORMANCE_PAY_GOLD[1]);
            assert.deepEqual(settleReporterEvaluation(harness.database, {
                jobId: entry.jobId,
                financialReceipt,
                now: harness.now,
            }), settled);
            assert.equal(getReporterEvaluationQuote(harness.database, entry.jobId).status, "settled");
            assert.equal(getReporterPublication(harness.database, entry.published.publicationId).status, "closed");
        }
    }
    finally {
        harness.database.close();
    }
});

test("reporter material can be returned only before an article exists and then claimed once again", () => {
    const harness = createHarness();
    try {
        registerResident(harness, "reporter-author");
        const source = registerReporterSourceFact(harness.database, sourceInput(harness, "reporter-source-return"));
        const pack = createReporterMaterialPack(harness.database, {
            packId: "reporter-pack-return",
            issueReference: "reporter-issue:return",
            requiredLevel: 1,
            difficultyLevel: 1,
            sourceIds: [source.sourceId],
            now: harness.now,
        });
        seedJob(harness, "reporter-return-job", "reporter-author");
        assert.equal(claimReporterMaterialPack(harness.database, {
            packId: pack.packId,
            jobId: "reporter-return-job",
            residentId: "reporter-author",
            idempotencyKey: "reporter-return-claim",
            now: harness.now,
        }).status, "claimed");
        const returned = returnReporterMaterialPack(harness.database, {
            packId: pack.packId,
            jobId: "reporter-return-job",
            residentId: "reporter-author",
            idempotencyKey: "reporter-return-key",
            now: harness.now,
        });
        assert.equal(returned.status, "returned");
        assert.deepEqual(returnReporterMaterialPack(harness.database, {
            packId: pack.packId,
            jobId: "reporter-return-job",
            residentId: "reporter-author",
            idempotencyKey: "reporter-return-key",
            now: harness.now,
        }), returned);
        seedJob(harness, "reporter-return-reclaim-job", "reporter-author");
        assert.equal(claimReporterMaterialPack(harness.database, {
            packId: pack.packId,
            jobId: "reporter-return-reclaim-job",
            residentId: "reporter-author",
            idempotencyKey: "reporter-reclaim-key",
            now: harness.now,
        }).status, "claimed");
        submitReporterArticle(harness.database, {
            jobId: "reporter-return-reclaim-job",
            residentId: "reporter-author",
            ...articlePayload({ source }, "return-reclaim"),
            now: harness.now,
        });
        assert.throws(() => returnReporterMaterialPack(harness.database, {
            packId: pack.packId,
            jobId: "reporter-return-reclaim-job",
            residentId: "reporter-author",
            idempotencyKey: "reporter-return-reclaim-after-article",
            now: harness.now,
        }), assertCode("reporter_material_has_article"));
    }
    finally {
        harness.database.close();
    }
});

test("reporter initial submissions use active qualification for the 1/1/2/3 per-issue quota", () => {
    const harness = createHarness();
    try {
        registerResident(harness, "reporter-author", 1);
        registerResident(harness, "reporter-level-two", 2);
        registerResident(harness, "reporter-level-three", 3);
        registerResident(harness, "reporter-level-four", 4);
        registerLingyeResidentReference(harness.database, {
            residentId: "reporter-unqualified",
            bindingReference: "reporter-binding:unqualified",
            registeredAt: harness.now,
        });

        const prepareInitial = (suffix, jobId, residentId, issueReference, extra = {}) => {
            seedJob(harness, jobId, residentId);
            const material = createSourceAndPack(harness, suffix, jobId, residentId, issueReference);
            const input = {
                jobId,
                residentId,
                ...articlePayload(material, suffix),
                ...extra,
                now: harness.now,
            };
            return { material, input };
        };
        const createInitial = (...args) => {
            const prepared = prepareInitial(...args);
            return { ...prepared, article: submitReporterArticle(harness.database, prepared.input) };
        };

        assert.throws(() => createReporterMaterialPack(harness.database, {
            packId: "reporter-pack-without-issue",
            requiredLevel: 1,
            difficultyLevel: 1,
            sourceIds: [registerReporterSourceFact(harness.database, sourceInput(harness, "reporter-source-without-issue")).sourceId],
            now: harness.now,
        }), assertCode("reporter_invalid_issue_reference"));

        const levelOneFirst = createInitial("quota-l1-first", "quota-l1-job-first", "reporter-author", "issue:l1");
        assert.equal(levelOneFirst.material.pack.packId, "reporter-pack:quota-l1-first");
        assert.equal(levelOneFirst.material.pack.issueReference, "issue:l1");
        assert.deepEqual(submitReporterArticle(harness.database, levelOneFirst.input), levelOneFirst.article);
        const levelOneSecond = prepareInitial("quota-l1-second", "quota-l1-job-second", "reporter-author", "issue:l1", {
            qualificationLevel: 4,
        });
        assert.throws(() => submitReporterArticle(harness.database, levelOneSecond.input), assertCode("reporter_issue_article_limit"));
        assert.equal(harness.database.prepare(`
          SELECT COUNT(*) AS count
          FROM career_reporter_articles AS article
          JOIN career_reporter_material_packs AS pack ON pack.pack_id = article.pack_id
          WHERE article.resident_id = 'reporter-author' AND pack.issue_reference = 'issue:l1'
            AND article.revision_kind = 'initial'
        `).get().count, 1);
        createInitial("quota-l1-other-issue", "quota-l1-job-other-issue", "reporter-author", "issue:l1-other");

        const levelTwoFirst = createInitial("quota-l2-first", "quota-l2-job-first", "reporter-level-two", "issue:l2");
        const levelTwoSecond = prepareInitial("quota-l2-second", "quota-l2-job-second", "reporter-level-two", "issue:l2");
        assert.throws(() => submitReporterArticle(harness.database, levelTwoSecond.input), assertCode("reporter_issue_article_limit"));
        assert.equal(levelTwoFirst.article.version, 1);

        createInitial("quota-l3-first", "quota-l3-job-first", "reporter-level-three", "issue:l3");
        createInitial("quota-l3-second", "quota-l3-job-second", "reporter-level-three", "issue:l3");
        const levelThreeThird = prepareInitial("quota-l3-third", "quota-l3-job-third", "reporter-level-three", "issue:l3");
        assert.throws(() => submitReporterArticle(harness.database, levelThreeThird.input), assertCode("reporter_issue_article_limit"));

        createInitial("quota-l4-first", "quota-l4-job-first", "reporter-level-four", "issue:l4");
        createInitial("quota-l4-second", "quota-l4-job-second", "reporter-level-four", "issue:l4");
        createInitial("quota-l4-third", "quota-l4-job-third", "reporter-level-four", "issue:l4");
        const levelFourFourth = prepareInitial("quota-l4-fourth", "quota-l4-job-fourth", "reporter-level-four", "issue:l4");
        assert.throws(() => submitReporterArticle(harness.database, levelFourFourth.input), assertCode("reporter_issue_article_limit"));

        seedJob(harness, "quota-unqualified-job", "reporter-unqualified");
        const unqualifiedMaterial = createSourceAndPack(
            harness,
            "quota-unqualified",
            "quota-unqualified-job",
            "reporter-unqualified",
            "issue:unqualified",
        );
        assert.throws(() => submitReporterArticle(harness.database, {
            jobId: "quota-unqualified-job",
            residentId: "reporter-unqualified",
            ...articlePayload(unqualifiedMaterial, "quota-unqualified"),
            now: harness.now,
        }), assertCode("reporter_active_qualification_required"));
    }
    finally {
        harness.database.close();
    }
});

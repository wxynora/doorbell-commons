import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-reporter-runtime-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const {
    reporterIssueReference,
    reporterAllowedNumbers,
    reporterPublicHistoryIdentity,
    reporterPublicHistoryOccurredAt,
    syncAuthorityJobs,
} = await import("../dist/career/p3-commission-runtime.js");
const { getPublicExpeditionWorld } = await import("../dist/store.js");

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const REPORTER = "reporter-runtime-author";
const RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

function registerReporter(database, backend) {
    registerLingyeResidentReference(database, {
        residentId: REPORTER,
        bindingReference: `reporter-runtime:${REPORTER}`,
        registeredAt: NOW,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId: REPORTER,
        gold: 100_000,
        silver: 0,
        migrationId: "reporter-runtime-account",
        idempotencyKey: "reporter-runtime-account",
    });
    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'reporter', 1, ?)
    `).run(REPORTER, NOW);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'reporter', 1, 'active', ?, ?, ?)
    `).run(REPORTER, "reporter-runtime-certificate", NOW, NOW);
    database.prepare(`
      INSERT INTO career_employments (
        employment_id, resident_id, career, institution, seat_number,
        status, availability, hired_at
      ) VALUES (?, ?, 'reporter', 'lingye_daily', 1, 'active', 'available', ?)
    `).run("reporter-runtime-employment", REPORTER, NOW);
    database.prepare(`
      INSERT INTO career_duty_days (
        duty_id, employment_id, resident_id, career, institution, duty_date,
        qualification_level, base_wage_gold, status, generated_at
      ) VALUES (?, ?, ?, 'reporter', 'lingye_daily', '2026-09-01', 1, 2000, 'scheduled', ?)
    `).run("reporter-runtime-duty", "reporter-runtime-employment", REPORTER, NOW);
}

function publicOption(database, internalOption) {
    const row = database.prepare(`
      SELECT handle FROM lingye_option_handles
      WHERE resident_id = ? AND operation = 'go.newsroom.commission' AND internal_option = ?
    `).get(REPORTER, internalOption);
    assert.ok(row);
    return row.handle;
}

test("public history registration and reporter publication close the authoritative work record", () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    let now = NOW;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        now: () => now,
        generateId: () => `reporter-runtime-id:${++sequence}`,
    });
    try {
        registerReporter(database, backend);
        const publicWorld = getPublicExpeditionWorld();
        const entry = publicWorld.history[0];
        const occurredAt = reporterPublicHistoryOccurredAt(publicWorld, entry, now);
        const identity = reporterPublicHistoryIdentity(publicWorld, entry, occurredAt);
        assert.deepEqual(reporterPublicHistoryIdentity({ ...publicWorld }, structuredClone(entry), occurredAt), identity);
        assert.notEqual(
            identity.sourceId,
            reporterPublicHistoryIdentity(publicWorld, { ...entry, text: `${entry.text} ` }, occurredAt).sourceId,
        );
        assert.equal(/:\d+$/u.test(identity.sourceId), false);

        const executor = createLingyeActionExecutor({ database, backend, now: () => now });
        const execute = (args) => executor.execute({
            residentId: REPORTER,
            bindingReference: `reporter-runtime:${REPORTER}`,
            op: "go.newsroom.commission",
            args,
        });
        const view = execute({});
        const reporterJob = view.data.jobs.find((job) => job.sourceType === "public_event_fact");
        assert.ok(reporterJob);
        assert.equal(view.data.jobs.length, 1);
        now += 1_000;
        syncAuthorityJobs(database, backend, NOW + 123_000);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_reporter_source_facts").get().count, 1);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_reporter_material_packs").get().count, 1);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_jobs").get().count, 1);
        assert.equal(reporterJob.sourceFacts.materialPack.sourceIds.length, 1);
        assert.equal(reporterJob.sourceFacts.sourceFacts[0].producerReference.startsWith("public-expedition-history:"), true);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_commission_source_facts").get().count, 0);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_reporter_source_facts").get().count, 1);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_reporter_material_packs").get().count, 1);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_jobs").get().count, 1);

        assert.equal(execute({
            option: publicOption(database, `commission:accept:${reporterJob.jobId}`),
        }).ok, true);
        execute({});
        assert.equal(execute({
            option: publicOption(database, `commission:check:${reporterJob.jobId}:sources`),
        }).ok, true);
        execute({});
        const submitted = execute({
            option: publicOption(database, `commission:submit:${reporterJob.jobId}`),
            text: "真实公共事实稿",
        });
        assert.equal(submitted.ok, true);
        const articleId = submitted.data.articleId;
        const reviewed = backend.trustedSystemCommands.reviewReporterArticle({
            articleId,
            reviewerReference: "trusted-reviewer:lingye-daily",
            decision: "approve",
            reasonCode: "hard_checks_passed",
        });
        const publication = backend.trustedSystemCommands.publishReporterArticle({
            articleId: reviewed.articleId,
            publicationId: `reporter-runtime-publication:${reporterJob.jobId}`,
        });
        assert.equal(publication.status, "open");
        assert.equal(backend.trustedQueries.getJob(reporterJob.jobId).status, "completed");
        assert.equal(database.prepare(`
          SELECT COUNT(*) AS count FROM career_work_records
          WHERE job_id = ? AND record_kind = 'completed'
        `).get(reporterJob.jobId).count, 1);

        now += 48 * 60 * 60 * 1_000;
        const settled = backend.trustedSystemCommands.settleReporterEvaluation({ jobId: reporterJob.jobId });
        assert.equal(settled.quote.validLikes, 0);
        assert.equal(settled.quote.performanceUnits, 0);
        assert.equal(settled.settlement.receiptId, null);
    }
    finally {
        database.close();
        rmSync(dataDirectory, { recursive: true, force: true });
    }
});

test("public history reporter identities are content-derived rather than array positions", () => {
    const world = { storyId: "same_kitchen", round: 4 };
    const occurredAt = Date.parse("2026-09-01T08:00:00+08:00");
    const first = reporterPublicHistoryIdentity(world, { kind: "story", title: "A", text: "one" }, occurredAt);
    const reordered = reporterPublicHistoryIdentity(world, { text: "one", title: "A", kind: "story" }, occurredAt);
    const changed = reporterPublicHistoryIdentity(world, { kind: "story", title: "A", text: "two" }, occurredAt);
    assert.equal(first.sourceId, reordered.sourceId);
    assert.equal(first.issueReference, reordered.issueReference);
    assert.notEqual(first.sourceId, changed.sourceId);
    assert.equal(first.issueReference, changed.issueReference);
    assert.equal(/:\d+$/u.test(first.sourceId), false);
    assert.equal(/:\d+$/u.test(first.issueReference), false);
});

test("reporter issue identity follows the authoritative Beijing 05:00 newspaper boundary", () => {
    assert.equal(
        reporterIssueReference(Date.parse("2026-09-01T04:59:59+08:00")),
        "lingye-daily:2026-09-01",
    );
    assert.equal(
        reporterIssueReference(Date.parse("2026-09-01T05:00:00+08:00")),
        "lingye-daily:2026-09-02",
    );
    assert.equal(
        reporterPublicHistoryOccurredAt({}, {}, NOW),
        null,
    );
});

test("reporter public facts authorize only finite numbers present in the source snapshot", () => {
    assert.deepEqual(
        reporterAllowedNumbers({ round: 4, nested: [12, { count: 4, ignored: "12" }], invalid: Number.NaN }),
        [4, 12],
    );
});

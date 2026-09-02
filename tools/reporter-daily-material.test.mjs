import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-reporter-material-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "daily-material-test-token";

const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createDoorbellInternalHandler } = await import("../dist/server/doorbell/router.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { makeFarm } = await import("../dist/game.js");
const { activateStoredNatureWorld, insertFarm } = await import("../dist/store.js");
const { currentDayIndex } = await import("../dist/time.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const FIVE = Date.parse("2026-09-01T05:00:00+08:00");
const RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

const boardFarm = makeFarm("日报榜单", 123, {
    aiName: "榜单小机",
    humanName: "榜单主人",
});
boardFarm.id = "REPORTERBOARD";
boardFarm.daily = {
    day: currentDayIndex(FIVE),
    tasks: 1,
    logins: 2,
    messages: 3,
    events: 4,
    stolen: 5,
    watered: 6,
    coinSpend: 7,
    oddDishes: 8,
};
boardFarm.ranch = {
    ...(boardFarm.ranch ?? {}),
    raidIncome: { day: currentDayIndex(FIVE), n: 9 },
    raidLoss: { day: currentDayIndex(FIVE), n: 10 },
};
insertFarm(boardFarm);
activateStoredNatureWorld({ now: FIVE, seed: "reporter-material-weather" });

function request(body) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.headers = { authorization: "Bearer daily-material-test-token" };
    return req;
}

function responseCapture() {
    return {
        body: "",
        status: null,
        writeHead(status) {
            this.status = status;
        },
        end(body = "") {
            this.body = String(body);
        },
    };
}

function seedRelayReporter(database, backend, residentId, index) {
    registerLingyeResidentReference(database, {
        residentId,
        bindingReference: `binding:${residentId}`,
        registeredAt: FIVE,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId,
        gold: 0,
        silver: 0,
        migrationId: `relay-economy:${residentId}`,
        idempotencyKey: `relay-economy:${residentId}`,
    });
    database.prepare(`INSERT INTO career_tracks (
      resident_id, career, track_order, selected_at
    ) VALUES (?, 'reporter', 1, ?)`).run(residentId, FIVE);
    database.prepare(`INSERT INTO career_certificates (
      resident_id, career, qualification_level, status,
      source_attempt_id, issued_at, effective_at
    ) VALUES (?, 'reporter', 1, 'active', ?, ?, ?)`)
        .run(residentId, `relay-certificate:${residentId}`, FIVE, FIVE);
    database.prepare(`INSERT INTO career_employments (
      employment_id, resident_id, career, institution, seat_number,
      employment_class, status, availability, hired_at
    ) VALUES (?, ?, 'reporter', 'lingye_daily', ?, ?, 'active', 'available', ?)`)
        .run(`relay-employment:${residentId}`, residentId, index < 2 ? index + 1 : 1,
            index < 2 ? "staff" : "external", FIVE);
    database.prepare(`INSERT INTO career_duty_days (
      duty_id, employment_id, resident_id, career, institution, duty_date,
      qualification_level, base_wage_gold, performance_rate_bps, status, generated_at
    ) VALUES (?, ?, ?, 'reporter', 'lingye_daily', '2026-09-01',
      1, 2000, ?, 'scheduled', ?)`)
        .run(`relay-duty:${residentId}`, `relay-employment:${residentId}`, residentId,
            index < 2 ? 10_000 : 5_000, FIVE);
}

test("Lingye Daily internal material returns sourced facts and only fully credited publications", async () => {
    const database = openLingyeWorldDatabase(":memory:");
    const publishedAt = Date.parse("2026-09-01T12:00:00+08:00");
    try {
        for (const residentId of ["selector", "writer", "reviewer"]) {
            registerLingyeResidentReference(database, {
                residentId,
                bindingReference: `binding:${residentId}`,
                registeredAt: publishedAt,
            });
        }
        const insertJob = database.prepare(`INSERT INTO career_jobs (
          job_id, career, source_type, source_id, object_type, object_id,
          required_level, difficulty_level, assignment_mode, status,
          worker_resident_id, created_at, updated_at, started_at, ended_at,
          decision_count, world_result_reference
        ) VALUES (?, 'reporter', ?, 'daily-source', ?, ?, 1, 1, 'accepted',
          'completed', ?, ?, ?, ?, ?, 2, ?)`);
        insertJob.run("selector-job", "public_event_fact", "public_event", "daily-event",
            "selector", publishedAt, publishedAt, publishedAt, publishedAt, "selected");
        insertJob.run("writer-job", "public_event_fact:writing", "reporter_article", "daily-article",
            "writer", publishedAt, publishedAt, publishedAt, publishedAt, "published");
        insertJob.run("reviewer-job", "public_event_fact:reviewing", "reporter_review", "daily-review",
            "reviewer", publishedAt, publishedAt, publishedAt, publishedAt, "approved");
        database.prepare(`INSERT INTO career_reporter_source_facts (
          source_id, source_type, producer_reference, occurred_at, public_subject,
          fact_json, allowed_numbers_json, privacy_scope, revision_reference,
          fact_digest, recorded_at
        ) VALUES ('daily-source', 'public_event_fact', 'public-event:test', ?,
          '真实公共事件', '{"count":3}', '[3]', 'public', NULL, 'digest', ?)`)
            .run(publishedAt - 1_000, publishedAt);
        database.prepare(`INSERT INTO career_reporter_material_packs (
          pack_id, issue_reference, required_level, difficulty_level,
          source_ids_json, source_snapshot_json, status, job_id,
          claimed_by_resident_id, claim_idempotency_key, created_at, claimed_at, consumed_at
        ) VALUES ('daily-pack', 'lingye-daily:2026-09-01', 1, 1,
          '["daily-source"]', '[{"sourceId":"daily-source","sourceType":"public_event_fact","occurredAt":0,"factDigest":"digest"}]',
          'consumed', 'writer-job', 'writer', 'claim', ?, ?, ?)`)
            .run(publishedAt, publishedAt, publishedAt);
        database.prepare(`INSERT INTO career_reporter_articles (
          article_id, job_id, resident_id, pack_id, version, revision_kind,
          article_text, numeric_claims_json, payload_hash, idempotency_key,
          status, submitted_at, reviewed_at, published_at
        ) VALUES ('daily-article', 'writer-job', 'writer', 'daily-pack', 1, 'initial',
          '三岗记者完成的真实报道。', '[]', 'payload', 'article-key',
          'published', ?, ?, ?)`)
            .run(publishedAt - 200, publishedAt - 100, publishedAt);
        database.prepare(`INSERT INTO career_reporter_publications (
          publication_id, article_id, job_id, resident_id, article_version,
          published_at, evaluation_opens_at, evaluation_closes_at, status
        ) VALUES ('daily-publication', 'daily-article', 'writer-job', 'writer', 1,
          ?, ?, ?, 'open')`).run(publishedAt, publishedAt, publishedAt + 48 * 60 * 60 * 1_000);
        database.prepare(`INSERT INTO career_reporter_story_workflows (
          workflow_id, issue_reference, selector_job_id, writer_job_id, reviewer_job_id,
          selector_resident_id, writer_resident_id, reviewer_resident_id,
          article_id, publication_id, status, selected_at, submitted_at, reviewed_at, published_at
        ) VALUES ('daily-workflow', 'lingye-daily:2026-09-01',
          'selector-job', 'writer-job', 'reviewer-job', 'selector', 'writer', 'reviewer',
          'daily-article', 'daily-publication', 'published', ?, ?, ?, ?)`)
            .run(publishedAt - 300, publishedAt - 200, publishedAt - 100, publishedAt);

        const response = responseCapture();
        const internalHandler = createDoorbellInternalHandler(
            () => { throw new Error("farm action must not run"); },
            null,
            null,
            { database, backend: {} },
        );
        const handled = await internalHandler(request({
            issue_date: "2026-09-01",
            period_start: "2026-08-31T17:00:00+08:00",
            period_end: "2026-09-01T17:00:00+08:00",
        }), response, ["internal", "doorbell", "lingye-daily", "material"], "POST");
        assert.equal(handled, true);
        assert.equal(response.status, 200);
        const payload = JSON.parse(response.body);
        assert.equal(payload.data.source_facts.length, 1);
        assert.deepEqual(payload.data.reporter_publications, [{
            publication_id: "daily-publication",
            published_at: new Date(publishedAt).toISOString(),
            selector: "社区记者",
            writer: "社区记者",
            reviewer: "社区记者",
            article_text: "三岗记者完成的真实报道。",
            version: 1,
        }]);
    }
    finally {
        database.close();
    }
});

test("reporter relay internal endpoints persist and replay an explicit selector-to-writer handoff", async () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    let now = FIVE;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `relay-endpoint:${++sequence}`,
        now: () => now,
    });
    try {
        ["relay-selector", "relay-writer", "relay-reviewer"].forEach((residentId, index) =>
            seedRelayReporter(database, backend, residentId, index));
        const internalHandler = createDoorbellInternalHandler(
            () => { throw new Error("farm action must not run"); },
            null,
            null,
            { database, backend, now: () => now },
        );
        const startResponse = responseCapture();
        const handled = await internalHandler(request({
            issue_date: "2026-09-01",
            period_start: "2026-08-31T05:00:00+08:00",
            period_end: "2026-09-01T05:00:00+08:00",
        }), startResponse, ["internal", "doorbell", "lingye-daily", "reporter-relay", "start"], "POST");
        assert.equal(handled, true);
        assert.equal(startResponse.status, 200);
        const started = JSON.parse(startResponse.body);
        assert.deepEqual(Object.keys(started), ["ok", "data"]);
        assert.deepEqual(Object.keys(started.data).sort(), ["issue_date", "status", "wake"]);
        assert.equal(started.data.issue_date, "2026-09-01");
        assert.equal(started.data.status, "started");
        assert.deepEqual(Object.keys(started.data.wake).sort(), [
            "action", "issue_date", "materials", "recipient_resident_id", "stage", "wake_id",
        ]);
        assert.equal(started.data.wake.stage, "selection");
        assert.deepEqual(Object.keys(started.data.wake.action).sort(), ["args", "op"]);
        assert.equal(started.data.wake.action.op, "go.newsroom.commission");
        assert.match(started.data.wake.action.args.option, /^opt_[A-Za-z0-9_-]{12}$/u);
        assert.equal(started.data.wake.materials.length, 13);
        for (const material of started.data.wake.materials) {
            assert.deepEqual(Object.keys(material).sort(), ["category", "content", "occurred_at", "title"]);
            assert.equal(typeof material.content, "string");
            assert.ok(material.content.trim());
            assert.doesNotMatch(material.content, /"rank"|"doorplate"|"value"/u);
        }
        assert.equal(started.data.wake.materials.filter((material) =>
            material.category === "today_board").length, 10);
        assert.equal(started.data.wake.materials.filter((material) =>
            material.category === "weather_forecast").length, 3);

        const replayResponse = responseCapture();
        await internalHandler(request({
            issue_date: "2026-09-01",
            period_start: "2026-08-31T05:00:00+08:00",
            period_end: "2026-09-01T05:00:00+08:00",
        }), replayResponse, ["internal", "doorbell", "lingye-daily", "reporter-relay", "start"], "POST");
        const replay = JSON.parse(replayResponse.body);
        assert.equal(replay.data.status, "already_started");
        assert.deepEqual(replay.data.wake, started.data.wake);

        const pendingResponse = responseCapture();
        await internalHandler(request({ issue_date: "2026-09-01" }), pendingResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "pending"], "POST");
        const pending = JSON.parse(pendingResponse.body);
        assert.equal(pending.data.wake.wake_id, started.data.wake.wake_id);
        assert.deepEqual(Object.keys(pending.data.wake).sort(), [
            "action", "issue_date", "materials", "recipient_resident_id", "stage", "wake_id",
        ]);

        const handoffBody = {
            issue_date: "2026-09-01",
            expected_stage: "selection",
        };
        const handoffResponse = responseCapture();
        await internalHandler(request(handoffBody), handoffResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "handoff"], "POST");
        assert.equal(handoffResponse.status, 200);
        const handedOff = JSON.parse(handoffResponse.body);
        assert.deepEqual(Object.keys(handedOff.data).sort(), ["issue_date", "status", "wake"]);
        assert.equal(handedOff.data.status, "handed_off");
        assert.equal(handedOff.data.wake.stage, "selection");
        assert.notEqual(handedOff.data.wake.wake_id, started.data.wake.wake_id);
        assert.notEqual(handedOff.data.wake.recipient_resident_id,
            started.data.wake.recipient_resident_id);
        assert.deepEqual(Object.keys(handedOff.data.wake).sort(), [
            "action", "issue_date", "materials", "recipient_resident_id", "stage", "wake_id",
        ]);

        const replayHandoffResponse = responseCapture();
        await internalHandler(request(handoffBody), replayHandoffResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "handoff"], "POST");
        const replayHandoff = JSON.parse(replayHandoffResponse.body);
        assert.equal(replayHandoff.data.status, "already_handed_off");
        assert.deepEqual(replayHandoff.data.wake, handedOff.data.wake);

        const handedOffPendingResponse = responseCapture();
        await internalHandler(request({ issue_date: "2026-09-01" }), handedOffPendingResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "pending"], "POST");
        assert.deepEqual(JSON.parse(handedOffPendingResponse.body).data.wake,
            handedOff.data.wake);

        const invalidHandoffResponse = responseCapture();
        await internalHandler(request({
            issue_date: "2026-09-01",
            expected_stage: "writing",
        }), invalidHandoffResponse,
        ["internal", "doorbell", "lingye-daily", "reporter-relay", "handoff"], "POST");
        assert.equal(invalidHandoffResponse.status, 400);

        const publicationResponse = responseCapture();
        await internalHandler(request({ issue_date: "2026-09-01" }), publicationResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "publication"], "POST");
        assert.deepEqual(JSON.parse(publicationResponse.body), {
            ok: true,
            data: {
                issue_date: "2026-09-01",
                status: "pending",
                publication: null,
            },
        });

        const executor = createLingyeActionExecutor({ database, backend, now: () => now });
        const execute = (residentId, args) => executor.execute({
            residentId,
            bindingReference: `binding:${residentId}`,
            farm: null,
            op: "go.newsroom.commission",
            args,
        });
        const selectionWake = handedOff.data.wake;
        const selection = execute(selectionWake.recipient_resident_id, {
            ...selectionWake.action.args,
            text: "本期先关注今日榜单。",
        });
        assert.equal(selection.ok, true, JSON.stringify(selection));
        const writingWake = selection.data.reporter_wake;
        const writing = execute(writingWake.recipient_resident_id, {
            ...writingWake.action.args,
            text: "今日日报依据公开榜单整理，记录农场里的新鲜动静。",
        });
        assert.equal(writing.ok, true, JSON.stringify(writing));
        const reviewWake = writing.data.reporter_wake;
        const review = execute(reviewWake.recipient_resident_id, reviewWake.actions.approve.args);
        assert.equal(review.ok, true, JSON.stringify(review));
        assert.equal(database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_publications`).get().count, 0);

        now = Date.parse("2026-09-01T09:00:00+08:00");
        const candidateResponse = responseCapture();
        await internalHandler(request({ issue_date: "2026-09-01" }), candidateResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "publication"], "POST");
        const candidate = JSON.parse(candidateResponse.body);
        assert.equal(candidate.data.status, "ready");
        assert.deepEqual(Object.keys(candidate.data.publication).sort(), [
            "article_text", "publication_id", "reviewer", "scheduled_publication_at", "selector", "version", "writer",
        ]);
        assert.equal(candidate.data.publication.scheduled_publication_at, new Date(now).toISOString());
        assert.equal(database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_publications`).get().count, 0);

        const publishedBody = {
            issue_date: "2026-09-01",
            publication_id: candidate.data.publication.publication_id,
            published_at: new Date(now).toISOString(),
        };
        const publishedResponse = responseCapture();
        await internalHandler(request(publishedBody), publishedResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "published"], "POST");
        assert.deepEqual(JSON.parse(publishedResponse.body), {
            ok: true,
            data: {
                issue_date: "2026-09-01",
                status: "published",
                publication_id: candidate.data.publication.publication_id,
                published_at: new Date(now).toISOString(),
            },
        });
        assert.equal(database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_publications`).get().count, 1);

        const replayPublishedResponse = responseCapture();
        await internalHandler(request(publishedBody), replayPublishedResponse,
            ["internal", "doorbell", "lingye-daily", "reporter-relay", "published"], "POST");
        assert.equal(JSON.parse(replayPublishedResponse.body).data.status, "already_published");

        const conflictResponse = responseCapture();
        await internalHandler(request({
            ...publishedBody,
            published_at: new Date(now + 1).toISOString(),
        }), conflictResponse,
        ["internal", "doorbell", "lingye-daily", "reporter-relay", "published"], "POST");
        assert.equal(conflictResponse.status, 409);
        assert.equal(JSON.parse(conflictResponse.body).error.code, "state_conflict");
        assert.equal(database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_publications`).get().count, 1);
    }
    finally {
        database.close();
    }
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-reporter-relay-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { ensureReporterDutyRoles } = await import("../dist/career/reporter-newsroom-service.js");
const { installCareerSchema } = await import("../dist/career/schema.js");
const { careerAdvancementWorkEligibility } = await import("../dist/career/school-service.js");
const {
    acknowledgePublishedReporterRelay,
    handoffReporterRelayDuty,
    publishReadyReporterRelay,
    reporterRelayIssue,
    reporterRelayWake,
    startReporterRelayIssue,
} = await import("../dist/career/reporter-relay-service.js");
const {
    activateStoredNatureWorld,
    getPublicExpeditionWorld,
    insertFarm,
} = await import("../dist/store.js");
const { makeFarm } = await import("../dist/game.js");
const { currentDayIndex } = await import("../dist/time.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const ISSUE_DATE = "2026-09-01";
const PERIOD_START = Date.parse("2026-08-31T05:00:00+08:00");
const FIVE = Date.parse("2026-09-01T05:00:00+08:00");
const NINE = Date.parse("2026-09-01T09:00:00+08:00");
const SEPTEMBER_TWO_FIVE = Date.parse("2026-09-02T05:00:00+08:00");
const SEPTEMBER_THREE_FIVE = Date.parse("2026-09-03T05:00:00+08:00");
const RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};
const REPORTERS = ["reporter-one", "reporter-two", "reporter-three"];

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
activateStoredNatureWorld({ now: FIVE, seed: "reporter-relay-weather" });

function seedReporter(database, backend, residentId, index, dutyDate = ISSUE_DATE) {
    const bindingReference = `binding:${residentId}`;
    registerLingyeResidentReference(database, {
        residentId,
        bindingReference,
        registeredAt: FIVE,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId,
        gold: 0,
        silver: 0,
        migrationId: `economy:${residentId}`,
        idempotencyKey: `economy:${residentId}`,
    });
    database.prepare(`INSERT INTO career_tracks (
      resident_id, career, track_order, selected_at
    ) VALUES (?, 'reporter', 1, ?)`).run(residentId, FIVE);
    database.prepare(`INSERT INTO career_certificates (
      resident_id, career, qualification_level, status,
      source_attempt_id, issued_at, effective_at
    ) VALUES (?, 'reporter', 1, 'active', ?, ?, ?)`)
        .run(residentId, `certificate:${residentId}`, FIVE, FIVE);
    const employmentClass = index < 2 ? "staff" : "external";
    database.prepare(`INSERT INTO career_employments (
      employment_id, resident_id, career, institution, seat_number,
      employment_class, status, availability, hired_at
    ) VALUES (?, ?, 'reporter', 'lingye_daily', ?, ?, 'active', 'available', ?)`)
        .run(`employment:${residentId}`, residentId, index < 2 ? index + 1 : 1,
            employmentClass, FIVE);
    database.prepare(`INSERT INTO career_duty_days (
      duty_id, employment_id, resident_id, career, institution, duty_date,
      qualification_level, base_wage_gold, performance_rate_bps, status, generated_at
    ) VALUES (?, ?, ?, 'reporter', 'lingye_daily', ?, 1, 2000, ?, 'scheduled', ?)`)
        .run(`duty:${dutyDate}:${residentId}`, `employment:${residentId}`, residentId,
            dutyDate, employmentClass === "staff" ? 10_000 : 5_000, FIVE);
    return bindingReference;
}

function addDutyDay(database, dutyDate) {
    const insert = database.prepare(`INSERT INTO career_duty_days (
      duty_id, employment_id, resident_id, career, institution, duty_date,
      qualification_level, base_wage_gold, performance_rate_bps, status, generated_at
    ) SELECT ?, employment_id, resident_id, career, institution, ?,
      qualification_level, base_wage_gold, performance_rate_bps, 'scheduled', ?
      FROM career_duty_days WHERE duty_id = ?`);
    for (const residentId of REPORTERS) {
        insert.run(`duty:${dutyDate}:${residentId}`, dutyDate, FIVE,
            `duty:${ISSUE_DATE}:${residentId}`);
    }
}

function fixture() {
    const database = openLingyeWorldDatabase(":memory:");
    let now = FIVE;
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `relay:${++sequence}`,
        now: () => now,
    });
    const bindings = new Map(REPORTERS.map((residentId, index) => [
        residentId,
        seedReporter(database, backend, residentId, index),
    ]));
    const executor = createLingyeActionExecutor({ database, backend, now: () => now });
    return {
        database,
        backend,
        bindings,
        setNow(value) {
            now = value;
        },
        execute(residentId, args) {
            return executor.execute({
                residentId,
                bindingReference: bindings.get(residentId),
                farm: null,
                op: "go.newsroom.commission",
                args,
            });
        },
    };
}

function actionArgs(action, text) {
    return text === undefined ? action.args : { ...action.args, text };
}

test("career schema upgrades a legacy relay wake table with persisted payload storage", () => {
    const database = new DatabaseSync(":memory:");
    try {
        database.exec(`CREATE TABLE career_reporter_relay_wakes (
          wake_id TEXT PRIMARY KEY,
          issue_reference TEXT NOT NULL,
          stage TEXT NOT NULL,
          wake_sequence INTEGER NOT NULL,
          recipient_resident_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE (issue_reference, stage, wake_sequence)
        )`);
        installCareerSchema(database);
        assert.ok(database.prepare("PRAGMA table_info(career_reporter_relay_wakes)")
            .all().some((column) => column.name === "payload_json"));
    }
    finally {
        database.close();
    }
});

function startRelay(context) {
    return startReporterRelayIssue(context.database, context.backend, {
        issueDate: ISSUE_DATE,
        periodStart: PERIOD_START,
        periodEnd: FIVE,
        now: FIVE,
        drawInt: () => 0,
    });
}

function startRelayAt(context, issueDate, periodStart, periodEnd, drawInt = () => 0) {
    context.setNow(periodEnd);
    boardFarm.daily = {
        ...boardFarm.daily,
        day: currentDayIndex(periodEnd),
    };
    boardFarm.ranch.raidIncome = { day: currentDayIndex(periodEnd), n: 9 };
    boardFarm.ranch.raidLoss = { day: currentDayIndex(periodEnd), n: 10 };
    return startReporterRelayIssue(context.database, context.backend, {
        issueDate,
        periodStart,
        periodEnd,
        now: periodEnd,
        drawInt,
    });
}

test("reporter duty roles are random each day and frozen once persisted", () => {
    const context = fixture();
    try {
        const first = ensureReporterDutyRoles(context.database, FIVE, { drawInt: () => 0 });
        const replay = ensureReporterDutyRoles(context.database, FIVE, { drawInt: (max) => max - 1 });
        assert.deepEqual(replay, first);

        addDutyDay(context.database, "2026-09-02");
        const second = ensureReporterDutyRoles(context.database,
            Date.parse("2026-09-02T00:00:00+08:00"), { drawInt: (max) => max - 1 });
        assert.notDeepEqual(
            Object.fromEntries(second.map((entry) => [entry.role, entry.residentId])),
            Object.fromEntries(first.map((entry) => [entry.role, entry.residentId])),
        );
        assert.equal(new Set(second.map((entry) => entry.residentId)).size, 3);
    }
    finally {
        context.database.close();
    }
});

test("empty newsroom calls show only the assigned duty while that reporter's task is not issued", () => {
    const context = fixture();
    try {
        const roster = ensureReporterDutyRoles(context.database, FIVE, { drawInt: () => 0 });
        const byRole = Object.fromEntries(roster.map((entry) => [entry.role, entry.residentId]));
        const labels = { selector: "选题", writer: "撰稿", reviewer: "审稿" };
        for (const [role, residentId] of Object.entries(byRole)) {
            const pending = context.execute(residentId, {});
            assert.equal(pending.ok, true, JSON.stringify(pending));
            assert.equal(pending.text,
                `今日你在报社进行${labels[role]}任务，当前具体任务还未发放。届时会通过 bell 向你发放今日任务。`);
            assert.deepEqual(pending.data, {
                newsroom: { dutyDate: ISSUE_DATE, role, taskStatus: "not_issued" },
            });
            assert.equal(JSON.stringify(pending).includes("materials"), false);
            assert.equal(JSON.stringify(pending).includes("options"), false);
        }

        const started = startRelay(context);
        assert.equal(context.execute(byRole.selector, {}).ok, false);
        assert.equal(context.execute(byRole.writer, {}).data.newsroom.taskStatus, "not_issued");
        assert.equal(context.execute(byRole.reviewer, {}).data.newsroom.taskStatus, "not_issued");

        const selected = context.execute(byRole.selector,
            actionArgs(started.wake.action, "今天先报道榜单变化。"));
        assert.equal(selected.ok, true, JSON.stringify(selected));
        assert.equal(context.execute(byRole.writer, {}).ok, false);
        assert.equal(context.execute(byRole.reviewer, {}).data.newsroom.taskStatus, "not_issued");

        const writingWake = selected.data.reporter_wake;
        const written = context.execute(byRole.writer,
            actionArgs(writingWake.action, "榜单变化已经整理成报道。"));
        assert.equal(written.ok, true, JSON.stringify(written));
        assert.equal(context.execute(byRole.reviewer, {}).ok, false);
    }
    finally {
        context.database.close();
    }
});

test("05:00 relay persists every wake and only publishes and credits all three roles at 09:00", () => {
    const context = fixture();
    try {
        const started = startRelay(context);
        assert.equal(started.status, "started");
        assert.equal(started.wake.stage, "selection");
        assert.equal(started.wake.materials.filter((item) => item.category === "today_board").length, 10);
        assert.equal(started.wake.materials.filter((item) => item.category === "weather_forecast").length, 3);
        for (const material of started.wake.materials) {
            assert.deepEqual(Object.keys(material).sort(), ["category", "content", "occurred_at", "title"]);
            assert.equal(typeof material.content, "string");
            assert.ok(material.content.trim());
        }
        const taskBoard = started.wake.materials.find((item) =>
            item.category === "today_board" && item.title.includes("卷王榜"));
        assert.match(taskBoard.content, /1\. 日报榜单 · REPORTERBOARD — 1/u);
        const forecast = started.wake.materials.find((item) => item.category === "weather_forecast");
        assert.match(forecast.content, /^日序：\d+；季节：.+；季节日：\d+；天气：[a-z_]+$/u);
        assert.deepEqual(Object.keys(started.wake).sort(), [
            "action", "issue_date", "materials", "recipient_resident_id", "stage", "wake_id",
        ]);
        const replay = startRelay(context);
        assert.equal(replay.status, "already_started");
        assert.deepEqual(replay.wake, started.wake);

        const selector = started.wake.recipient_resident_id;
        const selectionArgs = actionArgs(started.wake.action, "今日主线关注农场榜单变化。");
        const selected = context.execute(selector, selectionArgs);
        assert.equal(selected.ok, true, JSON.stringify(selected));
        assert.deepEqual(context.execute(selector, selectionArgs), selected);
        const writingWake = selected.data.reporter_wake;
        assert.equal(writingWake.stage, "writing");
        assert.equal(writingWake.selection_text, "今日主线关注农场榜单变化。");
        assert.deepEqual(Object.keys(writingWake).sort(), [
            "action", "issue_date", "materials", "recipient_resident_id", "selection_text", "stage", "wake_id",
        ]);
        assert.deepEqual(reporterRelayWake(context.database, `lingye-daily:${ISSUE_DATE}`, FIVE), writingWake);

        const writer = writingWake.recipient_resident_id;
        const writingArgs = actionArgs(writingWake.action,
            "今天的农场榜单各有热闹，日报社据公开素材整理成稿。");
        const written = context.execute(writer, writingArgs);
        assert.equal(written.ok, true, JSON.stringify(written));
        assert.deepEqual(context.execute(writer, writingArgs), written);
        const reviewWake = written.data.reporter_wake;
        assert.equal(reviewWake.stage, "review");
        assert.equal(reviewWake.selection_text, "今日主线关注农场榜单变化。");
        assert.equal(reviewWake.article_text,
            "今天的农场榜单各有热闹，日报社据公开素材整理成稿。");
        assert.deepEqual(Object.keys(reviewWake).sort(), [
            "actions", "article_text", "issue_date", "materials", "recipient_resident_id", "selection_text", "stage", "wake_id",
        ]);
        assert.deepEqual(Object.keys(reviewWake.actions).sort(), ["approve", "reject", "supplement"]);
        assert.deepEqual(reporterRelayWake(context.database, `lingye-daily:${ISSUE_DATE}`, FIVE), reviewWake);

        const reviewer = reviewWake.recipient_resident_id;
        const approved = context.execute(reviewer, reviewWake.actions.approve.args);
        assert.equal(approved.ok, true, JSON.stringify(approved));
        assert.equal(approved.text,
            "审稿通过，稿件已准备好，等待早上 9 点并入《铃野日报》。");
        assert.equal(reporterRelayWake(context.database, `lingye-daily:${ISSUE_DATE}`, FIVE), null);
        assert.equal(context.database.prepare(`SELECT status FROM career_reporter_relay_issues`).get().status, "ready");
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM career_work_records
          WHERE career = 'reporter'`).get().count, 1);
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM career_reporter_publications`).get().count, 0);
        for (const residentId of REPORTERS) {
            assert.equal(careerAdvancementWorkEligibility(
                context.database, residentId, "reporter", 2,
            ).currentLevelExperience, 0);
        }

        assert.deepEqual(publishReadyReporterRelay(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            now: FIVE,
        }), { issueDate: ISSUE_DATE, status: "pending", publication: null });
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM career_reporter_publications`).get().count, 0);

        context.setNow(NINE);
        const candidate = publishReadyReporterRelay(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            now: NINE,
        });
        assert.equal(candidate.status, "ready");
        assert.equal(candidate.publication.article_text,
            "今天的农场榜单各有热闹，日报社据公开素材整理成稿。");
        assert.deepEqual(Object.keys(candidate.publication).sort(), [
            "article_text", "publication_id", "reviewer", "scheduled_publication_at", "selector", "version", "writer",
        ]);
        assert.equal(candidate.publication.scheduled_publication_at, new Date(NINE).toISOString());
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count FROM career_reporter_publications`).get().count, 0);
        assert.equal(context.database.prepare(`SELECT status FROM career_reporter_story_workflows`).get().status,
            "pending_review");
        for (const residentId of REPORTERS) {
            assert.equal(careerAdvancementWorkEligibility(
                context.database, residentId, "reporter", 2,
            ).currentLevelExperience, 0);
        }

        const acknowledged = acknowledgePublishedReporterRelay(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            publicationId: candidate.publication.publication_id,
            publishedAt: NINE,
            now: NINE,
        });
        assert.deepEqual(acknowledged, {
            issueDate: ISSUE_DATE,
            status: "published",
            publicationId: candidate.publication.publication_id,
            publishedAt: NINE,
        });
        assert.equal(context.database.prepare(`SELECT status FROM career_reporter_story_workflows`).get().status,
            "published");
        const records = context.database.prepare(`SELECT resident_id, performance_units
          FROM career_work_records WHERE career = 'reporter' ORDER BY resident_id`).all();
        assert.deepEqual(records.map((row) => ({ ...row })), REPORTERS.toSorted().map((residentId) => ({
            resident_id: residentId,
            performance_units: 0,
        })));
        for (const residentId of REPORTERS) {
            assert.equal(careerAdvancementWorkEligibility(
                context.database, residentId, "reporter", 2,
            ).currentLevelExperience, 1);
        }
        assert.deepEqual(acknowledgePublishedReporterRelay(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            publicationId: candidate.publication.publication_id,
            publishedAt: NINE,
            now: NINE,
        }), { ...acknowledged, status: "already_published" });
    }
    finally {
        context.database.close();
    }
});

test("an explicitly triggered missed selection is handed to the writer without crediting the original selector", () => {
    const context = fixture();
    try {
        const started = startRelay(context);
        const originalWake = started.wake;
        const before = reporterRelayIssue(context.database, ISSUE_DATE);
        const originalSelector = before.selectorResidentId;
        const originalSelectorJob = before.selectorJobId;
        const writer = before.writerResidentId;
        const reviewer = before.reviewerResidentId;

        const handedOff = handoffReporterRelayDuty(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            expectedStage: "selection",
            now: FIVE + 1,
        });
        assert.equal(handedOff.status, "handed_off");
        assert.equal(handedOff.wake.stage, "selection");
        assert.equal(handedOff.wake.recipient_resident_id, writer);
        assert.notEqual(handedOff.wake.wake_id, originalWake.wake_id);
        assert.notEqual(handedOff.wake.action.args.option, originalWake.action.args.option);
        assert.deepEqual(reporterRelayWake(context.database,
            `lingye-daily:${ISSUE_DATE}`, FIVE), handedOff.wake);
        assert.deepEqual(reporterRelayWake(context.database,
            `lingye-daily:${ISSUE_DATE}`, FIVE, "selection", 1), originalWake);

        const after = reporterRelayIssue(context.database, ISSUE_DATE);
        assert.equal(after.selectorResidentId, writer);
        assert.equal(after.writerResidentId, writer);
        assert.notEqual(after.selectorJobId, originalSelectorJob);
        assert.equal(context.backend.trustedQueries.getJob(originalSelectorJob).status, "cancelled");
        assert.equal(context.backend.trustedQueries.getJob(after.selectorJobId).workerResidentId, writer);
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
          FROM career_work_records WHERE resident_id = ?`).get(originalSelector).count, 0);

        const replay = handoffReporterRelayDuty(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            expectedStage: "selection",
            now: FIVE + 2,
        });
        assert.equal(replay.status, "already_handed_off");
        assert.deepEqual(replay.wake, handedOff.wake);
        assert.deepEqual(startRelay(context).wake, handedOff.wake);
        const stale = context.execute(originalSelector,
            actionArgs(originalWake.action, "这份迟到的选题不应再被接受。"));
        assert.equal(stale.ok, false);
        assert.equal(stale.error.code, "OPTION_NOT_AVAILABLE");
        assert.equal(context.execute(writer, {}).ok, false);

        const selected = context.execute(writer,
            actionArgs(handedOff.wake.action, "兼任选题后，先关注今日榜单。"));
        assert.equal(selected.ok, true, JSON.stringify(selected));
        const writingWake = selected.data.reporter_wake;
        assert.equal(writingWake.stage, "writing");
        assert.equal(writingWake.recipient_resident_id, writer);
        const workflow = context.database.prepare(`SELECT *
          FROM career_reporter_story_workflows`).get();
        assert.equal(workflow.selector_resident_id, writer);
        assert.equal(workflow.writer_resident_id, writer);
        assert.equal(workflow.reviewer_resident_id, reviewer);
        assert.equal(workflow.selector_job_id, after.selectorJobId);

        const written = context.execute(writer, actionArgs(writingWake.action,
            "本期报道只整理今日榜单中的公开事实。"));
        assert.equal(written.ok, true, JSON.stringify(written));
        const reviewWake = written.data.reporter_wake;
        assert.equal(reviewWake.recipient_resident_id, reviewer);
        const approved = context.execute(reviewer, reviewWake.actions.approve.args);
        assert.equal(approved.ok, true, JSON.stringify(approved));

        context.setNow(NINE);
        const candidate = publishReadyReporterRelay(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            now: NINE,
        });
        const acknowledged = acknowledgePublishedReporterRelay(context.database, context.backend, {
            issueDate: ISSUE_DATE,
            publicationId: candidate.publication.publication_id,
            publishedAt: NINE,
            now: NINE,
        });
        assert.equal(acknowledged.status, "published");
        const records = context.database.prepare(`SELECT job_id, resident_id
          FROM career_work_records WHERE career = 'reporter' ORDER BY job_id`).all();
        assert.equal(records.some((row) => row.resident_id === originalSelector), false);
        assert.equal(records.filter((row) => row.resident_id === writer).length, 2);
        assert.equal(records.filter((row) => row.resident_id === reviewer).length, 1);
    }
    finally {
        context.database.close();
    }
});

test("reviewer can request one supplement and the second review wake cannot request another", () => {
    const context = fixture();
    try {
        const selectionWake = startRelay(context).wake;
        const writingWake = context.execute(selectionWake.recipient_resident_id,
            actionArgs(selectionWake.action, "先写榜单里的新鲜变化。" )).data.reporter_wake;
        const firstReviewWake = context.execute(writingWake.recipient_resident_id,
            actionArgs(writingWake.action, "今天榜单出现了新的农场动态。" )).data.reporter_wake;
        const supplementWake = context.execute(firstReviewWake.recipient_resident_id,
            actionArgs(firstReviewWake.actions.supplement, "请补清楚榜单素材之间的联系。" )).data.reporter_wake;
        assert.equal(supplementWake.stage, "supplement");
        assert.equal(supplementWake.review_feedback,
            "请补清楚榜单素材之间的联系。");
        assert.equal(supplementWake.selection_text, "先写榜单里的新鲜变化。");
        assert.equal(supplementWake.article_text, "今天榜单出现了新的农场动态。");
        assert.deepEqual(Object.keys(supplementWake).sort(), [
            "action", "article_text", "issue_date", "materials", "recipient_resident_id",
            "review_feedback", "selection_text", "stage", "wake_id",
        ]);
        const secondReviewWake = context.execute(supplementWake.recipient_resident_id,
            actionArgs(supplementWake.action, "补充后，报道只陈述榜单公开事实。" )).data.reporter_wake;
        assert.equal(secondReviewWake.stage, "review");
        assert.equal(secondReviewWake.review_feedback,
            "请补清楚榜单素材之间的联系。");
        assert.notEqual(secondReviewWake.wake_id, firstReviewWake.wake_id);
        assert.deepEqual(Object.keys(secondReviewWake.actions).sort(), ["approve", "reject"]);
        assert.deepEqual(Object.keys(secondReviewWake).sort(), [
            "actions", "article_text", "issue_date", "materials", "recipient_resident_id",
            "review_feedback", "selection_text", "stage", "wake_id",
        ]);
        assert.deepEqual(reporterRelayWake(context.database,
            `lingye-daily:${ISSUE_DATE}`, FIVE, "review", 1), firstReviewWake);
        assert.deepEqual(reporterRelayWake(context.database,
            `lingye-daily:${ISSUE_DATE}`, FIVE, "review", 2), secondReviewWake);
        assert.notEqual(writingWake.action.args.option, supplementWake.action.args.option);
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_relay_wakes WHERE payload_json IS NOT NULL`).get().count, 5);
        assert.equal(reporterRelayIssue(context.database, ISSUE_DATE).supplementCount, 1);
    }
    finally {
        context.database.close();
    }
});

test("relay actions require the assigned reporter's live same-day duty and reject unsupported numbers", () => {
    const context = fixture();
    try {
        const selectionWake = startRelay(context).wake;
        context.database.prepare(`UPDATE career_employments
          SET availability = 'leave' WHERE resident_id = ?`)
            .run(selectionWake.recipient_resident_id);
        const unavailable = context.execute(selectionWake.recipient_resident_id,
            actionArgs(selectionWake.action, "选择今日榜单作为报道主线。"));
        assert.equal(unavailable.ok, false);
        assert.equal(unavailable.error.code, "OPTION_NOT_AVAILABLE");
        context.database.prepare(`UPDATE career_employments
          SET availability = 'available' WHERE resident_id = ?`)
            .run(selectionWake.recipient_resident_id);

        const writingWake = context.execute(selectionWake.recipient_resident_id,
            actionArgs(selectionWake.action, "选择今日榜单作为报道主线。")).data.reporter_wake;
        const unsupported = context.execute(writingWake.recipient_resident_id,
            actionArgs(writingWake.action, "今天榜单里出现了完全没有素材依据的 999 条记录。"));
        assert.equal(unsupported.ok, false);
        assert.equal(unsupported.error.code, "OP_REJECTED");
        assert.equal(reporterRelayIssue(context.database, ISSUE_DATE).status, "writer_pending");
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_articles`).get().count, 0);
    }
    finally {
        context.database.close();
    }
});

test("Together materials baseline old history, include only new events, and raw inputs retain two issues", () => {
    const world = getPublicExpeditionWorld();
    const original = structuredClone(world);
    const context = fixture();
    try {
        world.storyId = "reporter_relay_delta";
        world.round = 1;
        world.history = [{ kind: "story", title: "旧共行记录", text: "窗口前已经存在" }];

        const first = startRelay(context);
        assert.equal(first.wake.materials.some((item) => item.category === "lingye_together"), false);

        addDutyDay(context.database, "2026-09-02");
        world.history.push({
            kind: "story",
            title: "新共行事件",
            text: "本期观察窗口内新增",
            internalSecret: "不得外送",
            voters: [{ residentId: "private-resident", at: SEPTEMBER_TWO_FIVE - 1 }],
        });
        const second = startRelayAt(context, "2026-09-02", FIVE, SEPTEMBER_TWO_FIVE);
        const together = second.wake.materials.filter((item) => item.category === "lingye_together");
        assert.equal(together.length, 1);
        assert.equal(together[0].title, "新共行事件");
        assert.equal(together[0].content, "本期观察窗口内新增");
        assert.equal(typeof together[0].content, "string");
        assert.doesNotMatch(together[0].content,
            /internalSecret|private-resident|story_id|history_index|voters|不得外送/u);

        addDutyDay(context.database, "2026-09-03");
        const third = startRelayAt(context, "2026-09-03", SEPTEMBER_TWO_FIVE,
            SEPTEMBER_THREE_FIVE);
        assert.equal(third.wake.materials.some((item) => item.category === "lingye_together"), false);

        const firstIssue = context.database.prepare(`SELECT raw_pruned_at
          FROM career_reporter_relay_issues WHERE issue_date = '2026-09-01'`).get();
        assert.equal(firstIssue.raw_pruned_at, SEPTEMBER_THREE_FIVE);
        assert.equal(context.database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_relay_materials WHERE issue_reference = 'lingye-daily:2026-09-01'`).get().count, 0);
        assert.ok(context.database.prepare(`SELECT COUNT(*) AS count
          FROM career_reporter_relay_materials WHERE issue_reference = 'lingye-daily:2026-09-02'`).get().count > 0);
        assert.deepEqual(JSON.parse(context.database.prepare(`SELECT source_ids_json
          FROM career_reporter_material_packs WHERE issue_reference = 'lingye-daily:2026-09-01'`).get().source_ids_json), []);
    }
    finally {
        for (const key of Object.keys(world))
            delete world[key];
        Object.assign(world, original);
        context.database.close();
    }
});

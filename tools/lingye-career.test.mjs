import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
    CareerDomainError,
    COURSE_TUITION_GOLD,
    EXAM_FEE_GOLD,
} from "../dist/career/contracts.js";
import { CareerEmploymentService } from "../dist/career/employment-service.js";
import { CareerJobService } from "../dist/career/job-service.js";
import {
    CAREER_CURRICULUM_VERSION,
    careerCourseAvailability,
    careerCourseContent,
    careerExamAvailability,
} from "../dist/career/curriculum.js";
import {
    beijingTimestamp,
    isBeijingExamDay,
    isBeijingExamSessionOpen,
    nextExamSessionAt,
    nextInterviewSessionAt,
    recordFinancialReceipt,
} from "../dist/career/persistence.js";
import { installCareerSchema } from "../dist/career/schema.js";
import { CareerSchoolService } from "../dist/career/school-service.js";
import { installEconomySchema } from "../dist/economy/economy-schema.js";
import { EconomyService } from "../dist/economy/economy-service.js";
import { runLingyeWorldTransaction } from "../dist/lingye-world-database.js";
const TEST_CURRICULUM_VERSION = "career-test-bank-v1";

test("career school uses the approved 1.5x tuition and exam fees", () => {
    assert.deepEqual(COURSE_TUITION_GOLD, {
        1: 30_000,
        2: 120_000,
        3: 270_000,
        4: 540_000,
    });
    assert.deepEqual(EXAM_FEE_GOLD, {
        1: 60_000,
        2: 240_000,
        3: 540_000,
        4: 1_080_000,
    });
    assert.deepEqual(Object.values(EXAM_FEE_GOLD).map((fee) => fee / 2), [
        30_000,
        120_000,
        270_000,
        540_000,
    ]);
});
const TEST_CONSTABLE_INTERVIEW_BANK = Object.freeze({
    getConstableInterviewPaper: ({ interviewId, candidateResidentId, scheduledAt }) => ({
        bankVersion: "constable-interview-test-bank-v1",
        paper: { interviewId, candidateResidentId, scheduledAt, questionIds: ["test-question-1"] },
        factMaterial: { sourceIds: ["test-fact-1"] },
        scoringStandard: {
            version: "constable-interview-rubric-v1",
            dimensions: ["facts", "restraint", "procedure", "explanation"],
            minimumDimensionAverage: 3,
            minimumTotalAverage: 16,
        },
    }),
});

test("exam calendar resolves only Tuesday, Thursday, and Saturday in Beijing time", () => {
    assert.equal(nextExamSessionAt(beijingTimestamp("2026-08-31", 23)),
        beijingTimestamp("2026-09-01", 14));
    assert.equal(nextExamSessionAt(beijingTimestamp("2026-09-01", 13, 59)),
        beijingTimestamp("2026-09-01", 14));
    assert.equal(nextExamSessionAt(beijingTimestamp("2026-09-01", 14)),
        beijingTimestamp("2026-09-01", 14));
    assert.equal(nextExamSessionAt(beijingTimestamp("2026-09-01", 18)),
        beijingTimestamp("2026-09-03", 14));
    assert.equal(nextExamSessionAt(beijingTimestamp("2026-09-02", 12)),
        beijingTimestamp("2026-09-03", 14));
    assert.equal(nextExamSessionAt(beijingTimestamp("2026-09-04", 12)),
        beijingTimestamp("2026-09-05", 14));
    assert.equal(nextExamSessionAt(beijingTimestamp("2026-09-06", 12)),
        beijingTimestamp("2026-09-08", 14));
    assert.equal(isBeijingExamDay(beijingTimestamp("2026-09-01", 23, 59)), true);
    assert.equal(isBeijingExamDay(beijingTimestamp("2026-09-02", 0)), false);
    const tuesdaySession = beijingTimestamp("2026-09-01", 14);
    assert.equal(isBeijingExamSessionOpen(tuesdaySession - 1, tuesdaySession), false);
    assert.equal(isBeijingExamSessionOpen(tuesdaySession, tuesdaySession), true);
    assert.equal(isBeijingExamSessionOpen(tuesdaySession + 2 * 60 * 60 * 1_000 - 1, tuesdaySession), true);
    assert.equal(isBeijingExamSessionOpen(tuesdaySession + 2 * 60 * 60 * 1_000, tuesdaySession), false);
});

test("constable interviews only use a 20:00 session with a complete 08:00 signup window", () => {
    assert.equal(nextInterviewSessionAt(beijingTimestamp("2026-09-01", 7, 59)),
        beijingTimestamp("2026-09-01", 20));
    assert.equal(nextInterviewSessionAt(beijingTimestamp("2026-09-01", 8)),
        beijingTimestamp("2026-09-02", 20));
    assert.equal(nextInterviewSessionAt(beijingTimestamp("2026-09-01", 15)),
        beijingTimestamp("2026-09-02", 20));
});

function testPaper(kind, targetKey, count) {
    const questions = Array.from({ length: count }, (_, index) => ({
        id: `${targetKey}:question:${index + 1}`,
        stem: `Test question ${index + 1}`,
        options: { A: "A", B: "B", C: "C", D: "D" },
        answer: "A",
        explanation: `Test explanation ${index + 1}`,
    }));
    return {
        kind,
        targetKey,
        bankVersion: TEST_CURRICULUM_VERSION,
        publicPaper: questions.map(({ answer: _answer, explanation: _explanation, ...question }) => question),
        answerKey: questions.map((question) => question.answer),
        review: questions.map((question) => ({
            id: question.id,
            correctAnswer: question.answer,
            explanation: question.explanation,
        })),
    };
}
const TEST_CURRICULUM = Object.freeze({
    careerCourseAvailability: (_career, level, courseIndex) => level >= 1 && level <= 4 && courseIndex >= 1 && courseIndex <= 3,
    careerCourseContent: (career, level, courseIndex) => ({
        career,
        level,
        courseIndex,
        title: `Test ${career} ${level}-${courseIndex}`,
        contentMarkdown: `Test course content for ${career} ${level}-${courseIndex}.`,
        bankVersion: TEST_CURRICULUM_VERSION,
    }),
    careerExamAvailability: (_career, level) => level >= 1 && level <= 4,
    createCoursePracticePaper: (career, level, courseIndex, residentId) => testPaper(
        "course_practice",
        `course:${residentId}:${career}:${level}:${courseIndex}`,
        5,
    ),
    createWrittenExamPaper: (career, level, attemptId) => testPaper(
        "written_exam",
        `exam:${attemptId}`,
        20,
    ),
});
function createHarness(initialNow = beijingTimestamp("2026-08-26", 11)) {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`CREATE TABLE residents (
      resident_id TEXT PRIMARY KEY,
      resident_name TEXT NOT NULL
    )`);
    installEconomySchema(database);
    let now = initialNow;
    let id = 0;
    const generateId = () => `generated-${++id}`;
    const economy = new EconomyService(database, {
        rules: {
            minimumSystemLoanCreditDays: 5,
            restrictedDailyGoldLimit: 1_000_000,
            restrictedDailySilverLimit: 10_000,
        },
        generateId,
        now: () => now,
    });
    const reservationIds = new Map();
    const ensureAccount = (residentId) => {
        database
            .prepare("INSERT OR IGNORE INTO residents (resident_id, resident_name) VALUES (?, ?)")
            .run(residentId, residentId);
        if (database.prepare("SELECT 1 FROM economy_accounts WHERE resident_id = ?").get(residentId))
            return;
        economy.importLegacyBalances({
            residentId,
            gold: 20_000_000,
            silver: 20_000,
            migrationId: `career-test:${residentId}`,
            idempotencyKey: `career-test:import:${residentId}`,
        });
    };
    const reservationKey = (residentId, businessReference) => `${residentId}:${businessReference.replace(/:(reserve|settle|release)$/, "")}`;
    const school = new CareerSchoolService({
        database,
        generateId,
        now: () => now,
        curriculum: TEST_CURRICULUM,
        constableInterviewBank: TEST_CONSTABLE_INTERVIEW_BANK,
    });
    const employment = new CareerEmploymentService({ database, generateId, now: () => now });
    const job = new CareerJobService({ database, generateId, now: () => now });
    return {
        database,
        economy,
        employment,
        ensureAccount,
        job,
        receipt(input) {
            ensureAccount(input.residentId);
            const idempotencyKey = `career-test:${input.kind}:${input.businessReference}`;
            if (input.kind === "system_gold_charge") {
                return economy.chargeToSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    actor: "human",
                    businessType: "career_test",
                    businessRef: input.businessReference,
                    idempotencyKey,
                }).financialReceipt;
            }
            if (input.kind === "system_gold_credit") {
                return economy.creditFromSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    businessType: "career_test",
                    businessRef: input.businessReference,
                    idempotencyKey,
                }).financialReceipt;
            }
            if (input.kind === "system_gold_reserve") {
                const reserved = economy.reserveSystemGold({
                    residentId: input.residentId,
                    amount: input.amount,
                    actor: "human",
                    businessReference: input.businessReference,
                    idempotencyKey,
                });
                reservationIds.set(reservationKey(input.residentId, input.businessReference), reserved.reservation_id);
                return reserved.financialReceipt;
            }
            if (input.kind === "system_gold_settle" || input.kind === "system_gold_release") {
                const reservationId = reservationIds.get(reservationKey(input.residentId, input.businessReference));
                assert.ok(reservationId);
                const settled = input.kind === "system_gold_settle"
                    ? economy.settleSystemGoldReservation({
                        reservationId,
                        businessReference: input.businessReference,
                        idempotencyKey,
                    })
                    : economy.releaseSystemGoldReservation({
                        reservationId,
                        businessReference: input.businessReference,
                        idempotencyKey,
                    });
                return settled.financialReceipt;
            }
            if (input.kind === "player_silver_settle") {
                const payerResidentId = `career-payer:${input.residentId}`;
                ensureAccount(payerResidentId);
                const trade = economy.createTrade({
                    payerResidentId,
                    payeeResidentId: input.residentId,
                    currency: "silver",
                    amount: input.amount,
                    businessType: "career_test",
                    businessRef: input.businessReference,
                    idempotencyKey: `${idempotencyKey}:create`,
                });
                economy.confirmTrade({
                    tradeId: trade.trade_id,
                    actorResidentId: input.residentId,
                    idempotencyKey: `${idempotencyKey}:confirm-payee`,
                });
                economy.confirmTrade({
                    tradeId: trade.trade_id,
                    actorResidentId: payerResidentId,
                    idempotencyKey: `${idempotencyKey}:confirm-payer`,
                });
                return economy.settleTrade({
                    tradeId: trade.trade_id,
                    idempotencyKey: `${idempotencyKey}:settle`,
                }).financialReceipt;
            }
            throw new Error(`Unsupported test receipt kind: ${input.kind}`);
        },
        school,
        setNow(value) {
            now = value;
        },
    };
}
function assertCareerError(code) {
    return (error) => error instanceof CareerDomainError && error.code === code;
}
function goldReceipt(harness, residentId, kind, amount, businessReference) {
    return harness.receipt({
        amount,
        businessReference,
        currency: "gold",
        kind,
        residentId,
    });
}
function seedCertificate(harness, residentId, career, level) {
    harness.database
        .prepare(`INSERT OR IGNORE INTO career_tracks (resident_id, career, track_order, selected_at)
       VALUES (?, ?, 1, 1)`)
        .run(residentId, career);
    for (let current = 1; current <= level; current += 1) {
        harness.database
            .prepare(`INSERT INTO career_certificates (
           resident_id, career, qualification_level, status, source_attempt_id, issued_at, effective_at
         ) VALUES (?, ?, ?, 'active', ?, 1, 1)`)
            .run(residentId, career, current, `seed-${residentId}-${career}-${current}`);
    }
}
let assessmentSubmissionSequence = 0;
function answersForScore(answerKey, correctAnswers) {
    return answerKey.map((answer, index) => index < correctAnswers
        ? answer
        : ({ A: "B", B: "C", C: "D", D: "A" })[answer]);
}
function submitPracticeScore(harness, input, correctAnswers, idempotencyKey = `practice-test-${++assessmentSubmissionSequence}`) {
    const paper = harness.database
        .prepare(`SELECT paper_id, answer_key_json FROM career_assessment_papers
       WHERE target_key = ?`)
        .get(`course:${input.residentId}:${input.career}:${input.level}:${input.courseIndex}`);
    const answerData = JSON.parse(paper.answer_key_json);
    return harness.school.submitCoursePractice({
        ...input,
        paperId: paper.paper_id,
        answers: answersForScore(answerData.answers ?? answerData, correctAnswers),
        idempotencyKey,
    });
}
function submitExamScore(harness, attemptId, correctAnswers, idempotencyKey = `exam-test-${++assessmentSubmissionSequence}`) {
    const paper = harness.database
        .prepare(`SELECT paper_id, answer_key_json FROM career_assessment_papers
       WHERE exam_attempt_id = ?`)
        .get(attemptId);
    const answerData = JSON.parse(paper.answer_key_json);
    return harness.school.submitWrittenExam({
        attemptId,
        paperId: paper.paper_id,
        answers: answersForScore(answerData.answers ?? answerData, correctAnswers),
        idempotencyKey,
    });
}
function deliverAndReadCourse(harness, input) {
    const content = harness.school.getCourseContent(input);
    harness.school.markCourseContentRead({
        ...input,
        contentDeliveryId: content.contentDeliveryId,
    });
    return content;
}
function completeLevelOneCourses(harness, residentId, career) {
    for (const courseIndex of [1, 2, 3]) {
        harness.school.enrollCourse({
            career,
            courseIndex,
            level: 1,
            residentId,
            tuitionReceipt: goldReceipt(harness, residentId, "system_gold_charge", COURSE_TUITION_GOLD[1], `career-course:${residentId}:${career}:1:${courseIndex}`),
        });
        deliverAndReadCourse(harness, { career, courseIndex, level: 1, residentId });
        assert.equal(submitPracticeScore(harness, {
            career,
            courseIndex,
            level: 1,
            residentId,
        }, 4).passed, true);
    }
}
test("career schema is idempotent and leaves the owning database version untouched", () => {
    const database = new DatabaseSync(":memory:");
    try {
        database.exec("PRAGMA user_version = 7");
        database.exec(`CREATE TABLE residents (
          resident_id TEXT PRIMARY KEY,
          resident_name TEXT NOT NULL
        )`);
        installEconomySchema(database);
        installCareerSchema(database);
        installCareerSchema(database);
        assert.equal(database.prepare("PRAGMA user_version").get().user_version, 7);
        assert.deepEqual(database
            .prepare(`SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'career_tracks', 'career_courses', 'career_certificates',
             'career_employments', 'career_duty_days', 'career_jobs', 'career_job_object_locks'
           ) ORDER BY name`)
            .all()
            .map((row) => ({ ...row })), [
            { name: "career_certificates" },
            { name: "career_courses" },
            { name: "career_duty_days" },
            { name: "career_employments" },
            { name: "career_job_object_locks" },
            { name: "career_jobs" },
            { name: "career_tracks" },
        ]);
    }
    finally {
        database.close();
    }
});
test("career schema adds frozen course delivery and exam no-show columns without inventing legacy content", () => {
    const database = new DatabaseSync(":memory:");
    try {
        database.exec(`
          CREATE TABLE residents (
            resident_id TEXT PRIMARY KEY,
            resident_name TEXT NOT NULL
          );
          CREATE TABLE career_courses (
            resident_id TEXT NOT NULL,
            career TEXT NOT NULL,
            qualification_level INTEGER NOT NULL,
            course_index INTEGER NOT NULL,
            tuition_receipt_id TEXT NOT NULL UNIQUE,
            enrolled_at INTEGER NOT NULL,
            content_read_at INTEGER,
            completed_at INTEGER,
            best_correct_answers INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (resident_id, career, qualification_level, course_index)
          );
          CREATE TABLE career_exam_attempts (
            attempt_id TEXT PRIMARY KEY,
            resident_id TEXT NOT NULL,
            career TEXT NOT NULL,
            qualification_level INTEGER NOT NULL,
            scheduled_at INTEGER NOT NULL,
            registration_status TEXT NOT NULL,
            reservation_receipt_id TEXT NOT NULL UNIQUE,
            settlement_receipt_id TEXT UNIQUE,
            release_receipt_id TEXT UNIQUE,
            correct_answers INTEGER,
            registered_at INTEGER NOT NULL,
            started_at INTEGER,
            ended_at INTEGER
          );
          INSERT INTO career_courses (
            resident_id, career, qualification_level, course_index,
            tuition_receipt_id, enrolled_at
          ) VALUES ('legacy', 'reporter', 1, 1, 'legacy-receipt', 1);
        `);
        installEconomySchema(database);
        installCareerSchema(database);
        const columns = new Set(database
            .prepare("PRAGMA table_info(career_courses)")
            .all()
            .map((column) => column.name));
        for (const name of [
            "content_bank_version",
            "content_snapshot_json",
            "content_delivery_id",
            "content_delivered_at",
        ]) {
            assert.equal(columns.has(name), true);
        }
        const examColumns = new Set(database
            .prepare("PRAGMA table_info(career_exam_attempts)")
            .all()
            .map((column) => column.name));
        assert.equal(examColumns.has("missed_session_at"), true);
        assert.deepEqual({ ...database
            .prepare(`SELECT content_bank_version, content_snapshot_json,
                     content_delivery_id, content_delivered_at
              FROM career_courses WHERE resident_id = 'legacy'`)
            .get() }, {
            content_bank_version: null,
            content_snapshot_json: null,
            content_delivery_id: null,
            content_delivered_at: null,
        });
    }
    finally {
        database.close();
    }
});
test("runtime curriculum opens approved courses but keeps exams fail closed without the private bank", () => {
    assert.equal(CAREER_CURRICULUM_VERSION, "career-curriculum-2026-08-27.1");
    assert.equal(careerCourseAvailability("agronomist", 1, 1), true);
    assert.equal(careerCourseAvailability("chef", 4, 1), true);
    assert.equal(careerCourseAvailability("chef", 4, 3), false);
    assert.equal(careerCourseAvailability("veterinarian", 3, 3), true);
    assert.equal(careerCourseAvailability("veterinarian", 3, 1), false);
    assert.equal(careerCourseAvailability("constable", 4, 1), true);
    assert.equal(careerCourseAvailability("constable", 4, 2), false);
    assert.equal(careerCourseAvailability("reporter", 1, 1), false);
    assert.equal(careerExamAvailability("constable", 4), false);
    assert.equal(careerCourseContent("agronomist", 1, 1).career, "agronomist");
    const paper = TEST_CURRICULUM.createCoursePracticePaper("agronomist", 1, 1, "reader-resident");
    assert.equal(paper.publicPaper.length, 5);
    assert.deepEqual(Object.keys(paper.publicPaper[0]).sort(), ["id", "options", "stem"]);
    assert.equal(Object.hasOwn(paper.publicPaper[0], "answer"), false);
    assert.throws(
        () => careerCourseContent("reporter", 1, 1),
        assertCareerError("assessment_content_not_available"),
    );
});
test("course enrollment freezes one content bank and read confirmation requires that delivery", () => {
    const harness = createHarness();
    try {
        const input = {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "frozen-course-resident",
        };
        harness.school.selectCareer(input.residentId, input.career);
        const enrollment = harness.school.enrollCourse({
            ...input,
            tuitionReceipt: goldReceipt(
                harness,
                input.residentId,
                "system_gold_charge",
                COURSE_TUITION_GOLD[1],
                "career-course:frozen-course-resident:reporter:1:1",
            ),
        });
        const stored = harness.database
            .prepare(`SELECT content_bank_version, content_snapshot_json, content_delivery_id,
                       content_delivered_at, content_read_at
                FROM career_courses
                WHERE resident_id = ? AND career = ?
                  AND qualification_level = ? AND course_index = ?`)
            .get(input.residentId, input.career, input.level, input.courseIndex);
        assert.equal(stored.content_bank_version, enrollment.bankVersion);
        assert.deepEqual(
            JSON.parse(stored.content_snapshot_json),
            TEST_CURRICULUM.careerCourseContent("reporter", 1, 1),
        );
        assert.equal(stored.content_delivery_id, null);
        assert.equal(stored.content_delivered_at, null);
        assert.equal(stored.content_read_at, null);
        assert.throws(
            () => harness.school.markCourseContentRead(input),
            assertCareerError("course_content_delivery_mismatch"),
        );
        const delivered = harness.school.getCourseContent(input);
        assert.equal(delivered.bankVersion, enrollment.bankVersion);
        assert.ok(delivered.contentDeliveryId);
        assert.equal(harness.school.getCourseContent(input).contentDeliveryId, delivered.contentDeliveryId);
        assert.throws(
            () => harness.school.markCourseContentRead({
                ...input,
                contentDeliveryId: "another-delivery",
            }),
            assertCareerError("course_content_delivery_mismatch"),
        );
        harness.school.markCourseContentRead({
            ...input,
            contentDeliveryId: delivered.contentDeliveryId,
        });
        assert.notEqual(harness.database
            .prepare(`SELECT content_read_at FROM career_courses
                WHERE resident_id = ? AND career = ?
                  AND qualification_level = ? AND course_index = ?`)
            .get(input.residentId, input.career, input.level, input.courseIndex).content_read_at, null);

        const mismatchedInput = {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "mismatched-paper-resident",
        };
        harness.school.selectCareer(mismatchedInput.residentId, mismatchedInput.career);
        harness.school.enrollCourse({
            ...mismatchedInput,
            tuitionReceipt: goldReceipt(
                harness,
                mismatchedInput.residentId,
                "system_gold_charge",
                COURSE_TUITION_GOLD[1],
                "career-course:mismatched-paper-resident:reporter:1:1",
            ),
        });
        harness.database
            .prepare("UPDATE career_assessment_papers SET bank_version = 'newer-bank' WHERE target_key = ?")
            .run("course:mismatched-paper-resident:reporter:1:1");
        assert.throws(
            () => harness.school.getCourseContent(mismatchedInput),
            assertCareerError("assessment_paper_mismatch"),
        );

        const legacyInput = {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "legacy-course-resident",
        };
        harness.school.selectCareer(legacyInput.residentId, legacyInput.career);
        harness.school.enrollCourse({
            ...legacyInput,
            tuitionReceipt: goldReceipt(
                harness,
                legacyInput.residentId,
                "system_gold_charge",
                COURSE_TUITION_GOLD[1],
                "career-course:legacy-course-resident:reporter:1:1",
            ),
        });
        harness.database
            .prepare(`UPDATE career_courses
                SET content_bank_version = NULL, content_snapshot_json = NULL
                WHERE resident_id = ? AND career = ?
                  AND qualification_level = ? AND course_index = ?`)
            .run(legacyInput.residentId, legacyInput.career, legacyInput.level, legacyInput.courseIndex);
        assert.throws(
            () => harness.school.getCourseContent(legacyInput),
            assertCareerError("assessment_content_not_available"),
        );
    }
    finally {
        harness.database.close();
    }
});
test("career financial receipts require an authoritative economy journal and balanced ledger", () => {
    const harness = createHarness();
    try {
        const residentId = "receipt-resident";
        const reserved = harness.receipt({
            amount: 500,
            businessReference: "career-test:receipt-authority:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId,
        });
        assert.ok(reserved.receiptId);
        const released = harness.receipt({
            amount: 500,
            businessReference: "career-test:receipt-authority:release",
            currency: "gold",
            kind: "system_gold_release",
            residentId,
        });
        const expectedRelease = {
            amount: 500,
            businessReference: "career-test:receipt-authority:release",
            currency: "gold",
            kind: "system_gold_release",
            residentId,
        };
        recordFinancialReceipt(harness.database, released, expectedRelease, beijingTimestamp("2026-08-26", 11));
        assert.throws(() => recordFinancialReceipt(harness.database, {
            ...released,
            amount: 501,
        }, expectedRelease, beijingTimestamp("2026-08-26", 11)), assertCareerError("financial_receipt_mismatch"));
        assert.throws(() => recordFinancialReceipt(harness.database, {
            ...expectedRelease,
            receiptId: "missing-economy-journal",
        }, expectedRelease, beijingTimestamp("2026-08-26", 11)), assertCareerError("financial_receipt_unverified"));
        harness.ensureAccount("ledgerless-resident");
        harness.database
            .prepare(`INSERT INTO economy_journals (
              journal_id, command_type, business_ref, payload_hash, result_json, created_at
            ) VALUES (?, ?, ?, ?, '{}', ?)`)
            .run("ledgerless-journal", "system.credit.career_test", "career-test:ledgerless", "0".repeat(64), beijingTimestamp("2026-08-26", 11));
        harness.database
            .prepare(`INSERT INTO economy_financial_receipts (
              receipt_id, resident_id, kind, currency, amount, business_reference, created_at
            ) VALUES (?, ?, 'system_gold_credit', 'gold', 100, ?, ?)`)
            .run("ledgerless-journal", "ledgerless-resident", "career-test:ledgerless", beijingTimestamp("2026-08-26", 11));
        const ledgerlessReceipt = {
            amount: 100,
            businessReference: "career-test:ledgerless",
            currency: "gold",
            kind: "system_gold_credit",
            receiptId: "ledgerless-journal",
            residentId: "ledgerless-resident",
        };
        assert.throws(() => recordFinancialReceipt(harness.database, ledgerlessReceipt, ledgerlessReceipt, beijingTimestamp("2026-08-26", 11)), assertCareerError("financial_receipt_unverified"));
    }
    finally {
        harness.database.close();
    }
});
test("school enforces ordered paid courses, read-and-practice completion, scheduled exam days, and retake fees", () => {
    const harness = createHarness();
    try {
        assert.deepEqual(harness.school.selectCareer("resident-1", "reporter"), {
            career: "reporter",
            trackOrder: 1,
        });
        assert.throws(() => harness.school.selectCareer("resident-1", "chef"), assertCareerError("secondary_career_locked"));
        assert.throws(() => harness.school.enrollCourse({
            career: "reporter",
            courseIndex: 2,
            level: 1,
            residentId: "resident-1",
            tuitionReceipt: goldReceipt(harness, "resident-1", "system_gold_charge", COURSE_TUITION_GOLD[1], "career-course:resident-1:reporter:1:2"),
        }), assertCareerError("previous_course_required"));
        const courseOneReceipt = goldReceipt(harness, "resident-1", "system_gold_charge", COURSE_TUITION_GOLD[1], "career-course:resident-1:reporter:1:1");
        harness.school.enrollCourse({
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
            tuitionReceipt: courseOneReceipt,
        });
        assert.throws(() => submitPracticeScore(harness, {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        }, 5), assertCareerError("course_content_not_read"));
        deliverAndReadCourse(harness, {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        });
        const failedPractice = submitPracticeScore(harness, {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        }, 3);
        assert.deepEqual({
            bestCorrectAnswers: failedPractice.bestCorrectAnswers,
            correctAnswers: failedPractice.correctAnswers,
            passed: failedPractice.passed,
        }, { bestCorrectAnswers: 3, correctAnswers: 3, passed: false });
        assert.equal(failedPractice.review.length, 5);
        assert.equal(submitPracticeScore(harness, {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        }, 4).passed, true);
        const replayablePractice = {
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        };
        const firstReplayableResult = submitPracticeScore(
            harness,
            replayablePractice,
            5,
            "practice-exact-replay",
        );
        assert.deepEqual(
            submitPracticeScore(harness, replayablePractice, 5, "practice-exact-replay"),
            firstReplayableResult,
        );
        assert.throws(
            () => submitPracticeScore(harness, replayablePractice, 4, "practice-exact-replay"),
            assertCareerError("assessment_submission_conflict"),
        );
        for (const courseIndex of [2, 3]) {
            harness.school.enrollCourse({
                career: "reporter",
                courseIndex,
                level: 1,
                residentId: "resident-1",
                tuitionReceipt: goldReceipt(harness, "resident-1", "system_gold_charge", COURSE_TUITION_GOLD[1], `career-course:resident-1:reporter:1:${courseIndex}`),
            });
            deliverAndReadCourse(harness, {
                career: "reporter",
                courseIndex,
                level: 1,
                residentId: "resident-1",
            });
            submitPracticeScore(harness, {
                career: "reporter",
                courseIndex,
                level: 1,
                residentId: "resident-1",
            }, 5);
        }
        const first = harness.school.registerExam({
            attemptId: "attempt-1",
            career: "reporter",
            level: 1,
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", EXAM_FEE_GOLD[1], "career-exam:attempt-1:reserve"),
            residentId: "resident-1",
        });
        assert.equal(first.scheduledAt, beijingTimestamp("2026-08-27", 14));
        harness.setNow(first.scheduledAt);
        harness.school.startExam(first.attemptId, goldReceipt(harness, "resident-1", "system_gold_settle", EXAM_FEE_GOLD[1], "career-exam:attempt-1:settle"));
        assert.deepEqual(submitExamScore(harness, first.attemptId, 17), {
            status: "failed",
            correctAnswers: 17,
            passed: false,
        });
        const retake = harness.school.registerExam({
            attemptId: "attempt-2",
            career: "reporter",
            level: 1,
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", EXAM_FEE_GOLD[1] / 2, "career-exam:attempt-2:reserve"),
            residentId: "resident-1",
        });
        assert.equal(retake.feeGold, EXAM_FEE_GOLD[1] / 2);
        harness.setNow(retake.scheduledAt);
        harness.school.startExam(retake.attemptId, goldReceipt(harness, "resident-1", "system_gold_settle", EXAM_FEE_GOLD[1] / 2, "career-exam:attempt-2:settle"));
        assert.deepEqual(submitExamScore(harness, retake.attemptId, 18), {
            status: "passed",
            correctAnswers: 18,
            passed: true,
        });
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT qualification_level, status FROM career_certificates
           WHERE resident_id = 'resident-1' AND career = 'reporter'`)
            .get() }, { qualification_level: 1, status: "active" });
        for (const courseIndex of [1, 2, 3]) {
            harness.school.enrollCourse({
                career: "reporter",
                courseIndex,
                level: 2,
                residentId: "resident-1",
                tuitionReceipt: goldReceipt(harness, "resident-1", "system_gold_charge", COURSE_TUITION_GOLD[2], `career-course:resident-1:reporter:2:${courseIndex}`),
            });
            deliverAndReadCourse(harness, {
                career: "reporter",
                courseIndex,
                level: 2,
                residentId: "resident-1",
            });
            submitPracticeScore(harness, {
                career: "reporter",
                courseIndex,
                level: 2,
                residentId: "resident-1",
            }, 4);
        }
        assert.throws(() => harness.school.registerExam({
            attemptId: "attempt-level-2",
            career: "reporter",
            level: 2,
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", EXAM_FEE_GOLD[2], "career-exam:attempt-level-2:reserve"),
            residentId: "resident-1",
        }), assertCareerError("work_record_requirement_not_met"));
        const insertWorkRecord = harness.database.prepare(`INSERT INTO career_work_records (
         work_record_id, job_id, resident_id, career, qualification_level,
         difficulty_level, record_kind, performance_units, recorded_at
       ) VALUES (?, ?, 'resident-1', 'reporter', 1, 1, 'completed', 1, ?)`);
        for (let index = 1; index <= 10; index += 1) {
            insertWorkRecord.run(`seed-work-${index}`, `seed-job-${index}`, index);
        }
        assert.equal(harness.school.registerExam({
            attemptId: "attempt-level-2",
            career: "reporter",
            level: 2,
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", EXAM_FEE_GOLD[2], "career-exam:attempt-level-2:reserve"),
            residentId: "resident-1",
        }).feeGold, EXAM_FEE_GOLD[2]);
        for (const level of [2, 3]) {
            harness.database
                .prepare(`INSERT INTO career_certificates (
             resident_id, career, qualification_level, status,
             source_attempt_id, issued_at, effective_at
           ) VALUES ('resident-1', 'reporter', ?, 'active', ?, 1, 1)`)
                .run(level, `manual-career-gate-${level}`);
        }
        assert.deepEqual(harness.school.selectCareer("resident-1", "chef"), {
            career: "chef",
            trackOrder: 2,
        });
        assert.throws(() => harness.school.selectCareer("resident-1", "agronomist"), assertCareerError("career_track_limit_reached"));
    }
    finally {
        harness.database.close();
    }
});
test("written exams open only on Tuesday, Thursday, and Saturday and active certificates block duplicate registration", () => {
    const harness = createHarness(beijingTimestamp("2026-08-26", 11));
    try {
        harness.school.selectCareer("exam-resident", "reporter");
        completeLevelOneCourses(harness, "exam-resident", "reporter");
        const boundReservation = goldReceipt(harness, "exam-resident", "system_gold_reserve", EXAM_FEE_GOLD[1], "career-exam:bound-attempt:reserve");
        const boundAttempt = harness.school.registerExam({
            attemptId: "bound-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: boundReservation,
            residentId: "exam-resident",
        });
        assert.equal(boundAttempt.scheduledAt, beijingTimestamp("2026-08-27", 14));
        assert.throws(
            () => harness.school.startExam(boundAttempt.attemptId, { receiptId: "not-consumed-off-day" }),
            assertCareerError("exam_session_closed"),
        );
        const wrongReservation = harness.economy.reserveSystemGold({
            residentId: "exam-resident",
            amount: EXAM_FEE_GOLD[1],
            actor: "human",
            businessReference: "another-contract:reserve",
            idempotencyKey: "another-contract:reserve",
        });
        const wrongSettlement = harness.economy.settleSystemGoldReservation({
            reservationId: wrongReservation.reservation_id,
            businessReference: "career-exam:bound-attempt:settle",
            idempotencyKey: "another-contract:settle-as-exam",
        });
        harness.setNow(boundAttempt.scheduledAt);
        assert.throws(() => harness.school.startExam(boundAttempt.attemptId, wrongSettlement.financialReceipt), assertCareerError("financial_receipt_mismatch"));
        const wrongReleaseReservation = harness.economy.reserveSystemGold({
            residentId: "exam-resident",
            amount: EXAM_FEE_GOLD[1],
            actor: "human",
            businessReference: "another-release-contract:reserve",
            idempotencyKey: "another-release-contract:reserve",
        });
        const wrongRelease = harness.economy.releaseSystemGoldReservation({
            reservationId: wrongReleaseReservation.reservation_id,
            businessReference: "career-exam:bound-attempt:release",
            idempotencyKey: "another-contract:release-as-exam",
        });
        assert.throws(() => harness.school.releaseUnstartedExam(boundAttempt.attemptId, wrongRelease.financialReceipt), assertCareerError("financial_receipt_mismatch"));
        assert.equal(harness.database
            .prepare("SELECT registration_status FROM career_exam_attempts WHERE attempt_id = 'bound-attempt'")
            .get().registration_status, "registered");
        assert.equal(harness.database
            .prepare("SELECT state FROM economy_system_gold_reservations WHERE reserve_journal_id = ?")
            .get(boundReservation.receiptId).state, "reserved");
        harness.school.releaseUnstartedExam(boundAttempt.attemptId, goldReceipt(harness, "exam-resident", "system_gold_release", EXAM_FEE_GOLD[1], "career-exam:bound-attempt:release"));
        harness.setNow(beijingTimestamp("2026-08-26", 11));
        const expiredReservation = goldReceipt(harness, "exam-resident", "system_gold_reserve", EXAM_FEE_GOLD[1], "career-exam:expired-attempt:reserve");
        const expiredAttempt = harness.school.registerExam({
            attemptId: "expired-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: expiredReservation,
            residentId: "exam-resident",
        });
        harness.setNow(expiredAttempt.scheduledAt);
        const expiredSettlement = goldReceipt(harness, "exam-resident", "system_gold_settle", EXAM_FEE_GOLD[1], "career-exam:expired-attempt:settle");
        harness.school.startExam(expiredAttempt.attemptId, expiredSettlement);
        harness.setNow(expiredAttempt.scheduledAt + 2 * 60 * 60 * 1_000);
        assert.deepEqual(submitExamScore(harness, expiredAttempt.attemptId, 20), {
            status: "expired",
            correctAnswers: null,
            passed: false,
        });
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT registration_status, correct_answers, settlement_receipt_id,
                             ended_at, missed_session_at
              FROM career_exam_attempts WHERE attempt_id = 'expired-attempt'`)
            .get() }, {
            correct_answers: null,
            ended_at: expiredAttempt.scheduledAt + 2 * 60 * 60 * 1_000,
            missed_session_at: expiredAttempt.scheduledAt + 2 * 60 * 60 * 1_000,
            registration_status: "failed",
            settlement_receipt_id: expiredSettlement.receiptId,
        });
        assert.equal(harness.school.registerExam({
            attemptId: "expired-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: expiredReservation,
            residentId: "exam-resident",
        }).feeGold, EXAM_FEE_GOLD[1]);
        const passedReservation = goldReceipt(harness, "exam-resident", "system_gold_reserve", EXAM_FEE_GOLD[1], "career-exam:passed-attempt:reserve");
        const passedAttempt = harness.school.registerExam({
            attemptId: "passed-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: passedReservation,
            residentId: "exam-resident",
        });
        harness.setNow(passedAttempt.scheduledAt);
        assert.equal(passedAttempt.feeGold, EXAM_FEE_GOLD[1]);
        harness.school.startExam(passedAttempt.attemptId, goldReceipt(harness, "exam-resident", "system_gold_settle", EXAM_FEE_GOLD[1], "career-exam:passed-attempt:settle"));
        const passedResult = submitExamScore(
            harness,
            passedAttempt.attemptId,
            20,
            "written-exam-exact-replay",
        );
        assert.deepEqual(passedResult, {
            status: "passed",
            correctAnswers: 20,
            passed: true,
        });
        assert.deepEqual(
            submitExamScore(harness, passedAttempt.attemptId, 20, "written-exam-exact-replay"),
            passedResult,
        );
        assert.throws(
            () => submitExamScore(harness, passedAttempt.attemptId, 19, "written-exam-exact-replay"),
            assertCareerError("assessment_submission_conflict"),
        );
        assert.throws(
            () => submitExamScore(harness, passedAttempt.attemptId, 20, "written-exam-second-submit"),
            assertCareerError("exam_already_submitted"),
        );
        assert.equal(harness.school.registerExam({
            attemptId: "passed-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: passedReservation,
            residentId: "exam-resident",
        }).feeGold, EXAM_FEE_GOLD[1]);
        const attemptsBefore = harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_exam_attempts WHERE resident_id = 'exam-resident'")
            .get().count;
        const balanceBeforeDuplicate = harness.economy.getAccount("exam-resident");
        let duplicateReservation;
        assert.throws(() => runLingyeWorldTransaction(harness.database, () => {
            duplicateReservation = goldReceipt(harness, "exam-resident", "system_gold_reserve", EXAM_FEE_GOLD[1], "career-exam:duplicate-attempt:reserve");
            return harness.school.registerExam({
                attemptId: "duplicate-attempt",
                career: "reporter",
                level: 1,
                reservationReceipt: duplicateReservation,
                residentId: "exam-resident",
            });
        }), assertCareerError("certificate_already_active"));
        assert.deepEqual(harness.economy.getAccount("exam-resident"), balanceBeforeDuplicate);
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_exam_attempts WHERE resident_id = 'exam-resident'")
            .get().count, attemptsBefore);
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_financial_receipts WHERE receipt_id = ?")
            .get(duplicateReservation.receiptId).count, 0);
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM economy_commands WHERE idempotency_key = ?")
            .get("career-test:system_gold_reserve:career-exam:duplicate-attempt:reserve").count, 0);
    }
    finally {
        harness.database.close();
    }
});
test("public institutions enforce two seats, next-day duty, base wage without work, and real-work performance", () => {
    const harness = createHarness(beijingTimestamp("2026-08-26", 0));
    try {
        for (const residentId of ["reporter-1", "reporter-2", "reporter-3"]) {
            seedCertificate(harness, residentId, "reporter", 1);
        }
        assert.equal(harness.employment.hire({
            career: "reporter",
            employmentId: "employment-1",
            institution: "lingye_daily",
            residentId: "reporter-1",
        }).seatNumber, 1);
        assert.equal(harness.employment.hire({
            career: "reporter",
            employmentId: "employment-2",
            institution: "lingye_daily",
            residentId: "reporter-2",
        }).seatNumber, 2);
        assert.throws(() => harness.employment.hire({
            career: "reporter",
            employmentId: "employment-3",
            institution: "lingye_daily",
            residentId: "reporter-3",
        }), assertCareerError("institution_full"));
        const duties = harness.employment.generateNextDutyDays();
        assert.equal(duties.length, 2);
        assert.ok(duties.every((duty) => duty.dutyDate === "2026-08-27"));
        harness.setNow(beijingTimestamp("2026-08-27", 10));
        harness.job.createJob({
            assignmentMode: "accepted",
            career: "reporter",
            difficultyLevel: 1,
            jobId: "report-job",
            objectId: "material-pack-1",
            objectType: "daily_material_pack",
            requiredLevel: 1,
            sourceId: "material-pack-1",
            sourceType: "daily_material_pack",
        });
        harness.job.acceptJob("report-job", "reporter-1");
        harness.job.recordDecision({
            changesWorld: false,
            consumesResources: false,
            idempotencyKey: "report-check",
            jobId: "report-job",
            kind: "check",
            optionReference: "source-check",
            resultReference: "source-check-result",
            workerResidentId: "reporter-1",
        });
        harness.job.recordDecision({
            changesWorld: true,
            consumesResources: false,
            idempotencyKey: "report-submit",
            jobId: "report-job",
            kind: "treatment",
            optionReference: "submit-article",
            resultReference: "published-article",
            workerResidentId: "reporter-1",
        });
        harness.job.completeJob({
            jobId: "report-job",
            validationPassed: true,
            workerResidentId: "reporter-1",
            worldResultReference: "published-article-v1",
        });
        const reporterEvaluation = {
            idempotencyKey: "report-evaluation-1",
            jobId: "report-job",
            sourceReference: "report-evaluation-1",
            validLikes: 15,
            wageReceipt: goldReceipt(harness, "reporter-1", "system_gold_credit", 2_000, "career-job:report-job:evaluation-performance"),
        };
        assert.deepEqual(harness.job.addReporterLikePerformance(reporterEvaluation), { performanceGold: 2_000, units: 2 });
        assert.deepEqual(harness.job.addReporterLikePerformance(reporterEvaluation), { performanceGold: 2_000, units: 2 });
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT job_id, resident_id, source_reference, idempotency_key,
              valid_likes, units, performance_gold, receipt_id
              FROM career_reporter_evaluation_settlements WHERE job_id = ?`)
            .get("report-job") }, {
            job_id: "report-job",
            resident_id: "reporter-1",
            source_reference: "report-evaluation-1",
            idempotency_key: "report-evaluation-1",
            valid_likes: 15,
            units: 2,
            performance_gold: 2_000,
            receipt_id: reporterEvaluation.wageReceipt.receiptId,
        });
        harness.setNow(beijingTimestamp("2026-08-28", 0));
        const dutyOne = duties.find((duty) => duty.residentId === "reporter-1");
        const dutyTwo = duties.find((duty) => duty.residentId === "reporter-2");
        assert.ok(dutyOne && dutyTwo);
        assert.deepEqual(harness.employment.settleDutyDay(dutyOne.dutyId, goldReceipt(harness, "reporter-1", "system_gold_credit", 3_000, `career-duty:${dutyOne.dutyId}:wage`)), { baseGold: 2_000, performanceGold: 1_000, performanceUnits: 1, totalGold: 3_000 });
        assert.deepEqual(harness.employment.settleDutyDay(dutyTwo.dutyId, goldReceipt(harness, "reporter-2", "system_gold_credit", 2_000, `career-duty:${dutyTwo.dutyId}:wage`)), { baseGold: 2_000, performanceGold: 0, performanceUnits: 0, totalGold: 2_000 });
        const nextDuties = harness.employment.generateNextDutyDays();
        const reporterTwoNext = nextDuties.find((duty) => duty.residentId === "reporter-2");
        assert.ok(reporterTwoNext);
        harness.employment.setAvailability("employment-2", "leave");
        assert.equal(harness.database
            .prepare("SELECT status FROM career_duty_days WHERE duty_id = ?")
            .get(reporterTwoNext.dutyId).status, "invalidated");
        harness.employment.setAvailability("employment-2", "available");
        assert.ok(harness.employment.generateNextDutyDays().some((duty) => duty.dutyId === reporterTwoNext.dutyId));
        assert.equal(harness.database
            .prepare("SELECT status FROM career_duty_days WHERE duty_id = ?")
            .get(reporterTwoNext.dutyId).status, "scheduled");
        harness.setNow(beijingTimestamp("2026-08-30", 0));
        assert.equal(harness.employment.settleDutyDay(reporterTwoNext.dutyId, goldReceipt(harness, "reporter-2", "system_gold_credit", 2_000, `career-duty:${reporterTwoNext.dutyId}:wage`)).totalGold, 2_000);
    }
    finally {
        harness.database.close();
    }
});
test("jobs share one real-object lock and preserve terminal, cancellation, transfer, and payment rules", () => {
    const harness = createHarness(beijingTimestamp("2026-08-26", 9));
    try {
        seedCertificate(harness, "agronomist-1", "agronomist", 2);
        for (const jobId of ["agri-job-1", "agri-job-2"]) {
            harness.job.createJob({
                assignmentMode: "accepted",
                career: "agronomist",
                difficultyLevel: 1,
                jobId,
                objectId: "farm-1:plot-1",
                objectType: "farm_plot",
                ownerResidentId: "farm-owner",
                requiredLevel: 1,
                sourceId: `request-${jobId}`,
                sourceType: "agronomy_request",
            });
            harness.job.acceptJob(jobId, "agronomist-1");
        }
        assert.throws(() => harness.job.createJob({
            assignmentMode: "accepted",
            career: "agronomist",
            difficultyLevel: 2,
            jobId: "agri-job-1",
            objectId: "farm-1:plot-1",
            objectType: "farm_plot",
            ownerResidentId: "different-owner",
            requiredLevel: 1,
            sourceId: "request-agri-job-1",
            sourceType: "agronomy_request",
        }), assertCareerError("job_idempotency_conflict"));
        harness.job.createJob({
            assignmentMode: "accepted",
            career: "agronomist",
            difficultyLevel: 1,
            jobId: "agri-job-capacity",
            objectId: "farm-1:plot-3",
            objectType: "farm_plot",
            ownerResidentId: "farm-owner",
            requiredLevel: 1,
            sourceId: "request-capacity",
            sourceType: "agronomy_request",
        });
        assert.throws(() => harness.job.acceptJob("agri-job-capacity", "agronomist-1"), assertCareerError("career_job_capacity_reached"));
        const firstDecision = {
            changesWorld: false,
            consumesResources: false,
            idempotencyKey: "check-1",
            jobId: "agri-job-1",
            kind: "check",
            optionReference: "inspect-soil",
            resultReference: "soil-wet",
            workerResidentId: "agronomist-1",
        };
        assert.deepEqual(harness.job.recordDecision(firstDecision), { sequence: 1, status: "active" });
        assert.deepEqual(harness.job.recordDecision(firstDecision), { sequence: 1, status: "active" });
        assert.throws(() => harness.job.recordDecision({
            ...firstDecision,
            workerResidentId: "different-worker",
        }), assertCareerError("job_worker_mismatch"));
        assert.throws(() => harness.job.recordDecision({
            changesWorld: false,
            consumesResources: false,
            idempotencyKey: "check-2",
            jobId: "agri-job-2",
            kind: "check",
            optionReference: "inspect-leaf",
            resultReference: "leaf-yellow",
            workerResidentId: "agronomist-1",
        }), assertCareerError("job_object_locked"));
        assert.equal(harness.job.cancelJob("agri-job-1").status, "cancelled");
        harness.job.recordDecision({
            changesWorld: false,
            consumesResources: false,
            idempotencyKey: "check-2",
            jobId: "agri-job-2",
            kind: "check",
            optionReference: "inspect-leaf",
            resultReference: "leaf-yellow",
            workerResidentId: "agronomist-1",
        });
        harness.job.recordDecision({
            changesWorld: true,
            consumesResources: true,
            idempotencyKey: "treat-2",
            jobId: "agri-job-2",
            kind: "treatment",
            optionReference: "apply-material",
            resultReference: "plot-recovered",
            workerResidentId: "agronomist-1",
        });
        assert.throws(() => harness.job.cancelJob("agri-job-2"), assertCareerError("job_cannot_cancel_after_effect"));
        const payment = harness.receipt({
            amount: 12,
            businessReference: "career-job:agri-job-2:settlement",
            currency: "silver",
            kind: "player_silver_settle",
            residentId: "agronomist-1",
        });
        assert.equal(harness.job.completeJob({
            expectedSilverPayment: 12,
            jobId: "agri-job-2",
            paymentReceipt: payment,
            validationPassed: true,
            workerResidentId: "agronomist-1",
            worldResultReference: "farm-world-change-1",
        }).status, "completed");
        harness.job.createJob({
            assignmentMode: "accepted",
            career: "agronomist",
            difficultyLevel: 2,
            jobId: "agri-transfer",
            objectId: "farm-1:plot-2",
            objectType: "farm_plot",
            requiredLevel: 1,
            sourceId: "request-transfer",
            sourceType: "agronomy_request",
        });
        harness.job.acceptJob("agri-transfer", "agronomist-1");
        harness.job.recordDecision({
            changesWorld: false,
            consumesResources: false,
            idempotencyKey: "transfer-check",
            jobId: "agri-transfer",
            kind: "check",
            optionReference: "inspect-roots",
            resultReference: "beyond-current-qualification",
            workerResidentId: "agronomist-1",
        });
        const transfer = harness.job.transferJob({
            jobId: "agri-transfer",
            successorJobId: "agri-successor",
            successorSourceId: "request-transfer-successor",
            workerResidentId: "agronomist-1",
        });
        assert.equal(transfer.transferred.status, "transferred");
        assert.equal(transfer.successor.status, "available");
        assert.deepEqual(harness.job.transferJob({
            jobId: "agri-transfer",
            successorJobId: "agri-successor",
            successorSourceId: "request-transfer-successor",
            workerResidentId: "agronomist-1",
        }), transfer);
        assert.equal(harness.job.expireJob("agri-successor", false).status, "expired");
        assert.throws(() => harness.job.expireJob("agri-job-2", true), assertCareerError("job_demand_still_exists"));
    }
    finally {
        harness.database.close();
    }
});
test("self jobs belong to their owner and cannot create an unclaimable transfer successor", () => {
    const harness = createHarness(beijingTimestamp("2026-08-26", 9));
    try {
        seedCertificate(harness, "chef-owner", "chef", 1);
        seedCertificate(harness, "other-chef", "chef", 1);
        assert.throws(() => harness.job.createJob({
            assignmentMode: "self",
            career: "chef",
            difficultyLevel: 1,
            jobId: "invalid-self-job",
            objectId: "recipe-draft-1",
            objectType: "recipe_draft",
            ownerResidentId: "chef-owner",
            requiredLevel: 1,
            selfWorkerResidentId: "other-chef",
            sourceId: "invalid-self-source",
            sourceType: "chef_research",
        }), assertCareerError("self_owner_mismatch"));
        harness.job.createJob({
            assignmentMode: "self",
            career: "chef",
            difficultyLevel: 1,
            jobId: "valid-self-job",
            objectId: "recipe-draft-2",
            objectType: "recipe_draft",
            ownerResidentId: "chef-owner",
            requiredLevel: 1,
            selfWorkerResidentId: "chef-owner",
            sourceId: "valid-self-source",
            sourceType: "chef_research",
        });
        harness.job.recordDecision({
            changesWorld: false,
            consumesResources: false,
            idempotencyKey: "self-check",
            jobId: "valid-self-job",
            kind: "check",
            optionReference: "check-recipe",
            resultReference: "needs-more-work",
            workerResidentId: "chef-owner",
        });
        assert.throws(() => harness.job.transferJob({
            jobId: "valid-self-job",
            successorJobId: "invalid-self-successor",
            successorSourceId: "invalid-self-successor-source",
            workerResidentId: "chef-owner",
        }), assertCareerError("job_not_transferable"));
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_jobs WHERE parent_job_id = 'valid-self-job'")
            .get().count, 0);
    }
    finally {
        harness.database.close();
    }
});
test("a failed constable interview returns a normal terminal result after persisting it", () => {
    const harness = createHarness();
    try {
        const reservation = harness.receipt({
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:failed-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "failed-candidate",
        });
        harness.database.exec(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES ('failed-candidate', 'constable', 1, 1);
    `);
        recordFinancialReceipt(harness.database, reservation, {
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:failed-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "failed-candidate",
        }, beijingTimestamp("2026-08-26", 11));
        harness.database
            .prepare(`INSERT INTO career_exam_attempts (
        attempt_id, resident_id, career, qualification_level, scheduled_at,
        registration_status, reservation_receipt_id, correct_answers,
        registered_at, started_at, ended_at
      ) VALUES (
        'failed-attempt', 'failed-candidate', 'constable', 1, 1,
        'written_passed', ?, 20, 1, 1, 1
      )`)
            .run(reservation.receiptId);
        harness.database.exec(`
      INSERT INTO career_constable_interviews (
        interview_id, attempt_id, candidate_resident_id, scheduled_at, status, created_at
      ) VALUES ('failed-interview', 'failed-attempt', 'failed-candidate', 1, 'scoring', 1);
      INSERT INTO career_constable_scores VALUES
        ('failed-interview', 'human-1', 2, 4, 4, 4, 1),
        ('failed-interview', 'human-2', 2, 4, 4, 4, 1),
        ('failed-interview', 'human-3', 2, 4, 4, 4, 1);
    `);
        assert.deepEqual(harness.school.openConstablePublicNotice(
            "failed-interview",
            ["resident-1"],
            "未通过候选居民",
        ), { status: "failed", noticeId: null });
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT status, finalized_at FROM career_constable_interviews
           WHERE interview_id = 'failed-interview'`)
            .get() }, { finalized_at: beijingTimestamp("2026-08-26", 11), status: "failed" });
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT registration_status, ended_at FROM career_exam_attempts
           WHERE attempt_id = 'failed-attempt'`)
            .get() }, { ended_at: beijingTimestamp("2026-08-26", 11), registration_status: "failed" });
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT COUNT(*) AS count FROM career_constable_public_notices
           WHERE interview_id = 'failed-interview'`)
            .get() }, { count: 0 });
    }
    finally {
        harness.database.close();
    }
});
test("constable interview uses human signup order and fails closed after the 24-hour notice", () => {
    const harness = createHarness(beijingTimestamp("2026-08-26", 11));
    try {
        harness.school.selectCareer("candidate", "constable");
        completeLevelOneCourses(harness, "candidate", "constable");
        const attempt = harness.school.registerExam({
            attemptId: "constable-attempt",
            career: "constable",
            level: 1,
            reservationReceipt: goldReceipt(harness, "candidate", "system_gold_reserve", EXAM_FEE_GOLD[1], "career-exam:constable-attempt:reserve"),
            residentId: "candidate",
        });
        harness.setNow(attempt.scheduledAt);
        harness.school.startExam(attempt.attemptId, goldReceipt(harness, "candidate", "system_gold_settle", EXAM_FEE_GOLD[1], "career-exam:constable-attempt:settle"));
        const writtenResult = submitExamScore(
            harness,
            attempt.attemptId,
            20,
            "constable-written-pass",
        );
        assert.deepEqual(writtenResult, {
            status: "written_passed",
            correctAnswers: 20,
            passed: true,
        });
        assert.deepEqual(
            submitExamScore(harness, attempt.attemptId, 20, "constable-written-pass"),
            writtenResult,
        );
        const scheduledAt = beijingTimestamp("2026-08-28", 20);
        const automaticInterview = harness.database
            .prepare(`SELECT interview_id, scheduled_at, status
                FROM career_constable_interviews WHERE attempt_id = ?`)
            .get(attempt.attemptId);
        assert.deepEqual({ ...automaticInterview }, {
            interview_id: automaticInterview.interview_id,
            scheduled_at: scheduledAt,
            status: "signup_open",
        });
        const interviewId = automaticInterview.interview_id;
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_constable_interviews WHERE attempt_id = ?")
            .get(attempt.attemptId).count, 1);
        assert.equal(harness.school.scheduleConstableInterview(attempt.attemptId, scheduledAt), interviewId);
        harness.setNow(beijingTimestamp("2026-08-28", 14));
        for (const index of [1, 2, 3, 4]) {
            harness.ensureAccount(`resident-${index}`);
            harness.school.signupConstableExaminer({
                eligibilityReference: `eligibility-${index}`,
                examinerAccountId: `human-${index}`,
                examinerResidentId: `resident-${index}`,
                interviewId,
            });
        }
        harness.setNow(beijingTimestamp("2026-08-28", 19, 30));
        for (const index of [1, 3, 4]) {
            harness.school.confirmConstableExaminerAttendance({
                eligibilityReference: `attendance-eligibility-${index}`,
                examinerAccountId: `human-${index}`,
                interviewId,
            });
        }
        harness.setNow(scheduledAt);
        assert.equal(harness.school.finalizeConstableExaminerPanel(interviewId), "panel_ready");
        for (const index of [1, 3, 4]) {
            harness.school.submitConstableInterviewScore({
                explanation: 4,
                examinerAccountId: `human-${index}`,
                facts: 4,
                interviewId,
                procedure: 4,
                restraint: 4,
            });
        }
        const opening = harness.school.openConstablePublicNotice(interviewId, [
            "candidate",
            "resident-1",
            "resident-2",
            "resident-3",
        ], "候选居民");
        assert.equal(opening.status, "public_notice");
        const noticeId = opening.noticeId;
        assert.deepEqual(harness.school.submitConstableInterviewScore({
            explanation: 4,
            examinerAccountId: "human-1",
            facts: 4,
            interviewId,
            procedure: 4,
            restraint: 4,
            examinerResidentId: "resident-1",
        }), { replay: true, status: "public_notice" });
        assert.throws(() => harness.school.submitConstableInterviewScore({
            explanation: 3,
            examinerAccountId: "human-1",
            facts: 4,
            interviewId,
            procedure: 4,
            restraint: 4,
            examinerResidentId: "resident-1",
        }), assertCareerError("interview_score_conflict"));
        harness.school.voteConstablePublicNotice(noticeId, "resident-1", "review_request");
        harness.setNow(scheduledAt + 24 * 60 * 60 * 1_000);
        assert.equal(harness.school.finalizeConstablePublicNotice(noticeId), "pending_review_configuration");
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT status, effective_at FROM career_certificates
           WHERE resident_id = 'candidate' AND career = 'constable' AND qualification_level = 1`)
            .get() }, { effective_at: null, status: "pending_review_configuration" });
    }
    finally {
        harness.database.close();
    }
});
test("a postponed constable interview reopens signup at a new session", () => {
    const harness = createHarness(beijingTimestamp("2026-08-26", 11));
    try {
        harness.school.selectCareer("postponed-candidate", "constable");
        completeLevelOneCourses(harness, "postponed-candidate", "constable");
        const attempt = harness.school.registerExam({
            attemptId: "postponed-attempt",
            career: "constable",
            level: 1,
            reservationReceipt: goldReceipt(harness, "postponed-candidate", "system_gold_reserve", EXAM_FEE_GOLD[1], "career-exam:postponed-attempt:reserve"),
            residentId: "postponed-candidate",
        });
        harness.setNow(attempt.scheduledAt);
        harness.school.startExam(attempt.attemptId, goldReceipt(harness, "postponed-candidate", "system_gold_settle", EXAM_FEE_GOLD[1], "career-exam:postponed-attempt:settle"));
        assert.deepEqual(submitExamScore(harness, attempt.attemptId, 20), {
            status: "written_passed",
            correctAnswers: 20,
            passed: true,
        });
        const firstSession = beijingTimestamp("2026-08-28", 20);
        const automaticInterview = harness.database
            .prepare(`SELECT interview_id, scheduled_at, status
                FROM career_constable_interviews WHERE attempt_id = ?`)
            .get(attempt.attemptId);
        assert.deepEqual({ ...automaticInterview }, {
            interview_id: automaticInterview.interview_id,
            scheduled_at: firstSession,
            status: "signup_open",
        });
        const interviewId = automaticInterview.interview_id;
        harness.setNow(beijingTimestamp("2026-08-28", 14));
        harness.ensureAccount("postponed-resident");
        harness.school.signupConstableExaminer({
            eligibilityReference: "postponed-eligibility",
            examinerAccountId: "postponed-human",
            examinerResidentId: "postponed-resident",
            interviewId,
        });
        harness.setNow(firstSession);
        const secondSession = beijingTimestamp("2026-08-29", 20);
        assert.deepEqual(harness.school.finalizeConstableExaminerPanel(interviewId), {
            status: "postponed",
            nextScheduledAt: secondSession,
        });
        assert.deepEqual({ ...harness.database
            .prepare("SELECT scheduled_at, status, postponed_count FROM career_constable_interviews WHERE interview_id = ?")
            .get(interviewId) }, { scheduled_at: secondSession, status: "signup_open", postponed_count: 1 });
        assert.equal(harness.school.scheduleConstableInterview(attempt.attemptId, secondSession), interviewId);
        assert.deepEqual({ ...harness.database
            .prepare("SELECT scheduled_at, status FROM career_constable_interviews WHERE interview_id = ?")
            .get(interviewId) }, { scheduled_at: secondSession, status: "signup_open" });
        assert.equal(harness.database
            .prepare("SELECT registration_status FROM career_exam_attempts WHERE attempt_id = ?")
            .get(attempt.attemptId).registration_status, "written_passed");
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_constable_examiner_signups WHERE interview_id = ?")
            .get(interviewId).count, 0);
        harness.database
            .prepare("UPDATE career_exam_attempts SET ended_at = ? WHERE attempt_id = ?")
            .run(secondSession - 30 * 24 * 60 * 60 * 1_000 - 1, attempt.attemptId);
        harness.setNow(secondSession);
        assert.deepEqual(harness.school.finalizeConstableExaminerPanel(interviewId), {
            status: "postponed",
            nextScheduledAt: null,
        });
        assert.deepEqual({ ...harness.database
            .prepare("SELECT status FROM career_constable_interviews WHERE interview_id = ?")
            .get(interviewId) }, { status: "postponed" });
        assert.equal(harness.database
            .prepare("SELECT registration_status FROM career_exam_attempts WHERE attempt_id = ?")
            .get(attempt.attemptId).registration_status, "postponed");
    }
    finally {
        harness.database.close();
    }
});

test("a closed constable notice with zero review requests activates without a policy", () => {
    const now = beijingTimestamp("2026-08-29", 12);
    const harness = createHarness(now);
    try {
        harness.ensureAccount("zero-review-candidate");
        harness.database
            .prepare("INSERT INTO career_tracks (resident_id, career, track_order, selected_at) VALUES (?, 'constable', 1, ?)")
            .run("zero-review-candidate", now);
        const reservation = harness.receipt({
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:zero-review-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "zero-review-candidate",
        });
        recordFinancialReceipt(harness.database, reservation, {
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:zero-review-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "zero-review-candidate",
        }, now);
        harness.database.prepare(`INSERT INTO career_exam_attempts (
          attempt_id, resident_id, career, qualification_level, scheduled_at,
          registration_status, reservation_receipt_id, registered_at, ended_at
        ) VALUES ('zero-review-attempt', 'zero-review-candidate', 'constable', 1, ?, 'written_passed', ?, ?, ?)`)
            .run(now - 1, reservation.receiptId, now - 1, now - 1);
        const material = TEST_CONSTABLE_INTERVIEW_BANK.getConstableInterviewPaper({
            candidateResidentId: "zero-review-candidate",
            interviewId: "zero-review-interview",
            scheduledAt: now - 1,
        });
        harness.database.prepare(`INSERT INTO career_constable_interviews (
          interview_id, attempt_id, candidate_resident_id, scheduled_at,
          interview_bank_version, interview_paper_snapshot_json,
          interview_fact_material_snapshot_json, interview_scoring_standard_snapshot_json,
          status, created_at
        ) VALUES ('zero-review-interview', 'zero-review-attempt', 'zero-review-candidate', ?, ?, ?, ?, ?, 'public_notice', ?)`)
            .run(now - 1, material.bankVersion, JSON.stringify(material.paper),
            JSON.stringify(material.factMaterial), JSON.stringify(material.scoringStandard), now - 1);
        harness.database.prepare(`INSERT INTO career_constable_public_notices (
          notice_id, interview_id, candidate_resident_id, candidate_resident_name,
          opened_at, closes_at, status, eligible_voter_count
        ) VALUES ('zero-review-notice', 'zero-review-interview', 'zero-review-candidate',
                  '零异议候选居民', ?, ?, 'open', 0)`)
            .run(now - 24 * 60 * 60 * 1_000 - 1, now - 1);
        harness.database.prepare(`INSERT INTO career_certificates (
          resident_id, career, qualification_level, status, source_attempt_id, issued_at
        ) VALUES ('zero-review-candidate', 'constable', 1, 'pending_public_notice', 'zero-review-attempt', ?)`)
            .run(now - 1);
        assert.equal(harness.school.finalizeConstablePublicNotice("zero-review-notice"), "certificate_activated");
        assert.deepEqual({ ...harness.database.prepare(`
          SELECT status, effective_at FROM career_certificates
          WHERE source_attempt_id = 'zero-review-attempt'
        `).get() }, { status: "active", effective_at: now });
    }
    finally {
        harness.database.close();
    }
});

test("constable examiner eligibility is checked against current loans and complaints", () => {
    const now = beijingTimestamp("2026-08-29", 14);
    const harness = createHarness(now);
    try {
        harness.ensureAccount("eligibility-candidate");
        harness.ensureAccount("eligibility-examiner");
        harness.database.exec(`
          INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
          VALUES ('eligibility-candidate', 'constable', 1, 1);
        `);
        const reservation = harness.receipt({
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:eligibility-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "eligibility-candidate",
        });
        recordFinancialReceipt(harness.database, reservation, {
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:eligibility-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "eligibility-candidate",
        }, now);
        const interviewSession = beijingTimestamp("2026-08-30", 20);
        harness.database.prepare(`INSERT INTO career_exam_attempts (
          attempt_id, resident_id, career, qualification_level, scheduled_at,
          registration_status, reservation_receipt_id, registered_at, ended_at
        ) VALUES ('eligibility-attempt', 'eligibility-candidate', 'constable', 1, ?, 'written_passed', ?, ?, ?)`)
            .run(interviewSession, reservation.receiptId, now - 1, now - 1);
        harness.database.prepare(`INSERT INTO career_constable_interviews (
          interview_id, attempt_id, candidate_resident_id, scheduled_at, status, created_at
        ) VALUES ('eligibility-interview', 'eligibility-attempt', 'eligibility-candidate', ?, 'signup_open', ?)`)
            .run(interviewSession, now);
        harness.database.prepare(`INSERT INTO economy_player_loans (
          loan_id, lender_resident_id, borrower_resident_id, principal_original,
          principal_outstanding, total_rate_ppm, term_days, status, created_at
        ) VALUES ('eligibility-loan', 'eligibility-candidate', 'eligibility-examiner', 1, 1, 0, 1, 'active', ?)`)
            .run(now);
        harness.setNow(beijingTimestamp("2026-08-30", 14));
        assert.throws(() => harness.school.signupConstableExaminer({
            eligibilityReference: "forged-reference",
            examinerAccountId: "eligibility-account",
            examinerResidentId: "eligibility-examiner",
            interviewId: "eligibility-interview",
        }), assertCareerError("examiner_not_eligible"));
        harness.database.prepare("DELETE FROM economy_player_loans WHERE loan_id = 'eligibility-loan'").run();
        harness.database.exec(`
          INSERT INTO career_jobs (
            job_id, career, source_type, source_id, object_type, object_id,
            owner_resident_id, required_level, difficulty_level, assignment_mode,
            status, created_at, updated_at
          ) VALUES (
            'eligibility-complaint-job', 'constable', 'resident_complaint', 'complaint-1',
            'complaint', 'complaint-1', 'eligibility-candidate', 1, 1, 'assigned', 'active', 1, 1
          );
          INSERT INTO career_job_assignment_exclusions (
            job_id, resident_id, relation_kind, source_reference, recorded_at
          ) VALUES ('eligibility-complaint-job', 'eligibility-examiner', 'source_party', 'complaint-1', 1);
        `);
        assert.throws(() => harness.school.signupConstableExaminer({
            eligibilityReference: "another-forged-reference",
            examinerAccountId: "eligibility-account-2",
            examinerResidentId: "eligibility-examiner",
            interviewId: "eligibility-interview",
        }), assertCareerError("examiner_not_eligible"));
    }
    finally {
        harness.database.close();
    }
});

test("constable scoring fails closed when no private interview bank is configured", () => {
    const now = beijingTimestamp("2026-08-29", 12);
    const harness = createHarness(now);
    try {
        harness.ensureAccount("unconfigured-candidate");
        harness.ensureAccount("unconfigured-examiner");
        harness.database.exec(`
          INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
          VALUES ('unconfigured-candidate', 'constable', 1, 1);
        `);
        const reservation = harness.receipt({
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:unconfigured-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "unconfigured-candidate",
        });
        recordFinancialReceipt(harness.database, reservation, {
            amount: EXAM_FEE_GOLD[1],
            businessReference: "career-exam:unconfigured-attempt:reserve",
            currency: "gold",
            kind: "system_gold_reserve",
            residentId: "unconfigured-candidate",
        }, now);
        harness.database.prepare(`INSERT INTO career_exam_attempts (
          attempt_id, resident_id, career, qualification_level, scheduled_at,
          registration_status, reservation_receipt_id, registered_at, ended_at
        ) VALUES ('unconfigured-attempt', 'unconfigured-candidate', 'constable', 1, ?, 'written_passed', ?, ?, ?)`)
            .run(now, reservation.receiptId, now, now);
        harness.database.prepare(`INSERT INTO career_constable_interviews (
          interview_id, attempt_id, candidate_resident_id, scheduled_at, status, created_at
        ) VALUES ('unconfigured-interview', 'unconfigured-attempt', 'unconfigured-candidate', ?, 'panel_ready', ?)`)
            .run(now, now);
        harness.database.prepare(`INSERT INTO career_constable_examiner_signups (
          interview_id, examiner_account_id, examiner_resident_id, eligibility_reference,
          signup_order, signed_up_at, attendance_confirmed_at,
          attendance_eligibility_reference, selected
        ) VALUES ('unconfigured-interview', 'unconfigured-account', 'unconfigured-examiner', 'service-assertion', 1, ?, ?, 'service-assertion', 1)`)
            .run(now, now);
        const unconfigured = new CareerSchoolService({
            database: harness.database,
            generateId: () => "unconfigured-generated",
            now: () => now,
            curriculum: TEST_CURRICULUM,
        });
        assert.throws(() => unconfigured.submitConstableInterviewScore({
            explanation: 4,
            examinerAccountId: "unconfigured-account",
            examinerResidentId: "unconfigured-examiner",
            facts: 4,
            interviewId: "unconfigured-interview",
            procedure: 4,
            restraint: 4,
        }), assertCareerError("interview_material_not_configured"));
        for (const [index, accountId] of ["unconfigured-account", "unconfigured-account-2", "unconfigured-account-3"].entries()) {
            if (index > 0) {
                harness.database.prepare(`INSERT INTO career_constable_examiner_signups (
                  interview_id, examiner_account_id, examiner_resident_id, eligibility_reference,
                  signup_order, signed_up_at, attendance_confirmed_at,
                  attendance_eligibility_reference, selected
                ) VALUES ('unconfigured-interview', ?, ?, 'service-assertion', ?, ?, ?, 'service-assertion', 1)`)
                    .run(accountId, `unconfigured-examiner-${index + 1}`, index + 1, now, now);
                harness.ensureAccount(`unconfigured-examiner-${index + 1}`);
            }
            harness.database.prepare(`INSERT INTO career_constable_scores (
              interview_id, examiner_account_id, facts_score, restraint_score,
              procedure_score, explanation_score, scored_at
            ) VALUES ('unconfigured-interview', ?, 4, 4, 4, 4, ?)`)
                .run(accountId, now);
        }
        harness.database.prepare("UPDATE career_constable_interviews SET status = 'scoring' WHERE interview_id = 'unconfigured-interview'").run();
        assert.throws(() => unconfigured.openConstablePublicNotice(
            "unconfigured-interview",
            ["unconfigured-voter"],
            "未配置材料候选居民",
        ), assertCareerError("interview_material_not_configured"));
    }
    finally {
        harness.database.close();
    }
});

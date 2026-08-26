import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { CareerDomainError, } from "../dist/career/contracts.js";
import { CareerEmploymentService } from "../dist/career/employment-service.js";
import { CareerJobService } from "../dist/career/job-service.js";
import { beijingTimestamp, recordFinancialReceipt } from "../dist/career/persistence.js";
import { installCareerSchema } from "../dist/career/schema.js";
import { CareerSchoolService } from "../dist/career/school-service.js";
import { installEconomySchema } from "../dist/economy/economy-schema.js";
import { EconomyService } from "../dist/economy/economy-service.js";
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
    const school = new CareerSchoolService({ database, generateId, now: () => now });
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
                    residentId: input.residentId,
                    idempotencyKey: `${idempotencyKey}:confirm-payee`,
                });
                economy.confirmTrade({
                    tradeId: trade.trade_id,
                    residentId: payerResidentId,
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
function completeLevelOneCourses(harness, residentId, career) {
    for (const courseIndex of [1, 2, 3]) {
        harness.school.enrollCourse({
            career,
            courseIndex,
            level: 1,
            residentId,
            tuitionReceipt: goldReceipt(harness, residentId, "system_gold_charge", 20_000, `career-course:${residentId}:${career}:1:${courseIndex}`),
        });
        harness.school.markCourseContentRead({ career, courseIndex, level: 1, residentId });
        assert.equal(harness.school.submitCoursePractice({
            career,
            correctAnswers: 4,
            courseIndex,
            level: 1,
            residentId,
        }).passed, true);
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
test("school enforces ordered paid courses, read-and-practice completion, fixed sessions, and retake fees", () => {
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
            tuitionReceipt: goldReceipt(harness, "resident-1", "system_gold_charge", 20_000, "career-course:resident-1:reporter:1:2"),
        }), assertCareerError("previous_course_required"));
        const courseOneReceipt = goldReceipt(harness, "resident-1", "system_gold_charge", 20_000, "career-course:resident-1:reporter:1:1");
        harness.school.enrollCourse({
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
            tuitionReceipt: courseOneReceipt,
        });
        assert.throws(() => harness.school.submitCoursePractice({
            career: "reporter",
            correctAnswers: 5,
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        }), assertCareerError("course_content_not_read"));
        harness.school.markCourseContentRead({
            career: "reporter",
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        });
        assert.deepEqual(harness.school.submitCoursePractice({
            career: "reporter",
            correctAnswers: 3,
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        }), { bestCorrectAnswers: 3, passed: false });
        assert.equal(harness.school.submitCoursePractice({
            career: "reporter",
            correctAnswers: 4,
            courseIndex: 1,
            level: 1,
            residentId: "resident-1",
        }).passed, true);
        for (const courseIndex of [2, 3]) {
            harness.school.enrollCourse({
                career: "reporter",
                courseIndex,
                level: 1,
                residentId: "resident-1",
                tuitionReceipt: goldReceipt(harness, "resident-1", "system_gold_charge", 20_000, `career-course:resident-1:reporter:1:${courseIndex}`),
            });
            harness.school.markCourseContentRead({
                career: "reporter",
                courseIndex,
                level: 1,
                residentId: "resident-1",
            });
            harness.school.submitCoursePractice({
                career: "reporter",
                correctAnswers: 5,
                courseIndex,
                level: 1,
                residentId: "resident-1",
            });
        }
        const first = harness.school.registerExam({
            attemptId: "attempt-1",
            career: "reporter",
            level: 1,
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", 40_000, "career-exam:attempt-1:reserve"),
            residentId: "resident-1",
        });
        assert.equal(first.scheduledAt, beijingTimestamp("2026-08-26", 12));
        harness.setNow(first.scheduledAt);
        harness.school.startExam(first.attemptId, goldReceipt(harness, "resident-1", "system_gold_settle", 40_000, "career-exam:attempt-1:settle"));
        assert.equal(harness.school.submitWrittenExam(first.attemptId, 17), "failed");
        const retake = harness.school.registerExam({
            attemptId: "attempt-2",
            career: "reporter",
            level: 1,
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", 20_000, "career-exam:attempt-2:reserve"),
            residentId: "resident-1",
        });
        assert.equal(retake.feeGold, 20_000);
        harness.setNow(retake.scheduledAt);
        harness.school.startExam(retake.attemptId, goldReceipt(harness, "resident-1", "system_gold_settle", 20_000, "career-exam:attempt-2:settle"));
        assert.equal(harness.school.submitWrittenExam(retake.attemptId, 18), "passed");
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
                tuitionReceipt: goldReceipt(harness, "resident-1", "system_gold_charge", 80_000, `career-course:resident-1:reporter:2:${courseIndex}`),
            });
            harness.school.markCourseContentRead({
                career: "reporter",
                courseIndex,
                level: 2,
                residentId: "resident-1",
            });
            harness.school.submitCoursePractice({
                career: "reporter",
                correctAnswers: 4,
                courseIndex,
                level: 2,
                residentId: "resident-1",
            });
        }
        assert.throws(() => harness.school.registerExam({
            attemptId: "attempt-level-2",
            career: "reporter",
            level: 2,
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", 160_000, "career-exam:attempt-level-2:reserve"),
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
            reservationReceipt: goldReceipt(harness, "resident-1", "system_gold_reserve", 160_000, "career-exam:attempt-level-2:reserve"),
            residentId: "resident-1",
        }).feeGold, 160_000);
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
test("written exams expire at the session boundary and active certificates block duplicate registration", () => {
    const harness = createHarness(beijingTimestamp("2026-08-26", 11));
    try {
        harness.school.selectCareer("exam-resident", "reporter");
        completeLevelOneCourses(harness, "exam-resident", "reporter");
        const expiredAttempt = harness.school.registerExam({
            attemptId: "expired-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: goldReceipt(harness, "exam-resident", "system_gold_reserve", 40_000, "career-exam:expired-attempt:reserve"),
            residentId: "exam-resident",
        });
        harness.setNow(expiredAttempt.scheduledAt);
        const expiredSettlement = goldReceipt(harness, "exam-resident", "system_gold_settle", 40_000, "career-exam:expired-attempt:settle");
        harness.school.startExam(expiredAttempt.attemptId, expiredSettlement);
        harness.setNow(expiredAttempt.scheduledAt + 2 * 60 * 60 * 1_000);
        assert.equal(harness.school.submitWrittenExam(expiredAttempt.attemptId, 20), "expired");
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT registration_status, correct_answers, settlement_receipt_id
              FROM career_exam_attempts WHERE attempt_id = 'expired-attempt'`)
            .get() }, {
            correct_answers: null,
            registration_status: "failed",
            settlement_receipt_id: expiredSettlement.receiptId,
        });
        const passedAttempt = harness.school.registerExam({
            attemptId: "passed-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: goldReceipt(harness, "exam-resident", "system_gold_reserve", 20_000, "career-exam:passed-attempt:reserve"),
            residentId: "exam-resident",
        });
        harness.setNow(passedAttempt.scheduledAt);
        harness.school.startExam(passedAttempt.attemptId, goldReceipt(harness, "exam-resident", "system_gold_settle", 20_000, "career-exam:passed-attempt:settle"));
        assert.equal(harness.school.submitWrittenExam(passedAttempt.attemptId, 20), "passed");
        const attemptsBefore = harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_exam_attempts WHERE resident_id = 'exam-resident'")
            .get().count;
        const duplicateReservation = goldReceipt(harness, "exam-resident", "system_gold_reserve", 20_000, "career-exam:duplicate-attempt:reserve");
        assert.throws(() => harness.school.registerExam({
            attemptId: "duplicate-attempt",
            career: "reporter",
            level: 1,
            reservationReceipt: duplicateReservation,
            residentId: "exam-resident",
        }), assertCareerError("certificate_already_active"));
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_exam_attempts WHERE resident_id = 'exam-resident'")
            .get().count, attemptsBefore);
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM career_financial_receipts WHERE receipt_id = ?")
            .get(duplicateReservation.receiptId).count, 0);
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
        assert.deepEqual(harness.job.addReporterLikePerformance({
            jobId: "report-job",
            sourceReference: "report-evaluation-1",
            validLikes: 15,
            wageReceipt: goldReceipt(harness, "reporter-1", "system_gold_credit", 2_000, "career-job:report-job:evaluation-performance"),
        }), { performanceGold: 2_000, units: 2 });
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
test("a failed constable interview persists its terminal state before reporting failure", () => {
    const harness = createHarness();
    try {
        const reservation = harness.receipt({
            amount: 40_000,
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
            amount: 40_000,
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
        assert.throws(() => harness.school.openConstablePublicNotice("failed-interview", ["resident-1"]), assertCareerError("constable_interview_failed"));
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
            reservationReceipt: goldReceipt(harness, "candidate", "system_gold_reserve", 40_000, "career-exam:constable-attempt:reserve"),
            residentId: "candidate",
        });
        harness.setNow(attempt.scheduledAt);
        harness.school.startExam(attempt.attemptId, goldReceipt(harness, "candidate", "system_gold_settle", 40_000, "career-exam:constable-attempt:settle"));
        assert.equal(harness.school.submitWrittenExam(attempt.attemptId, 20), "written_passed");
        const scheduledAt = beijingTimestamp("2026-08-26", 20);
        const interviewId = harness.school.scheduleConstableInterview(attempt.attemptId, scheduledAt);
        harness.setNow(beijingTimestamp("2026-08-26", 8));
        for (const index of [1, 2, 3, 4]) {
            harness.school.signupConstableExaminer({
                eligibilityReference: `eligibility-${index}`,
                examinerAccountId: `human-${index}`,
                examinerResidentId: `resident-${index}`,
                interviewId,
            });
        }
        harness.setNow(beijingTimestamp("2026-08-26", 19, 30));
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
        const noticeId = harness.school.openConstablePublicNotice(interviewId, [
            "candidate",
            "resident-1",
            "resident-2",
            "resident-3",
        ]);
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
            reservationReceipt: goldReceipt(harness, "postponed-candidate", "system_gold_reserve", 40_000, "career-exam:postponed-attempt:reserve"),
            residentId: "postponed-candidate",
        });
        harness.setNow(attempt.scheduledAt);
        harness.school.startExam(attempt.attemptId, goldReceipt(harness, "postponed-candidate", "system_gold_settle", 40_000, "career-exam:postponed-attempt:settle"));
        assert.equal(harness.school.submitWrittenExam(attempt.attemptId, 20), "written_passed");
        const firstSession = beijingTimestamp("2026-08-27", 20);
        const interviewId = harness.school.scheduleConstableInterview(attempt.attemptId, firstSession);
        harness.setNow(beijingTimestamp("2026-08-27", 8));
        harness.school.signupConstableExaminer({
            eligibilityReference: "postponed-eligibility",
            examinerAccountId: "postponed-human",
            examinerResidentId: "postponed-resident",
            interviewId,
        });
        harness.setNow(firstSession);
        assert.equal(harness.school.finalizeConstableExaminerPanel(interviewId), "postponed");
        const secondSession = beijingTimestamp("2026-08-28", 20);
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
    }
    finally {
        harness.database.close();
    }
});

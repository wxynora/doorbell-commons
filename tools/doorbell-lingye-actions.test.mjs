import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-lingye-actions-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
process.env.AIFARM_DOORBELL_SERVICE_TOKEN = "doorbell-lingye-actions-test-token";

const { makeFarm } = await import("../dist/game.js");
const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { createDoorbellInternalHandler } = await import("../dist/server/doorbell/router.js");
const { insertFarm } = await import("../dist/store.js");

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const RESIDENT_ID = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const OTHER_RESIDENT_ID = "019ffb01-49cd-7020-94af-3d04fb1ed03d";
const MIGRATION_ID = "019ffb01-49cd-7020-a4af-3d04fb1ed03d";
const FARM_ID = "ABC234";
const HUMAN_KEY = "doorbell-lingye-human-key";
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: 5,
    restrictedDailyGoldLimit: 150_000,
    restrictedDailySilverLimit: 300,
};
const TEST_CURRICULUM_VERSION = "doorbell-lingye-test-bank-v1";
function testPaper(kind, targetKey, count) {
    const questions = Array.from({ length: count }, (_, index) => ({
        id: `${targetKey}:question:${index + 1}`,
        stem: `Test question ${index + 1}`,
        options: { A: "A", B: "B", C: "C", D: "D" },
        answer: ["A", "B", "C", "D"][index % 4],
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
    careerCourseAvailability: (career) => career !== "reporter",
    careerCourseContent: (career, level, courseIndex) => ({
        career,
        level,
        courseIndex,
        title: `Test ${career} ${level}-${courseIndex}`,
        contentMarkdown: `Test course content for ${career} ${level}-${courseIndex}.`,
        bankVersion: TEST_CURRICULUM_VERSION,
    }),
    careerExamAvailability: (career) => career !== "reporter",
    createCoursePracticePaper: (career, level, courseIndex, residentId) =>
        testPaper("course_practice", `course:${residentId}:${career}:${level}:${courseIndex}`, 5),
    createWrittenExamPaper: (career, level, attemptId) =>
        testPaper("written_exam", `exam:${attemptId}`, 20),
});

function request(body) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.headers = { authorization: "Bearer doorbell-lingye-actions-test-token" };
    return req;
}

function responseCapture() {
    return {
        body: "",
        headers: undefined,
        status: undefined,
        writeHead(status, headers) {
            this.status = status;
            this.headers = headers;
        },
        end(body = "") {
            this.body = String(body);
        },
    };
}

function execute(executor, op, args, identity = {}) {
    return executor.execute({
        residentId: identity.residentId ?? RESIDENT_ID,
        bindingReference: identity.bindingReference ?? MIGRATION_ID,
        op,
        args,
    });
}

test("Doorbell Lingye exposes only ready authoritative bank, school and commission state", async (t) => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    let actionNow = NOW;
    const backend = createLingyeWorldBackend(database, {
        economyRules: ECONOMY_RULES,
        curriculum: TEST_CURRICULUM,
        generateId: () => `lingye-action-${++sequence}`,
        now: () => actionNow,
    });
    const executor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: ECONOMY_RULES,
        now: () => actionNow,
    });
    t.after(() => {
        database.close();
        rmSync(dataDirectory, { recursive: true, force: true });
    });

    registerLingyeResidentReference(database, {
        residentId: RESIDENT_ID,
        bindingReference: MIGRATION_ID,
        registeredAt: NOW,
    });
    registerLingyeResidentReference(database, {
        residentId: OTHER_RESIDENT_ID,
        bindingReference: "other-doorbell-migration",
        registeredAt: NOW,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId: RESIDENT_ID,
        gold: 2_000_000,
        silver: 600,
        migrationId: `economy:${MIGRATION_ID}`,
        idempotencyKey: `economy:${MIGRATION_ID}`,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId: OTHER_RESIDENT_ID,
        gold: 100_000,
        silver: 100,
        migrationId: "economy:other-doorbell-migration",
        idempotencyKey: "economy:other-doorbell-migration",
    });

    assert.throws(() => execute(executor, "go.school.choose", {
        option: "school:invalid-answer-contract",
        answers: ["A", "B", "C", "D", "E"],
    }), /answers must contain five or twenty A-D choices/u);

    const farm = makeFarm("Doorbell Lingye Test");
    farm.id = FARM_ID;
    farm.humanKey = HUMAN_KEY;
    farm.agentKey = undefined;
    farm.doorbellMcpMigration = {
        migrationId: MIGRATION_ID,
        confirmationId: "019ffb01-49cd-7020-b4af-3d04fb1ed03d",
        revokedAt: new Date(NOW).toISOString(),
        legacyMcpRevoked: true,
    };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: "real-plot-condition-1",
            condition: "drought",
            status: "open",
            generatedDay: 1,
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: 99_999,
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);

    const router = createDoorbellInternalHandler(() => {
        throw new Error("farm executor must not be called");
    }, executor);
    const res = responseCapture();
    const handled = await router(request({
        resident_id: RESIDENT_ID,
        farm_human_key: HUMAN_KEY,
        expected_farm_doorplate: FARM_ID,
        op: "go.bank.view",
        args: {},
    }), res, ["internal", "doorbell", "lingye-actions", "execute"], "POST");
    assert.equal(handled, true);
    assert.equal(res.status, 200);
    const routedBank = JSON.parse(res.body);
    assert.equal(routedBank.ok, true);
    assert.equal(routedBank.data.account.availableGold, 2_000_000);
    assert.equal(routedBank.data.account.availableSilver, 600);

    const bankView = execute(executor, "go.bank.view", {});
    const depositOption = bankView.data.options.find((entry) => entry.option.includes("demand-deposit"));
    assert.ok(depositOption);
    const bankRevision = /^bank:[a-z-]+:(\d+)/u.exec(depositOption.option)?.[1];
    assert.ok(bankRevision);
    assert.deepEqual(execute(executor, "go.bank.choose", {
        option: `bank:term-close:${bankRevision}:another-resident-deposit`,
    }), {
        ok: false,
        error: {
            code: "OPTION_NOT_AVAILABLE",
            message: "OPTION_NOT_AVAILABLE",
        },
    });
    const depositArgs = { option: depositOption.option, amount: 1_000 };
    const firstDeposit = execute(executor, "go.bank.choose", depositArgs);
    const replayedDeposit = execute(executor, "go.bank.choose", depositArgs);
    assert.equal(firstDeposit.ok, true);
    assert.deepEqual(replayedDeposit, firstDeposit);
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold, 1_999_000);
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().demandGold, 1_000);

    const beforeFailedCommands = database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count;
    const latestBank = execute(executor, "go.bank.view", {});
    const latestDepositOption = latestBank.data.options.find((entry) => entry.option.includes("demand-deposit"));
    const insufficient = execute(executor, "go.bank.choose", {
        option: latestDepositOption.option,
        amount: 9_999_999,
    });
    assert.deepEqual(insufficient, {
        ok: false,
        error: {
            code: "INSUFFICIENT_FUNDS",
            message: "可用余额不足，本次操作没有执行。",
        },
    });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count, beforeFailedCommands);
    assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold, 1_999_000);

    const schoolBefore = execute(executor, "go.school.view", {});
    assert.equal(schoolBefore.ok, true);
    assert.deepEqual(schoolBefore.data.courses, []);
    assert.deepEqual(schoolBefore.data.exams, []);
    assert.deepEqual(schoolBefore.data.contentSources, {
        courseCatalogAvailable: true,
        courseContentAvailable: true,
        examQuestionBankAvailable: true,
    });
    assert.equal(schoolBefore.data.courseCatalog.length, 60);
    assert.deepEqual(schoolBefore.data.courseCatalog[0], {
        career: "chef",
        qualificationLevel: 1,
        courseIndex: 1,
        title: "《食材也有身份证》",
        teachingScope: "区分食材、产物、料理和自动回收物",
        tuitionGold: 30_000,
        contentAvailable: true,
    });
    assert.equal(schoolBefore.data.options.some((entry) =>
        entry.option.includes("school:career-select") && entry.option.endsWith(":reporter")), false);
    assert.equal(schoolBefore.data.courseCatalog.find((entry) => entry.career === "reporter").contentAvailable, false);
    const agronomistOption = schoolBefore.data.options.find((entry) => entry.option.includes("school:career-select") && entry.option.endsWith(":agronomist"));
    assert.ok(agronomistOption);
    const selectedCareer = execute(executor, "go.school.choose", { option: agronomistOption.option });
    assert.equal(selectedCareer.ok, true);
    assert.deepEqual(selectedCareer.data.result, { career: "agronomist", trackOrder: 1 });
    assert.ok(selectedCareer.data.current.options.some((entry) => entry.option.includes("school:course-enroll")));
    const restartedExecutor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: ECONOMY_RULES,
        now: () => actionNow,
    });
    assert.deepEqual(execute(restartedExecutor, "go.school.choose", { option: agronomistOption.option }), selectedCareer);
    assert.equal(database
        .prepare("SELECT COUNT(*) AS count FROM lingye_school_action_receipts WHERE resident_id = ?")
        .get(RESIDENT_ID).count, 1);
    const staleChefOption = schoolBefore.data.options.find((entry) => entry.option.includes("school:career-select") && entry.option.endsWith(":chef"));
    assert.ok(staleChefOption);
    assert.equal(execute(executor, "go.school.choose", { option: staleChefOption.option }).error.code, "OPTION_NOT_AVAILABLE");
    assert.equal(database
        .prepare("SELECT COUNT(*) AS count FROM lingye_school_action_receipts WHERE resident_id = ?")
        .get(RESIDENT_ID).count, 1);
    assert.equal(database
        .prepare("SELECT COUNT(*) AS count FROM career_tracks WHERE resident_id = ?")
        .get(RESIDENT_ID).count, 1);

    for (const courseIndex of [1, 2, 3]) {
        const beforeEnroll = execute(executor, "go.school.view", {});
        const enrollOption = beforeEnroll.data.options.find((entry) =>
            entry.option.includes("school:course-enroll") &&
            entry.option.endsWith(`:agronomist:1:${courseIndex}`));
        assert.ok(enrollOption);
        const enrolled = execute(executor, "go.school.choose", { option: enrollOption.option });
        assert.equal(enrolled.ok, true);
        const reference = `agronomist:1:${courseIndex}`;
        const courseView = execute(executor, "go.school.view", { reference });
        assert.equal(courseView.ok, true);
        assert.equal(courseView.data.reference.content.practiceQuestions.length, 5);
        assert.deepEqual(Object.keys(courseView.data.reference.content.practiceQuestions[0]).sort(), [
            "id",
            "options",
            "stem",
        ]);
        const readOption = courseView.data.options.find((entry) =>
            entry.option.includes("school:course-read") && entry.option.includes(`:${reference}:`) &&
            entry.option.endsWith(`:${courseView.data.reference.content.contentDeliveryId}`));
        assert.ok(readOption);
        const read = execute(executor, "go.school.choose", { option: readOption.option });
        assert.equal(read.ok, true);
        let practiceOption = read.data.current.options.find((entry) =>
            entry.option.includes("school:course-practice") && entry.option.endsWith(`:${reference}`));
        assert.deepEqual(practiceOption.requires, ["answers"]);
        if (courseIndex === 1) {
            const failedPractice = execute(executor, "go.school.choose", {
                option: practiceOption.option,
                answers: ["A", "A", "A", "A", "A"],
            });
            assert.deepEqual({
                bestCorrectAnswers: failedPractice.data.result.bestCorrectAnswers,
                correctAnswers: failedPractice.data.result.correctAnswers,
                passed: failedPractice.data.result.passed,
            }, {
                bestCorrectAnswers: 2,
                correctAnswers: 2,
                passed: false,
            });
            assert.equal(failedPractice.data.result.review.length, 5);
            practiceOption = failedPractice.data.current.options.find((entry) =>
                entry.option.includes("school:course-practice") && entry.option.endsWith(`:${reference}`));
        }
        const answerData = JSON.parse(database.prepare(`SELECT answer_key_json
          FROM career_assessment_papers WHERE target_key = ?`)
            .get(`course:${RESIDENT_ID}:agronomist:1:${courseIndex}`).answer_key_json);
        const passedPractice = execute(executor, "go.school.choose", {
            option: practiceOption.option,
            answers: answerData.answers ?? answerData,
        });
        assert.equal(passedPractice.data.result.correctAnswers, 5);
        assert.equal(passedPractice.data.result.passed, true);
    }

    const examRegistrationView = execute(executor, "go.school.view", {});
    const registerExamOption = examRegistrationView.data.options.find((entry) =>
        entry.option.includes("school:exam-register") && entry.option.endsWith(":agronomist:1"));
    assert.ok(registerExamOption);
    const firstRegistration = execute(executor, "go.school.choose", { option: registerExamOption.option });
    assert.equal(firstRegistration.ok, true);
    database.prepare("UPDATE career_exam_attempts SET registration_status = 'postponed' WHERE attempt_id = ?")
        .run(firstRegistration.data.result.attemptId);
    const terminalInterviewView = execute(executor, "go.school.view", {});
    assert.ok(terminalInterviewView.data.options.some((entry) =>
        entry.option.includes("school:exam-register") && entry.option.endsWith(":agronomist:1")));
    database.prepare("UPDATE career_exam_attempts SET registration_status = 'registered' WHERE attempt_id = ?")
        .run(firstRegistration.data.result.attemptId);
    const staleReleaseOption = firstRegistration.data.current.options.find((entry) =>
        entry.option.includes("school:exam-release"));
    assert.ok(staleReleaseOption);
    actionNow = firstRegistration.data.result.scheduledAt + 2 * 60 * 60 * 1_000;
    const missedView = execute(executor, "go.school.view", {});
    assert.equal(missedView.data.exams.find((exam) =>
        exam.attemptId === firstRegistration.data.result.attemptId).registrationStatus, "expired");
    assert.equal(missedView.data.options.some((entry) =>
        entry.option === staleReleaseOption.option), false);
    assert.deepEqual({ ...database.prepare(`SELECT registration_status, settlement_receipt_id,
             release_receipt_id, ended_at, missed_session_at
        FROM career_exam_attempts WHERE attempt_id = ?`)
        .get(firstRegistration.data.result.attemptId) }, {
        registration_status: "failed",
        settlement_receipt_id: database.prepare(`SELECT settle_journal_id
          FROM economy_system_gold_reservations WHERE reservation_id = ?`)
            .get(firstRegistration.data.result.reservationId).settle_journal_id,
        release_receipt_id: null,
        ended_at: actionNow,
        missed_session_at: actionNow,
    });
    assert.equal(database.prepare(`SELECT state FROM economy_system_gold_reservations
      WHERE reservation_id = ?`).get(firstRegistration.data.result.reservationId).state, "settled");
    const reRegisterOption = missedView.data.options.find((entry) =>
        entry.option.includes("school:exam-register") && entry.option.endsWith(":agronomist:1"));
    assert.ok(reRegisterOption);
    const registeredExam = execute(executor, "go.school.choose", { option: reRegisterOption.option });
    assert.equal(registeredExam.ok, true);
    assert.equal(registeredExam.data.result.feeGold, 60_000);
    actionNow = registeredExam.data.result.scheduledAt;
    const examSessionView = execute(executor, "go.school.view", {});
    const startExamOption = examSessionView.data.options.find((entry) => entry.option.includes("school:exam-start"));
    assert.ok(startExamOption);
    const startedExam = execute(executor, "go.school.choose", { option: startExamOption.option });
    assert.equal(startedExam.data.result.questions.length, 20);
    assert.deepEqual(Object.keys(startedExam.data.result.questions[0]).sort(), ["id", "options", "stem"]);
    const submitExamOption = startedExam.data.current.options.find((entry) => entry.option.includes("school:exam-submit"));
    assert.deepEqual(submitExamOption.requires, ["answers"]);
    const examAnswerData = JSON.parse(database.prepare(`SELECT answer_key_json
      FROM career_assessment_papers WHERE exam_attempt_id = ?`)
        .get(registeredExam.data.result.attemptId).answer_key_json);
    const passedExam = execute(executor, "go.school.choose", {
        option: submitExamOption.option,
        answers: examAnswerData.answers ?? examAnswerData,
    });
    assert.deepEqual(passedExam.data.result, {
        status: "passed",
        correctAnswers: 20,
        passed: true,
    });
    assert.deepEqual({ ...database.prepare(`SELECT qualification_level, status
      FROM career_certificates WHERE resident_id = ? AND career = 'agronomist'`)
        .get(RESIDENT_ID) }, { qualification_level: 1, status: "active" });

    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'veterinarian', 2, ?)
    `).run(RESIDENT_ID, NOW);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'veterinarian', 1, 'active', ?, ?, ?)
    `).run(RESIDENT_ID, "fixture-veterinarian-certificate", NOW, NOW);
    const firstHireOption = execute(executor, "go.school.view", {}).data.options.find((entry) => entry.option.includes("school:employment-hire") && entry.option.endsWith(":veterinarian"));
    assert.ok(firstHireOption);
    const firstHire = execute(executor, "go.school.choose", { option: firstHireOption.option });
    assert.equal(firstHire.ok, true);
    const firstEmploymentId = firstHire.data.result.employmentId;
    const endOption = execute(executor, "go.school.view", {}).data.options.find((entry) => entry.option.includes("school:employment-end") && entry.option.endsWith(`:${firstEmploymentId}`));
    assert.ok(endOption);
    assert.equal(execute(executor, "go.school.choose", { option: endOption.option }).ok, true);
    const secondHireOption = execute(executor, "go.school.view", {}).data.options.find((entry) => entry.option.includes("school:employment-hire") && entry.option.endsWith(":veterinarian"));
    assert.ok(secondHireOption);
    assert.notEqual(secondHireOption.option, firstHireOption.option);
    const secondHire = execute(executor, "go.school.choose", { option: secondHireOption.option });
    assert.equal(secondHire.ok, true);
    assert.notEqual(secondHire.data.result.employmentId, firstEmploymentId);
    assert.deepEqual(database.prepare(`
      SELECT employment_id, status FROM career_employments
      WHERE resident_id = ? ORDER BY hired_at, employment_id
    `).all(RESIDENT_ID).map((row) => ({ ...row })), [
        { employment_id: firstEmploymentId, status: "ended" },
        { employment_id: secondHire.data.result.employmentId, status: "active" },
    ]);

    backend.trustedSystemCommands.createJob({
        jobId: "real-farm-job-1",
        career: "agronomist",
        sourceType: "farm_plot_condition",
        sourceId: "real-plot-condition-1",
        objectType: "farm_plot",
        objectId: `${FARM_ID}:plot:1`,
        ownerResidentId: OTHER_RESIDENT_ID,
        requiredLevel: 1,
        difficultyLevel: 1,
        assignmentMode: "accepted",
    });
    database.prepare(`
      INSERT INTO career_commission_payments (job_id, trade_id, silver_amount, created_at)
      VALUES ('real-farm-job-1', NULL, 10, ?)
    `).run(NOW);
    database.prepare(`
      INSERT INTO career_commission_source_facts (source_id, source_type, fact_json, recorded_at)
      VALUES ('real-plot-condition-1', 'farm_plot_condition', ?, ?)
    `).run(JSON.stringify({ farmDoorplate: FARM_ID, plotId: 1, condition: "drought", status: "open" }), NOW);
    const farmCommissions = execute(executor, "go.farm.commission", {});
    assert.equal(farmCommissions.ok, true);
    assert.equal(farmCommissions.data.jobs.length, 1);
    assert.equal(farmCommissions.data.jobs[0].sourceId, "real-plot-condition-1");
    assert.deepEqual(farmCommissions.data.options, [{ option: "commission:accept:real-farm-job-1" }]);
    const accepted = execute(executor, "go.farm.commission", {
        option: "commission:accept:real-farm-job-1",
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.data.result.status, "accepted");
    assert.equal(accepted.data.result.workerResidentId, RESIDENT_ID);
    const residentFacade = backend.forResident(RESIDENT_ID);
    assert.deepEqual(residentFacade.recordOwnJobDecision({
        changesWorld: false,
        consumesResources: false,
        idempotencyKey: "resident-facade-check",
        jobId: "real-farm-job-1",
        kind: "check",
        optionReference: "inspect",
        resultReference: "inspection-complete",
        workerResidentId: OTHER_RESIDENT_ID,
    }), { sequence: 1, status: "active" });
    const transferred = residentFacade.transferOwnJob({
        jobId: "real-farm-job-1",
        successorJobId: "resident-facade-successor",
        successorSourceId: "resident-facade-successor-source",
        workerResidentId: OTHER_RESIDENT_ID,
    });
    assert.equal(transferred.transferred.workerResidentId, RESIDENT_ID);
    assert.equal(transferred.transferred.status, "transferred");
    backend.trustedSystemCommands.createJob({
        jobId: "resident-facade-job",
        career: "agronomist",
        sourceType: "farm_plot_condition",
        sourceId: "resident-facade-source",
        objectType: "farm_plot",
        objectId: `${FARM_ID}:plot:facade`,
        ownerResidentId: OTHER_RESIDENT_ID,
        requiredLevel: 1,
        difficultyLevel: 1,
        assignmentMode: "accepted",
    });
    assert.equal(residentFacade.acceptOwnJob("resident-facade-job").workerResidentId, RESIDENT_ID);

    const noHospitalSource = execute(executor, "go.hospital.commission", {});
    assert.deepEqual(noHospitalSource.data.jobs, []);
    assert.deepEqual(noHospitalSource.data.options, []);

    const notMigrated = execute(executor, "go.bank.view", {}, {
        residentId: OTHER_RESIDENT_ID,
        bindingReference: "missing-migration",
    });
    assert.equal(notMigrated.ok, false);
    assert.equal(notMigrated.error.code, "LINGYE_NOT_READY");
});

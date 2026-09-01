import assert from "node:assert/strict";
import test from "node:test";

import { COURSE_TUITION_GOLD, EXAM_FEE_GOLD } from "../dist/career/contracts.js";
import { careerAdvancementWorkEligibility } from "../dist/career/school-service.js";
import {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";
import { createLingyeActionExecutor } from "../dist/server/doorbell/lingye.js";

const NOW = Date.parse("2026-09-01T12:00:00+08:00");
const RESIDENT_ID = "019ffb01-49cd-7020-c4af-3d04fb1ed03d";
const BINDING_REFERENCE = "career-advancement-work-gate";
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: 5,
    restrictedDailyGoldLimit: 150_000,
    restrictedDailySilverLimit: 300,
};
const CURRICULUM = Object.freeze({
    careerCourseAvailability: () => true,
    careerCourseContent: (career, level, courseIndex) => ({
        career,
        level,
        courseIndex,
        title: `${career}-${level}-${courseIndex}`,
        contentMarkdown: "test",
        bankVersion: "career-advancement-test-v1",
    }),
    careerExamAvailability: () => true,
    createCoursePracticePaper: (career, level, courseIndex, residentId) => ({
        kind: "course_practice",
        targetKey: `course:${residentId}:${career}:${level}:${courseIndex}`,
        bankVersion: "career-advancement-test-v1",
        publicPaper: Array.from({ length: 5 }, (_, index) => ({
            id: `practice-${index + 1}`,
            stem: `Question ${index + 1}`,
            options: { A: "A", B: "B", C: "C", D: "D" },
        })),
        answerKey: Array.from({ length: 5 }, () => "A"),
        review: Array.from({ length: 5 }, (_, index) => ({
            id: `practice-${index + 1}`,
            correctAnswer: "A",
            explanation: "test",
        })),
    }),
    createWrittenExamPaper: () => {
        throw new Error("not used");
    },
});

function optionWithLabel(options, label) {
    return options.find((entry) => entry.label === label);
}

test("advancement thresholds are career-specific and count only the current qualification level", () => {
    const database = openLingyeWorldDatabase(":memory:");
    try {
        const expected = {
            chef: [20, 200, 500],
            agronomist: [10, 100, 200],
            veterinarian: [10, 100, 200],
            reporter: [5, 30, 80],
            constable: [3, 15, 40],
        };
        for (const [career, requirements] of Object.entries(expected)) {
            for (const [index, required] of requirements.entries()) {
                const eligibility = careerAdvancementWorkEligibility(
                    database,
                    "threshold-resident",
                    career,
                    index + 2,
                );
                assert.equal(eligibility.requiredCurrentLevelExperience, required);
                assert.equal(eligibility.eligible, false);
            }
        }

        const insertWorkRecord = database.prepare(`INSERT INTO career_work_records (
          work_record_id, job_id, resident_id, career, qualification_level,
          difficulty_level, record_kind, performance_units, recorded_at
        ) VALUES (?, ?, 'threshold-resident', 'agronomist', ?, 1, 'completed', 1, ?)`);
        for (let index = 1; index <= 100; index += 1) {
            insertWorkRecord.run(`level-one-${index}`, `level-one-job-${index}`, 1, NOW + index);
        }
        const ignoresLowerLevel = careerAdvancementWorkEligibility(
            database,
            "threshold-resident",
            "agronomist",
            3,
        );
        assert.equal(ignoresLowerLevel.currentLevelExperience, 0);
        assert.equal(ignoresLowerLevel.eligible, false);

        for (let index = 1; index <= 100; index += 1) {
            insertWorkRecord.run(`level-two-${index}`, `level-two-job-${index}`, 2, NOW + 200 + index);
        }
        assert.equal(careerAdvancementWorkEligibility(
            database,
            "threshold-resident",
            "agronomist",
            3,
        ).eligible, true);
    }
    finally {
        database.close();
    }
});

test("chef advancement counts only successful original cooking after the current certificate", () => {
    const database = openLingyeWorldDatabase(":memory:");
    const residentId = "chef-threshold-resident";
    try {
        database.prepare(`INSERT INTO career_tracks (
          resident_id, career, track_order, selected_at
        ) VALUES (?, 'chef', 1, ?)`).run(residentId, NOW - 2_000);
        database.prepare(`INSERT INTO career_certificates (
          resident_id, career, qualification_level, status,
          source_attempt_id, issued_at, effective_at
        ) VALUES (?, 'chef', 1, 'active', 'chef-level-one-certificate', ?, ?)`)
            .run(residentId, NOW - 1_000, NOW);
        const insertProduction = database.prepare(`INSERT INTO chef_recipe_production_commissions (
          cooking_receipt_id, cook_resident_id, recipe_id, author_resident_id,
          rarity, commission_gold, settlement, financial_receipt_id, created_at
        ) VALUES (?, ?, ?, ?, 'N', 0, 'author_self', NULL, ?)`);
        insertProduction.run("before-certificate", residentId, "recipe-before", residentId, NOW - 1);
        for (let index = 1; index <= 20; index += 1) {
            insertProduction.run(`current-level-${index}`, residentId, `recipe-${index}`,
                residentId, NOW + index);
        }

        const eligibility = careerAdvancementWorkEligibility(database, residentId, "chef", 2);
        assert.equal(eligibility.experienceKind, "original_recipe_production");
        assert.equal(eligibility.currentLevelExperience, 20);
        assert.equal(eligibility.requiredCurrentLevelExperience, 20);
        assert.equal(eligibility.eligible, true);
    }
    finally {
        database.close();
    }
});

test("next-level courses remain available while exam registration waits for real work records", () => {
    const database = openLingyeWorldDatabase(":memory:");
    try {
        const backend = createLingyeWorldBackend(database, {
            economyRules: ECONOMY_RULES,
            curriculum: CURRICULUM,
            now: () => NOW,
        });
        const executor = createLingyeActionExecutor({
            database,
            backend,
            economyRules: ECONOMY_RULES,
            now: () => NOW,
        });
        registerLingyeResidentReference(database, {
            residentId: RESIDENT_ID,
            bindingReference: BINDING_REFERENCE,
            registeredAt: NOW,
        });
        backend.trustedSystemCommands.importLegacyBalances({
            residentId: RESIDENT_ID,
            gold: 1_000_000,
            silver: 0,
            migrationId: `economy:${BINDING_REFERENCE}`,
            idempotencyKey: `economy:${BINDING_REFERENCE}`,
        });
        backend.trustedSystemCommands.selectCareer(RESIDENT_ID, "reporter");
        database.prepare(`INSERT INTO career_certificates (
          resident_id, career, qualification_level, status,
          source_attempt_id, issued_at, effective_at
        ) VALUES (?, 'reporter', 1, 'active', 'level-one-certificate', ?, ?)`)
            .run(RESIDENT_ID, NOW, NOW);

        for (const courseIndex of [1, 2, 3]) {
            backend.trustedSystemCommands.enrollCourse({
                residentId: RESIDENT_ID,
                career: "reporter",
                level: 2,
                courseIndex,
                amount: COURSE_TUITION_GOLD[2],
                actor: "agent",
                idempotencyKey: `level-two-course-${courseIndex}`,
            });
            database.prepare(`UPDATE career_courses SET completed_at = ?
              WHERE resident_id = ? AND career = 'reporter'
                AND qualification_level = 2 AND course_index = ?`)
                .run(NOW, RESIDENT_ID, courseIndex);
        }

        const runSchoolView = () => executor.execute({
            residentId: RESIDENT_ID,
            bindingReference: BINDING_REFERENCE,
            farm: null,
            op: "go.school.view",
            args: {},
        });
        const before = runSchoolView();
        assert.equal(before.ok, true);
        assert.equal(before.data.courses.filter((course) =>
            course.career === "reporter" && course.qualificationLevel === 2).length, 3);
        assert.deepEqual(before.data.advancement, [{
            career: "reporter",
            eligible: false,
            targetLevel: 2,
            previousLevel: 1,
            experienceKind: "qualified_commission",
            currentLevelExperience: 0,
            requiredCurrentLevelExperience: 5,
            registrationStatus: "work_experience_required",
            message: "工作经验不足，不能报考。",
        }]);
        assert.equal(optionWithLabel(before.data.options, "报名资格考试：记者"), undefined);

        const goldBeforeRejectedRegistration = backend.forResident(RESIDENT_ID).getOwnAccount().availableGold;
        assert.throws(() => backend.trustedSystemCommands.registerExam({
            attemptId: "blocked-level-two-exam",
            residentId: RESIDENT_ID,
            career: "reporter",
            level: 2,
            amount: EXAM_FEE_GOLD[2],
            actor: "agent",
            idempotencyKey: "blocked-level-two-exam",
        }), (error) => error?.code === "work_record_requirement_not_met");
        assert.equal(backend.forResident(RESIDENT_ID).getOwnAccount().availableGold,
            goldBeforeRejectedRegistration);
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_exam_attempts").get().count, 0);

        const insertWorkRecord = database.prepare(`INSERT INTO career_work_records (
          work_record_id, job_id, resident_id, career, qualification_level,
          difficulty_level, record_kind, performance_units, recorded_at
        ) VALUES (?, ?, ?, 'reporter', 1, 1, 'completed', 1, ?)`);
        for (let index = 1; index <= 5; index += 1) {
            insertWorkRecord.run(`work-${index}`, `job-${index}`, RESIDENT_ID, NOW + index);
        }
        assert.equal(careerAdvancementWorkEligibility(database, RESIDENT_ID, "reporter", 2).eligible, true);

        const after = runSchoolView();
        assert.equal(after.data.advancement[0].eligible, true);
        assert.equal(after.data.advancement[0].message, null);
        assert.ok(optionWithLabel(after.data.options, "报名资格考试：记者"));
    }
    finally {
        database.close();
    }
});

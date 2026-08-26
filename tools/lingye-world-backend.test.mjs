import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
    runLingyeWorldTransaction,
} from "../dist/lingye-world-database.js";
import { assertSupportedNodeVersion } from "../dist/runtime-version.js";

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

test("farm runtime rejects Node versions below the node:sqlite transaction contract", () => {
    assert.doesNotThrow(() => assertSupportedNodeVersion("22.16.0"));
    assert.doesNotThrow(() => assertSupportedNodeVersion("24.0.0"));
    assert.throws(() => assertSupportedNodeVersion("22.15.9"), /Node\.js >=22\.16\.0 is required/u);
    assert.throws(() => assertSupportedNodeVersion("20.20.0"), /Node\.js >=22\.16\.0 is required/u);
    assert.doesNotThrow(() => assertSupportedNodeVersion());
});

function createHarness() {
    const directory = mkdtempSync(join(tmpdir(), "lingye-world-backend-"));
    const databasePath = join(directory, "lingye-world.sqlite");
    const database = openLingyeWorldDatabase(databasePath);
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: ECONOMY_RULES,
        generateId: () => `world-${++sequence}`,
        now: () => NOW,
        exposeInternalsForTesting: true,
    });
    return { backend, database, databasePath, directory, services: backend.testing };
}

test("Lingye world keeps resident references, economy and careers in one isolated authority", () => {
    const harness = createHarness();
    try {
        assert.equal(harness.database.isTransaction, false);
        assert.deepEqual(Object.keys(harness.backend).sort(), [
            "queries",
            "residentCommands",
            "testing",
            "trustedSystemCommands",
        ]);
        assert.equal(Object.hasOwn(harness.backend, "commands"), false);
        assert.equal(Object.hasOwn(harness.backend, "economy"), false);
        assert.equal(Object.hasOwn(harness.backend, "career"), false);
        assert.deepEqual(Object.keys(harness.backend.residentCommands).sort(), [
            "cancelPlayerLoan",
            "confirmPlayerLoan",
            "confirmTrade",
            "proposePlayerLoan",
            "repayPlayerLoan",
        ]);
        for (const command of [
            "importLegacyBalances",
            "creditFromSystem",
            "chargeToSystem",
            "settleTrade",
            "cancelTrade",
            "refundTrade",
        ]) {
            assert.equal(Object.hasOwn(harness.backend.residentCommands, command), false);
            assert.equal(Object.hasOwn(harness.backend.trustedSystemCommands, command), true);
        }
        const publicBackend = createLingyeWorldBackend(harness.database, {
            economyRules: ECONOMY_RULES,
            now: () => NOW,
        });
        assert.deepEqual(Object.keys(publicBackend).sort(), [
            "queries",
            "residentCommands",
            "trustedSystemCommands",
        ]);
        assert.equal(Object.hasOwn(publicBackend, "testing"), false);
        assert.equal(runLingyeWorldTransaction(harness.database, () => {
            assert.equal(harness.database.isTransaction, true);
            return runLingyeWorldTransaction(harness.database, () => {
                assert.equal(harness.database.isTransaction, true);
                return "nested-transaction-ok";
            });
        }), "nested-transaction-ok");
        assert.equal(harness.database.isTransaction, false);
        const resident = registerLingyeResidentReference(harness.database, {
            residentId: "resident-a",
            bindingReference: "migration-a",
            registeredAt: NOW,
        });
        assert.deepEqual(registerLingyeResidentReference(harness.database, {
            residentId: "resident-a",
            bindingReference: "migration-a",
            registeredAt: NOW + 1,
        }), resident);
        assert.throws(() => registerLingyeResidentReference(harness.database, {
            residentId: "resident-b",
            bindingReference: "migration-a",
            registeredAt: NOW,
        }), /binding conflict/u);

        harness.services.economy.importLegacyBalances({
            residentId: "resident-a",
            gold: 200_000,
            silver: 300,
            migrationId: "economy-migration-a",
            idempotencyKey: "economy-migration-a",
        });
        harness.services.career.school.selectCareer("resident-a", "reporter");

        harness.backend.trustedSystemCommands.enrollCourse({
            residentId: "resident-a",
            career: "reporter",
            level: 1,
            courseIndex: 1,
            amount: 20_000,
            actor: "human",
            idempotencyKey: "career-tuition-1",
        });

        assert.equal(harness.services.economy.getAccount("resident-a").availableGold, 180_000);
        assert.deepEqual({ ...harness.database
            .prepare(`SELECT c.career, a.available_gold, r.binding_reference
              FROM career_tracks c
              JOIN economy_accounts a ON a.resident_id = c.resident_id
              JOIN residents r ON r.resident_id = c.resident_id`)
            .get() }, {
            available_gold: 180_000,
            binding_reference: "migration-a",
            career: "reporter",
        });

        assert.throws(() => harness.backend.trustedSystemCommands.enrollCourse({
            residentId: "resident-a",
            career: "reporter",
            level: 1,
            courseIndex: 2,
            amount: 80_000,
            actor: "human",
            idempotencyKey: "career-tuition-rollback",
        }));
        assert.equal(harness.services.economy.getAccount("resident-a").availableGold, 180_000);
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM economy_commands WHERE idempotency_key = 'career-tuition-rollback'")
            .get().count, 0);
        assert.throws(() => harness.backend.trustedSystemCommands.registerExam({
            attemptId: "atomic-exam-rollback",
            residentId: "resident-a",
            career: "reporter",
            level: 1,
            amount: 40_000,
            actor: "human",
            idempotencyKey: "atomic-exam-rollback",
        }));
        assert.equal(harness.services.economy.getAccount("resident-a").availableGold, 180_000);
        assert.equal(harness.services.economy.getAccount("resident-a").frozenGold, 0);
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM economy_commands WHERE idempotency_key = 'atomic-exam-rollback'")
            .get().count, 0);

        harness.database.close();
        const reopened = openLingyeWorldDatabase(harness.databasePath);
        try {
            assert.equal(reopened
                .prepare("SELECT available_gold FROM economy_accounts WHERE resident_id = 'resident-a'")
                .get().available_gold, 180_000);
            assert.equal(reopened
                .prepare("SELECT COUNT(*) AS count FROM career_courses WHERE resident_id = 'resident-a'")
                .get().count, 1);
        }
        finally {
            reopened.close();
        }
    }
    finally {
        if (harness.database.isOpen)
            harness.database.close();
        rmSync(harness.directory, { recursive: true, force: true });
    }
});

test("failed world command rolls back its economy writes inside a committed outer transaction", () => {
    const harness = createHarness();
    try {
        registerLingyeResidentReference(harness.database, {
            residentId: "resident-nested-rollback",
            bindingReference: "migration-nested-rollback",
            registeredAt: NOW,
        });
        harness.services.economy.importLegacyBalances({
            residentId: "resident-nested-rollback",
            gold: 200_000,
            silver: 0,
            migrationId: "economy-migration-nested-rollback",
            idempotencyKey: "economy-migration-nested-rollback",
        });
        harness.services.career.school.selectCareer("resident-nested-rollback", "reporter");

        const before = {
            availableGold: harness.services.economy.getAccount("resident-nested-rollback").availableGold,
            commandCount: harness.database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count,
            courseCount: harness.database.prepare("SELECT COUNT(*) AS count FROM career_courses").get().count,
            journalCount: harness.database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count,
        };

        harness.database.exec("BEGIN");
        let commandError;
        try {
            harness.backend.trustedSystemCommands.enrollCourse({
                residentId: "resident-nested-rollback",
                career: "reporter",
                level: 1,
                courseIndex: 2,
                amount: 80_000,
                actor: "human",
                idempotencyKey: "career-tuition-nested-rollback",
            });
        }
        catch (error) {
            commandError = error;
        }
        harness.database.exec("COMMIT");

        assert.ok(commandError instanceof Error);
        assert.equal(harness.database.isTransaction, false);
        assert.equal(
            harness.services.economy.getAccount("resident-nested-rollback").availableGold,
            before.availableGold,
        );
        assert.equal(
            harness.database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count,
            before.journalCount,
        );
        assert.equal(
            harness.database.prepare("SELECT COUNT(*) AS count FROM economy_commands").get().count,
            before.commandCount,
        );
        assert.equal(
            harness.database.prepare("SELECT COUNT(*) AS count FROM career_courses").get().count,
            before.courseCount,
        );
    }
    finally {
        if (harness.database.isTransaction)
            harness.database.exec("ROLLBACK");
        if (harness.database.isOpen)
            harness.database.close();
        rmSync(harness.directory, { recursive: true, force: true });
    }
});

test("reporter evaluation below five valid likes records a legitimate zero award", () => {
    const harness = createHarness();
    try {
        registerLingyeResidentReference(harness.database, {
            residentId: "reporter-zero",
            bindingReference: "migration-reporter-zero",
            registeredAt: NOW,
        });
        harness.services.economy.importLegacyBalances({
            residentId: "reporter-zero",
            gold: 10_000,
            silver: 0,
            migrationId: "economy-migration-reporter-zero",
            idempotencyKey: "economy-migration-reporter-zero",
        });
        harness.services.career.school.selectCareer("reporter-zero", "reporter");
        harness.database
            .prepare(`INSERT INTO career_certificates (
              resident_id, career, qualification_level, status,
              source_attempt_id, issued_at, effective_at
            ) VALUES (?, 'reporter', 1, 'active', ?, ?, ?)`)
            .run("reporter-zero", "reporter-zero-certificate", NOW, NOW);
        harness.services.career.employment.hire({
            career: "reporter",
            employmentId: "reporter-zero-employment",
            institution: "lingye_daily",
            residentId: "reporter-zero",
        });
        harness.database
            .prepare(`INSERT INTO career_duty_days (
              duty_id, employment_id, resident_id, career, institution, duty_date,
              qualification_level, base_wage_gold, status, generated_at
            ) VALUES (?, ?, ?, 'reporter', 'lingye_daily', '2026-09-01', 1, 2000, 'scheduled', ?)`)
            .run("reporter-zero-duty", "reporter-zero-employment", "reporter-zero", NOW);
        harness.services.career.jobs.createJob({
            jobId: "reporter-zero-job",
            career: "reporter",
            sourceType: "daily_material_pack",
            sourceId: "reporter-zero-source",
            objectType: "article",
            objectId: "reporter-zero-article",
            ownerResidentId: "reporter-zero",
            requiredLevel: 1,
            difficultyLevel: 1,
            assignmentMode: "accepted",
        });
        harness.services.career.jobs.acceptJob("reporter-zero-job", "reporter-zero");
        for (const [index, changesWorld] of [false, true].entries()) {
            harness.services.career.jobs.recordDecision({
                jobId: "reporter-zero-job",
                workerResidentId: "reporter-zero",
                idempotencyKey: `reporter-zero-decision-${index + 1}`,
                kind: index === 0 ? "check" : "treatment",
                optionReference: `reporter-zero-option-${index + 1}`,
                resultReference: `reporter-zero-result-${index + 1}`,
                consumesResources: false,
                changesWorld,
            });
        }
        harness.services.career.jobs.completeJob({
            jobId: "reporter-zero-job",
            workerResidentId: "reporter-zero",
            validationPassed: true,
            worldResultReference: "reporter-zero-published",
        });

        const beforeGold = harness.services.economy.getAccount("reporter-zero").availableGold;
        const beforeJournals = harness.database
            .prepare("SELECT COUNT(*) AS count FROM economy_journals")
            .get().count;
        assert.deepEqual(
            harness.backend.trustedSystemCommands.addReporterLikePerformance({
                jobId: "reporter-zero-job",
                residentId: "reporter-zero",
                amount: 0,
                validLikes: 4,
                sourceReference: "reporter-zero-evaluation",
                idempotencyKey: "reporter-zero-evaluation",
            }),
            { performanceGold: 0, units: 0 },
        );
        assert.equal(harness.services.economy.getAccount("reporter-zero").availableGold, beforeGold);
        assert.equal(
            harness.database.prepare("SELECT COUNT(*) AS count FROM economy_journals").get().count,
            beforeJournals,
        );
        assert.equal(
            harness.database
                .prepare("SELECT COUNT(*) AS count FROM economy_commands WHERE idempotency_key = ?")
                .get("reporter-zero-evaluation").count,
            0,
        );
    }
    finally {
        if (harness.database.isOpen)
            harness.database.close();
        rmSync(harness.directory, { recursive: true, force: true });
    }
});

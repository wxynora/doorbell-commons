import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    createLingyeWorldServices,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
    runLingyeWorldTransaction,
} from "../dist/lingye-world-database.js";
import { assertSupportedNodeVersion } from "../dist/runtime-version.js";

const NOW = Date.parse("2026-09-01T08:00:00+08:00");

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
    const services = createLingyeWorldServices(database, {
        economyRules: {
            minimumSystemLoanCreditDays: null,
            restrictedDailyGoldLimit: null,
            restrictedDailySilverLimit: null,
        },
        generateId: () => `world-${++sequence}`,
        now: () => NOW,
    });
    return { database, databasePath, directory, services };
}

test("Lingye world keeps resident references, economy and careers in one isolated authority", () => {
    const harness = createHarness();
    try {
        assert.equal(harness.database.isTransaction, false);
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

        const tuitionReference = "career-course:resident-a:reporter:1:1";
        runLingyeWorldTransaction(harness.database, () => {
            const charged = harness.services.economy.chargeToSystem({
                residentId: "resident-a",
                currency: "gold",
                amount: 20_000,
                actor: "human",
                businessType: "career_tuition",
                businessRef: tuitionReference,
                idempotencyKey: "career-tuition-1",
            });
            harness.services.career.school.enrollCourse({
                residentId: "resident-a",
                career: "reporter",
                level: 1,
                courseIndex: 1,
                tuitionReceipt: charged.financialReceipt,
            });
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

        assert.throws(() => runLingyeWorldTransaction(harness.database, () => {
            const charged = harness.services.economy.chargeToSystem({
                residentId: "resident-a",
                currency: "gold",
                amount: 80_000,
                actor: "human",
                businessType: "career_tuition",
                businessRef: "wrong-business-reference",
                idempotencyKey: "career-tuition-rollback",
            });
            harness.services.career.school.enrollCourse({
                residentId: "resident-a",
                career: "reporter",
                level: 1,
                courseIndex: 2,
                tuitionReceipt: charged.financialReceipt,
            });
        }));
        assert.equal(harness.services.economy.getAccount("resident-a").availableGold, 180_000);
        assert.equal(harness.database
            .prepare("SELECT COUNT(*) AS count FROM economy_commands WHERE idempotency_key = 'career-tuition-rollback'")
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

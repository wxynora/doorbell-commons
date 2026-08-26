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
    const backend = createLingyeWorldBackend(database, {
        economyRules: ECONOMY_RULES,
        generateId: () => `lingye-action-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: ECONOMY_RULES,
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
    backend.trustedSystemCommands.importLegacyBalances({
        residentId: RESIDENT_ID,
        gold: 2_000_000,
        silver: 600,
        migrationId: `economy:${MIGRATION_ID}`,
        idempotencyKey: `economy:${MIGRATION_ID}`,
    });

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
        courseContentAvailable: false,
        examQuestionBankAvailable: false,
    });
    const agronomistOption = schoolBefore.data.options.find((entry) => entry.option === "school:career-select:agronomist");
    assert.ok(agronomistOption);
    const selectedCareer = execute(executor, "go.school.choose", { option: agronomistOption.option });
    assert.equal(selectedCareer.ok, true);
    assert.deepEqual(selectedCareer.data.result, { career: "agronomist", trackOrder: 1 });
    assert.equal(selectedCareer.data.current.options.some((entry) => /course|exam/u.test(entry.option)), false);

    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'agronomist', 1, 'active', ?, ?, ?)
    `).run(RESIDENT_ID, "fixture-agronomist-certificate", NOW, NOW);
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

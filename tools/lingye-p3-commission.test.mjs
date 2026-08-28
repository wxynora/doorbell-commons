import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-lingye-p3-commission-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const { makeFarm } = await import("../dist/game.js");
const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { beijingDay } = await import("../dist/career/p3-world.js");
const {
    AGRONOMY_NPC_BASE_FEE_GOLD,
    farmActionTouchesLockedCareerObject,
    HOSPITAL_BASE_FEE_GOLD,
    startRegisteredP3Scheduler,
    syncAuthorityJobs,
} = await import("../dist/career/p3-commission-runtime.js");
const { getFarm, insertFarm, replaceFarm } = await import("../dist/store.js");

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const OWNER = "019ffc01-49cd-7020-84af-3d04fb1ed03d";
const AGRONOMIST = "019ffc01-49cd-7020-94af-3d04fb1ed03d";
const VETERINARIAN = "019ffc01-49cd-7020-a4af-3d04fb1ed03d";
const REPORTER = "019ffc01-49cd-7020-b4af-3d04fb1ed03d";
const CONSTABLE = "019ffc01-49cd-7020-c4af-3d04fb1ed03d";
const FARM_ID = "P3C234";
const MIGRATION = "019ffc01-49cd-7020-d4af-3d04fb1ed03d";
const RULES = {
    minimumSystemLoanCreditDays: 5,
    restrictedDailyGoldLimit: 1_000_000,
    restrictedDailySilverLimit: 1_000,
};

function execute(executor, residentId, op, args, farm) {
    const bindingReference = residentId === OWNER ? MIGRATION : `binding:${residentId}`;
    return executor.execute({ residentId, bindingReference, farm, op, args });
}

function registerResident(database, backend, residentId, bindingReference, gold = 0, silver = 0) {
    registerLingyeResidentReference(database, { residentId, bindingReference, registeredAt: NOW });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId,
        gold,
        silver,
        migrationId: `economy:${bindingReference}`,
        idempotencyKey: `economy:${bindingReference}`,
    });
}

function certify(database, residentId, career, level = 1) {
    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, ?, 1, ?)
    `).run(residentId, career, NOW);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).run(residentId, career, level, `certificate:${residentId}:${career}`, NOW, NOW);
}

function scheduleDuty(database, residentId, career, institution, seatNumber) {
    const employmentId = `employment:${residentId}:${career}`;
    database.prepare(`
      INSERT INTO career_employments (
        employment_id, resident_id, career, institution, seat_number,
        status, availability, hired_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 'available', ?)
    `).run(employmentId, residentId, career, institution, seatNumber, NOW);
    database.prepare(`
      INSERT INTO career_duty_days (
        duty_id, employment_id, resident_id, career, institution, duty_date,
        qualification_level, base_wage_gold, status, generated_at
      ) VALUES (?, ?, ?, ?, ?, '2026-09-01', 1, 2000, 'scheduled', ?)
    `).run(`duty:${residentId}:${career}`, employmentId, residentId, career, institution, NOW);
}

test("P3 commissions bind real sources to payment, world results, review state, and authoritative completion", () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-commission-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES });

    registerResident(database, backend, OWNER, MIGRATION, 100_000, 100);
    registerResident(database, backend, AGRONOMIST, `binding:${AGRONOMIST}`);
    registerResident(database, backend, VETERINARIAN, `binding:${VETERINARIAN}`);
    registerResident(database, backend, REPORTER, `binding:${REPORTER}`);
    registerResident(database, backend, CONSTABLE, `binding:${CONSTABLE}`);
    certify(database, AGRONOMIST, "agronomist");
    certify(database, VETERINARIAN, "veterinarian");
    certify(database, REPORTER, "reporter");
    certify(database, CONSTABLE, "constable");
    scheduleDuty(database, VETERINARIAN, "veterinarian", "animal_hospital", 1);
    scheduleDuty(database, REPORTER, "reporter", "lingye_daily", 1);
    scheduleDuty(database, CONSTABLE, "constable", "public_security", 1);

    const farm = makeFarm("P3 commission", 711);
    farm.id = FARM_ID;
    farm.doorbellMcpMigration = { migrationId: MIGRATION };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: `p3:agronomy:${FARM_ID}:fixture:1`,
            condition: "drought",
            status: "open",
            generatedDay: beijingDay(NOW),
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.ranch = {
        animals: [{
            kindId: "chicken",
            ticksSinceProduce: 0,
            pending: 0,
            lingyeHealth: {
                sourceId: `p3:animal:${FARM_ID}:fixture:0`,
                condition: "indigestion",
                status: "open",
                generatedDay: beijingDay(NOW),
                generatedAt: NOW,
                checks: [],
                treatments: [],
                recoveryUntilDay: null,
            },
        }],
        coins: 0,
        raids: [],
        raidDebts: [],
        pets: [],
    };
    farm.trail = [{ t: NOW - 1_000, kind: "stolen", by: "visitor", plotId: 1, crop: "test" }];
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW),
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);

    const agronomySource = execute(executor, OWNER, "go.farm.commission", {}, getFarm(FARM_ID)).data.sources[0];
    assert.equal(Object.hasOwn(agronomySource.fact, "condition"), false);
    const publishedAgronomy = execute(executor, OWNER, "go.farm.commission", {
        option: `commission:publish:${agronomySource.sourceId}`,
        amount: 25,
    }, getFarm(FARM_ID));
    assert.equal(publishedAgronomy.ok, true);
    const agronomyJobId = publishedAgronomy.data.result.jobId;
    assert.equal(execute(executor, AGRONOMIST, "go.farm.commission", {
        option: `commission:accept:${agronomyJobId}`,
    }).ok, true);
    assert.equal(backend.forResident(OWNER).getOwnAccount().availableSilver, 75);
    const checkedAgronomy = execute(executor, AGRONOMIST, "go.farm.commission", {
        option: `commission:check:${agronomyJobId}:soil`,
    });
    assert.equal(checkedAgronomy.ok, true, JSON.stringify(checkedAgronomy));
    const lockedPlotId = agronomySource.fact.plotId;
    const unlockedPlotId = farm.plots.find((plot) => plot.id !== lockedPlotId).id;
    assert.equal(farmActionTouchesLockedCareerObject(database, FARM_ID, "harvest", { plotId: lockedPlotId }), true);
    assert.equal(farmActionTouchesLockedCareerObject(database, FARM_ID, "ripen", { plots: [unlockedPlotId, lockedPlotId] }), true);
    assert.equal(farmActionTouchesLockedCareerObject(database, FARM_ID, "water", { plotId: unlockedPlotId }), false);
    assert.equal(farmActionTouchesLockedCareerObject(database, FARM_ID, "run", {}), true);
    const agronomyTreatment = {
        option: `commission:treat:${agronomyJobId}:water-retaining-cover`,
    };
    let injectedFailure = true;
    const faultExecutor = createLingyeActionExecutor({
        database,
        backend,
        economyRules: RULES,
        afterWorldApplyForTesting() {
            if (injectedFailure) {
                injectedFailure = false;
                throw new Error("forced_after_world_apply");
            }
        },
    });
    assert.throws(() => execute(faultExecutor, AGRONOMIST, "go.farm.commission", agronomyTreatment),
        /forced_after_world_apply/u);
    assert.equal(getFarm(FARM_ID).plots[0].crop.lingyeAgronomy.status, "resolved");
    assert.equal(backend.trustedQueries.getJob(agronomyJobId).status, "active");
    const restartedExecutor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const completedAgronomy = execute(restartedExecutor, AGRONOMIST, "go.farm.commission", agronomyTreatment);
    assert.equal(completedAgronomy.ok, true);
    assert.equal(completedAgronomy.data.result.status, "completed");
    assert.deepEqual(execute(executor, AGRONOMIST, "go.farm.commission", agronomyTreatment), completedAgronomy);
    assert.equal(backend.forResident(OWNER).getOwnAccount().availableGold, 95_000);
    assert.equal(backend.forResident(AGRONOMIST).getOwnAccount().availableSilver, 25);
    assert.equal(getFarm(FARM_ID).plots[0].crop.lingyeAgronomy.status, "resolved");

    const animalSource = execute(executor, OWNER, "go.hospital.commission", {}, getFarm(FARM_ID)).data.sources[0];
    assert.equal(Object.hasOwn(animalSource.fact, "condition"), false);
    const publishedAnimal = execute(executor, OWNER, "go.hospital.commission", {
        option: `commission:publish:${animalSource.sourceId}`,
    }, getFarm(FARM_ID));
    const animalJobId = publishedAnimal.data.result.jobId;
    assert.equal(execute(executor, VETERINARIAN, "go.hospital.commission", {
        option: `commission:assign:${animalJobId}`,
    }).error.code, "OPTION_NOT_AVAILABLE");
    assert.equal(backend.trustedQueries.getJob(animalJobId).workerResidentId, VETERINARIAN);
    assert.equal(execute(executor, VETERINARIAN, "go.hospital.commission", {
        option: `commission:check:${animalJobId}:feed-history`,
    }).ok, true);
    const wrongTreatmentArgs = {
        option: `commission:treat:${animalJobId}:wound-cleanser+bandage`,
    };
    const wrongTreatment = execute(executor, VETERINARIAN, "go.hospital.commission", wrongTreatmentArgs);
    assert.equal(wrongTreatment.ok, true);
    assert.equal(wrongTreatment.data.result.status, "active");
    assert.equal(getFarm(FARM_ID).ranch.animals[0].lingyeHealth.status, "treating");
    assert.equal(backend.forResident(OWNER).getOwnAccount().availableGold, 84_000);
    assert.deepEqual(
        execute(executor, VETERINARIAN, "go.hospital.commission", wrongTreatmentArgs),
        wrongTreatment,
    );
    assert.equal(backend.forResident(OWNER).getOwnAccount().availableGold, 84_000);
    const treatedAnimal = execute(executor, VETERINARIAN, "go.hospital.commission", {
        option: `commission:treat:${animalJobId}:stomach-powder`,
    });
    assert.equal(treatedAnimal.ok, true);
    assert.equal(treatedAnimal.data.result.status, "completed");
    assert.equal(getFarm(FARM_ID).ranch.animals[0].lingyeHealth.status, "recovering");
    assert.equal(backend.forResident(OWNER).getOwnAccount().availableGold, 76_000);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count
      FROM economy_system_gold_reservations
      WHERE resident_id = ? AND business_reference LIKE ?`)
        .get(OWNER, `career-job:${animalJobId}:materials:%`).count, 2);

    const securitySource = execute(executor, OWNER, "go.security.commission", {}, getFarm(FARM_ID)).data.sources[0];
    const farmWithNewTrail = structuredClone(getFarm(FARM_ID));
    farmWithNewTrail.trail.unshift({
        t: NOW,
        kind: "foiled",
        by: "new-visitor",
        plotId: 2,
        crop: "new-test",
    });
    replaceFarm(FARM_ID, farmWithNewTrail);
    const refreshedSecuritySources = execute(
        executor,
        OWNER,
        "go.security.commission",
        {},
        getFarm(FARM_ID),
    ).data.sources;
    assert.equal(refreshedSecuritySources.some((source) => source.sourceId === securitySource.sourceId), true);
    assert.equal(new Set(refreshedSecuritySources.map((source) => source.sourceId)).size, 2);
    const securityPublished = execute(executor, OWNER, "go.security.commission", {
        option: `commission:publish:${securitySource.sourceId}`,
    }, getFarm(FARM_ID));
    const securityJobId = securityPublished.data.result.jobId;
    assert.equal(execute(executor, CONSTABLE, "go.security.commission", {
        option: `commission:assign:${securityJobId}`,
    }).error.code, "OPTION_NOT_AVAILABLE");
    assert.equal(backend.trustedQueries.getJob(securityJobId).workerResidentId, CONSTABLE);
    assert.equal(execute(executor, CONSTABLE, "go.security.commission", {
        option: `commission:check:${securityJobId}:facts`,
    }).ok, true);
    const resolvedSecurity = execute(executor, CONSTABLE, "go.security.commission", {
        option: `commission:resolve:${securityJobId}:rules_explained`,
        text: "recorded result",
    });
    assert.equal(resolvedSecurity.ok, true);
    assert.equal(resolvedSecurity.data.status, "completed");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_security_resolutions WHERE job_id = ?")
        .get(securityJobId).count, 1);

    const newsroom = execute(executor, REPORTER, "go.newsroom.commission", {});
    const reporterJob = newsroom.data.jobs.find((job) => job.sourceType === "public_event_fact");
    assert.ok(reporterJob);
    assert.equal(reporterJob.sourceFacts.sourceId, reporterJob.sourceId);
    assert.equal(reporterJob.sourceFacts.sourceType, "public_event_fact");
    assert.equal(typeof reporterJob.sourceFacts.publicFact.title, "string");
    assert.equal(execute(executor, REPORTER, "go.newsroom.commission", {
        option: `commission:accept:${reporterJob.jobId}`,
    }).ok, true);
    assert.equal(execute(executor, REPORTER, "go.newsroom.commission", {
        option: `commission:check:${reporterJob.jobId}:sources`,
    }).ok, true);
    const submitted = execute(executor, REPORTER, "go.newsroom.commission", {
        option: `commission:submit:${reporterJob.jobId}`,
        text: "candidate article",
    });
    assert.equal(submitted.ok, true);
    assert.equal(submitted.data.status, "pending_review");
    assert.equal(backend.trustedQueries.getJob(reporterJob.jobId).status, "active");

    database.close();
    rmSync(dataDirectory, { recursive: true, force: true });
});

test("agronomy transfer releases the old payment and requires an owner-approved successor payment", () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-transfer-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const owner = "019ffc05-49cd-7020-84af-3d04fb1ed03d";
    const firstWorker = "019ffc05-49cd-7020-94af-3d04fb1ed03d";
    const secondWorker = "019ffc05-49cd-7020-a4af-3d04fb1ed03d";
    const migration = "019ffc05-49cd-7020-b4af-3d04fb1ed03d";
    const farmId = "P3TRANSFER";
    registerResident(database, backend, owner, migration, 100_000, 100);
    registerResident(database, backend, firstWorker, `binding:${firstWorker}`);
    registerResident(database, backend, secondWorker, `binding:${secondWorker}`);
    certify(database, firstWorker, "agronomist");
    certify(database, secondWorker, "agronomist");
    const run = (residentId, args, farm) => executor.execute({
        residentId,
        bindingReference: residentId === owner ? migration : `binding:${residentId}`,
        farm,
        op: "go.farm.commission",
        args,
    });
    const farm = makeFarm("P3 transfer", 715);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: `p3:agronomy:${farmId}:fixture:1`,
            condition: "drought",
            status: "open",
            generatedDay: beijingDay(NOW),
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW),
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);
    const source = run(owner, {}, getFarm(farmId)).data.sources[0];
    const published = run(owner, {
        option: `commission:publish:${source.sourceId}`,
        amount: 25,
    }, getFarm(farmId));
    const originalJobId = published.data.result.jobId;
    assert.equal(run(firstWorker, { option: `commission:accept:${originalJobId}` }).ok, true);
    assert.equal(backend.forResident(owner).getOwnAccount().availableSilver, 75);
    assert.equal(run(firstWorker, { option: `commission:check:${originalJobId}:soil` }).ok, true);
    const transferred = run(firstWorker, { option: `commission:transfer:${originalJobId}` });
    assert.equal(transferred.ok, true, JSON.stringify(transferred));
    const successor = transferred.data.successor;
    assert.equal(backend.forResident(owner).getOwnAccount().availableSilver, 100);
    assert.equal(successor.sourceId, source.sourceId);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_commission_payments WHERE job_id = ?")
        .get(successor.jobId).count, 0);
    assert.equal(run(secondWorker, {}).data.options.some((entry) =>
        entry.option === `commission:accept:${successor.jobId}`), false);
    const ownerView = run(owner, {}, getFarm(farmId));
    const republish = ownerView.data.options.find((entry) =>
        entry.option === `commission:republish:${successor.jobId}`);
    assert.deepEqual(republish.requires, ["amount"]);
    assert.equal(run(owner, { option: republish.option, amount: 30 }, getFarm(farmId)).ok, true);
    const accept = run(secondWorker, {}).data.options.find((entry) =>
        entry.option === `commission:accept:${successor.jobId}`);
    assert.ok(accept);
    assert.equal(run(secondWorker, { option: accept.option }).ok, true);
    assert.equal(backend.forResident(owner).getOwnAccount().availableSilver, 70);
    database.close();
});

test("veterinarian transfer immediately reassigns the successor to another authoritative worker", () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-vet-transfer-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const owner = "019ffc08-49cd-7020-a4af-3d04fb1ed03d";
    const firstWorker = "019ffc08-49cd-7020-84af-3d04fb1ed03d";
    const secondWorker = "019ffc08-49cd-7020-94af-3d04fb1ed03d";
    const migration = "019ffc08-49cd-7020-b4af-3d04fb1ed03d";
    const farmId = "P3VET234";
    registerResident(database, backend, owner, migration, 100_000);
    registerResident(database, backend, firstWorker, `binding:${firstWorker}`);
    registerResident(database, backend, secondWorker, `binding:${secondWorker}`);
    certify(database, firstWorker, "veterinarian");
    certify(database, secondWorker, "veterinarian");
    scheduleDuty(database, firstWorker, "veterinarian", "animal_hospital", 1);
    scheduleDuty(database, secondWorker, "veterinarian", "animal_hospital", 2);
    const farm = makeFarm("P3 veterinarian transfer", 718);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.ranch = {
        animals: [{
            kindId: "chicken",
            ticksSinceProduce: 0,
            pending: 0,
            lingyeHealth: {
                sourceId: `p3:animal:${farmId}:fixture:0`,
                condition: "indigestion",
                status: "open",
                generatedDay: beijingDay(NOW),
                generatedAt: NOW,
                checks: [],
                treatments: [],
                recoveryUntilDay: null,
            },
        }],
        coins: 0,
        raids: [],
        raidDebts: [],
        pets: [],
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW),
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);
    const run = (residentId, args, targetFarm) => executor.execute({
        residentId,
        bindingReference: residentId === owner ? migration : `binding:${residentId}`,
        farm: targetFarm,
        op: "go.hospital.commission",
        args,
    });
    const source = run(owner, {}, getFarm(farmId)).data.sources[0];
    const published = run(owner, { option: `commission:publish:${source.sourceId}` }, getFarm(farmId));
    const jobId = published.data.result.jobId;
    assert.equal(backend.trustedQueries.getJob(jobId).workerResidentId, firstWorker);
    assert.equal(run(firstWorker, {
        option: `commission:check:${jobId}:feed-history`,
    }).ok, true);
    const transferred = run(firstWorker, {
        option: `commission:transfer:${jobId}`,
    });
    assert.equal(transferred.ok, true, JSON.stringify(transferred));
    assert.equal(transferred.data.successor.workerResidentId, secondWorker);
    assert.equal(backend.trustedQueries.getJob(transferred.data.successor.jobId).workerResidentId, secondWorker);
    database.close();
});

test("four commission decisions close further world actions and one bad recovery row cannot block startup", () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-decision-cap-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const owner = "019ffc09-49cd-7020-84af-3d04fb1ed03d";
    const worker = "019ffc09-49cd-7020-94af-3d04fb1ed03d";
    const migration = "019ffc09-49cd-7020-a4af-3d04fb1ed03d";
    const farmId = "P3CAP234";
    registerResident(database, backend, owner, migration, 100_000, 100);
    registerResident(database, backend, worker, `binding:${worker}`);
    certify(database, worker, "agronomist", 4);
    const farm = makeFarm("P3 decision capacity", 719);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 1,
        ripe: false,
        lingyeAgronomy: {
            sourceId: `p3:agronomy:${farmId}:fixture:1`,
            condition: "nutrient_imbalance",
            status: "open",
            generatedDay: beijingDay(NOW),
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW),
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);
    const run = (residentId, args, targetFarm) => executor.execute({
        residentId,
        bindingReference: residentId === owner ? migration : `binding:${residentId}`,
        farm: targetFarm,
        op: "go.farm.commission",
        args,
    });
    const source = run(owner, {}, getFarm(farmId)).data.sources[0];
    const published = run(owner, {
        option: `commission:publish:${source.sourceId}`,
        amount: 25,
    }, getFarm(farmId));
    const jobId = published.data.result.jobId;
    assert.equal(run(worker, { option: `commission:accept:${jobId}` }).ok, true);
    for (const check of ["leaf", "soil", "root", "pest-trace"]) {
        assert.equal(run(worker, {
            option: `commission:check:${jobId}:${check}`,
        }).ok, true);
    }
    const cappedView = run(worker, {});
    assert.deepEqual(cappedView.data.options.map((entry) => entry.option), [
        `commission:transfer:${jobId}`,
    ]);
    const worldBefore = JSON.stringify(getFarm(farmId));
    const operationsBefore = database.prepare(`SELECT COUNT(*) AS count
      FROM lingye_cross_store_operations WHERE job_id = ?`).get(jobId).count;
    const fifth = run(worker, {
        option: `commission:check:${jobId}:treatment-history`,
    });
    assert.equal(fifth.error.code, "OPTION_NOT_AVAILABLE");
    assert.equal(JSON.stringify(getFarm(farmId)), worldBefore);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count
      FROM lingye_cross_store_operations WHERE job_id = ?`).get(jobId).count, operationsBefore);

    const badRow = database.prepare(`SELECT action_key FROM lingye_cross_store_operations
      WHERE job_id = ? ORDER BY created_at, action_key LIMIT 1`).get(jobId);
    database.prepare(`UPDATE lingye_cross_store_operations
      SET status = 'world_applied', result_json = NULL WHERE action_key = ?`)
        .run(badRow.action_key);
    const recoveryMessages = [];
    const originalConsoleError = console.error;
    console.error = (...parts) => recoveryMessages.push(parts.join(" "));
    try {
        assert.doesNotThrow(() => createLingyeActionExecutor({
            database,
            backend,
            economyRules: RULES,
        }));
    }
    finally {
        console.error = originalConsoleError;
    }
    assert.deepEqual(recoveryMessages, [
        "[doorbell-lingye] one pending cross-store operation could not be recovered",
    ]);
    database.close();
});

test("registered P3 farms also advance from the Beijing day-boundary scheduler", () => {
    const database = openLingyeWorldDatabase(":memory:");
    const owner = "019ffc06-49cd-7020-84af-3d04fb1ed03d";
    const migration = "019ffc06-49cd-7020-94af-3d04fb1ed03d";
    registerLingyeResidentReference(database, { residentId: owner, bindingReference: migration, registeredAt: NOW });
    const farm = makeFarm("P3 scheduler", 716);
    farm.id = "P3SCHEDULER";
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW) - 1,
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);
    let scheduled;
    let delay;
    const stop = startRegisteredP3Scheduler(database, {
        now: () => NOW,
        setTimer(callback, milliseconds) {
            scheduled = callback;
            delay = milliseconds;
            return { unref() {} };
        },
    });
    assert.equal(delay, 16 * 60 * 60 * 1_000);
    scheduled();
    assert.equal(getFarm(farm.id).lingyeP3.lastAdvancedDay, beijingDay(NOW));
    stop();
    database.close();
});

test("authority job sync waits for a qualified worker without breaking unrelated reads", () => {
    const database = openLingyeWorldDatabase(":memory:");
    const borrower = "019ffc07-49cd-7020-84af-3d04fb1ed03d";
    const constable = "019ffc07-49cd-7020-94af-3d04fb1ed03d";
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-authority-sync-${++sequence}`,
        now: () => NOW,
    });
    registerResident(database, backend, borrower, `binding:${borrower}`, 10_000);
    database.prepare(`
      INSERT INTO economy_system_loans (
        loan_id, borrower_resident_id, principal_original, principal_outstanding,
        daily_rate_ppm, term_days, originated_day, accrued_through_day, due_day,
        status, created_at
      ) VALUES ('overdue-loan', ?, 1000, 1000, 1000, 14, 1, 14, 14, 'overdue', ?)
    `).run(borrower, NOW);
    certify(database, borrower, "constable");
    scheduleDuty(database, borrower, "constable", "public_security", 1);

    assert.doesNotThrow(() => syncAuthorityJobs(database, backend, NOW));
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_jobs WHERE source_type = 'bank_overdue_notice'").get().count, 0);

    registerResident(database, backend, constable, `binding:${constable}`);
    certify(database, constable, "constable");
    scheduleDuty(database, constable, "constable", "public_security", 2);
    syncAuthorityJobs(database, backend, NOW);
    const job = database.prepare("SELECT worker_resident_id FROM career_jobs WHERE source_type = 'bank_overdue_notice'").get();
    assert.equal(job.worker_resident_id, constable);
    database.close();
});

test("system NPC fallback settles real agronomy and hospital sources without player work", () => {
    assert.deepEqual(AGRONOMY_NPC_BASE_FEE_GOLD, {
        1: 20_000,
        2: 60_000,
        3: 150_000,
        4: 400_000,
    });
    assert.deepEqual(Object.fromEntries(Object.entries(HOSPITAL_BASE_FEE_GOLD)
        .map(([level, baseFee]) => [level, baseFee * 3])), {
        1: 15_000,
        2: 45_000,
        3: 120_000,
        4: 300_000,
    });
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-npc-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const owner = "019ffc02-49cd-7020-84af-3d04fb1ed03d";
    const stranger = "019ffc02-49cd-7020-94af-3d04fb1ed03d";
    const migration = "019ffc02-49cd-7020-a4af-3d04fb1ed03d";
    const farmId = "P3NPC234";
    registerResident(database, backend, owner, migration, 500_000);
    registerResident(database, backend, stranger, `binding:${stranger}`, 500_000);
    const executeOwner = (op, args, targetFarm) => executor.execute({
        residentId: owner,
        bindingReference: migration,
        farm: targetFarm,
        op,
        args,
    });
    const executeStranger = (op, args, targetFarm) => executor.execute({
        residentId: stranger,
        bindingReference: `binding:${stranger}`,
        farm: targetFarm,
        op,
        args,
    });

    const farm = makeFarm("P3 NPC", 712);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: `p3:agronomy:${farmId}:fixture:1`,
            condition: "drought",
            status: "open",
            generatedDay: beijingDay(NOW),
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.ranch = {
        animals: [{
            kindId: "chicken",
            ticksSinceProduce: 0,
            pending: 0,
            lingyeHealth: {
                sourceId: `p3:animal:${farmId}:fixture:0`,
                condition: "compound_fever",
                status: "open",
                generatedDay: beijingDay(NOW),
                generatedAt: NOW,
                checks: [],
                treatments: [],
                recoveryUntilDay: null,
            },
        }],
        coins: 0,
        raids: [],
        raidDebts: [],
        pets: [],
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW),
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);

    const agronomy = executeOwner("go.farm.commission", {}, getFarm(farmId));
    assert.equal(agronomy.ok, true, JSON.stringify(agronomy));
    const agronomySource = agronomy.data.sources[0];
    const agronomyOption = { option: `commission:npc:${agronomySource.sourceId}` };
    assert.equal(agronomy.data.options.some((entry) => entry.option === agronomyOption.option), true);
    assert.equal(executeStranger("go.farm.commission", agronomyOption, getFarm(farmId)).error.code, "OPTION_NOT_AVAILABLE");
    const treatedAgronomy = executeOwner("go.farm.commission", agronomyOption, getFarm(farmId));
    assert.equal(treatedAgronomy.ok, true, JSON.stringify(treatedAgronomy));
    assert.deepEqual(treatedAgronomy.data.result.fee, {
        baseGold: 20_000,
        materialGold: 5_000,
        totalGold: 25_000,
    });
    assert.equal(getFarm(farmId).plots[0].crop.lingyeAgronomy.status, "resolved");
    assert.equal(backend.forResident(owner).getOwnAccount().availableGold, 475_000);
    assert.deepEqual(executeOwner("go.farm.commission", agronomyOption, getFarm(farmId)), treatedAgronomy);

    const hospital = executeOwner("go.hospital.commission", {}, getFarm(farmId));
    const animalSource = hospital.data.sources[0];
    const animalOption = { option: `commission:npc:${animalSource.sourceId}` };
    const treatedAnimal = executeOwner("go.hospital.commission", animalOption, getFarm(farmId));
    assert.equal(treatedAnimal.ok, true, JSON.stringify(treatedAnimal));
    assert.deepEqual(treatedAnimal.data.result.fee, {
        baseGold: 300_000,
        materialGold: 22_000,
        totalGold: 322_000,
    });
    assert.equal(getFarm(farmId).ranch.animals[0].lingyeHealth.status, "recovering");
    assert.equal(backend.forResident(owner).getOwnAccount().availableGold, 153_000);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_npc_service_settlements").get().count, 2);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count FROM career_jobs
      WHERE source_id IN (?, ?)
    `).get(agronomySource.sourceId, animalSource.sourceId).count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_work_records").get().count, 0);

    database.close();
});

test("failed NPC fallback leaves money, source state, and settlement unchanged", () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-npc-failed-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const owner = "019ffc03-49cd-7020-84af-3d04fb1ed03d";
    const migration = "019ffc03-49cd-7020-94af-3d04fb1ed03d";
    const farmId = "P3NPCLOW";
    registerResident(database, backend, owner, migration, 20_000);
    const executeOwner = (op, args, targetFarm) => executor.execute({
        residentId: owner,
        bindingReference: migration,
        farm: targetFarm,
        op,
        args,
    });
    const farm = makeFarm("P3 NPC low balance", 713);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: `p3:agronomy:${farmId}:fixture:1`,
            condition: "drought",
            status: "open",
            generatedDay: beijingDay(NOW),
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW),
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);
    const view = executeOwner("go.farm.commission", {}, getFarm(farmId));
    assert.equal(view.ok, true, JSON.stringify(view));
    const source = view.data.sources[0];
    const failed = executeOwner("go.farm.commission", {
        option: `commission:npc:${source.sourceId}`,
    }, getFarm(farmId));
    assert.deepEqual(failed, {
        ok: false,
        error: { code: "INSUFFICIENT_FUNDS", message: "可用余额不足，本次操作没有执行。" },
    });
    assert.equal(backend.forResident(owner).getOwnAccount().availableGold, 20_000);
    assert.equal(getFarm(farmId).plots[0].crop.lingyeAgronomy.status, "open");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_npc_service_settlements").get().count, 0);

    database.close();
});

test("NPC fallback recovers the same world action when SQLite settlement commit was lost", () => {
    const database = openLingyeWorldDatabase(":memory:");
    let sequence = 0;
    const backend = createLingyeWorldBackend(database, {
        economyRules: RULES,
        generateId: () => `p3-npc-recovery-${++sequence}`,
        now: () => NOW,
    });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const owner = "019ffc04-49cd-7020-84af-3d04fb1ed03d";
    const migration = "019ffc04-49cd-7020-94af-3d04fb1ed03d";
    const farmId = "P3NPCRCV";
    registerResident(database, backend, owner, migration, 100_000);
    const executeOwner = (op, args, targetFarm) => executor.execute({
        residentId: owner,
        bindingReference: migration,
        farm: targetFarm,
        op,
        args,
    });
    const farm = makeFarm("P3 NPC recovery", 714);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.plots[0].crop = {
        seedType: "common",
        progress: 1,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
        lingyeAgronomy: {
            sourceId: `p3:agronomy:${farmId}:fixture:1`,
            condition: "drought",
            status: "open",
            generatedDay: beijingDay(NOW),
            generatedAt: NOW,
            checks: [],
            treatments: [],
            qualityPenalty: true,
        },
    };
    farm.lingyeP3 = {
        version: 1,
        lastAdvancedDay: beijingDay(NOW),
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    insertFarm(farm);
    const source = executeOwner("go.farm.commission", {}, getFarm(farmId)).data.sources[0];
    const args = { option: `commission:npc:${source.sourceId}` };
    database.exec(`
      CREATE TRIGGER fail_npc_settlement
      BEFORE INSERT ON career_npc_service_settlements
      BEGIN
        SELECT RAISE(FAIL, 'forced_npc_settlement_failure');
      END;
    `);
    assert.throws(() => executeOwner("go.farm.commission", args, getFarm(farmId)), /forced_npc_settlement_failure/u);
    assert.equal(getFarm(farmId).plots[0].crop.lingyeAgronomy.status, "resolved");
    assert.equal(backend.forResident(owner).getOwnAccount().availableGold, 100_000);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_npc_service_settlements").get().count, 0);
    database.exec("DROP TRIGGER fail_npc_settlement");

    const restartedExecutor = createLingyeActionExecutor({ database, backend, economyRules: RULES });
    const recovered = restartedExecutor.execute({
        residentId: owner,
        bindingReference: migration,
        farm: getFarm(farmId),
        op: "go.farm.commission",
        args,
    });
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(recovered.data.result.fee.totalGold, 25_000);
    assert.equal(backend.forResident(owner).getOwnAccount().availableGold, 75_000);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_npc_service_settlements").get().count, 1);
    assert.equal(Object.keys(getFarm(farmId).lingyeP3.actionReceipts).length, 1);
    assert.equal(database.prepare(`
      SELECT status FROM lingye_cross_store_operations WHERE action_key LIKE ?
    `).get(`%`).status, "completed");

    database.close();
});

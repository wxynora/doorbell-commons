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
const { AGRONOMY_NPC_BASE_FEE_GOLD, HOSPITAL_BASE_FEE_GOLD } = await import("../dist/career/p3-commission-runtime.js");
const { getFarm, insertFarm } = await import("../dist/store.js");

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
    const agronomyTreatment = {
        option: `commission:treat:${agronomyJobId}:water-retaining-cover`,
    };
    const completedAgronomy = execute(executor, AGRONOMIST, "go.farm.commission", agronomyTreatment);
    assert.equal(completedAgronomy.ok, true);
    assert.equal(completedAgronomy.data.result.status, "completed");
    assert.deepEqual(execute(executor, AGRONOMIST, "go.farm.commission", agronomyTreatment), completedAgronomy);
    assert.equal(backend.forResident(OWNER).getOwnAccount().availableGold, 95_000);
    assert.equal(backend.forResident(AGRONOMIST).getOwnAccount().availableSilver, 25);
    assert.equal(getFarm(FARM_ID).plots[0].crop.lingyeAgronomy.status, "resolved");

    const animalSource = execute(executor, OWNER, "go.hospital.commission", {}, getFarm(FARM_ID)).data.sources[0];
    const publishedAnimal = execute(executor, OWNER, "go.hospital.commission", {
        option: `commission:publish:${animalSource.sourceId}`,
    }, getFarm(FARM_ID));
    const animalJobId = publishedAnimal.data.result.jobId;
    assert.equal(execute(executor, VETERINARIAN, "go.hospital.commission", {
        option: `commission:assign:${animalJobId}`,
    }).ok, true);
    assert.equal(execute(executor, VETERINARIAN, "go.hospital.commission", {
        option: `commission:check:${animalJobId}:feed-history`,
    }).ok, true);
    const treatedAnimal = execute(executor, VETERINARIAN, "go.hospital.commission", {
        option: `commission:treat:${animalJobId}:stomach-powder`,
    });
    assert.equal(treatedAnimal.ok, true);
    assert.equal(treatedAnimal.data.result.status, "completed");
    assert.equal(getFarm(FARM_ID).ranch.animals[0].lingyeHealth.status, "recovering");
    assert.equal(backend.forResident(OWNER).getOwnAccount().availableGold, 87_000);

    const securitySource = execute(executor, OWNER, "go.security.commission", {}, getFarm(FARM_ID)).data.sources[0];
    const securityPublished = execute(executor, OWNER, "go.security.commission", {
        option: `commission:publish:${securitySource.sourceId}`,
    }, getFarm(FARM_ID));
    const securityJobId = securityPublished.data.result.jobId;
    assert.equal(execute(executor, CONSTABLE, "go.security.commission", {
        option: `commission:assign:${securityJobId}`,
    }).ok, true);
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

    const recovered = executeOwner("go.farm.commission", args, getFarm(farmId));
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(recovered.data.result.fee.totalGold, 25_000);
    assert.equal(backend.forResident(owner).getOwnAccount().availableGold, 75_000);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_npc_service_settlements").get().count, 1);
    assert.equal(Object.keys(getFarm(farmId).lingyeP3.actionReceipts).length, 1);

    database.close();
});

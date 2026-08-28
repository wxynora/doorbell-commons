import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-animal-constable-p3-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const { makeFarm } = await import("../dist/game.js");
const { dispatchRanchRaid, ranchCollect, ranchFeedAnimal } = await import("../dist/engine.js");
const { advanceRanch } = await import("../dist/domain/ranch/progression.js");
const {
    ANIMAL_CONDITIONS,
    animalCheckCandidates,
    animalChecksFor,
    animalObservationsFor,
    beijingDay,
    checkAnimalCase,
    currentP3Sources,
    treatAnimalCase,
    advanceP3Farm,
} = await import("../dist/career/p3-world.js");
const {
    createLingyeWorldBackend,
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { getFarm, insertFarm, replaceFarm } = await import("../dist/store.js");

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const RULES = {
    minimumSystemLoanCreditDays: 5,
    restrictedDailyGoldLimit: 1_000_000,
    restrictedDailySilverLimit: 1_000,
};

function animalFarm(condition, status = "open", id = `P3ANIMAL${condition}`) {
    const farm = makeFarm("P3 animal acceptance", 801);
    farm.id = id;
    farm.lastTickAt = NOW;
    farm.ranch = {
        animals: [{
            kindId: "chicken",
            ticksSinceProduce: 2,
            pending: 0,
            lingyeHealth: {
                sourceId: `p3:animal:${id}:fixture:0`,
                condition,
                status,
                generatedDay: beijingDay(NOW),
                generatedAt: NOW,
                checks: [],
                treatments: [],
                recoveryUntilDay: null,
            },
        }],
        coins: 10_000,
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
    return farm;
}

test.after(() => rmSync(dataDirectory, { recursive: true, force: true }));

test("animal P3 facts stay progressive, wrong material stays unresolved, and every health status gates ranch actions", () => {
    assert.ok(animalCheckCandidates(4).length > 1);
    assert.deepEqual(animalObservationsFor("dehydration"), [
        "increased_water_intake",
        "reduced_activity",
    ]);

    const reductions = { 1: 0, 2: 0.1, 3: 0.2, 4: 0.3 };
    let fixtureNumber = 0;
    for (const [condition, contract] of Object.entries(ANIMAL_CONDITIONS)) {
        for (const [levelText, reduction] of Object.entries(reductions)) {
            const level = Number(levelText);
            if (level < contract.minimumLevel)
                continue;
            const farm = animalFarm(condition, "open", `P3ANIMAL${fixtureNumber++}`);
            const sourceId = farm.ranch.animals[0].lingyeHealth.sourceId;
            const checked = checkAnimalCase(farm, sourceId, animalChecksFor(condition)[0]);
            assert.equal(checked.sourceId, sourceId);
            assert.ok(farm.ranch.animals[0].lingyeHealth.checks.length === 1);
            const treated = treatAnimalCase(farm, sourceId, contract.materials, level, NOW);
            assert.equal(treated.status, "recovering");
            assert.equal(treated.recoveryDays,
                Math.max(1, Math.ceil(contract.recoveryDays * (1 - reduction))));
        }
    }

    const wrongFarm = animalFarm("indigestion", "open", "P3ANIMALWRONG");
    const wrongSourceId = wrongFarm.ranch.animals[0].lingyeHealth.sourceId;
    checkAnimalCase(wrongFarm, wrongSourceId, "feed-history");
    const wrong = treatAnimalCase(wrongFarm, wrongSourceId, ["wound-cleanser", "bandage"], 4, NOW);
    assert.deepEqual(wrong, {
        sourceId: wrongSourceId,
        status: "treating",
        resolved: false,
        materialGold: 6_000,
    });
    assert.deepEqual(treatAnimalCase(wrongFarm, wrongSourceId, ["wound-cleanser", "bandage"], 4, NOW), wrong);
    assert.equal(wrongFarm.ranch.animals[0].lingyeHealth.status, "treating");
    assert.deepEqual(wrongFarm.ranch.animals[0].lingyeHealth.treatments, ["wound-cleanser+bandage"]);
    assert.equal(treatAnimalCase(wrongFarm, wrongSourceId, ["stomach-powder"], 4, NOW).resolved, true);

    for (const status of ["open", "treating", "recovering"]) {
        const farm = animalFarm("indigestion", status, `P3GATE${status}`);
        const animal = farm.ranch.animals[0];
        const beforeTicks = animal.ticksSinceProduce;
        advanceRanch(farm, 10);
        assert.equal(animal.ticksSinceProduce, beforeTicks, `${status} pauses production`);
        assert.deepEqual(ranchFeedAnimal(farm, 0, NOW), { ok: false, error: "OP_REJECTED" });
        const target = makeFarm("P3 gate target", 802);
        target.id = `P3GATETARGET${status}`;
        assert.deepEqual(dispatchRanchRaid(farm, target, 0, 1, NOW), { ok: false, error: "OP_REJECTED" });
    }

    const pendingFarm = animalFarm("indigestion", "open", "P3PENDING");
    pendingFarm.ranch.animals[0].pending = 1;
    assert.equal(ranchCollect(pendingFarm, [pendingFarm], NOW).ok, true);
    assert.equal(pendingFarm.ranch.animals[0].pending, 0);
});

function registerResident(database, backend, residentId, bindingReference, gold = 0) {
    registerLingyeResidentReference(database, {
        residentId,
        bindingReference,
        registeredAt: NOW,
    });
    backend.trustedSystemCommands.importLegacyBalances({
        residentId,
        gold,
        silver: 0,
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

test("completed animal history remains readable after recovery without exposing condition", () => {
    const database = openLingyeWorldDatabase(":memory:");
    const backend = createLingyeWorldBackend(database, { economyRules: RULES, now: () => NOW });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES, now: () => NOW });
    const owner = "019ffc20-49cd-7020-84af-3d04fb1ed03d";
    const veterinarian = "019ffc20-49cd-7020-94af-3d04fb1ed03d";
    const migration = "019ffc20-49cd-7020-a4af-3d04fb1ed03d";
    const farmId = "P3ANHISTORY";
    registerResident(database, backend, owner, migration, 100_000);
    registerResident(database, backend, veterinarian, `binding:${veterinarian}`);
    certify(database, veterinarian, "veterinarian", 1);
    scheduleDuty(database, veterinarian, "veterinarian", "animal_hospital", 1);

    const farm = animalFarm("indigestion", "open", farmId);
    farm.doorbellMcpMigration = { migrationId: migration };
    insertFarm(farm);
    const run = (residentId, args = {}, targetFarm = getFarm(farmId)) => executor.execute({
        residentId,
        bindingReference: residentId === owner ? migration : `binding:${residentId}`,
        farm: targetFarm,
        op: "go.hospital.commission",
        args,
    });

    const initial = run(owner);
    assert.equal(initial.ok, true, JSON.stringify(initial));
    const source = initial.data.sources[0];
    assert.equal(Object.hasOwn(source.fact, "condition"), false);
    const published = run(owner, { option: `commission:publish:${source.sourceId}` });
    assert.equal(published.ok, true, JSON.stringify(published));
    const jobId = published.data.result.jobId;
    assert.equal(run(veterinarian, { option: `commission:check:${jobId}:feed-history` }).ok, true);
    const treated = run(veterinarian, { option: `commission:treat:${jobId}:stomach-powder` });
    assert.equal(treated.ok, true, JSON.stringify(treated));
    const recoveryAt = (treated.data.world.recoveryUntilDay - beijingDay(NOW)) * DAY_MS + NOW;
    const recovered = getFarm(farmId);
    advanceP3Farm(recovered, recoveryAt);
    replaceFarm(farmId, recovered);

    const history = run(owner);
    assert.equal(history.ok, true, JSON.stringify(history));
    const job = history.data.jobs.find((entry) => entry.jobId === jobId);
    assert.ok(job);
    assert.equal(job.status, "completed");
    assert.equal(Object.hasOwn(job.sourceFacts.initialFact, "condition"), false);
    assert.deepEqual(job.sourceFacts.currentState, { status: "completed" });
    assert.equal(currentP3Sources(getFarm(farmId)).animal, null);
    database.close();
});

test("security P3 exposes stable real trail sources and only non-punitive results", () => {
    const database = openLingyeWorldDatabase(":memory:");
    const backend = createLingyeWorldBackend(database, { economyRules: RULES, now: () => NOW });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES, now: () => NOW });
    const owner = "019ffc21-49cd-7020-84af-3d04fb1ed03d";
    const constable = "019ffc21-49cd-7020-94af-3d04fb1ed03d";
    const migration = "019ffc21-49cd-7020-a4af-3d04fb1ed03d";
    const farmId = "P3SECURITY";
    registerResident(database, backend, owner, migration);
    registerResident(database, backend, constable, `binding:${constable}`);
    certify(database, constable, "constable", 1);
    scheduleDuty(database, constable, "constable", "public_security", 1);

    const farm = makeFarm("P3 security", 803);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    farm.trail = [{ t: NOW, kind: "stolen", by: "external-player", plotId: 1, crop: "test-crop" }];
    insertFarm(farm);
    const run = (residentId, args = {}, targetFarm = getFarm(farmId)) => executor.execute({
        residentId,
        bindingReference: residentId === owner ? migration : `binding:${residentId}`,
        farm: targetFarm,
        op: "go.security.commission",
        args,
    });

    const firstView = run(owner);
    assert.equal(firstView.ok, true, JSON.stringify(firstView));
    const source = firstView.data.sources[0];
    const secondView = run(owner);
    assert.equal(secondView.data.sources[0].sourceId, source.sourceId);
    assert.equal(typeof getFarm(farmId).trail[0].eventId, "string");
    assert.equal(Object.hasOwn(source.fact.event, "eventId"), true);

    const published = run(owner, { option: `commission:publish:${source.sourceId}` });
    assert.equal(published.ok, true, JSON.stringify(published));
    const jobId = published.data.result.jobId;
    const forged = run(constable, { option: `commission:resolve:${jobId}:penalty`, text: "unsupported" });
    assert.deepEqual(forged.error, { code: "OPTION_NOT_AVAILABLE", message: "OPTION_NOT_AVAILABLE" });
    assert.equal(run(constable, { option: `commission:check:${jobId}:facts` }).ok, true);
    const resolved = run(constable, {
        option: `commission:resolve:${jobId}:rules_explained`,
        text: "recorded facts",
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    assert.equal(database.prepare("SELECT result_kind FROM career_security_resolutions WHERE job_id = ?")
        .get(jobId).result_kind, "rules_explained");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_security_resolutions WHERE job_id = ? AND result_kind LIKE 'penalty%'")
        .get(jobId).count, 0);
    database.close();
});

test("a bank overdue matter has no party-cancel option and remains a real loan fact", () => {
    const database = openLingyeWorldDatabase(":memory:");
    const backend = createLingyeWorldBackend(database, { economyRules: RULES, now: () => NOW });
    const executor = createLingyeActionExecutor({ database, backend, economyRules: RULES, now: () => NOW });
    const borrower = "019ffc22-49cd-7020-84af-3d04fb1ed03d";
    const constable = "019ffc22-49cd-7020-94af-3d04fb1ed03d";
    const migration = "019ffc22-49cd-7020-a4af-3d04fb1ed03d";
    const farmId = "P3BANKSEC";
    registerResident(database, backend, borrower, migration);
    registerResident(database, backend, constable, `binding:${constable}`);
    certify(database, constable, "constable", 1);
    scheduleDuty(database, constable, "constable", "public_security", 1);
    database.prepare(`
      INSERT INTO economy_system_loans (
        loan_id, borrower_resident_id, principal_original, principal_outstanding,
        daily_rate_ppm, term_days, originated_day, accrued_through_day, due_day,
        status, created_at
      ) VALUES ('p3-bank-loan', ?, 1000, 1000, 1000, 14, 1, 14, 14, 'overdue', ?)
    `).run(borrower, NOW);
    const farm = makeFarm("P3 bank security", 804);
    farm.id = farmId;
    farm.doorbellMcpMigration = { migrationId: migration };
    insertFarm(farm);
    const run = (residentId, args = {}) => executor.execute({
        residentId,
        bindingReference: residentId === borrower ? migration : `binding:${residentId}`,
        farm: getFarm(farmId),
        op: "go.security.commission",
        args,
    });

    const view = run(borrower);
    assert.equal(view.ok, true, JSON.stringify(view));
    const job = view.data.jobs.find((entry) => entry.sourceType === "bank_overdue_notice");
    assert.ok(job);
    assert.equal(job.ownerResidentId, borrower);
    assert.equal(job.workerResidentId, constable);
    assert.equal(view.data.options.some((entry) => entry.option === `commission:cancel:${job.jobId}`), false);
    const forgedCancel = run(borrower, { option: `commission:cancel:${job.jobId}` });
    assert.deepEqual(forgedCancel.error, { code: "OPTION_NOT_AVAILABLE", message: "OPTION_NOT_AVAILABLE" });
    assert.equal(database.prepare("SELECT status FROM economy_system_loans WHERE loan_id = 'p3-bank-loan'").get().status, "overdue");
    assert.equal(backend.trustedQueries.getJob(job.jobId).status, "assigned");
    database.close();
});

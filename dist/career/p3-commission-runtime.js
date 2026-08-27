import { createHash } from "node:crypto";
import { allFarms, getFarm, getPublicExpeditionWorld, replaceFarm } from "../store.js";
import { runLingyeWorldTransaction } from "../lingye-world-database.js";
import { CareerDomainError } from "./contracts.js";
import {
    AGRONOMY_CONDITIONS,
    ANIMAL_CONDITIONS,
    advanceP3Farm,
    agronomyCheckCandidates,
    agronomyChecksFor,
    agronomyObservationsFor,
    agronomyTreatmentCandidates,
    animalCheckCandidates,
    animalChecksFor,
    animalObservationsFor,
    animalTreatmentCandidates,
    checkAgronomyIssue,
    checkAnimalCase,
    currentP3Sources,
    runP3WorldAction,
    treatAgronomyIssue,
    treatAnimalCase,
} from "./p3-world.js";

export const HOSPITAL_BASE_FEE_GOLD = Object.freeze({
    1: 5_000,
    2: 15_000,
    3: 40_000,
    4: 100_000,
});

export const AGRONOMY_NPC_BASE_FEE_GOLD = Object.freeze({
    1: 20_000,
    2: 60_000,
    3: 150_000,
    4: 400_000,
});

function digest(value) {
    return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function commissionJobId(sourceId) {
    return `doorbell-job:${digest(sourceId).slice(0, 32)}`;
}

function saveAdvancedFarm(farm, now) {
    const staged = structuredClone(farm);
    const advanced = advanceP3Farm(staged, now);
    if (advanced.changed) {
        replaceFarm(farm.id, staged);
        return getFarm(farm.id);
    }
    return farm;
}

function registeredResidentForFarm(database, farm) {
    const bindingReference = farm?.doorbellMcpMigration?.migrationId;
    if (!bindingReference)
        return null;
    return database.prepare("SELECT resident_id FROM residents WHERE binding_reference = ?").get(bindingReference)?.resident_id ?? null;
}

export function advanceRegisteredP3Farms(database, now = Date.now()) {
    const changedFarmIds = [];
    for (const farm of allFarms()) {
        if (!registeredResidentForFarm(database, farm))
            continue;
        const current = saveAdvancedFarm(farm, now);
        if (current !== farm)
            changedFarmIds.push(farm.id);
    }
    return changedFarmIds;
}

function nextBeijingDayBoundary(now) {
    const offset = 8 * 60 * 60 * 1000;
    return (Math.floor((now + offset) / (24 * 60 * 60 * 1000)) + 1) *
        24 * 60 * 60 * 1000 - offset;
}

export function startRegisteredP3Scheduler(database, options = {}) {
    const now = options.now ?? Date.now;
    const setTimer = options.setTimer ?? setTimeout;
    let stopped = false;
    let timer;
    const schedule = () => {
        if (stopped)
            return;
        const current = now();
        timer = setTimer(() => {
            if (stopped)
                return;
            advanceRegisteredP3Farms(database, now());
            schedule();
        }, Math.max(0, nextBeijingDayBoundary(current) - current));
        timer?.unref?.();
    };
    schedule();
    return () => {
        stopped = true;
        if (timer)
            clearTimeout(timer);
    };
}

function agronomySource(farm, ownerResidentId, source) {
    if (!source)
        return null;
    const contract = AGRONOMY_CONDITIONS[source.condition];
    if (!contract)
        return null;
    return {
        sourceId: source.sourceId,
        career: "agronomist",
        sourceType: "farm_plot_condition",
        objectType: "farm_plot",
        objectId: `${farm.id}:plot:${source.plotId}`,
        ownerResidentId,
        requiredLevel: contract.minimumLevel,
        difficultyLevel: contract.minimumLevel,
        assignmentMode: "accepted",
        status: source.status,
        fact: {
            farmDoorplate: farm.id,
            plotId: source.plotId,
            condition: source.condition,
            observations: agronomyObservationsFor(source.condition),
            status: source.status,
        },
    };
}

function animalSource(farm, ownerResidentId, source) {
    if (!source)
        return null;
    const contract = ANIMAL_CONDITIONS[source.condition];
    if (!contract)
        return null;
    return {
        sourceId: source.sourceId,
        career: "veterinarian",
        sourceType: "animal_health_case",
        objectType: "farm_animal",
        objectId: `${farm.id}:animal:${source.animalIndex}`,
        ownerResidentId,
        requiredLevel: contract.minimumLevel,
        difficultyLevel: contract.minimumLevel,
        assignmentMode: "assigned",
        status: source.status,
        fact: {
            farmDoorplate: farm.id,
            animalIndex: source.animalIndex,
            animalKindId: source.animalKindId,
            condition: source.condition,
            observations: animalObservationsFor(source.condition),
            status: source.status,
        },
    };
}

function securityTrailSources(farm, ownerResidentId) {
    return (farm.trail ?? [])
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry?.kind === "stolen" || entry?.kind === "foiled")
        .map(({ entry, index }) => {
            const sourceId = `p3:security:trail:${farm.id}:${entry.t}:${entry.kind}:${index}`;
            return {
                sourceId,
                career: "constable",
                sourceType: "farm_interaction_complaint",
                objectType: "farm_trail_event",
                objectId: `${farm.id}:trail:${index}`,
                ownerResidentId,
                requiredLevel: 1,
                difficultyLevel: 1,
                assignmentMode: "assigned",
                status: "open",
                fact: {
                    farmDoorplate: farm.id,
                    event: structuredClone(entry),
                },
            };
        });
}

export function boundFarmSources(database, farm, ownerResidentId, now = Date.now()) {
    const authoritativeOwner = registeredResidentForFarm(database, farm);
    if (authoritativeOwner !== ownerResidentId)
        return [];
    const currentFarm = saveAdvancedFarm(farm, now);
    const sources = currentP3Sources(currentFarm);
    const candidates = [
        agronomySource(currentFarm, ownerResidentId, sources.agronomy),
        animalSource(currentFarm, ownerResidentId, sources.animal),
        ...securityTrailSources(currentFarm, ownerResidentId),
    ].filter(Boolean);
    for (const source of candidates) {
        database.prepare(`
          INSERT OR IGNORE INTO career_commission_source_facts (
            source_id, source_type, fact_json, recorded_at
          ) VALUES (?, ?, ?, ?)
        `).run(source.sourceId, source.sourceType, JSON.stringify(source.fact), now);
    }
    return candidates;
}

export function syncAuthorityJobs(database, backend, now = Date.now()) {
    const publicWorld = getPublicExpeditionWorld();
    for (const [index, entry] of (publicWorld?.history ?? []).entries()) {
        if (!entry || typeof entry !== "object")
            continue;
        const sourceId = `p3:reporter:public-expedition:${publicWorld.storyId}:${publicWorld.round}:${index}`;
        database.prepare(`
          INSERT OR IGNORE INTO career_commission_source_facts (
            source_id, source_type, fact_json, recorded_at
          ) VALUES (?, 'public_event_fact', ?, ?)
        `).run(sourceId, JSON.stringify({
            storyId: publicWorld.storyId,
            round: publicWorld.round,
            historyIndex: index,
            publicFact: entry,
        }), now);
        backend.trustedSystemCommands.createJob({
            jobId: commissionJobId(sourceId),
            career: "reporter",
            sourceType: "public_event_fact",
            sourceId,
            objectType: "public_event",
            objectId: `${publicWorld.storyId}:${publicWorld.round}:${index}`,
            ownerResidentId: null,
            requiredLevel: 1,
            difficultyLevel: 1,
            assignmentMode: "accepted",
        });
    }
    const overdueLoans = database.prepare(`
      SELECT loan_id, borrower_resident_id, status FROM economy_system_loans
      WHERE status IN ('overdue', 'restricted')
    `).all();
    for (const loan of overdueLoans) {
        const sourceId = `p3:security:system-loan:${loan.loan_id}`;
        database.prepare(`
          INSERT OR IGNORE INTO career_commission_source_facts (
            source_id, source_type, fact_json, recorded_at
          ) VALUES (?, 'bank_overdue_notice', ?, ?)
        `).run(sourceId, JSON.stringify({
            loanId: loan.loan_id,
            borrowerResidentId: loan.borrower_resident_id,
            status: loan.status,
        }), now);
        try {
            runLingyeWorldTransaction(database, () => {
                const job = backend.trustedSystemCommands.createJob({
                    jobId: commissionJobId(sourceId),
                    career: "constable",
                    sourceType: "bank_overdue_notice",
                    sourceId,
                    objectType: "system_loan",
                    objectId: loan.loan_id,
                    ownerResidentId: loan.borrower_resident_id,
                    requiredLevel: 1,
                    difficultyLevel: 1,
                    assignmentMode: "assigned",
                });
                if (job.workerResidentId === null)
                    backend.trustedSystemCommands.assignAuthorityJob({ jobId: job.jobId });
            });
        }
        catch (error) {
            if (!(error instanceof CareerDomainError) || error.code !== "authoritative_worker_unavailable")
                throw error;
        }
    }
    return now;
}

export function farmActionTouchesLockedCareerObject(database, farmId, action, params = {}) {
    if (!["run", "water", "harvest", "ripen", "use", "steal"].includes(action))
        return false;
    const prefix = `${farmId}:plot:`;
    const lockedPlotIds = new Set(database.prepare(`
      SELECT object_id FROM career_job_object_locks WHERE object_type = 'farm_plot'
    `).all()
        .map((row) => row.object_id)
        .filter((objectId) => objectId.startsWith(prefix))
        .map((objectId) => Number(objectId.slice(prefix.length)))
        .filter((plotId) => Number.isSafeInteger(plotId) && plotId > 0));
    if (lockedPlotIds.size === 0)
        return false;
    if (params.plotId !== undefined)
        return lockedPlotIds.has(Number(params.plotId));
    if (action === "ripen" && Array.isArray(params.plots))
        return params.plots.some((plotId) => lockedPlotIds.has(Number(plotId)));
    return true;
}

export function publishBoundSource(database, backend, source, amount, now = Date.now()) {
    const existing = database.prepare("SELECT * FROM career_jobs WHERE source_type = ? AND source_id = ?")
        .get(source.sourceType, source.sourceId);
    if (existing) {
        if (source.career === "agronomist") {
            const payment = database.prepare("SELECT silver_amount FROM career_commission_payments WHERE job_id = ?")
                .get(existing.job_id);
            if (!payment || payment.silver_amount !== amount)
                throw new Error("commission_publish_conflict");
        }
        else if (amount !== undefined) {
            throw new Error("commission_publish_conflict");
        }
        const job = backend.trustedQueries.getJob(existing.job_id);
        if (job.assignmentMode === "assigned" && job.workerResidentId === null)
            return backend.trustedSystemCommands.assignAuthorityJob({ jobId: job.jobId });
        return job;
    }
    if (source.career === "agronomist" && (!Number.isSafeInteger(amount) || amount <= 0))
        throw new Error("agronomy_payment_required");
    if (source.career !== "agronomist" && amount !== undefined)
        throw new Error("commission_amount_not_available");
    const job = backend.trustedSystemCommands.createJob({
        jobId: commissionJobId(source.sourceId),
        career: source.career,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        objectType: source.objectType,
        objectId: source.objectId,
        ownerResidentId: source.ownerResidentId,
        requiredLevel: source.requiredLevel,
        difficultyLevel: source.difficultyLevel,
        assignmentMode: source.assignmentMode,
    });
    if (source.career === "agronomist") {
        database.prepare(`
          INSERT INTO career_commission_payments (job_id, trade_id, silver_amount, created_at)
          VALUES (?, NULL, ?, ?)
        `).run(job.jobId, amount, now);
    }
    return job.assignmentMode === "assigned"
        ? backend.trustedSystemCommands.assignAuthorityJob({ jobId: job.jobId })
        : job;
}

function targetFarm(job) {
    if (job.objectType !== "farm_plot" && job.objectType !== "farm_animal" && job.objectType !== "farm_trail_event")
        return null;
    const suffix = job.objectType === "farm_plot" ? ":plot:" : job.objectType === "farm_animal" ? ":animal:" : ":trail:";
    const index = job.objectId.lastIndexOf(suffix);
    if (index <= 0)
        throw new Error("commission_world_contract_unavailable");
    const farm = getFarm(job.objectId.slice(0, index));
    if (!farm)
        throw new Error("commission_world_contract_unavailable");
    return farm;
}

function sourceState(job) {
    const farm = targetFarm(job);
    if (!farm)
        return null;
    const sources = currentP3Sources(farm);
    if (job.career === "agronomist") {
        const plotId = Number(job.objectId.slice(job.objectId.lastIndexOf(":plot:") + 6));
        const plot = farm.plots?.find((entry) => entry.id === plotId);
        const issue = plot?.crop?.lingyeAgronomy;
        if (issue?.sourceId === job.sourceId) {
            return {
                farm,
                source: {
                    sourceId: issue.sourceId,
                    plotId,
                    condition: issue.condition,
                    status: issue.status,
                    checks: [...issue.checks],
                    treatments: [...issue.treatments],
                },
            };
        }
    }
    if (job.career === "veterinarian" && sources.animal?.sourceId === job.sourceId)
        return { farm, source: sources.animal };
    if (job.career === "constable")
        return { farm, source: { sourceId: job.sourceId, status: "open" } };
    throw new Error("commission_source_not_available");
}

export function workerOptions(job, residentId, qualificationLevel = job.requiredLevel) {
    if (job.workerResidentId !== residentId || !["accepted", "assigned", "active"].includes(job.status))
        return [];
    if (job.career === "agronomist") {
        const state = sourceState(job).source;
        const options = agronomyCheckCandidates(qualificationLevel)
            .filter((check) => !state.checks.includes(check))
            .map((check) => `commission:check:${job.jobId}:${check}`);
        if (state.checks.length > 0 && state.status !== "resolved")
            options.push(...agronomyTreatmentCandidates(qualificationLevel)
                .map((treatment) => `commission:treat:${job.jobId}:${treatment}`));
        if (state.checks.length > 0)
            options.push(`commission:transfer:${job.jobId}`);
        return options;
    }
    if (job.career === "veterinarian") {
        const state = sourceState(job).source;
        const options = animalCheckCandidates(qualificationLevel)
            .filter((check) => !state.checks.includes(check))
            .map((check) => `commission:check:${job.jobId}:${check}`);
        if (state.checks.length > 0 && ["open", "treating"].includes(state.status))
            options.push(...animalTreatmentCandidates(qualificationLevel)
                .map((treatment) => `commission:treat:${job.jobId}:${treatment}`));
        if (state.checks.length > 0)
            options.push(`commission:transfer:${job.jobId}`);
        return options;
    }
    if (job.career === "reporter")
        return job.decisionCount === 0
            ? [`commission:check:${job.jobId}:sources`]
            : [`commission:submit:${job.jobId}`];
    if (job.career === "constable") {
        if (job.decisionCount === 0)
            return [`commission:check:${job.jobId}:facts`];
        const results = job.sourceType === "bank_overdue_notice"
            ? ["bank_notice"]
            : job.sourceType === "farm_interaction_complaint"
                ? ["rules_explained", "voluntary_mediation"]
                : job.sourceType === "complaint_review"
                    ? ["review_upheld"]
                    : [];
        return results.map((result) => `commission:resolve:${job.jobId}:${result}`);
    }
    return [];
}

export function commissionSourceFacts(database, job) {
    const recorded = database.prepare(`
      SELECT source_type, fact_json, recorded_at
      FROM career_commission_source_facts WHERE source_id = ?
    `).get(job.sourceId);
    const authoritativeSourceType = job.sourceType.split(":transfer", 1)[0];
    if (!recorded || recorded.source_type !== authoritativeSourceType)
        throw new Error("commission_source_not_available");
    const fact = JSON.parse(recorded.fact_json);
    if (job.sourceType === "bank_overdue_notice") {
        const loan = database.prepare(`
          SELECT loan_id, borrower_resident_id, principal_original,
                 principal_outstanding, accrued_interest, due_day, status
          FROM economy_system_loans WHERE loan_id = ?
        `).get(job.objectId);
        if (!loan)
            throw new Error("commission_source_not_available");
        return {
            sourceId: job.sourceId,
            sourceType: job.sourceType,
            recordedAt: recorded.recorded_at,
            initialFact: fact,
            loan: {
                loanId: loan.loan_id,
                borrowerResidentId: loan.borrower_resident_id,
                principalOriginal: loan.principal_original,
                principalOutstanding: loan.principal_outstanding,
                accruedInterest: loan.accrued_interest,
                dueDay: loan.due_day,
                status: loan.status,
            },
        };
    }
    if (job.sourceType === "public_event_fact" || job.sourceType === "farm_interaction_complaint") {
        return {
            sourceId: job.sourceId,
            sourceType: job.sourceType,
            recordedAt: recorded.recorded_at,
            ...fact,
        };
    }
    const state = sourceState(job);
    const { condition: _recordedCondition, ...publicInitialFact } = fact;
    const { condition: _currentCondition, ...publicCurrentState } = state.source;
    return {
        sourceId: job.sourceId,
        sourceType: job.sourceType,
        recordedAt: recorded.recorded_at,
        initialFact: publicInitialFact,
        currentState: structuredClone(publicCurrentState),
    };
}

export function publicCommissionSource(source) {
    const publicSource = structuredClone(source);
    if (publicSource?.fact && typeof publicSource.fact === "object")
        delete publicSource.fact.condition;
    return publicSource;
}

export function applyWorldCheck(job, check, actionKey, payloadHash, now = Date.now()) {
    const state = sourceState(job);
    if (!state?.farm)
        return { sourceId: job.sourceId, check };
    const staged = structuredClone(state.farm);
    const result = runP3WorldAction(staged, actionKey, payloadHash, () => {
        if (job.career === "agronomist")
            return checkAgronomyIssue(staged, job.sourceId, check);
        if (job.career === "veterinarian")
            return checkAnimalCase(staged, job.sourceId, check);
        return { sourceId: job.sourceId, check };
    }, now);
    replaceFarm(staged.id, staged);
    return result;
}

export function applyWorldTreatment(job, treatment, qualificationLevel, actionKey, payloadHash, now = Date.now()) {
    const state = sourceState(job);
    if (!state?.farm)
        throw new Error("commission_world_contract_unavailable");
    const staged = structuredClone(state.farm);
    const result = runP3WorldAction(staged, actionKey, payloadHash, () => {
        if (job.career === "agronomist")
            return treatAgronomyIssue(staged, job.sourceId, treatment, qualificationLevel, now);
        if (job.career === "veterinarian")
            return treatAnimalCase(staged, job.sourceId, treatment.split("+"), qualificationLevel, now);
        throw new Error("commission_treatment_not_available");
    }, now);
    replaceFarm(staged.id, staged);
    return result;
}

export function treatmentGold(job, treatment) {
    const state = sourceState(job);
    if (job.career === "agronomist") {
        const contract = Object.values(AGRONOMY_CONDITIONS)
            .find((entry) => entry.material === treatment);
        if (!contract)
            throw new Error("agronomy_treatment_not_available");
        return contract.materialGold;
    }
    if (job.career === "veterinarian") {
        const contract = Object.values(ANIMAL_CONDITIONS)
            .find((entry) => entry.materials.join("+") === treatment);
        if (!contract)
            throw new Error("animal_treatment_not_available");
        return contract.materialGold + HOSPITAL_BASE_FEE_GOLD[job.difficultyLevel];
    }
    throw new Error("commission_treatment_not_available");
}

function npcServiceContract(source) {
    if (source.career === "agronomist") {
        const contract = AGRONOMY_CONDITIONS[source.fact.condition];
        const baseFeeGold = AGRONOMY_NPC_BASE_FEE_GOLD[source.difficultyLevel];
        if (!contract || !baseFeeGold || contract.minimumLevel !== source.difficultyLevel)
            throw new Error("commission_npc_contract_unavailable");
        return {
            baseFeeGold,
            materialFeeGold: contract.materialGold,
            treatment: contract.material,
        };
    }
    if (source.career === "veterinarian") {
        const contract = ANIMAL_CONDITIONS[source.fact.condition];
        const normalBaseFeeGold = HOSPITAL_BASE_FEE_GOLD[source.difficultyLevel];
        if (!contract || !normalBaseFeeGold || contract.minimumLevel !== source.difficultyLevel)
            throw new Error("commission_npc_contract_unavailable");
        return {
            baseFeeGold: normalBaseFeeGold * 3,
            materialFeeGold: contract.materialGold,
            treatment: contract.materials.join("+"),
        };
    }
    throw new Error("commission_npc_not_available");
}

function npcWorldTreatment(source, treatment, actionKey, payloadHash, now) {
    const job = {
        career: source.career,
        sourceId: source.sourceId,
        objectType: source.objectType,
        objectId: source.objectId,
    };
    const farm = targetFarm(job);
    const persistedReceipt = farm?.lingyeP3?.actionReceipts?.[actionKey];
    if (persistedReceipt) {
        if (persistedReceipt.payloadHash !== payloadHash)
            throw new Error("commission_npc_conflict");
        return structuredClone(persistedReceipt.result);
    }
    const state = sourceState(job);
    const staged = structuredClone(state.farm);
    const result = runP3WorldAction(staged, actionKey, payloadHash, () => {
        if (source.career === "agronomist") {
            for (const check of agronomyChecksFor(state.source.condition))
                checkAgronomyIssue(staged, source.sourceId, check);
            return treatAgronomyIssue(staged, source.sourceId, treatment, source.difficultyLevel, now);
        }
        if (source.career === "veterinarian") {
            for (const check of animalChecksFor(state.source.condition))
                checkAnimalCase(staged, source.sourceId, check);
            return treatAnimalCase(staged, source.sourceId, treatment.split("+"), source.difficultyLevel, now);
        }
        throw new Error("commission_npc_not_available");
    }, now);
    replaceFarm(staged.id, staged);
    return result;
}

export function recoverBoundNpcSource(database, residentId, career, sourceId, actionKey) {
    if (!["agronomist", "veterinarian"].includes(career))
        return null;
    const recorded = database.prepare(`
      SELECT source_type, fact_json FROM career_commission_source_facts WHERE source_id = ?
    `).get(sourceId);
    if (!recorded)
        return null;
    const fact = JSON.parse(recorded.fact_json);
    const farm = getFarm(fact.farmDoorplate);
    if (!farm || registeredResidentForFarm(database, farm) !== residentId ||
        !farm.lingyeP3?.actionReceipts?.[actionKey]) {
        return null;
    }
    if (career === "agronomist" && recorded.source_type === "farm_plot_condition") {
        const contract = AGRONOMY_CONDITIONS[fact.condition];
        if (!contract || !Number.isSafeInteger(fact.plotId))
            return null;
        return agronomySource(farm, residentId, {
            sourceId,
            plotId: fact.plotId,
            condition: fact.condition,
            status: "resolved",
        });
    }
    if (career === "veterinarian" && recorded.source_type === "animal_health_case") {
        const contract = ANIMAL_CONDITIONS[fact.condition];
        if (!contract || !Number.isSafeInteger(fact.animalIndex) || typeof fact.animalKindId !== "string")
            return null;
        return animalSource(farm, residentId, {
            sourceId,
            animalIndex: fact.animalIndex,
            animalKindId: fact.animalKindId,
            condition: fact.condition,
            status: "recovering",
        });
    }
    return null;
}

export function completeNpcFallbackService(database, backend, source, actionKey, payloadHash, now = Date.now()) {
    if (!source || !["agronomist", "veterinarian"].includes(source.career) || source.ownerResidentId === null)
        throw new Error("commission_npc_not_available");
    const existingBySource = database.prepare(`
      SELECT * FROM career_npc_service_settlements WHERE source_id = ?
    `).get(source.sourceId);
    const existingByKey = database.prepare(`
      SELECT * FROM career_npc_service_settlements WHERE idempotency_key = ?
    `).get(actionKey);
    const existing = existingBySource ?? existingByKey;
    if (existing) {
        if (existing.source_id !== source.sourceId ||
            existing.owner_resident_id !== source.ownerResidentId ||
            existing.career !== source.career ||
            existing.payload_hash !== payloadHash) {
            throw new Error("commission_npc_conflict");
        }
        return JSON.parse(existing.result_json);
    }
    let operation = database.prepare(`
      SELECT * FROM lingye_cross_store_operations WHERE action_key = ?
    `).get(actionKey);
    if (!operation) {
        operation = runLingyeWorldTransaction(database, () => {
            const contract = npcServiceContract(source);
            const totalFeeGold = contract.baseFeeGold + contract.materialFeeGold;
            const reserved = backend.trustedSystemCommands.reserveSystemGold({
                residentId: source.ownerResidentId,
                amount: totalFeeGold,
                actor: "agent",
                businessReference: `career-npc-service:${source.sourceId}`,
                idempotencyKey: `${actionKey}:reserve`,
            });
            database.prepare(`
              INSERT INTO lingye_cross_store_operations (
                action_key, operation_kind, resident_id, career, job_id, source_json,
                action_value, option_reference, qualification_level, payload_hash,
                reservation_id, gold_amount, status, created_at, updated_at
              ) VALUES (?, 'npc_service', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            `).run(actionKey, source.ownerResidentId, source.career, JSON.stringify(source),
                contract.treatment, `commission:npc:${source.sourceId}`, source.difficultyLevel,
                payloadHash, reserved.reservation_id, totalFeeGold, now, now);
            return database.prepare("SELECT * FROM lingye_cross_store_operations WHERE action_key = ?")
                .get(actionKey);
        });
    }
    if (operation.operation_kind !== "npc_service" || operation.resident_id !== source.ownerResidentId ||
        operation.career !== source.career || operation.payload_hash !== payloadHash) {
        throw new Error("commission_npc_conflict");
    }
    return resumeNpcFallbackService(database, backend, operation);
}

function resumeNpcFallbackService(database, backend, operation) {
    if (operation.status === "completed")
        return JSON.parse(operation.result_json);
    const source = JSON.parse(operation.source_json);
    const contract = npcServiceContract(source);
    let world = operation.world_result_json ? JSON.parse(operation.world_result_json) : null;
    if (!world) {
        world = npcWorldTreatment(source, contract.treatment, operation.action_key,
            operation.payload_hash, operation.created_at);
        runLingyeWorldTransaction(database, () => {
            database.prepare(`
              UPDATE lingye_cross_store_operations
              SET status = 'world_applied', world_result_json = ?, updated_at = ?
              WHERE action_key = ? AND status = 'pending'
            `).run(JSON.stringify(world), Date.now(), operation.action_key);
        });
    }
    return runLingyeWorldTransaction(database, () => {
        const current = database.prepare("SELECT * FROM lingye_cross_store_operations WHERE action_key = ?")
            .get(operation.action_key);
        if (current.status === "completed")
            return JSON.parse(current.result_json);
        const settled = backend.trustedSystemCommands.settleSystemGoldReservation({
            reservationId: current.reservation_id,
            businessReference: `career-npc-service:${source.sourceId}:settle`,
            idempotencyKey: `${current.action_key}:settle`,
        });
        const settlementId = `npc-service:${digest(source.sourceId).slice(0, 32)}`;
        const result = {
            settlementId,
            sourceId: source.sourceId,
            career: source.career,
            status: "completed",
            serviceActor: "system",
            fee: {
                baseGold: contract.baseFeeGold,
                materialGold: contract.materialFeeGold,
                totalGold: current.gold_amount,
            },
            world,
            completedAt: current.created_at,
        };
        database.prepare(`
          INSERT INTO career_npc_service_settlements (
            settlement_id, source_id, source_type, career, owner_resident_id,
            difficulty_level, base_fee_gold, material_fee_gold, total_fee_gold,
            charge_receipt_id, idempotency_key, payload_hash, result_json, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(settlementId, source.sourceId, source.sourceType, source.career,
            source.ownerResidentId, source.difficultyLevel, contract.baseFeeGold,
            contract.materialFeeGold, current.gold_amount, settled.financialReceipt.receiptId,
            current.action_key, current.payload_hash, JSON.stringify(result), current.created_at);
        database.prepare(`
          UPDATE lingye_cross_store_operations
          SET status = 'completed', result_json = ?, updated_at = ?
          WHERE action_key = ? AND status = 'world_applied'
        `).run(JSON.stringify(result), Date.now(), current.action_key);
        return result;
    });
}

export function recoverPendingNpcFallbackServices(database, backend) {
    const pending = database.prepare(`
      SELECT * FROM lingye_cross_store_operations
      WHERE operation_kind = 'npc_service' AND status IN ('pending', 'world_applied')
      ORDER BY created_at, action_key
    `).all();
    for (const operation of pending)
        resumeNpcFallbackService(database, backend, operation);
}

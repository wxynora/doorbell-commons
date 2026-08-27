import { createHash } from "node:crypto";
import { allFarms, getFarm, getPublicExpeditionWorld, replaceFarm } from "../store.js";
import {
    AGRONOMY_CONDITIONS,
    ANIMAL_CONDITIONS,
    advanceP3Farm,
    agronomyChecksFor,
    animalChecksFor,
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
        backend.trustedSystemCommands.createJob({
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
    }
    return now;
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
        return backend.trustedQueries.getJob(existing.job_id);
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
    return job;
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

export function workerOptions(job, residentId) {
    if (job.workerResidentId !== residentId || !["accepted", "assigned", "active"].includes(job.status))
        return [];
    if (job.career === "agronomist") {
        const state = sourceState(job).source;
        const options = agronomyChecksFor(state.condition).map((check) => `commission:check:${job.jobId}:${check}`);
        if (state.checks.length > 0 && state.status !== "resolved")
            options.push(`commission:treat:${job.jobId}:${AGRONOMY_CONDITIONS[state.condition].material}`);
        if (state.checks.length > 0)
            options.push(`commission:transfer:${job.jobId}`);
        return options;
    }
    if (job.career === "veterinarian") {
        const state = sourceState(job).source;
        const options = animalChecksFor(state.condition).map((check) => `commission:check:${job.jobId}:${check}`);
        if (state.checks.length > 0 && state.status === "open")
            options.push(`commission:treat:${job.jobId}:${ANIMAL_CONDITIONS[state.condition].materials.join("+")}`);
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
    if (!recorded || recorded.source_type !== job.sourceType)
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
    return {
        sourceId: job.sourceId,
        sourceType: job.sourceType,
        recordedAt: recorded.recorded_at,
        initialFact: fact,
        currentState: structuredClone(state.source),
    };
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
        const contract = AGRONOMY_CONDITIONS[state.source.condition];
        if (!contract || treatment !== contract.material)
            throw new Error("agronomy_treatment_not_available");
        return contract.materialGold;
    }
    if (job.career === "veterinarian") {
        const contract = ANIMAL_CONDITIONS[state.source.condition];
        if (!contract || treatment !== contract.materials.join("+"))
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
    const contract = npcServiceContract(source);
    const totalFeeGold = contract.baseFeeGold + contract.materialFeeGold;
    const charged = backend.trustedSystemCommands.chargeToSystem({
        residentId: source.ownerResidentId,
        currency: "gold",
        amount: totalFeeGold,
        actor: "agent",
        businessType: "career_npc_service",
        businessRef: `career-npc-service:${source.sourceId}`,
        idempotencyKey: `${actionKey}:charge`,
    });
    const world = npcWorldTreatment(source, contract.treatment, actionKey, payloadHash, now);
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
            totalGold: totalFeeGold,
        },
        world,
        completedAt: now,
    };
    database.prepare(`
      INSERT INTO career_npc_service_settlements (
        settlement_id, source_id, source_type, career, owner_resident_id,
        difficulty_level, base_fee_gold, material_fee_gold, total_fee_gold,
        charge_receipt_id, idempotency_key, payload_hash, result_json, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(settlementId, source.sourceId, source.sourceType, source.career,
        source.ownerResidentId, source.difficultyLevel, contract.baseFeeGold,
        contract.materialFeeGold, totalFeeGold, charged.financialReceipt.receiptId,
        actionKey, payloadHash, JSON.stringify(result), now);
    return result;
}

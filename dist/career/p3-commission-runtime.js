import { createHash } from "node:crypto";
import { allFarms, getFarm, getNatureWorld, replaceFarm, replaceFarmsAndNatureAtomic } from "../store.js";
import { reconcileNatureTreatment } from "../nature-runtime.js";
import { runLingyeWorldTransaction } from "../lingye-world-database.js";
import { AGRONOMY_COMMISSION_REWARD_GOLD, AGRONOMY_COMMISSION_SILVER, CareerDomainError } from "./contracts.js";
import {
    getReporterArticle,
    getReporterMaterialPack,
    getReporterSourceFact,
} from "./reporter-service.js";
import { ensureReporterDutyRoles, reporterWorkflowForJob } from "./reporter-newsroom-service.js";
import {
    AGRONOMY_CONDITIONS,
    ANIMAL_CONDITIONS,
    advanceP3Farm,
    agronomyCheckCandidates,
    agronomyChecksFor,
    agronomyIssuesForFarm,
    agronomyMaterialUsage,
    agronomyObservationsFor,
    agronomyTreatmentCandidates,
    agronomyTreatmentContract,
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
    1: 3_000,
    2: 9_000,
    3: 24_000,
    4: 60_000,
});

export const AGRONOMY_NPC_BASE_FEE_GOLD = Object.freeze({
    1: 20_000,
    2: 60_000,
    3: 150_000,
    4: 400_000,
});

export function playerServiceCommissionPrice(source) {
    if (!source || !Number.isSafeInteger(source.difficultyLevel))
        throw new Error("commission_price_unavailable");
    if (source.career === "agronomist") {
        const laborSilver = AGRONOMY_COMMISSION_SILVER[source.difficultyLevel];
        const systemRewardGold = AGRONOMY_COMMISSION_REWARD_GOLD[source.difficultyLevel];
        if (!laborSilver || !systemRewardGold)
            throw new Error("commission_price_unavailable");
        return Object.freeze({ baseFeeGold: 0, laborSilver, systemRewardGold });
    }
    if (source.career === "veterinarian") {
        const baseFeeGold = HOSPITAL_BASE_FEE_GOLD[source.difficultyLevel];
        if (!baseFeeGold)
            throw new Error("commission_price_unavailable");
        return Object.freeze({ baseFeeGold, laborSilver: 0, systemRewardGold: 0 });
    }
    throw new Error("commission_price_unavailable");
}

function digest(value) {
    return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function requireStandaloneP3Checkpoint(database) {
    // P3 world state may share this SQLite connection with career/economy.
    // A caller-owned transaction would make the durable phases collapse into
    // one savepoint while the in-memory world has already been published.
    if (database.isTransaction)
        throw new Error("p3_world_checkpoint_requires_standalone_transaction");
}

export function commissionJobId(sourceId) {
    return `doorbell-job:${digest(sourceId).slice(0, 32)}`;
}

export function commissionSourceType(sourceType) {
    return sourceType.split(/:transfer|:republication/u, 1)[0];
}

export function currentBoundSourceJob(database, source) {
    if (!["agronomist", "veterinarian"].includes(source.career))
        return database.prepare("SELECT * FROM career_jobs WHERE source_type = ? AND source_id = ?")
            .get(source.sourceType, source.sourceId);
    return database.prepare(`SELECT * FROM career_jobs WHERE source_id = ? AND career = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(source.sourceId, source.career);
}

export function boundSourcePublicationIdentity(database, source) {
    const existing = currentBoundSourceJob(database, source);
    const retry = existing?.status === "cancelled" &&
        ["agronomist", "veterinarian"].includes(source.career);
    const optionId = retry ? `${source.sourceId}:republication:${existing.job_id}` : source.sourceId;
    return {
        optionId,
        jobId: retry ? commissionJobId(optionId) : existing?.job_id ?? commissionJobId(source.sourceId),
        sourceType: retry ? `${existing.source_type}:republication` : existing?.source_type ?? source.sourceType,
        parentJobId: retry ? existing.job_id : null,
    };
}

export function boundSourceCanPublish(database, source) {
    const existing = currentBoundSourceJob(database, source);
    return !existing || (["agronomist", "veterinarian"].includes(source.career) &&
        source.status === "open" && existing.status === "cancelled");
}

function canonicalPublicValue(value) {
    if (value === null)
        return "null";
    if (typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new Error("public_expedition_history_not_json");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map((item) => canonicalPublicValue(item)).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${canonicalPublicValue(value[key])}`).join(",")}}`;
    }
    throw new Error("public_expedition_history_not_json");
}

export function reporterAllowedNumbers(value) {
    const numbers = new Set();
    const visit = (current) => {
        if (typeof current === "number") {
            if (Number.isFinite(current))
                numbers.add(current);
            return;
        }
        if (Array.isArray(current)) {
            for (const item of current)
                visit(item);
            return;
        }
        if (current && typeof current === "object") {
            for (const child of Object.values(current))
                visit(child);
        }
    };
    visit(value);
    return [...numbers].sort((left, right) => left - right);
}

function historyTimestampCandidates(publicWorld, entry) {
    const candidates = [
        publicWorld?.startedAt,
        entry?.at,
        entry?.occurredAt,
        entry?.startedAt,
        entry?.completedAt,
        entry?.endedAt,
        ...(Array.isArray(entry?.voters) ? entry.voters.map((voter) => voter?.at) : []),
        ...(Array.isArray(entry?.contributions) ? entry.contributions.map((item) => item?.at) : []),
    ];
    return candidates.filter((value) => Number.isSafeInteger(value) && value >= 0);
}

export function reporterPublicHistoryOccurredAt(publicWorld, entry, now = Date.now()) {
    const validNow = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
    const past = historyTimestampCandidates(publicWorld, entry).filter((value) => value <= validNow);
    const stableWorldStart = Number.isSafeInteger(publicWorld?.startedAt) && publicWorld.startedAt >= 0
        ? publicWorld.startedAt
        : null;
    return past.length > 0 ? Math.max(...past) : stableWorldStart;
}

export function reporterIssueReference(occurredAt) {
    if (!Number.isSafeInteger(occurredAt) || occurredAt < 0)
        throw new Error("public_expedition_history_time_invalid");
    const beijing = new Date(occurredAt + 8 * 60 * 60 * 1000);
    if (beijing.getUTCHours() >= 5)
        beijing.setUTCDate(beijing.getUTCDate() + 1);
    const year = beijing.getUTCFullYear();
    const month = String(beijing.getUTCMonth() + 1).padStart(2, "0");
    const day = String(beijing.getUTCDate()).padStart(2, "0");
    return `lingye-daily:${year}-${month}-${day}`;
}

export function reporterPublicHistoryIdentity(publicWorld, entry, occurredAt) {
    const storyId = String(publicWorld?.storyId ?? "").trim();
    const round = Number(publicWorld?.round);
    if (!storyId || !Number.isSafeInteger(round) || round < 1)
        throw new Error("public_expedition_history_identity_invalid");
    const contentDigest = digest(canonicalPublicValue({ storyId, round, entry }));
    const prefix = `p3:reporter:public-expedition:${storyId}:${round}`;
    return Object.freeze({
        contentDigest,
        sourceId: `${prefix}:source:${contentDigest}`,
        issueReference: reporterIssueReference(occurredAt),
        packId: `reporter-pack:public-expedition:${storyId}:${round}:${contentDigest}`,
        objectId: `public-expedition:${storyId}:${round}:event:${contentDigest}`,
    });
}

function saveAdvancedFarm(farm, now) {
    const staged = structuredClone(farm);
    const advanced = advanceP3Farm(staged, now);
    const legacyTrailChanged = ensureTrailEventIds(staged);
    if (advanced.changed || legacyTrailChanged) {
        replaceFarm(farm.id, staged);
        return getFarm(farm.id);
    }
    return farm;
}

function ensureTrailEventIds(farm) {
    const trail = farm.trail ?? [];
    const occurrences = new Map();
    let changed = false;
    for (const entry of [...trail].reverse()) {
        if (!entry || typeof entry !== "object" ||
            (typeof entry.eventId === "string" && entry.eventId.length > 0)) {
            continue;
        }
        const fingerprint = JSON.stringify([
            farm.id,
            entry.t ?? null,
            entry.kind ?? null,
            entry.by ?? null,
            entry.plotId ?? null,
            entry.crop ?? null,
        ]);
        const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
        occurrences.set(fingerprint, occurrence);
        entry.eventId = `legacy-${digest(`${fingerprint}:${occurrence}`).slice(0, 32)}`;
        changed = true;
    }
    return changed;
}

function registeredResidentForFarm(database, farm) {
    const bindingReference = farm?.doorbellMcpMigration?.migrationId;
    if (!bindingReference)
        return null;
    return database.prepare("SELECT resident_id FROM residents WHERE binding_reference = ?").get(bindingReference)?.resident_id ?? null;
}

const CONSTABLE_THEFT_LOOKBACK_MS = 72 * 60 * 60 * 1_000;

export function constableExamTheftEligibility(database, residentId, now = Date.now()) {
    const actorFarms = allFarms()
        .filter((farm) => registeredResidentForFarm(database, farm) === residentId)
        .map((farm) => farm.id);
    if (actorFarms.length === 0)
        return { eligible: true, latestStolenAt: null };
    const actorFarmIds = new Set(actorFarms);
    const cutoff = now - CONSTABLE_THEFT_LOOKBACK_MS;
    let latestStolenAt = null;
    for (const farm of allFarms()) {
        for (const entry of farm.trail ?? []) {
            const happenedAt = Number(entry?.t);
            if (entry?.kind !== "stolen" || !actorFarmIds.has(entry.actorFarmId) ||
                !Number.isFinite(happenedAt) || happenedAt <= cutoff || happenedAt > now)
                continue;
            latestStolenAt = latestStolenAt === null ? happenedAt : Math.max(latestStolenAt, happenedAt);
        }
    }
    return { eligible: latestStolenAt === null, latestStolenAt };
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
    try {
        ensureReporterDutyRoles(database, now());
    }
    catch (error) {
        console.error("[lingye-p3] reporter duty assignment failed", error);
    }
    const schedule = () => {
        if (stopped)
            return;
        const current = now();
        timer = setTimer(() => {
            if (stopped)
                return;
            try {
                advanceRegisteredP3Farms(database, now());
            }
            catch (error) {
                console.error("[lingye-p3] daily farm advancement failed", error);
            }
            try {
                ensureReporterDutyRoles(database, now());
            }
            catch (error) {
                console.error("[lingye-p3] reporter duty assignment failed", error);
            }
            finally {
                schedule();
            }
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
    const treatment = agronomyTreatmentContract(source.requiredTreatment);
    const requiredLevel = Math.max(contract.minimumLevel, treatment?.minimumLevel ?? contract.minimumLevel);
    return {
        sourceId: source.sourceId,
        career: "agronomist",
        sourceType: "farm_plot_condition",
        objectType: "farm_plot",
        objectId: `${farm.id}:plot:${source.plotId}`,
        ownerResidentId,
        requiredLevel,
        difficultyLevel: requiredLevel,
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

function securityTrailSources(database, farm, ownerResidentId) {
    return (farm.trail ?? [])
        .filter((entry) => entry?.kind === "stolen" &&
            typeof entry.eventId === "string" && entry.eventId.length > 0)
        .map((entry) => {
            const sourceId = `p3:security:trail:${entry.eventId}`;
            const actorFarm = typeof entry.actorFarmId === "string" && entry.actorFarmId.length > 0
                ? getFarm(entry.actorFarmId)
                : null;
            const actorResidentId = actorFarm ? registeredResidentForFarm(database, actorFarm) : null;
            return {
                sourceId,
                career: "constable",
                sourceType: "farm_interaction_complaint",
                objectType: "farm_trail_event",
                objectId: `${farm.id}:trail:${entry.eventId}`,
                ownerResidentId,
                requiredLevel: 1,
                difficultyLevel: 1,
                assignmentMode: "assigned",
                excludedResidentIds: actorResidentId === null ? [] : [actorResidentId],
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
        ...securityTrailSources(database, currentFarm, ownerResidentId),
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
    const overdueLoans = backend.trustedQueries.listPunishableSystemLoanFacts();
    for (const loan of overdueLoans) {
        const sourceId = `p3:security:system-loan:${loan.loanId}`;
        database.prepare(`
          INSERT OR IGNORE INTO career_commission_source_facts (
            source_id, source_type, fact_json, recorded_at
          ) VALUES (?, 'bank_overdue_notice', ?, ?)
        `).run(sourceId, JSON.stringify({
            loanId: loan.loanId,
            borrowerResidentId: loan.borrowerResidentId,
            outstandingGold: loan.outstandingGold,
            dueDay: loan.dueDay,
            graceDays: loan.graceDays,
        }), now);
        try {
            runLingyeWorldTransaction(database, () => {
                const job = backend.trustedSystemCommands.createJob({
                    jobId: commissionJobId(sourceId),
                    career: "constable",
                    sourceType: "bank_overdue_notice",
                    sourceId,
                    objectType: "system_loan",
                    objectId: loan.loanId,
                    ownerResidentId: loan.borrowerResidentId,
                    requiredLevel: 1,
                    difficultyLevel: 1,
                    assignmentMode: "assigned",
                    excludedResidentIds: [loan.borrowerResidentId],
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
    const awaitingAssignment = database.prepare(`
      SELECT job_id FROM career_jobs
      WHERE assignment_mode = 'assigned' AND status = 'available'
        AND worker_resident_id IS NULL
      ORDER BY created_at, job_id
    `).all();
    for (const row of awaitingAssignment) {
        try {
            backend.trustedSystemCommands.assignAuthorityJob({ jobId: row.job_id });
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

const LOCKED_CAREER_OBJECT_TEXT = Object.freeze({
    run: "有地块正在由职业委托处理，本轮一条龙操作没有执行。",
    water: "目标地块正在由职业委托处理，本次浇水没有执行。",
    harvest: "目标地块正在由职业委托处理，本次收获没有执行。",
    ripen: "目标地块正在由职业委托处理，本次催熟没有执行。",
    steal: "目标地块正在由职业委托处理，本次偷菜没有执行。",
    use: "目标地块正在由职业委托处理，本次使用加速道具没有执行。",
});

export function lockedCareerObjectText(action) {
    return LOCKED_CAREER_OBJECT_TEXT[action]
        ?? "目标对象正在由职业委托处理，本次操作没有执行。";
}

function servicePublicationRequest(source, request) {
    const price = playerServiceCommissionPrice(source);
    if (typeof request === "number") {
        if (source.career !== "agronomist" || request !== price.laborSilver)
            throw new Error("commission_price_invalid");
        return { audience: "public", targetResidentId: null, price };
    }
    if (request !== undefined && (request === null || typeof request !== "object" || Array.isArray(request)))
        throw new Error("commission_publication_invalid");
    const audience = request?.audience ?? "public";
    const targetResidentId = request?.targetResidentId ?? null;
    if (!["public", "targeted"].includes(audience) ||
        (audience === "targeted") !== (targetResidentId !== null) ||
        (request?.amount !== undefined && request.amount !== price.laborSilver)) {
        throw new Error("commission_publication_invalid");
    }
    return { audience, targetResidentId, price };
}

export function publishBoundSource(database, backend, source, request, now = Date.now()) {
    if (!source || source.status !== "open")
        throw new Error("commission_source_not_available");
    const serviceCommission = ["agronomist", "veterinarian"].includes(source.career);
    if (!serviceCommission && request !== undefined)
        throw new Error("commission_amount_not_available");
    const publication = serviceCommission ? servicePublicationRequest(source, request) : null;
    const identity = boundSourcePublicationIdentity(database, source);
    const existing = identity.parentJobId ? null : currentBoundSourceJob(database, source);
    if (existing) {
        const expectedExclusions = [...(source.excludedResidentIds ?? [])]
            .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
        const storedExclusions = database.prepare(`SELECT resident_id
          FROM career_job_assignment_exclusions WHERE job_id = ?
          ORDER BY resident_id COLLATE BINARY ASC`)
            .all(existing.job_id)
            .map((row) => row.resident_id);
        if (expectedExclusions.length !== storedExclusions.length ||
            expectedExclusions.some((residentId, index) => residentId !== storedExclusions[index]))
            throw new Error("commission_publish_conflict");
        if (serviceCommission &&
            (!existing.service_commission || existing.service_audience !== publication.audience ||
                existing.target_resident_id !== publication.targetResidentId))
            throw new Error("commission_publish_conflict");
        if (source.career === "agronomist") {
            const payment = database.prepare("SELECT silver_amount FROM career_commission_payments WHERE job_id = ?")
                .get(existing.job_id);
            if (!payment || payment.silver_amount !== publication.price.laborSilver)
                throw new Error("commission_publish_conflict");
        }
        const job = backend.trustedQueries.getJob(existing.job_id);
        if (!serviceCommission && job.assignmentMode === "assigned" && job.workerResidentId === null)
            return backend.trustedSystemCommands.assignAuthorityJob({ jobId: job.jobId });
        return job;
    }
    const job = backend.trustedSystemCommands.createJob({
        jobId: identity.jobId,
        career: source.career,
        sourceType: identity.sourceType,
        sourceId: source.sourceId,
        objectType: source.objectType,
        objectId: source.objectId,
        ownerResidentId: source.ownerResidentId,
        requiredLevel: source.requiredLevel,
        difficultyLevel: source.difficultyLevel,
        assignmentMode: serviceCommission ? "accepted" : source.assignmentMode,
        ...(serviceCommission ? {
            serviceCommission: true,
            serviceAudience: publication.audience,
            ...(publication.targetResidentId === null ? {} : { targetResidentId: publication.targetResidentId }),
        } : {}),
        excludedResidentIds: source.excludedResidentIds ?? [],
    });
    if (identity.parentJobId)
        database.prepare("UPDATE career_jobs SET parent_job_id = ? WHERE job_id = ?")
            .run(identity.parentJobId, job.jobId);
    if (source.career === "agronomist") {
        database.prepare(`
          INSERT INTO career_commission_payments (job_id, trade_id, silver_amount, created_at)
          VALUES (?, NULL, ?, ?)
        `).run(job.jobId, publication.price.laborSilver, now);
    }
    return !serviceCommission && job.assignmentMode === "assigned"
        ? backend.trustedSystemCommands.assignAuthorityJob({ jobId: job.jobId })
        : backend.trustedQueries.getJob(job.jobId);
}

export function startSelfAgronomyWork(database, backend, source) {
    if (!source || source.career !== "agronomist" || source.status !== "open" ||
        typeof source.ownerResidentId !== "string" || source.ownerResidentId.length === 0) {
        throw new Error("self_agronomy_source_not_available");
    }
    const identity = boundSourcePublicationIdentity(database, source);
    const existing = identity.parentJobId ? null : currentBoundSourceJob(database, source);
    if (existing) {
        const job = backend.trustedQueries.getJob(existing.job_id);
        if (job.career !== "agronomist" || job.assignmentMode !== "self" ||
            job.ownerResidentId !== source.ownerResidentId || job.workerResidentId !== source.ownerResidentId) {
            throw new Error("self_agronomy_start_conflict");
        }
        return job;
    }
    const job = backend.trustedSystemCommands.createJob({
        jobId: identity.jobId,
        career: "agronomist",
        sourceType: identity.sourceType,
        sourceId: source.sourceId,
        objectType: source.objectType,
        objectId: source.objectId,
        ownerResidentId: source.ownerResidentId,
        requiredLevel: source.requiredLevel,
        difficultyLevel: source.difficultyLevel,
        assignmentMode: "self",
        selfWorkerResidentId: source.ownerResidentId,
        excludedResidentIds: source.excludedResidentIds ?? [],
    });
    if (identity.parentJobId)
        database.prepare("UPDATE career_jobs SET parent_job_id = ? WHERE job_id = ?")
            .run(identity.parentJobId, job.jobId);
    return backend.trustedQueries.getJob(job.jobId);
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
        const entry = agronomyIssuesForFarm(farm)
            .find(({ plot, issue }) => plot.id === plotId && issue.sourceId === job.sourceId);
        if (entry) {
            const { issue } = entry;
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
    const decisionCapacityReached = job.decisionCount >= 4;
    if (job.career === "agronomist") {
        const state = sourceState(job).source;
        const treatmentOptions = state.checks.length > 0 && state.status !== "resolved"
            ? agronomyTreatmentCandidates(qualificationLevel)
                .map((treatment) => `commission:treat:${job.jobId}:${treatment}`)
            : [];
        if (decisionCapacityReached) {
            if (state.checks.length > 0 && job.assignmentMode !== "self")
                treatmentOptions.push(`commission:transfer:${job.jobId}`);
            return treatmentOptions;
        }
        const options = agronomyCheckCandidates(qualificationLevel)
            .filter((check) => !state.checks.includes(check))
            .map((check) => `commission:check:${job.jobId}:${check}`);
        options.push(...treatmentOptions);
        if (state.checks.length > 0 && job.assignmentMode !== "self")
            options.push(`commission:transfer:${job.jobId}`);
        return options;
    }
    if (job.career === "veterinarian") {
        const state = sourceState(job).source;
        const treatmentOptions = state.checks.length > 0 && ["open", "treating"].includes(state.status)
            ? animalTreatmentCandidates(qualificationLevel)
                .map((treatment) => `commission:treat:${job.jobId}:${treatment}`)
            : [];
        if (decisionCapacityReached) {
            if (state.checks.length > 0 && job.assignmentMode !== "self")
                treatmentOptions.push(`commission:transfer:${job.jobId}`);
            return treatmentOptions;
        }
        const options = animalCheckCandidates(qualificationLevel)
            .filter((check) => !state.checks.includes(check))
            .map((check) => `commission:check:${job.jobId}:${check}`);
        options.push(...treatmentOptions);
        if (state.checks.length > 0 && job.assignmentMode !== "self")
            options.push(`commission:transfer:${job.jobId}`);
        return options;
    }
    if (job.career === "reporter") {
        if (job.sourceType.endsWith(":reviewing")) {
            if (job.decisionCount === 0 || job.decisionCount === 2)
                return [`commission:check:${job.jobId}:article`];
            if (job.decisionCount === 1 || job.decisionCount === 3) {
                return [
                    `commission:resolve:${job.jobId}:approve`,
                    `commission:resolve:${job.jobId}:needs_supplement`,
                    `commission:resolve:${job.jobId}:reject`,
                ];
            }
            return [];
        }
        return job.decisionCount === 0
            ? [`commission:check:${job.jobId}:sources`]
            : [`commission:submit:${job.jobId}`];
    }
    if (job.career === "constable") {
        if (job.decisionCount === 0)
            return [`commission:check:${job.jobId}:facts`];
        const results = job.sourceType === "bank_overdue_notice"
            ? ["bank_system_loan_refusal"]
            : job.sourceType === "farm_interaction_complaint"
                ? ["farm_crop_theft"]
                : job.sourceType === "complaint_review"
                    ? ["review_upheld"]
                    : [];
        return results.map((result) => `commission:resolve:${job.jobId}:${result}`);
    }
    return [];
}

function reporterPackRowForJob(database, job) {
    const workflow = reporterWorkflowForJob(database, job.jobId);
    const packJobId = workflow?.writerJobId ?? job.jobId;
    const bound = database.prepare(`
      SELECT * FROM career_reporter_material_packs WHERE job_id = ?
    `).get(packJobId);
    if (bound)
        return bound;
    const candidates = database.prepare(`
      SELECT * FROM career_reporter_material_packs
      ORDER BY created_at, pack_id
    `).all().filter((row) => {
        let sourceIds;
        try {
            sourceIds = JSON.parse(row.source_ids_json);
        }
        catch {
            return false;
        }
        return Array.isArray(sourceIds) && sourceIds.includes(job.sourceId);
    });
    if (candidates.length !== 1)
        throw new Error("commission_source_not_available");
    const candidate = candidates[0];
    if (!["available", "returned"].includes(candidate.status) || candidate.job_id !== null)
        throw new Error("commission_source_not_available");
    return candidate;
}

export function reporterMaterialPackForJob(database, job) {
    if (!job || job.career !== "reporter")
        throw new Error("commission_source_not_available");
    const row = reporterPackRowForJob(database, job);
    return getReporterMaterialPack(database, row.pack_id);
}

function reporterCommissionSourceFacts(database, job) {
    const materialPack = reporterMaterialPackForJob(database, job);
    const workflow = reporterWorkflowForJob(database, job.jobId);
    const sourceFacts = materialPack.sourceIds.map((sourceId) => getReporterSourceFact(database, sourceId));
    const selected = sourceFacts.find((source) => source.sourceId === job.sourceId);
    if (!selected)
        throw new Error("commission_source_not_available");
    const publicFact = selected.fact?.publicHistory ?? selected.fact;
    return {
        sourceId: job.sourceId,
        sourceType: job.sourceType,
        recordedAt: selected.recordedAt,
        materialPack,
        sourceFacts,
        initialFact: selected.fact,
        publicFact: structuredClone(publicFact),
        ...(workflow
            ? {
                newsroomWorkflow: workflow,
                ...(workflow.articleId
                    ? { article: getReporterArticle(database, workflow.articleId) }
                    : {}),
            }
            : {}),
    };
}

export function commissionSourceFacts(database, job) {
    const authoritativeSourceType = commissionSourceType(job.sourceType);
    if (job.career === "reporter")
        return reporterCommissionSourceFacts(database, job);
    const recorded = database.prepare(`
      SELECT source_type, fact_json, recorded_at
      FROM career_commission_source_facts WHERE source_id = ?
    `).get(job.sourceId);
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
    const { condition: _recordedCondition, ...publicInitialFact } = fact;
    let state;
    try {
        state = sourceState(job);
    }
    catch (error) {
        // A completed animal case may already have left recovery.  The
        // durable source fact remains the history authority; do not turn a
        // valid terminal job into a broken read merely because its live
        // object has naturally disappeared.
        if (job.career !== "veterinarian" ||
            error?.message !== "commission_source_not_available" ||
            !["completed", "cancelled", "transferred", "expired"].includes(job.status))
            throw error;
        return {
            sourceId: job.sourceId,
            sourceType: job.sourceType,
            recordedAt: recorded.recorded_at,
            initialFact: publicInitialFact,
            currentState: { status: job.status },
        };
    }
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
    const currentNature = getNatureWorld();
    const nextNature = reconcileNatureTreatment(structuredClone(currentNature), staged, job.sourceId, result, now);
    if (JSON.stringify(nextNature) !== JSON.stringify(currentNature)) {
        replaceFarmsAndNatureAtomic({
            replacements: [{ id: staged.id, farm: staged }],
            nextNatureWorld: nextNature,
        });
    }
    else {
        replaceFarm(staged.id, staged);
    }
    return result;
}

const AGRONOMY_MATERIAL_GOLD = new Map(agronomyTreatmentCandidates(4)
    .map((material) => [material, agronomyTreatmentContract(material)?.materialGold]));

/**
 * Resolve the real material units and their existing gold reference price for
 * an agronomy treatment batch.  The plan is pure; the caller's existing
 * reservation/settlement path remains responsible for charging it atomically.
 */
export function agronomyTreatmentMaterialUsage(requirements, qualificationLevel) {
    const usage = agronomyMaterialUsage(requirements, qualificationLevel);
    let requiredGold = 0;
    let consumedGold = 0;
    for (const [materialId, quantity] of Object.entries(usage.required)) {
        const unitGold = AGRONOMY_MATERIAL_GOLD.get(materialId);
        if (!Number.isSafeInteger(unitGold) || unitGold <= 0)
            throw new Error("agronomy_treatment_material_not_available");
        requiredGold += unitGold * quantity;
    }
    for (const [materialId, quantity] of Object.entries(usage.consumed)) {
        const unitGold = AGRONOMY_MATERIAL_GOLD.get(materialId);
        if (!Number.isSafeInteger(unitGold) || unitGold <= 0)
            throw new Error("agronomy_treatment_material_not_available");
        consumedGold += unitGold * quantity;
    }
    return {
        ...usage,
        requiredGold,
        consumedGold,
        savedGold: requiredGold - consumedGold,
    };
}

export function treatmentGold(job, treatment, qualificationLevel = job.difficultyLevel, requirements = { [treatment]: 1 }) {
    const state = sourceState(job);
    if (job.career === "agronomist") {
        const contract = agronomyTreatmentContract(treatment);
        if (!contract)
            throw new Error("agronomy_treatment_not_available");
        return agronomyTreatmentMaterialUsage(requirements, qualificationLevel).consumedGold;
    }
    if (job.career === "veterinarian") {
        return veterinarianTreatmentMaterialGold(job, treatment) +
            (job.serviceCommission ? 0 : HOSPITAL_BASE_FEE_GOLD[job.difficultyLevel]);
    }
    throw new Error("commission_treatment_not_available");
}

export function veterinarianTreatmentMaterialGold(job, treatment) {
    sourceState(job);
    if (job.career !== "veterinarian")
        throw new Error("animal_treatment_not_available");
    const contract = Object.values(ANIMAL_CONDITIONS)
        .find((entry) => entry.materials.join("+") === treatment);
    if (!contract)
        throw new Error("animal_treatment_not_available");
    return contract.materialGold;
}

function npcServiceContract(source) {
    if (source.career === "agronomist") {
        const contract = AGRONOMY_CONDITIONS[source.fact.condition];
        const baseFeeGold = AGRONOMY_NPC_BASE_FEE_GOLD[source.difficultyLevel];
        if (!contract || !baseFeeGold || contract.minimumLevel > source.difficultyLevel)
            throw new Error("commission_npc_contract_unavailable");
        const liveTreatment = sourceState({
            career: source.career,
            sourceId: source.sourceId,
            objectType: source.objectType,
            objectId: source.objectId,
        }).source.requiredTreatment ?? contract.material;
        const treatmentContract = agronomyTreatmentContract(liveTreatment);
        if (!treatmentContract || treatmentContract.minimumLevel > source.difficultyLevel)
            throw new Error("commission_npc_contract_unavailable");
        return {
            baseFeeGold,
            materialFeeGold: treatmentContract.materialGold,
            treatment: liveTreatment,
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

export function npcServiceGold(source) {
    const contract = npcServiceContract(source);
    return contract.baseFeeGold + contract.materialFeeGold;
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
    const currentNature = getNatureWorld();
    const nextNature = reconcileNatureTreatment(structuredClone(currentNature), staged, source.sourceId, result, now);
    if (JSON.stringify(nextNature) !== JSON.stringify(currentNature)) {
        replaceFarmsAndNatureAtomic({
            replacements: [{ id: staged.id, farm: staged }],
            nextNatureWorld: nextNature,
        });
    }
    else {
        replaceFarm(staged.id, staged);
    }
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
        requireStandaloneP3Checkpoint(database);
        operation = runLingyeWorldTransaction(database, () => {
            const contract = npcServiceContract(source);
            const totalFeeGold = npcServiceGold(source);
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
    requireStandaloneP3Checkpoint(database);
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

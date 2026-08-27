import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const AGRONOMY_CONDITIONS = Object.freeze({
    drought: Object.freeze({ minimumLevel: 1, growth: "paused", material: "water-retaining-cover", materialGold: 5_000 }),
    waterlogging: Object.freeze({ minimumLevel: 2, growth: "paused", material: "drainage-material", materialGold: 2_000 }),
    local_pest: Object.freeze({ minimumLevel: 1, growth: "normal", material: "insect-trap", materialGold: 3_000 }),
    nutrient_imbalance: Object.freeze({ minimumLevel: 3, growth: "half", material: "soil-conditioner", materialGold: 6_000 }),
    root_damage: Object.freeze({ minimumLevel: 3, growth: "paused", material: "root-treatment", materialGold: 10_000 }),
});

export const ANIMAL_CONDITIONS = Object.freeze({
    indigestion: Object.freeze({ minimumLevel: 1, recoveryDays: 1, materials: Object.freeze(["stomach-powder"]), materialGold: 3_000 }),
    minor_injury: Object.freeze({ minimumLevel: 1, recoveryDays: 1, materials: Object.freeze(["wound-cleanser", "bandage"]), materialGold: 6_000 }),
    wet_cold: Object.freeze({ minimumLevel: 2, recoveryDays: 2, materials: Object.freeze(["dry-bedding", "warm-compress"]), materialGold: 9_000 }),
    dehydration: Object.freeze({ minimumLevel: 2, recoveryDays: 2, materials: Object.freeze(["rehydration-salt"]), materialGold: 2_000 }),
    respiratory_infection: Object.freeze({ minimumLevel: 3, recoveryDays: 3, materials: Object.freeze(["respiratory-medicine"]), materialGold: 12_000 }),
    compound_fever: Object.freeze({ minimumLevel: 4, recoveryDays: 4, materials: Object.freeze(["antipyretic", "rehydration-salt", "respiratory-medicine"]), materialGold: 22_000 }),
});

const AGRONOMY_CHECKS = Object.freeze({
    drought: Object.freeze(["leaf", "soil"]),
    waterlogging: Object.freeze(["soil", "root"]),
    local_pest: Object.freeze(["leaf", "pest-trace"]),
    nutrient_imbalance: Object.freeze(["leaf", "soil", "treatment-history"]),
    root_damage: Object.freeze(["root", "soil"]),
});

const ANIMAL_CHECKS = Object.freeze({
    indigestion: Object.freeze(["feed-history", "abdomen"]),
    minor_injury: Object.freeze(["injury", "activity-history"]),
    wet_cold: Object.freeze(["temperature", "bedding", "breathing"]),
    dehydration: Object.freeze(["water-intake", "temperature"]),
    respiratory_infection: Object.freeze(["temperature", "breathing"]),
    compound_fever: Object.freeze(["temperature", "hydration", "breathing"]),
});

export function agronomyChecksFor(condition) {
    return [...(AGRONOMY_CHECKS[condition] ?? [])];
}

export function animalChecksFor(condition) {
    return [...(ANIMAL_CHECKS[condition] ?? [])];
}

export function beijingDay(at) {
    return Math.floor((at + 8 * 60 * 60 * 1_000) / DAY_MS);
}

function stableInteger(...parts) {
    return createHash("sha256").update(parts.join(":"), "utf8").digest().readUInt32BE(0);
}

function stableChance(limit, ...parts) {
    return stableInteger(...parts) / 0x1_0000_0000 < limit;
}

function stablePick(values, ...parts) {
    return values[stableInteger(...parts) % values.length];
}

function p3State(farm, currentDay) {
    const existing = farm.lingyeP3;
    if (existing && existing.version === 1) {
        existing.history ??= [];
        existing.actionReceipts ??= {};
        existing.lastAdvancedDay ??= currentDay - 1;
        existing.lastAnimalRecoveryDay ??= null;
        return existing;
    }
    const state = {
        version: 1,
        lastAdvancedDay: currentDay - 1,
        lastAnimalRecoveryDay: null,
        history: [],
        actionReceipts: {},
    };
    farm.lingyeP3 = state;
    return state;
}

export function runP3WorldAction(farm, actionKey, payloadHash, operation, now = Date.now()) {
    const state = p3State(farm, beijingDay(now));
    const existing = state.actionReceipts[actionKey];
    if (existing) {
        if (existing.payloadHash !== payloadHash)
            throw new Error("p3_world_action_conflict");
        return structuredClone(existing.result);
    }
    const result = operation();
    state.actionReceipts[actionKey] = {
        payloadHash,
        result: structuredClone(result),
        recordedAt: now,
    };
    return result;
}

function activeAgronomyIssue(farm) {
    for (const plot of farm.plots ?? []) {
        const issue = plot.crop?.lingyeAgronomy;
        if (issue?.status === "open" || issue?.status === "stabilized")
            return { issue, plot };
    }
    return null;
}

function activeAnimalCase(farm) {
    for (const [index, animal] of (farm.ranch?.animals ?? []).entries()) {
        const health = animal.lingyeHealth;
        if (health && health.status !== "healthy")
            return { animal, health, index };
    }
    return null;
}

function advanceRecoveries(farm, state, day, now) {
    let changed = false;
    for (const [index, animal] of (farm.ranch?.animals ?? []).entries()) {
        const health = animal.lingyeHealth;
        if (health?.status !== "recovering" || day < health.recoveryUntilDay)
            continue;
        state.history.push({
            type: "animal_recovered",
            sourceId: health.sourceId,
            animalIndex: index,
            condition: health.condition,
            recordedAt: now,
        });
        delete animal.lingyeHealth;
        state.lastAnimalRecoveryDay = day;
        changed = true;
    }
    return changed;
}

function eligibleAgronomyConditions(plot) {
    const waterCount = Number.isSafeInteger(plot.crop?.waterCount) ? plot.crop.waterCount : 0;
    const conditions = ["local_pest"];
    if (waterCount === 0)
        conditions.push("drought");
    if (waterCount >= 2)
        conditions.push("waterlogging");
    return conditions;
}

function generateAgronomyIssue(farm, day, now) {
    if (activeAgronomyIssue(farm) || !stableChance(0.08, farm.id, day, "agronomy"))
        return null;
    const plots = (farm.plots ?? []).filter((plot) => plot.crop && !plot.crop.ripe);
    if (plots.length === 0)
        return null;
    const plot = stablePick(plots, farm.id, day, "agronomy-plot");
    const condition = stablePick(eligibleAgronomyConditions(plot), farm.id, day, plot.id, "agronomy-condition");
    const sourceId = `p3:agronomy:${farm.id}:${day}:${plot.id}`;
    plot.crop.lingyeAgronomy = {
        sourceId,
        condition,
        status: "open",
        generatedDay: day,
        generatedAt: now,
        checks: [],
        treatments: [],
        qualityPenalty: true,
    };
    return { type: "agronomy", sourceId, plotId: plot.id, condition };
}

function generateAnimalCase(farm, state, day, now) {
    if (activeAnimalCase(farm) ||
        (state.lastAnimalRecoveryDay !== null && day - state.lastAnimalRecoveryDay < 7) ||
        !stableChance(0.02, farm.id, day, "animal-health")) {
        return null;
    }
    const animals = farm.ranch?.animals ?? [];
    if (animals.length === 0)
        return null;
    const animal = stablePick(animals, farm.id, day, "animal");
    const animalIndex = animals.indexOf(animal);
    const condition = stablePick(Object.keys(ANIMAL_CONDITIONS), farm.id, day, animal.kindId, animalIndex, "animal-condition");
    const sourceId = `p3:animal:${farm.id}:${day}:${animalIndex}`;
    animal.lingyeHealth = {
        sourceId,
        condition,
        status: "open",
        generatedDay: day,
        generatedAt: now,
        checks: [],
        treatments: [],
        recoveryUntilDay: null,
    };
    return { type: "animal", sourceId, animalIndex, condition };
}

export function advanceP3Farm(farm, now = Date.now()) {
    const day = beijingDay(now);
    const state = p3State(farm, day);
    const generated = [];
    let changed = false;
    for (let candidateDay = state.lastAdvancedDay + 1; candidateDay <= day; candidateDay += 1) {
        changed = advanceRecoveries(farm, state, candidateDay, now) || changed;
        const agronomy = generateAgronomyIssue(farm, candidateDay, now);
        if (agronomy)
            generated.push(agronomy);
        const animal = generateAnimalCase(farm, state, candidateDay, now);
        if (animal)
            generated.push(animal);
        state.lastAdvancedDay = candidateDay;
        changed = true;
    }
    return { changed, generated, state };
}

export function agronomyGrowthEffect(crop) {
    const issue = crop?.lingyeAgronomy;
    if (!issue || issue.status === "resolved")
        return "normal";
    return AGRONOMY_CONDITIONS[issue.condition]?.growth ?? "normal";
}

export function agronomyHarvestPenalty(crop) {
    const issue = crop?.lingyeAgronomy;
    return Boolean(issue && issue.status !== "resolved" && issue.qualityPenalty);
}

export function recordAgronomyHarvest(farm, plot, now = Date.now()) {
    const issue = plot?.crop?.lingyeAgronomy;
    if (!issue)
        return;
    const state = p3State(farm, beijingDay(now));
    state.history.push({
        type: "agronomy_harvested",
        sourceId: issue.sourceId,
        plotId: plot.id,
        condition: issue.condition,
        statusAtHarvest: issue.status,
        qualityPenalty: issue.status !== "resolved" && Boolean(issue.qualityPenalty),
        recordedAt: now,
    });
}

export function ranchProductionPaused(animal) {
    const status = animal?.lingyeHealth?.status;
    return status === "open" || status === "treating" || status === "recovering";
}

function requireIssue(farm, sourceId) {
    const entry = activeAgronomyIssue(farm);
    if (!entry || entry.issue.sourceId !== sourceId)
        throw new Error("agronomy_source_not_available");
    return entry;
}

function requireCase(farm, sourceId) {
    const entry = activeAnimalCase(farm);
    if (!entry || entry.health.sourceId !== sourceId)
        throw new Error("animal_source_not_available");
    return entry;
}

function addUnique(values, value) {
    if (!values.includes(value))
        values.push(value);
}

export function checkAgronomyIssue(farm, sourceId, check) {
    const { issue } = requireIssue(farm, sourceId);
    if (!AGRONOMY_CHECKS[issue.condition]?.includes(check))
        throw new Error("agronomy_check_not_available");
    addUnique(issue.checks, check);
    return { condition: issue.condition, check, sourceId };
}

export function treatAgronomyIssue(farm, sourceId, treatment, qualificationLevel, now = Date.now()) {
    const { issue } = requireIssue(farm, sourceId);
    const contract = AGRONOMY_CONDITIONS[issue.condition];
    if (!contract || qualificationLevel < contract.minimumLevel)
        throw new Error("agronomy_qualification_insufficient");
    if (treatment !== contract.material)
        throw new Error("agronomy_treatment_not_available");
    if (issue.checks.length === 0)
        throw new Error("agronomy_check_required");
    addUnique(issue.treatments, treatment);
    issue.status = "resolved";
    issue.resolvedAt = now;
    return { sourceId, condition: issue.condition, status: issue.status, materialGold: contract.materialGold };
}

export function checkAnimalCase(farm, sourceId, check) {
    const { health } = requireCase(farm, sourceId);
    if (!ANIMAL_CHECKS[health.condition]?.includes(check))
        throw new Error("animal_check_not_available");
    addUnique(health.checks, check);
    return { condition: health.condition, check, sourceId };
}

export function treatAnimalCase(farm, sourceId, materials, qualificationLevel, now = Date.now()) {
    const { health } = requireCase(farm, sourceId);
    const contract = ANIMAL_CONDITIONS[health.condition];
    if (!contract || qualificationLevel < contract.minimumLevel)
        throw new Error("animal_qualification_insufficient");
    if (health.checks.length === 0)
        throw new Error("animal_check_required");
    if (!Array.isArray(materials) || materials.length !== contract.materials.length ||
        materials.some((material, index) => material !== contract.materials[index])) {
        throw new Error("animal_treatment_not_available");
    }
    health.treatments = [...materials];
    health.status = "recovering";
    health.treatedAt = now;
    health.recoveryUntilDay = beijingDay(now) + contract.recoveryDays;
    return {
        sourceId,
        condition: health.condition,
        status: health.status,
        recoveryUntilDay: health.recoveryUntilDay,
        materialGold: contract.materialGold,
    };
}

export function currentP3Sources(farm) {
    const agronomy = activeAgronomyIssue(farm);
    const animal = activeAnimalCase(farm);
    return {
        agronomy: agronomy ? {
            sourceId: agronomy.issue.sourceId,
            plotId: agronomy.plot.id,
            condition: agronomy.issue.condition,
            status: agronomy.issue.status,
            checks: [...agronomy.issue.checks],
            treatments: [...agronomy.issue.treatments],
        } : null,
        animal: animal ? {
            sourceId: animal.health.sourceId,
            animalIndex: animal.index,
            animalKindId: animal.animal.kindId,
            condition: animal.health.condition,
            status: animal.health.status,
            checks: [...animal.health.checks],
            treatments: [...animal.health.treatments],
            recoveryUntilDay: animal.health.recoveryUntilDay,
        } : null,
    };
}

import { createHash } from "node:crypto";
import { currentSeason, currentWeather } from "../time.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const AGRONOMY_CONDITIONS = Object.freeze({
    drought: Object.freeze({ minimumLevel: 1, growth: "paused", material: "water-retaining-cover", materialGold: 5_000 }),
    waterlogging: Object.freeze({ minimumLevel: 2, growth: "paused", material: "drainage-material", materialGold: 2_000 }),
    local_pest: Object.freeze({ minimumLevel: 1, growth: "normal", material: "insect-trap", materialGold: 3_000 }),
    nutrient_imbalance: Object.freeze({ minimumLevel: 3, growth: "half", material: "soil-conditioner", materialGold: 6_000 }),
    root_damage: Object.freeze({ minimumLevel: 3, growth: "paused", material: "root-treatment", materialGold: 10_000 }),
});
export const AGRONOMY_ADDITIONAL_TREATMENTS = Object.freeze({
    "pest-net": Object.freeze({ minimumLevel: 2, material: "pest-net", materialGold: 5_000 }),
});

export const P4_SEASONAL_BASELINES = Object.freeze({
    spring: Object.freeze({ agronomyChance: 0.12, animalChance: 0.03 }),
    summer: Object.freeze({ agronomyChance: 0.08, animalChance: 0.02 }),
    autumn: Object.freeze({ agronomyChance: 0.06, animalChance: 0.015 }),
    winter: Object.freeze({ agronomyChance: 0.08, animalChance: 0.02 }),
});
const SEASON_ID_BY_NAME = Object.freeze({ "春": "spring", "夏": "summer", "秋": "autumn", "冬": "winter" });

function p4SeasonalBaseline(now) {
    if (!currentWeather(now))
        return null;
    return P4_SEASONAL_BASELINES[SEASON_ID_BY_NAME[currentSeason(now).name]] ?? null;
}

/**
 * Material saving is a batch property of the agronomist qualification.  The
 * first level has no saving; levels 2/3/4 save 5%/10%/15% of eligible ordinary
 * material demand.  These are rates, not rounded quantities.
 */
export const AGRONOMY_MATERIAL_SAVING_RATES = Object.freeze({
    1: 0,
    2: 0.05,
    3: 0.10,
    4: 0.15,
});

const AGRONOMY_SAVABLE_MATERIALS = new Set(
    [...Object.values(AGRONOMY_CONDITIONS), ...Object.values(AGRONOMY_ADDITIONAL_TREATMENTS)]
        .map((condition) => condition.material),
);

export function agronomyMaterialSavingRate(qualificationLevel) {
    return AGRONOMY_MATERIAL_SAVING_RATES[Number(qualificationLevel)] ?? 0;
}

function normalizeAgronomyMaterialRequirements(requirements) {
    const entries = Array.isArray(requirements)
        ? requirements
        : requirements && typeof requirements === "object"
            ? Object.entries(requirements).map(([id, quantity]) => ({ id, quantity }))
            : null;
    if (!entries)
        throw new TypeError("agronomy_material_requirements_invalid");

    const normalized = new Map();
    for (const entry of entries) {
        const id = typeof entry === "string"
            ? entry
            : entry && typeof entry === "object"
                ? String(entry.id ?? entry.material ?? "")
                : "";
        const quantity = typeof entry === "string"
            ? 1
            : Number(entry?.quantity ?? entry?.qty ?? 0);
        if (!id || !Number.isSafeInteger(quantity) || quantity < 0)
            throw new TypeError("agronomy_material_requirements_invalid");
        if (quantity === 0)
            continue;
        const current = normalized.get(id);
        const savable = entry && typeof entry === "object" && entry.savable === false
            ? false
            : entry && typeof entry === "object" && entry.ordinary === false
                ? false
                : current?.savable ?? AGRONOMY_SAVABLE_MATERIALS.has(id);
        const nextQuantity = (current?.required ?? 0) + quantity;
        if (!Number.isSafeInteger(nextQuantity))
            throw new TypeError("agronomy_material_requirements_invalid");
        normalized.set(id, { required: nextQuantity, savable });
    }
    return normalized;
}

/**
 * Calculate one atomic batch's material demand without touching inventory.
 * Requirements may be a material->quantity map, material-id strings, or
 * records like { id, quantity }.  Only the five ordinary P3 treatment
 * materials are reducible by default; a record may explicitly mark a known
 * material non-savable for a special/event contract.
 */
export function agronomyMaterialUsage(requirements, qualificationLevel) {
    const normalized = normalizeAgronomyMaterialRequirements(requirements);
    const required = {};
    const consumed = {};
    const saved = {};
    let eligibleDemand = 0;
    for (const [id, entry] of normalized) {
        required[id] = entry.required;
        consumed[id] = entry.required;
        if (entry.savable)
            eligibleDemand += entry.required;
    }
    const rate = agronomyMaterialSavingRate(qualificationLevel);
    const requestedSaving = Math.floor(eligibleDemand * rate);
    let remainingSaving = requestedSaving;
    // Stable ID order makes mixed-material batches reproducible while the
    // floor-at-one rule protects every distinct material requirement.
    for (const id of Object.keys(required).sort()) {
        const entry = normalized.get(id);
        if (!entry.savable || remainingSaving <= 0)
            continue;
        const reducible = Math.max(0, entry.required - 1);
        const amount = Math.min(reducible, remainingSaving);
        if (amount <= 0)
            continue;
        consumed[id] -= amount;
        saved[id] = amount;
        remainingSaving -= amount;
    }
    const totalSaved = requestedSaving - remainingSaving;
    return {
        qualificationLevel: Number(qualificationLevel) || 0,
        savingRate: rate,
        required,
        consumed,
        saved,
        totalRequired: Object.values(required).reduce((sum, quantity) => sum + quantity, 0),
        eligibleDemand,
        totalSaved,
        totalConsumed: Object.values(consumed).reduce((sum, quantity) => sum + quantity, 0),
    };
}

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

const AGRONOMY_OBSERVATIONS = Object.freeze({
    drought: Object.freeze(["leaf_wilt", "soil_surface_dry"]),
    waterlogging: Object.freeze(["soil_surface_saturated", "lower_leaf_yellowing"]),
    local_pest: Object.freeze(["leaf_damage", "visible_pest_trace"]),
    nutrient_imbalance: Object.freeze(["uneven_leaf_color", "uneven_growth"]),
    root_damage: Object.freeze(["whole_plant_wilt", "root_zone_instability"]),
});

const ANIMAL_OBSERVATIONS = Object.freeze({
    indigestion: Object.freeze(["reduced_appetite", "abdominal_discomfort"]),
    minor_injury: Object.freeze(["reduced_activity", "localized_injury_trace"]),
    wet_cold: Object.freeze(["damp_coat_or_feathers", "reduced_activity"]),
    dehydration: Object.freeze(["increased_water_intake", "reduced_activity"]),
    respiratory_infection: Object.freeze(["abnormal_breathing", "reduced_activity"]),
    compound_fever: Object.freeze(["elevated_temperature", "abnormal_breathing", "dehydration_sign"]),
});

const AGRONOMY_FINDINGS = Object.freeze({
    drought: Object.freeze({ leaf: "leaf_water_stress", soil: "soil_moisture_low" }),
    waterlogging: Object.freeze({ soil: "soil_water_excess", root: "root_oxygen_low" }),
    local_pest: Object.freeze({ leaf: "leaf_feeding_damage", "pest-trace": "localized_pest_trace" }),
    nutrient_imbalance: Object.freeze({ leaf: "leaf_nutrient_pattern", soil: "soil_nutrient_imbalance", "treatment-history": "prior_input_mismatch" }),
    root_damage: Object.freeze({ root: "root_tissue_damage", soil: "soil_structure_unstable" }),
});

const ANIMAL_FINDINGS = Object.freeze({
    indigestion: Object.freeze({ "feed-history": "recent_feed_irregularity", abdomen: "abdominal_discomfort_confirmed" }),
    minor_injury: Object.freeze({ injury: "minor_external_injury", "activity-history": "recent_activity_reduction" }),
    wet_cold: Object.freeze({ temperature: "temperature_slightly_low", bedding: "bedding_damp", breathing: "breathing_clear" }),
    dehydration: Object.freeze({ "water-intake": "water_intake_increased", temperature: "temperature_not_elevated" }),
    respiratory_infection: Object.freeze({ temperature: "temperature_elevated", breathing: "respiratory_sign_confirmed" }),
    compound_fever: Object.freeze({ temperature: "temperature_high", hydration: "dehydration_confirmed", breathing: "respiratory_sign_confirmed" }),
});

const CHECK_FINDING_TEXT = Object.freeze({
    leaf_water_stress: "叶片失去挺度，呈现缺水压力。",
    soil_moisture_low: "土面发干，土壤水分偏低。",
    soil_water_excess: "土面有积水。",
    root_oxygen_low: "根区缺氧。",
    leaf_feeding_damage: "叶片发现取食缺口。",
    localized_pest_trace: "地块发现局部虫迹。",
    adjacent_pest_trace_continuation: "虫迹沿相邻地块连续延伸。",
    leaf_nutrient_pattern: "叶色存在异常。",
    soil_nutrient_imbalance: "土壤情况支持营养失衡。",
    prior_input_mismatch: "近期处理记录与当前状态不匹配。",
    root_tissue_damage: "根部组织存在受损迹象。",
    soil_structure_unstable: "根区土壤结构不稳定。",
    recent_feed_irregularity: "近期饲料记录存在异常。",
    abdominal_discomfort_confirmed: "腹部不适已确认。",
    minor_external_injury: "发现轻微外伤。",
    recent_activity_reduction: "近期活动减少。",
    temperature_slightly_low: "体温略低。",
    bedding_damp: "垫料潮湿。",
    breathing_clear: "呼吸未见异常。",
    water_intake_increased: "饮水增加。",
    temperature_not_elevated: "体温未升高。",
    temperature_elevated: "体温升高。",
    respiratory_sign_confirmed: "呼吸异常已确认。",
    temperature_high: "体温呈高热。",
    dehydration_confirmed: "补水状态异常，脱水已确认。",
    no_relevant_abnormality: "本项检查没有发现与当前异常直接相关的迹象。",
});

const ANIMAL_RECOVERY_REDUCTION = Object.freeze({ 1: 0, 2: 0.1, 3: 0.2, 4: 0.3 });

export function agronomyChecksFor(condition) {
    return [...(AGRONOMY_CHECKS[condition] ?? [])];
}

export function animalChecksFor(condition) {
    return [...(ANIMAL_CHECKS[condition] ?? [])];
}

export function agronomyCheckCandidates(qualificationLevel) {
    return [...new Set(Object.entries(AGRONOMY_CONDITIONS)
        .filter(([, entry]) => entry.minimumLevel <= qualificationLevel)
        .flatMap(([condition]) => AGRONOMY_CHECKS[condition] ?? []))];
}

export function animalCheckCandidates(qualificationLevel) {
    return [...new Set(Object.entries(ANIMAL_CONDITIONS)
        .filter(([, entry]) => entry.minimumLevel <= qualificationLevel)
        .flatMap(([condition]) => ANIMAL_CHECKS[condition] ?? []))];
}

export function agronomyObservationsFor(condition) {
    return [...(AGRONOMY_OBSERVATIONS[condition] ?? [])];
}

export function animalObservationsFor(condition) {
    return [...(ANIMAL_OBSERVATIONS[condition] ?? [])];
}

export function p3CheckFindingText(finding) {
    return CHECK_FINDING_TEXT[finding] ?? CHECK_FINDING_TEXT.no_relevant_abnormality;
}

export function agronomyTreatmentCandidates(qualificationLevel) {
    return [...new Set([...Object.values(AGRONOMY_CONDITIONS), ...Object.values(AGRONOMY_ADDITIONAL_TREATMENTS)]
        .filter((entry) => entry.minimumLevel <= qualificationLevel)
        .map((entry) => entry.material))];
}

export function agronomyTreatmentContract(material) {
    return [...Object.values(AGRONOMY_CONDITIONS), ...Object.values(AGRONOMY_ADDITIONAL_TREATMENTS)]
        .find((entry) => entry.material === material) ?? null;
}

export function animalTreatmentCandidates(qualificationLevel) {
    return [...new Set(Object.values(ANIMAL_CONDITIONS)
        .filter((entry) => entry.minimumLevel <= qualificationLevel)
        .map((entry) => entry.materials.join("+")))];
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

const ACTIVE_AGRONOMY_STATUSES = new Set(["open", "stabilized", "treating"]);

export function plotAgronomyIssues(plot) {
    const candidates = [
        plot?.lingyeAgronomy,
        ...(Array.isArray(plot?.lingyeNatureAgronomy) ? plot.lingyeNatureAgronomy : []),
        plot?.crop?.lingyeAgronomy,
        ...(Array.isArray(plot?.crop?.lingyeNatureAgronomy) ? plot.crop.lingyeNatureAgronomy : []),
    ].filter(Boolean);
    const seen = new Set();
    return candidates.filter((issue) => {
        const key = String(issue?.sourceId ?? "");
        if (key && seen.has(key))
            return false;
        if (key)
            seen.add(key);
        return true;
    });
}

function migratePlotAgronomyIssues(plot) {
    const crop = plot?.crop;
    if (!crop)
        return false;
    let changed = false;
    if (crop.lingyeAgronomy) {
        if (!plot.lingyeAgronomy || plot.lingyeAgronomy.sourceId === crop.lingyeAgronomy.sourceId) {
            plot.lingyeAgronomy = crop.lingyeAgronomy;
            delete crop.lingyeAgronomy;
            changed = true;
        }
    }
    if (Array.isArray(crop.lingyeNatureAgronomy) && crop.lingyeNatureAgronomy.length > 0) {
        plot.lingyeNatureAgronomy ??= [];
        const existing = new Set(plot.lingyeNatureAgronomy.map((issue) => String(issue?.sourceId ?? "")));
        for (const issue of crop.lingyeNatureAgronomy) {
            const sourceId = String(issue?.sourceId ?? "");
            if (!sourceId || !existing.has(sourceId)) {
                plot.lingyeNatureAgronomy.push(issue);
                if (sourceId)
                    existing.add(sourceId);
            }
        }
        delete crop.lingyeNatureAgronomy;
        changed = true;
    }
    return changed;
}

export function normalizeFarmAgronomyIssues(farm) {
    let changed = false;
    for (const plot of farm.plots ?? [])
        changed = migratePlotAgronomyIssues(plot) || changed;
    return changed;
}

function activeAgronomyIssue(farm, predicate = () => true) {
    for (const plot of farm.plots ?? []) {
        for (const issue of plotAgronomyIssues(plot)) {
            if (ACTIVE_AGRONOMY_STATUSES.has(issue?.status) && predicate(issue))
                return { issue, plot };
        }
    }
    return null;
}

function findAgronomyIssue(farm, sourceId) {
    for (const plot of farm.plots ?? []) {
        const issue = plotAgronomyIssues(plot).find((entry) => entry.sourceId === sourceId);
        if (issue)
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
            natureEventId: health.natureEventId ?? null,
            natureImpactId: health.natureImpactId ?? null,
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
    const seasonal = p4SeasonalBaseline(now);
    if (activeAgronomyIssue(farm, (issue) => !issue.natureEventId) ||
        !stableChance(seasonal?.agronomyChance ?? 0.08, farm.id, day, "agronomy"))
        return null;
    const plots = (farm.plots ?? []).filter((plot) => plot.crop && !plot.crop.ripe);
    if (plots.length === 0)
        return null;
    const plot = stablePick(plots, farm.id, day, "agronomy-plot");
    const condition = stablePick(eligibleAgronomyConditions(plot), farm.id, day, plot.id, "agronomy-condition");
    const sourceId = `p3:agronomy:${farm.id}:${day}:${plot.id}`;
    plot.lingyeAgronomy = {
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
    const seasonal = p4SeasonalBaseline(now);
    if (activeAnimalCase(farm) ||
        (state.lastAnimalRecoveryDay !== null && day - state.lastAnimalRecoveryDay < 7) ||
        !stableChance(seasonal?.animalChance ?? 0.02, farm.id, day, "animal-health")) {
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
    const migrated = normalizeFarmAgronomyIssues(farm);
    const state = p3State(farm, day);
    const generated = [];
    let changed = migrated;
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

export function agronomyGrowthEffect(plot) {
    const effects = plotAgronomyIssues(plot)
        .filter((issue) => issue.status !== "resolved")
        .map((issue) => AGRONOMY_CONDITIONS[issue.condition]?.growth ?? "normal");
    return effects.includes("paused") ? "paused" : effects.includes("half") ? "half" : "normal";
}

export function agronomyHarvestPenalty(plot) {
    return plotAgronomyIssues(plot).some((issue) => issue.status !== "resolved" && issue.qualityPenalty);
}

export function agronomyTreatmentLocked(plot) {
    return plotAgronomyIssues(plot).some((issue) => issue.status === "treating");
}

export function agronomyObservationsForPlot(plot) {
    return [...new Set(plotAgronomyIssues(plot)
        .filter((issue) => ACTIVE_AGRONOMY_STATUSES.has(issue?.status))
        .flatMap((issue) => agronomyObservationsFor(issue.condition)))];
}

export function recordAgronomyHarvest(farm, plot, now = Date.now()) {
    migratePlotAgronomyIssues(plot);
    const issues = plotAgronomyIssues(plot).filter((issue) => ACTIVE_AGRONOMY_STATUSES.has(issue?.status));
    if (issues.length === 0)
        return;
    const state = p3State(farm, beijingDay(now));
    for (const issue of issues) {
        state.history.push({
            type: "agronomy_harvested",
            sourceId: issue.sourceId,
            plotId: plot.id,
            condition: issue.condition,
            statusAtHarvest: issue.status,
            qualityPenalty: issue.status !== "resolved" && Boolean(issue.qualityPenalty),
            natureEventId: issue.natureEventId ?? null,
            natureImpactId: issue.natureImpactId ?? null,
            recordedAt: now,
        });
    }
}

export function ranchProductionPaused(animal) {
    const status = animal?.lingyeHealth?.status;
    return status === "open" || status === "treating" || status === "recovering";
}

export const ranchHealthActionBlocked = ranchProductionPaused;

export function maybeApplyRanchRaidInjury(farm, animal, eventReference, now = Date.now()) {
    if (!farm?.doorbellMcpMigration?.migrationId || !animal || animal.lingyeHealth ||
        !stableChance(0.1, farm.id, eventReference, "ranch-raid-injury")) {
        return false;
    }
    const animalIndex = farm.ranch?.animals?.indexOf(animal) ?? -1;
    if (animalIndex < 0)
        return false;
    const sourceId = `p3:animal:${farm.id}:raid:${eventReference}`;
    animal.lingyeHealth = {
        sourceId,
        condition: "minor_injury",
        status: "open",
        generatedDay: beijingDay(now),
        generatedAt: now,
        checks: [],
        treatments: [],
        recoveryUntilDay: null,
    };
    p3State(farm, beijingDay(now));
    return true;
}

function requireIssue(farm, sourceId) {
    normalizeFarmAgronomyIssues(farm);
    const entry = findAgronomyIssue(farm, sourceId);
    if (!entry || !["open", "stabilized", "treating"].includes(entry.issue.status))
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
    if (![...new Set(Object.values(AGRONOMY_CHECKS).flat())].includes(check))
        throw new Error("agronomy_check_not_available");
    addUnique(issue.checks, check);
    issue.status = "treating";
    const finding = issue.condition === "local_pest" && check === "pest-trace" && issue.spreadFromSourceId
        ? "adjacent_pest_trace_continuation"
        : AGRONOMY_FINDINGS[issue.condition][check] ?? "no_relevant_abnormality";
    return {
        check,
        finding,
        sourceId,
    };
}

export function treatAgronomyIssue(farm, sourceId, treatment, qualificationLevel, now = Date.now()) {
    const { issue } = requireIssue(farm, sourceId);
    const contract = AGRONOMY_CONDITIONS[issue.condition];
    if (!contract || qualificationLevel < contract.minimumLevel)
        throw new Error("agronomy_qualification_insufficient");
    const candidate = agronomyTreatmentContract(treatment);
    if (candidate && candidate.minimumLevel > qualificationLevel)
        throw new Error("agronomy_treatment_not_available");
    if (!candidate)
        throw new Error("agronomy_treatment_not_available");
    if (issue.checks.length === 0)
        throw new Error("agronomy_check_required");
    addUnique(issue.treatments, treatment);
    const requiredTreatment = issue.requiredTreatment ?? contract.material;
    if (treatment !== requiredTreatment) {
        return {
            sourceId,
            status: issue.status,
            resolved: false,
            materialGold: candidate.materialGold,
        };
    }
    issue.status = "resolved";
    issue.resolvedAt = now;
    if (issue.condition === "drought" && treatment === "water-retaining-cover")
        issue.protectedForEvent = true;
    return { sourceId, status: issue.status, resolved: true, materialGold: candidate.materialGold };
}

export function checkAnimalCase(farm, sourceId, check) {
    const { health } = requireCase(farm, sourceId);
    if (![...new Set(Object.values(ANIMAL_CHECKS).flat())].includes(check))
        throw new Error("animal_check_not_available");
    addUnique(health.checks, check);
    health.status = "treating";
    return {
        check,
        finding: ANIMAL_FINDINGS[health.condition][check] ?? "no_relevant_abnormality",
        sourceId,
    };
}

export function treatAnimalCase(farm, sourceId, materials, qualificationLevel, now = Date.now()) {
    const { health } = requireCase(farm, sourceId);
    const contract = ANIMAL_CONDITIONS[health.condition];
    if (!contract || qualificationLevel < contract.minimumLevel)
        throw new Error("animal_qualification_insufficient");
    if (health.checks.length === 0)
        throw new Error("animal_check_required");
    const treatmentReference = Array.isArray(materials) ? materials.join("+") : "";
    const candidate = Object.values(ANIMAL_CONDITIONS).find((entry) =>
        entry.materials.join("+") === treatmentReference && entry.minimumLevel <= qualificationLevel);
    if (!candidate) {
        throw new Error("animal_treatment_not_available");
    }
    addUnique(health.treatments, treatmentReference);
    if (treatmentReference !== contract.materials.join("+")) {
        return {
            sourceId,
            status: health.status,
            resolved: false,
            materialGold: candidate.materialGold,
        };
    }
    health.status = "recovering";
    health.treatedAt = now;
    const reduction = ANIMAL_RECOVERY_REDUCTION[qualificationLevel] ?? 0;
    const recoveryDays = Math.max(1, Math.ceil(contract.recoveryDays * (1 - reduction)));
    health.recoveryUntilDay = beijingDay(now) + recoveryDays;
    return {
        sourceId,
        status: health.status,
        resolved: true,
        recoveryDays,
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
            requiredTreatment: agronomy.issue.requiredTreatment ?? AGRONOMY_CONDITIONS[agronomy.issue.condition]?.material,
            natureEventId: agronomy.issue.natureEventId ?? null,
            natureImpactId: agronomy.issue.natureImpactId ?? null,
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
            natureEventId: animal.health.natureEventId ?? null,
            natureImpactId: animal.health.natureImpactId ?? null,
        } : null,
    };
}

export function addNatureAgronomyIssue(farm, input) {
    const plot = farm.plots?.find((entry) => entry.id === Number(input.plotId));
    if (!plot)
        return null;
    migratePlotAgronomyIssues(plot);
    plot.lingyeNatureAgronomy ??= [];
    const existing = plot.lingyeNatureAgronomy.find((issue) => issue.sourceId === String(input.sourceId));
    if (existing)
        return existing;
    if (!plot.crop)
        return null;
    const contract = AGRONOMY_CONDITIONS[input.condition];
    if (!contract)
        throw new Error("agronomy_condition_not_available");
    const issue = {
        sourceId: String(input.sourceId),
        condition: input.condition,
        status: "open",
        generatedDay: Number(input.generatedDay),
        generatedAt: Number(input.now),
        checks: [],
        treatments: [],
        qualityPenalty: true,
        natureEventId: String(input.eventId),
        natureImpactId: String(input.impactId),
        requiredTreatment: input.requiredTreatment ?? contract.material,
        spreadFromSourceId: input.spreadFromSourceId ?? null,
        lastSpreadDay: input.lastSpreadDay ?? null,
        protectedForEvent: false,
    };
    plot.lingyeNatureAgronomy.push(issue);
    p3State(farm, Number(input.generatedDay));
    return issue;
}

export function addNatureAnimalCase(farm, input) {
    if (activeAnimalCase(farm))
        return null;
    const animal = farm.ranch?.animals?.[Number(input.animalIndex)];
    const contract = ANIMAL_CONDITIONS[input.condition];
    if (!animal || !contract)
        return null;
    animal.lingyeHealth = {
        sourceId: String(input.sourceId),
        condition: input.condition,
        status: "open",
        generatedDay: Number(input.generatedDay),
        generatedAt: Number(input.now),
        checks: [],
        treatments: [],
        recoveryUntilDay: null,
        natureEventId: String(input.eventId),
        natureImpactId: String(input.impactId),
    };
    p3State(farm, Number(input.generatedDay));
    return animal.lingyeHealth;
}

export function agronomyIssuesForFarm(farm) {
    return (farm.plots ?? []).flatMap((plot) => plotAgronomyIssues(plot)
        .map((issue) => ({ plot, issue })));
}

// 铃野权威自然时间线：14 日生态季、稳定每日天气、三日预报与公共灾害事实。
// 本模块只持有世界事实。作物、牧场、钓鱼、病例与职业的真实结算由各自权威入口接线。
import { createHash, randomBytes } from "node:crypto";
import { seasons } from "./content.js";

export const NATURE_WORLD_VERSION = 1;
export const WEATHER_CONDITIONS = [
    "sunny", "cloudy", "light_rain", "heavy_rain", "thunderstorm",
    "fog", "hot", "dry_wind", "light_snow", "blizzard",
];
export const DISASTER_TYPES = ["flood", "drought", "pest"];
export const DISASTER_PHASES = ["forecast", "active", "recovery"];
export const ECO_SEASON_DAYS = 14;
export const ECO_CYCLE_DAYS = ECO_SEASON_DAYS * 4;
export const FORECAST_FUTURE_DAYS = 3;

const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 3_600_000;
const WEATHER_WEIGHT_ROWS = {
    "春": [25, 20, 30, 10, 5, 10, 0, 0, 0, 0],
    "夏": [20, 10, 15, 10, 15, 5, 20, 5, 0, 0],
    "秋": [30, 25, 20, 5, 5, 10, 0, 5, 0, 0],
    "冬": [25, 20, 0, 0, 0, 5, 0, 10, 30, 10],
};
const DISASTER_PRIORITY = { flood: 0, drought: 1, pest: 2 };
const FLOOD_WEATHER = new Set(["heavy_rain", "thunderstorm"]);
const DROUGHT_WEATHER = new Set(["sunny", "hot", "dry_wind"]);
const PEST_WARM_WEATHER = new Set([
    "sunny", "cloudy", "light_rain", "heavy_rain", "thunderstorm", "fog", "hot",
]);
const PEST_MOIST_WEATHER = new Set(["light_rain", "cloudy", "fog"]);
const DROUGHT_RECOVERY_WEATHER = new Set(["light_rain", "heavy_rain", "thunderstorm"]);
const IMPACT_KINDS = new Set([
    "plot_pest", "plot_flooded", "plot_drought", "flood_fish", "animal_wet_cold", "animal_dehydration",
]);
const IMPACT_KINDS_BY_DISASTER = {
    flood: new Set(["plot_flooded", "flood_fish", "animal_wet_cold"]),
    drought: new Set(["plot_drought", "animal_dehydration"]),
    pest: new Set(["plot_pest"]),
};
const IMPACT_RESOLUTION_KINDS = new Set(["owner", "visitor", "career", "natural", "transferred"]);

export class NatureContractError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "NatureContractError";
        this.code = code;
    }
}

export function beijingDayIndex(now) {
    return Math.floor((Number(now) + BEIJING_OFFSET_MS) / DAY_MS);
}

export function beijingDayStart(dayIndex) {
    return dayIndex * DAY_MS - BEIJING_OFFSET_MS;
}

function assertDay(value, field) {
    if (!Number.isSafeInteger(value))
        throw new NatureContractError("invalid_nature_state", `${field} must be an integer Beijing day index`);
    return value;
}

function cleanSeed(value) {
    const seed = String(value ?? "").trim();
    if (!seed || seed.length > 128)
        throw new NatureContractError("invalid_nature_seed", "nature seed must contain 1 to 128 characters");
    return seed;
}

function clone(value) {
    return structuredClone(value);
}

function inactiveNatureWorld() {
    return {
        version: NATURE_WORLD_VERSION,
        status: "inactive",
        activationDay: null,
        lastAdvancedDay: null,
        seed: null,
        weatherPlan: [],
        currentEvent: null,
        settledEvents: [],
        cooldownUntilDay: null,
    };
}

function seasonIndexForDay(activationDay, dayIndex) {
    const elapsed = dayIndex - activationDay;
    if (elapsed < 0)
        return null;
    return Math.floor(elapsed / ECO_SEASON_DAYS) % seasons.length;
}

export function ecologicalSeasonForDay(world, dayIndex) {
    if (world?.status !== "active")
        return null;
    const index = seasonIndexForDay(world.activationDay, dayIndex);
    if (index === null)
        return null;
    const season = seasons[index];
    const elapsed = dayIndex - world.activationDay;
    return {
        id: ["spring", "summer", "autumn", "winter"][index] ?? `season_${index}`,
        name: season.name,
        index,
        day: (elapsed % ECO_SEASON_DAYS) + 1,
        cycleDay: (elapsed % ECO_CYCLE_DAYS) + 1,
        startsOnDay: dayIndex - (elapsed % ECO_SEASON_DAYS),
        endsOnDay: dayIndex - (elapsed % ECO_SEASON_DAYS) + ECO_SEASON_DAYS - 1,
        definition: season,
    };
}

export function ecologicalSeasonAt(world, now) {
    return ecologicalSeasonForDay(world, beijingDayIndex(now));
}

function deterministicUnit(seed, scope) {
    const digest = createHash("sha256").update(`${seed}\u0000${scope}`, "utf8").digest();
    return digest.readUInt32BE(0) / 0x1_0000_0000;
}

function weightedWeather(seed, dayIndex, seasonName) {
    const weights = WEATHER_WEIGHT_ROWS[seasonName];
    if (!weights)
        throw new NatureContractError("invalid_nature_state", `missing weather weights for season ${seasonName}`);
    let needle = deterministicUnit(seed, `weather:${dayIndex}`) * 100;
    for (let i = 0; i < weights.length; i++) {
        needle -= weights[i];
        if (needle < 0)
            return WEATHER_CONDITIONS[i];
    }
    return WEATHER_CONDITIONS[WEATHER_CONDITIONS.length - 1];
}

export function plannedWeatherForDay(world, dayIndex) {
    if (world?.status !== "active")
        return null;
    const season = ecologicalSeasonForDay(world, dayIndex);
    if (!season)
        return null;
    return {
        dayIndex,
        season: season.name,
        seasonDay: season.day,
        condition: weightedWeather(world.seed, dayIndex, season.name),
    };
}

function normalizeWeatherEntry(entry, world) {
    if (!entry || typeof entry !== "object")
        throw new NatureContractError("invalid_nature_state", "weather plan entry must be an object");
    const dayIndex = assertDay(entry.dayIndex, "weatherPlan.dayIndex");
    const planned = plannedWeatherForDay(world, dayIndex);
    if (!planned || entry.season !== planned.season || entry.seasonDay !== planned.seasonDay || entry.condition !== planned.condition)
        throw new NatureContractError("invalid_nature_state", `weather plan entry for day ${dayIndex} does not match the authority seed`);
    return planned;
}

function normalizeImpact(entry) {
    if (!entry || typeof entry !== "object")
        throw new NatureContractError("invalid_nature_state", "disaster impact must be an object");
    const impactId = String(entry.impactId ?? "").trim();
    const farmId = String(entry.farmId ?? "").trim();
    const objectId = String(entry.objectId ?? "").trim();
    const kind = String(entry.kind ?? "").trim();
    if (!impactId || !farmId || !objectId || !IMPACT_KINDS.has(kind))
        throw new NatureContractError("invalid_nature_state", "disaster impact identity is invalid");
    const resolvedAtDay = entry.resolvedAtDay == null ? null : assertDay(entry.resolvedAtDay, "impact.resolvedAtDay");
    const resolutionKind = entry.resolutionKind == null ? null : String(entry.resolutionKind).trim();
    const resolutionRef = entry.resolutionRef == null ? null : String(entry.resolutionRef).trim();
    if (resolvedAtDay == null && (resolutionKind != null || resolutionRef != null))
        throw new NatureContractError("invalid_nature_state", "unresolved disaster impact cannot contain resolution facts");
    if (resolvedAtDay != null && (!IMPACT_RESOLUTION_KINDS.has(resolutionKind) || !resolutionRef))
        throw new NatureContractError("invalid_nature_state", "resolved disaster impact must retain its authority resolution fact");
    return {
        impactId,
        farmId,
        objectId,
        kind,
        createdAtDay: assertDay(entry.createdAtDay, "impact.createdAtDay"),
        resolvedAtDay,
        resolutionKind,
        resolutionRef,
    };
}

function normalizeEvent(event) {
    if (!event || typeof event !== "object")
        throw new NatureContractError("invalid_nature_state", "current disaster event must be an object");
    const eventId = String(event.eventId ?? "").trim();
    const type = String(event.type ?? "").trim();
    const phase = String(event.phase ?? "").trim();
    if (!eventId || !DISASTER_TYPES.includes(type) || !DISASTER_PHASES.includes(phase))
        throw new NatureContractError("invalid_nature_state", "current disaster identity or phase is invalid");
    const triggerDays = Array.isArray(event.triggerDays)
        ? event.triggerDays.map((day) => assertDay(day, "event.triggerDays"))
        : [];
    if (triggerDays.length < 2)
        throw new NatureContractError("invalid_nature_state", "current disaster must retain its trigger days");
    const impacts = Array.isArray(event.impacts) ? event.impacts.map(normalizeImpact) : [];
    if (impacts.some((impact) => !IMPACT_KINDS_BY_DISASTER[type].has(impact.kind)))
        throw new NatureContractError("invalid_nature_state", `${type} disaster contains an impact from another disaster contract`);
    return {
        eventId,
        type,
        region: "public_farm",
        phase,
        triggerDays,
        forecastedAtDay: assertDay(event.forecastedAtDay, "event.forecastedAtDay"),
        activeFromDay: assertDay(event.activeFromDay, "event.activeFromDay"),
        activatedAtDay: event.activatedAtDay == null ? null : assertDay(event.activatedAtDay, "event.activatedAtDay"),
        recoveryAtDay: event.recoveryAtDay == null ? null : assertDay(event.recoveryAtDay, "event.recoveryAtDay"),
        readyForSettlementAtDay: event.readyForSettlementAtDay == null
            ? null
            : assertDay(event.readyForSettlementAtDay, "event.readyForSettlementAtDay"),
        impacts,
    };
}

function normalizeSettledEvent(event) {
    const normalized = normalizeEvent({ ...event, phase: "recovery" });
    return {
        ...normalized,
        phase: "settled",
        settledAtDay: assertDay(event.settledAtDay, "event.settledAtDay"),
    };
}

export function normalizeNatureWorld(raw) {
    if (raw == null)
        return inactiveNatureWorld();
    if (!raw || typeof raw !== "object" || raw.version !== NATURE_WORLD_VERSION)
        throw new NatureContractError("invalid_nature_state", "unsupported nature world format");
    if (raw.status === "inactive")
        return inactiveNatureWorld();
    if (raw.status !== "active")
        throw new NatureContractError("invalid_nature_state", "nature world status is invalid");
    const world = {
        version: NATURE_WORLD_VERSION,
        status: "active",
        activationDay: assertDay(raw.activationDay, "activationDay"),
        lastAdvancedDay: null,
        seed: cleanSeed(raw.seed),
        weatherPlan: [],
        currentEvent: null,
        settledEvents: [],
        cooldownUntilDay: raw.cooldownUntilDay == null ? null : assertDay(raw.cooldownUntilDay, "cooldownUntilDay"),
    };
    world.lastAdvancedDay = raw.lastAdvancedDay == null
        ? world.activationDay - 1
        : assertDay(raw.lastAdvancedDay, "lastAdvancedDay");
    if (world.lastAdvancedDay < world.activationDay - 1)
        throw new NatureContractError("invalid_nature_state", "lastAdvancedDay cannot precede nature activation");
    const seenDays = new Set();
    world.weatherPlan = (Array.isArray(raw.weatherPlan) ? raw.weatherPlan : []).map((entry) => {
        const normalized = normalizeWeatherEntry(entry, world);
        if (seenDays.has(normalized.dayIndex))
            throw new NatureContractError("invalid_nature_state", `duplicate weather day ${normalized.dayIndex}`);
        seenDays.add(normalized.dayIndex);
        return normalized;
    }).sort((a, b) => a.dayIndex - b.dayIndex);
    world.currentEvent = raw.currentEvent == null ? null : normalizeEvent(raw.currentEvent);
    world.settledEvents = (Array.isArray(raw.settledEvents) ? raw.settledEvents : []).map(normalizeSettledEvent);
    return world;
}

export function createNatureSeed() {
    return randomBytes(16).toString("hex");
}

export function activateNatureWorld(raw, { now, seed }) {
    const world = normalizeNatureWorld(raw);
    const activationDay = beijingDayIndex(now);
    const normalizedSeed = cleanSeed(seed);
    if (world.status === "active") {
        if (world.seed !== normalizedSeed)
            throw new NatureContractError("nature_already_activated", "nature world is already bound to another authority seed");
        return world;
    }
    return {
        ...inactiveNatureWorld(),
        status: "active",
        activationDay,
        lastAdvancedDay: activationDay - 1,
        seed: normalizedSeed,
    };
}

function weatherMap(world) {
    return new Map(world.weatherPlan.map((entry) => [entry.dayIndex, entry]));
}

export function ensureWeatherPlan(raw, now, futureDays = FORECAST_FUTURE_DAYS) {
    const world = normalizeNatureWorld(raw);
    if (world.status !== "active")
        return world;
    const today = beijingDayIndex(now);
    if (today < world.activationDay)
        return world;
    const byDay = weatherMap(world);
    const lastStored = world.weatherPlan.at(-1)?.dayIndex ?? (world.activationDay - 1);
    const start = Math.max(world.activationDay, lastStored + 1);
    const end = today + futureDays;
    for (let day = start; day <= end; day++)
        byDay.set(day, plannedWeatherForDay(world, day));
    world.weatherPlan = [...byDay.values()].sort((a, b) => a.dayIndex - b.dayIndex);
    return world;
}

function eventIdFor(world, type, activeFromDay) {
    return createHash("sha256")
        .update(`${world.seed}\u0000disaster:${type}:${activeFromDay}`, "utf8")
        .digest("hex")
        .slice(0, 24);
}

function candidateAt(world, endDay, type) {
    const entries = weatherMap(world);
    const days = type === "drought"
        ? [endDay - 3, endDay - 2, endDay - 1, endDay]
        : [endDay - 2, endDay - 1, endDay];
    const actualDays = type === "flood" ? days.slice(-2) : days;
    const facts = actualDays.map((day) => entries.get(day) ?? plannedWeatherForDay(world, day));
    if (facts.some((fact) => !fact))
        return null;
    if (type === "flood" && !facts.every((fact) => FLOOD_WEATHER.has(fact.condition)))
        return null;
    if (type === "drought" && !facts.every((fact) => DROUGHT_WEATHER.has(fact.condition)))
        return null;
    if (type === "pest") {
        if (!facts.every((fact) => ["春", "夏"].includes(fact.season) && PEST_WARM_WEATHER.has(fact.condition)))
            return null;
        if (facts.filter((fact) => PEST_MOIST_WEATHER.has(fact.condition)).length < 2)
            return null;
    }
    return { type, triggerDays: facts.map((fact) => fact.dayIndex), activeFromDay: endDay };
}

function findForecastCandidate(world, today) {
    const candidates = [];
    for (let activeDay = today + 1; activeDay <= today + FORECAST_FUTURE_DAYS; activeDay++) {
        for (const type of DISASTER_TYPES) {
            const candidate = candidateAt(world, activeDay, type);
            if (candidate)
                candidates.push(candidate);
        }
    }
    return candidates.sort((a, b) => a.activeFromDay - b.activeFromDay
        || DISASTER_PRIORITY[a.type] - DISASTER_PRIORITY[b.type])[0] ?? null;
}

function recoveryStartsOnDay(world, event, day) {
    const byDay = weatherMap(world);
    const condition = (targetDay) => (byDay.get(targetDay) ?? plannedWeatherForDay(world, targetDay))?.condition;
    if (event.type === "flood")
        return day > event.activeFromDay && !FLOOD_WEATHER.has(condition(day));
    if (event.type === "drought")
        return day >= event.activeFromDay && DROUGHT_RECOVERY_WEATHER.has(condition(day));
    if (event.type === "pest")
        return day > event.activeFromDay
            && !PEST_MOIST_WEATHER.has(condition(day))
            && !PEST_MOIST_WEATHER.has(condition(day - 1));
    return false;
}

function firstRecoveryDay(world, event, today) {
    for (let day = event.activeFromDay; day <= today; day++) {
        if (recoveryStartsOnDay(world, event, day))
            return day;
    }
    return null;
}

function minimumSettlementDay(event) {
    if (event.recoveryAtDay == null)
        return Number.POSITIVE_INFINITY;
    if (event.type === "pest")
        return event.recoveryAtDay + 2;
    if (event.type === "flood")
        return event.recoveryAtDay + 1;
    return event.recoveryAtDay;
}

function settleIfReady(world, today) {
    const event = world.currentEvent;
    if (!event || event.phase !== "recovery" || event.readyForSettlementAtDay == null)
        return;
    if (event.impacts.some((impact) => impact.resolvedAtDay == null))
        return;
    const allImpactsResolvedAtDay = event.impacts.reduce((latest, impact) => Math.max(latest, impact.resolvedAtDay), event.recoveryAtDay);
    const earliestSettlementDay = Math.max(
        minimumSettlementDay(event),
        event.readyForSettlementAtDay,
        allImpactsResolvedAtDay,
    );
    if (today < earliestSettlementDay)
        return;
    world.settledEvents.push({ ...clone(event), phase: "settled", settledAtDay: today });
    world.currentEvent = null;
    world.cooldownUntilDay = today + 8;
}

function advanceNatureDay(world, day) {
    const event = world.currentEvent;
    if (event?.phase === "forecast" && day >= event.activeFromDay) {
        event.phase = "active";
        event.activatedAtDay = event.activeFromDay;
    }
    if (event?.phase === "active") {
        const recoveryAtDay = firstRecoveryDay(world, event, day);
        if (recoveryAtDay != null) {
            event.phase = "recovery";
            event.recoveryAtDay = recoveryAtDay;
        }
    }
    settleIfReady(world, day);
    if (world.currentEvent == null && (world.cooldownUntilDay == null || day >= world.cooldownUntilDay)) {
        const candidate = findForecastCandidate(world, day);
        if (candidate) {
            world.currentEvent = {
                eventId: eventIdFor(world, candidate.type, candidate.activeFromDay),
                type: candidate.type,
                region: "public_farm",
                phase: "forecast",
                triggerDays: candidate.triggerDays,
                forecastedAtDay: day,
                activeFromDay: candidate.activeFromDay,
                activatedAtDay: null,
                recoveryAtDay: null,
                readyForSettlementAtDay: null,
                impacts: [],
            };
        }
    }
}

export function advanceNatureWorld(raw, now) {
    const world = ensureWeatherPlan(raw, now);
    if (world.status !== "active")
        return world;
    const today = beijingDayIndex(now);
    if (today < world.activationDay)
        return world;
    if (world.lastAdvancedDay > today)
        throw new NatureContractError("nature_clock_regressed", "nature authority cannot move backwards across Beijing day boundaries");
    if (world.lastAdvancedDay === today) {
        advanceNatureDay(world, today);
        return world;
    }
    for (let day = world.lastAdvancedDay + 1; day <= today; day++) {
        advanceNatureDay(world, day);
        world.lastAdvancedDay = day;
    }
    return world;
}

function requireCurrentEvent(world, eventId) {
    const event = world.currentEvent;
    if (!event || event.eventId !== eventId)
        throw new NatureContractError("nature_event_not_current", "the disaster event is not current");
    return event;
}

export function registerNatureImpact(raw, { eventId, farmId, objectId, kind, now }) {
    const world = normalizeNatureWorld(raw);
    const event = requireCurrentEvent(world, String(eventId ?? "").trim());
    if (event.phase === "forecast")
        throw new NatureContractError("nature_event_not_active", "forecast events cannot create gameplay impacts");
    const normalizedFarmId = String(farmId ?? "").trim();
    const normalizedObjectId = String(objectId ?? "").trim();
    const normalizedKind = String(kind ?? "").trim();
    if (!normalizedFarmId || !normalizedObjectId || !IMPACT_KINDS.has(normalizedKind))
        throw new NatureContractError("invalid_nature_impact", "nature impact identity is invalid");
    if (!IMPACT_KINDS_BY_DISASTER[event.type].has(normalizedKind))
        throw new NatureContractError("nature_impact_not_allowed", `${normalizedKind} is not allowed for ${event.type}`);
    const impactId = createHash("sha256")
        .update(`${event.eventId}\u0000${normalizedFarmId}\u0000${normalizedObjectId}\u0000${normalizedKind}`, "utf8")
        .digest("hex")
        .slice(0, 24);
    const existing = event.impacts.find((impact) => impact.impactId === impactId);
    if (existing)
        return { world, impact: existing, created: false };
    const impact = {
        impactId,
        farmId: normalizedFarmId,
        objectId: normalizedObjectId,
        kind: normalizedKind,
        createdAtDay: beijingDayIndex(now),
        resolvedAtDay: null,
        resolutionKind: null,
        resolutionRef: null,
    };
    event.impacts.push(impact);
    return { world, impact, created: true };
}

export function resolveNatureImpact(raw, { eventId, impactId, resolutionKind, resolutionRef, now }) {
    const world = normalizeNatureWorld(raw);
    const event = requireCurrentEvent(world, String(eventId ?? "").trim());
    const impact = event.impacts.find((entry) => entry.impactId === String(impactId ?? "").trim());
    if (!impact)
        throw new NatureContractError("nature_impact_not_found", "the disaster impact does not exist");
    const normalizedKind = String(resolutionKind ?? "").trim();
    const normalizedRef = String(resolutionRef ?? "").trim();
    if (!IMPACT_RESOLUTION_KINDS.has(normalizedKind) || !normalizedRef)
        throw new NatureContractError("invalid_nature_resolution", "nature impact resolution requires an approved kind and authority reference");
    if (impact.resolvedAtDay != null) {
        if (impact.resolutionKind !== normalizedKind || impact.resolutionRef !== normalizedRef)
            throw new NatureContractError("nature_resolution_conflict", "nature impact is already bound to another resolution fact");
        return { world, impact };
    }
    impact.resolvedAtDay = beijingDayIndex(now);
    impact.resolutionKind = normalizedKind;
    impact.resolutionRef = normalizedRef;
    return { world, impact };
}

export function markNatureEventReadyForSettlement(raw, { eventId, now }) {
    const world = normalizeNatureWorld(raw);
    const event = requireCurrentEvent(world, String(eventId ?? "").trim());
    if (event.phase !== "recovery")
        throw new NatureContractError("nature_event_not_recovering", "only a recovering event can be marked ready for settlement");
    event.readyForSettlementAtDay ??= beijingDayIndex(now);
    return world;
}

export function natureSnapshot(raw, now) {
    const world = advanceNatureWorld(raw, now);
    if (world.status !== "active")
        return { status: "inactive", season: null, weather: null, forecast: [], currentEvent: null };
    const today = beijingDayIndex(now);
    const byDay = weatherMap(world);
    const forecast = [];
    for (let day = today; day <= today + FORECAST_FUTURE_DAYS; day++)
        forecast.push(clone(byDay.get(day) ?? plannedWeatherForDay(world, day)));
    return {
        status: "active",
        season: ecologicalSeasonForDay(world, today),
        weather: forecast[0],
        forecast,
        currentEvent: world.currentEvent ? clone(world.currentEvent) : null,
    };
}

import { beijingDayIndex } from "../../nature.js";

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => typeof value === "string" && value.length > 0;
const ranks = { aligned: 0, not_applicable: 0, behind: 1, missing_facts: 2, conflict: 3 };

// This inspects only facts supplied by the caller. Missing checks are never
// converted into a negative roll, and no cursor or case is advanced here.
export function preflightP3WeatherEnable({ world, farms, now }) {
    if (!Array.isArray(farms) || !Number.isSafeInteger(now)) throw new TypeError("weather preflight inputs required");
    if (world?.status !== "active") return { canEnable: false, deferred: world?.status === "inactive",
        natureDay: null, worldDay: null, reasons: ["NATURE_NOT_ACTIVE"], farms: [] };
    const today = beijingDayIndex(now);
    const worldDay = world.lastAdvancedDay;
    const reasons = [];
    if (!Number.isSafeInteger(world.activationDay) || !Number.isSafeInteger(worldDay)) reasons.push("NATURE_CURSOR_MISSING");
    else if (worldDay < world.activationDay - 1 || worldDay > today || world.activationDay > today)
        reasons.push("NATURE_CURSOR_CONFLICT");
    const natureDay = reasons.length ? null : Math.max(world.activationDay, Math.min(today, worldDay + 1));
    const events = new Map();
    for (const event of [world.currentEvent, world.storyEvent, world.winterEvent,
        ...(Array.isArray(world.settledEvents) ? world.settledEvents : [])]) {
        if (event && nonempty(event.eventId)) events.set(event.eventId, event);
    }
    const rows = farms.map(farm => {
        const farmId = nonempty(farm?.id) ? farm.id : null;
        const p3Day = farm?.lingyeP3?.lastAdvancedDay ?? null;
        const row = { farmId, natureDay, p3Day, status: "aligned", reasons: [] };
        const add = (status, code) => {
            if (!row.reasons.includes(code)) row.reasons.push(code);
            if (ranks[status] > ranks[row.status]) row.status = status;
        };
        if (!farmId) add("conflict", "FARM_ID_MISSING");
        const bound = !!farm?.doorbellMcpMigration?.migrationId;
        if (!bound && farm?.lingyeWeatherUpgrade == null) {
            if (row.status === "aligned") row.status = "not_applicable";
            return row;
        }
        if (!bound && row.status === "aligned") row.status = "not_applicable";
        const p3 = farm.lingyeP3;
        if (bound && (!record(p3) || p3.lastAdvancedDay == null)) add("missing_facts", "P3_CURSOR_MISSING");
        else if (bound) {
            if (p3.version === undefined) add("missing_facts", "P3_VERSION_MISSING");
            else if (p3.version !== 1) add("conflict", "P3_VERSION_CONFLICT");
            if (!Number.isSafeInteger(p3.lastAdvancedDay)) add("conflict", "P3_CURSOR_INVALID");
            else if (!reasons.length && p3.lastAdvancedDay < worldDay) add("behind", "P3_BEHIND_NATURE");
            else if (!reasons.length && p3.lastAdvancedDay > worldDay) add("conflict", "P3_AHEAD_OF_NATURE");
            if (!Array.isArray(p3.history)) add("missing_facts", "P3_HISTORY_MISSING");
            if (p3.lastAnimalRecoveryDay === undefined) add("missing_facts", "P3_RECOVERY_FACT_MISSING");
            else if (p3.lastAnimalRecoveryDay !== null && (!Number.isSafeInteger(p3.lastAnimalRecoveryDay) ||
                Number.isSafeInteger(p3.lastAdvancedDay) && p3.lastAnimalRecoveryDay > p3.lastAdvancedDay))
                add("conflict", "P3_RECOVERY_FACT_CONFLICT");
        }
        const eventFor = id => {
            const event = events.get(id);
            if (!event || !Array.isArray(event.impacts)) add("missing_facts", "NATURE_EVENT_FACT_MISSING");
            return event && Array.isArray(event.impacts) ? event : null;
        };
        const weather = farm.lingyeWeatherUpgrade;
        if (weather != null) {
            if (!record(weather) || !Number.isSafeInteger(weather.activationDay) || !record(weather.terrain))
                add("missing_facts", "WEATHER_ACTIVATION_FACT_MISSING");
            const checkWeatherDay = (state, missingCode) => {
                if (!record(state) || !Number.isSafeInteger(state.lastDay)) { add("missing_facts", missingCode); return; }
                if (Number.isSafeInteger(weather.activationDay) && Number.isSafeInteger(worldDay) &&
                    worldDay >= weather.activationDay - 1) {
                    if (state.lastDay < worldDay) add("behind", "WEATHER_DAY_BEHIND");
                    else if (state.lastDay > worldDay) add("conflict", "WEATHER_DAY_AHEAD");
                }
            };
            for (const plot of Array.isArray(farm.plots) ? farm.plots : [])
                checkWeatherDay(plot?.lingyeWeatherUpgrade, "PLOT_WEATHER_FACT_MISSING");
            if (farm.ranch) {
                const facility = farm.ranch.lingyeWeatherUpgrade;
                checkWeatherDay(facility, "RANCH_WEATHER_FACT_MISSING");
                if (record(facility)) for (const field of ["frozenSince", "wetSince", "iceSince"]) {
                    const since = facility[field];
                    if (since === null) continue;
                    if (!Number.isSafeInteger(since) || !Number.isSafeInteger(facility[`${field}At`]))
                        add("missing_facts", "EXPOSURE_TIME_MISSING");
                    else if (beijingDayIndex(facility[`${field}At`]) !== since)
                        add("conflict", "EXPOSURE_TIME_CONFLICT");
                }
            }
        }
        if (farm.ranch?.animals !== undefined && !Array.isArray(farm.ranch.animals)) add("conflict", "ANIMAL_FACTS_CONFLICT");
        for (const animal of Array.isArray(farm.ranch?.animals) ? farm.ranch.animals : []) {
            const health = animal?.lingyeHealth;
            if (!health || health.status === "healthy") continue;
            if (!record(health) || !nonempty(health.sourceId) || !nonempty(health.condition) ||
                !nonempty(health.status) || !Number.isSafeInteger(health.generatedDay) ||
                !Number.isSafeInteger(health.generatedAt)) {
                add("missing_facts", "CASE_FACTS_MISSING");
                continue;
            }
            if (Number.isSafeInteger(p3?.lastAdvancedDay) && health.generatedDay > p3.lastAdvancedDay)
                add("conflict", "CASE_CURSOR_CONFLICT");
            if (health.natureEventId != null || health.natureImpactId != null) {
                if (!nonempty(health.natureEventId) || !nonempty(health.natureImpactId)) {
                    add("missing_facts", "CASE_NATURE_REFERENCE_MISSING");
                    continue;
                }
                const event = eventFor(health.natureEventId);
                if (!event) continue;
                const impact = event.impacts.find(item => item.impactId === health.natureImpactId);
                if (!impact) add("missing_facts", "CASE_IMPACT_FACT_MISSING");
                else if (impact.farmId !== farmId || impact.kind !== `animal_${health.condition}` ||
                    impact.resolutionKind !== "transferred" || impact.resolutionRef !== health.sourceId)
                    add("conflict", "CASE_IMPACT_REFERENCE_CONFLICT");
            }
        }
        const exposure = farm.lingyeWeatherUpgrade?.exposureChecks;
        if (exposure !== undefined && !record(exposure)) add("conflict", "EXPOSURE_FACTS_CONFLICT");
        else for (const [eventId, checks] of Object.entries(exposure ?? {})) {
            if (!record(checks)) { add("conflict", "EXPOSURE_FACTS_CONFLICT"); continue; }
            const event = eventFor(eventId);
            for (const [condition, check] of Object.entries(checks)) {
                if (!record(check) || !Number.isSafeInteger(check.sinceDay) || !Number.isSafeInteger(check.sinceAt) ||
                    !Number.isSafeInteger(check.checkedDay) || typeof check.hit !== "boolean") {
                    add("missing_facts", "EXPOSURE_FACTS_MISSING");
                    continue;
                }
                if (!Object.hasOwn(check, "animalId")) add("missing_facts", "EXPOSURE_FACTS_MISSING");
                if (check.eventId !== eventId || check.farmId !== farmId || check.condition !== condition ||
                    check.checkedDay < check.sinceDay || beijingDayIndex(check.sinceAt) !== check.sinceDay ||
                    Number.isSafeInteger(worldDay) && check.checkedDay > worldDay ||
                    Object.hasOwn(check, "animalId") &&
                        (check.hit && !nonempty(check.animalId) || !check.hit && check.animalId !== null))
                    add("conflict", "EXPOSURE_REFERENCE_CONFLICT");
                if (check.hit && event && !event.impacts.some(impact => impact.farmId === farmId &&
                    impact.kind === `animal_${condition}` && impact.resolutionKind === "transferred"))
                    add("missing_facts", "EXPOSURE_IMPACT_FACT_MISSING");
            }
        }
        return row;
    });
    return { canEnable: reasons.length === 0 && rows.every(row => ["aligned", "not_applicable"].includes(row.status)),
        deferred: false, natureDay, worldDay: Number.isSafeInteger(worldDay) ? worldDay : null, reasons, farms: rows };
}

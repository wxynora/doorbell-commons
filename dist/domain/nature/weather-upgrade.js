// Local candidate only. The caller must supply reviewed rules and authoritative
// daily weather; no new weather probabilities or gameplay defaults live here.
function integer(value, name) {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be an integer`);
    return value;
}

function level(value, capacity, name) {
    integer(value, name);
    integer(capacity, `${name} capacity`);
    if (capacity < 0 || value < 0 || value > capacity)
        throw new RangeError(`${name} is outside its configured capacity`);
    return value;
}

function deltaFor(rule, condition, terrain) {
    if (!rule || !Object.hasOwn(rule.weatherDelta ?? {}, condition))
        throw new Error(`weather_rule_missing:${condition}`);
    let delta = integer(rule.weatherDelta[condition], "weather delta");
    for (const adjustment of rule.terrainAdjustments ?? []) {
        if (!Array.isArray(adjustment.conditions) || !Array.isArray(adjustment.anyFlags))
            throw new TypeError("terrain adjustment requires conditions and anyFlags");
        if (adjustment.conditions.includes(condition) && adjustment.anyFlags.some(flag => terrain[flag] === true))
            delta += integer(adjustment.delta, "terrain delta");
    }
    return delta;
}

/** Append only unpublished dates, passing the actual prior forecast to the generator. */
export function extendWeatherPlan(entries, startDay, throughDay, generate) {
    if (!Array.isArray(entries) || typeof generate !== "function") throw new TypeError("weather plan and generator required");
    integer(startDay, "start day");
    integer(throughDay, "through day");
    const result = entries.map(entry => ({ ...entry })).sort((a, b) => a.dayIndex - b.dayIndex);
    for (let i = 0; i < result.length; i++) {
        integer(result[i].dayIndex, "weather day");
        if (i > 0 && result[i].dayIndex !== result[i - 1].dayIndex + 1)
            throw new Error("weather_plan_not_contiguous");
    }
    let day = result.length ? result[result.length - 1].dayIndex + 1 : startDay;
    while (day <= throughDay) {
        const previous = result.length ? { ...result[result.length - 1] } : null;
        const generated = generate(day, previous);
        if (!generated || generated.dayIndex !== day || typeof generated.condition !== "string" || !generated.condition)
            throw new Error("invalid_generated_weather");
        result.push({ ...generated });
        day++;
    }
    return result;
}

/** Apply one real weather day exactly once. The caller supplies every rule. */
export function advancePlotWeather(previous, weather, terrain, rules) {
    if (!previous || !weather || !terrain || !rules?.snow)
        throw new TypeError("plot state, weather, terrain and reviewed rules are required");
    const day = integer(weather.dayIndex, "weather day");
    const lastDay = integer(previous.lastDay, "last weather day");
    if (typeof weather.condition !== "string" || !weather.condition) throw new TypeError("weather condition required");
    if (day === lastDay) {
        if (previous.lastCondition !== weather.condition) throw new Error("weather_day_conflict");
        return { ...previous };
    }
    if (day !== lastDay + 1) throw new Error("weather_day_not_next");
    const snow = level(previous.snow, rules.snow.capacity, "snow");
    const nextSnow = Math.max(0, Math.min(rules.snow.capacity,
        snow + deltaFor(rules.snow, weather.condition, terrain)));
    if (!rules.moisture) {
        if (rules.snow.meltToMoisture !== undefined) throw new Error("weather_melt_policy_unavailable");
        return { ...previous, lastDay: day, lastCondition: weather.condition, snow: nextSnow };
    }
    const moisture = level(previous.moisture, rules.moisture.capacity, "moisture");
    const weatherDelta = deltaFor(rules.moisture, weather.condition, terrain);
    const melt = rules.snow.meltToMoisture;
    let meltDelta = 0;
    if (melt !== undefined) {
        if (integer(melt?.moisturePerSnow, "melt moisture per snow") < 0 ||
            !["weather_then_melt", "melt_then_weather"].includes(melt?.sequence))
            throw new Error("weather_melt_policy_unavailable");
        meltDelta = Math.max(0, snow - nextSnow) * melt.moisturePerSnow;
        integer(meltDelta, "melt moisture");
    }
    const limitMoisture = value => Math.max(0, Math.min(rules.moisture.capacity, value));
    const nextMoisture = melt?.sequence === "melt_then_weather"
        ? limitMoisture(limitMoisture(moisture + meltDelta) + weatherDelta)
        : limitMoisture(limitMoisture(moisture + weatherDelta) + meltDelta);
    return { ...previous, lastDay: day, lastCondition: weather.condition, moisture: nextMoisture, snow: nextSnow };
}

/** Preserve the strongest existing agronomy effect when snow also has an effect. */
export function combineSnowGrowth(existing, snow, threshold, snowEffect) {
    const ranks = { normal: 0, half: 1, paused: 2 };
    if (!Object.hasOwn(ranks, existing) || !Object.hasOwn(ranks, snowEffect))
        throw new TypeError("invalid growth effect");
    integer(snow, "snow");
    integer(threshold, "snow threshold");
    if (snow < 0 || threshold < 0) throw new RangeError("snow and threshold must not be negative");
    return snow >= threshold && ranks[snowEffect] > ranks[existing] ? snowEffect : existing;
}

/** Compare one authoritative waterline with this household's relative height. */
export function floodedPlotIds(event, waterline, terrain, plots) {
    if (!event || event.type !== "flood" || typeof event.eventId !== "string" || !event.eventId)
        throw new TypeError("authoritative flood event required");
    if (event.phase === "forecast") return [];
    if (!["active", "recovery"].includes(event.phase)) throw new Error("flood_event_not_current");
    if (!waterline || waterline.eventId !== event.eventId || !Number.isFinite(waterline.height) ||
        !terrain || !Number.isFinite(terrain.relativeElevation)) throw new Error("flood_geography_unavailable");
    if (!Array.isArray(plots)) throw new TypeError("farm plots required");
    return waterline.height >= terrain.relativeElevation ? plots.map(plot => plot.id) : [];
}

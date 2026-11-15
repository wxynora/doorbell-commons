import { createHash } from "node:crypto";

const SEASONS = ["spring", "summer", "autumn", "winter"];
function weightMap(raw, conditions, signed = false) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("weather weights required");
    const result = {};
    for (const [condition, value] of Object.entries(raw)) {
        if (!conditions.includes(condition) || !Number.isFinite(value) || (!signed && value < 0))
            throw new Error("weather_weight_invalid");
        result[condition] = value;
    }
    return result;
}

// Only configured seasons use a new policy; the world retains its existing
// generator for every other season.
export function normalizeForecastPolicy(raw, conditions) {
    if (!raw || raw.version !== 1 || !raw.seasonWeights || !Array.isArray(raw.transitions))
        throw new TypeError("weather forecast policy required");
    const seasonWeights = {};
    for (const season of SEASONS) {
        if (raw.seasonWeights[season] === undefined) continue;
        seasonWeights[season] = weightMap(raw.seasonWeights[season], conditions);
        if (Object.values(seasonWeights[season]).reduce((sum, value) => sum + value, 0) <= 0)
            throw new Error("weather_weight_empty");
    }
    if (Object.keys(seasonWeights).length === 0) throw new Error("weather_weight_empty");
    const transitions = raw.transitions.map(rule => {
        if (!Array.isArray(rule?.previous) || !rule.previous.every(value => conditions.includes(value)) ||
            !Array.isArray(rule?.seasons) || !rule.seasons.every(value => SEASONS.includes(value)))
            throw new Error("weather_transition_invalid");
        return { previous: [...rule.previous], seasons: [...rule.seasons], changes: weightMap(rule.changes, conditions, true) };
    });
    return { version: 1, seasonWeights, transitions };
}

export function selectForecastCondition(policy, conditions, seed, day, season, previous) {
    const weights = { ...policy.seasonWeights[season] };
    for (const rule of policy.transitions) {
        if (!rule.seasons.includes(season) || !rule.previous.includes(previous)) continue;
        for (const [condition, change] of Object.entries(rule.changes))
            weights[condition] = (weights[condition] ?? 0) + change;
    }
    let total = 0;
    for (const condition of conditions) {
        const value = weights[condition] ?? 0;
        if (value < 0 || !Number.isFinite(value)) throw new Error("weather_transition_weight_invalid");
        total += value;
    }
    if (!(total > 0)) throw new Error("weather_transition_weight_empty");
    const hash = createHash("sha256").update(`${seed}\u0000weather:${day}`, "utf8").digest();
    let needle = hash.readUInt32BE(0) / 0x1_0000_0000 * total;
    for (const condition of conditions) {
        needle -= weights[condition] ?? 0;
        if (needle < 0) return condition;
    }
    throw new Error("weather_weight_selection_failed");
}

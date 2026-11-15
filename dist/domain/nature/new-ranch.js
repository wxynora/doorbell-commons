import { beijingDayIndex } from "../../nature.js";
import { advanceWinterFacilities } from "./winter-facilities.js";
import { reconcileWinterFarmImpacts } from "./winter-impacts.js";

let activePolicy = null;
export function setNewRanchWeatherPolicy(policy) {
    activePolicy = policy ?? null;
}

// A preimage may be the original object or its already-encoded record map.
export function isNewWeatherRanch(farm, before) {
    if (!farm?.lingyeWeatherUpgrade || !farm.ranch || farm.ranch.lingyeWeatherUpgrade || !before) return false;
    if (before.state !== undefined) return before.state?.ranch == null;
    if (before.records instanceof Map) {
        const ranch = before.records.get("/ranch");
        if (ranch) return ranch.kind === "value" && JSON.parse(ranch.fieldsJson) === null;
        const root = before.records.get("");
        if (!root || root.kind !== "object") throw new Error("new_ranch_before_unavailable");
        return JSON.parse(root.fieldsJson).ranch == null;
    }
    throw new Error("new_ranch_before_unavailable");
}

// Called by the owning write while the target farm and nature fact are still
// part of the same transaction. A temporary read never calls this function.
export function prepareNewRanchWeather({ farm, before, nature, now }) {
    if (!isNewWeatherRanch(farm, before)) return { changed: false, nature };
    if (!Number.isSafeInteger(now) || !activePolicy?.ranch) throw new Error("new_ranch_weather_policy_unavailable");
    const day = beijingDayIndex(now);
    if (nature?.status !== "active" || nature.lastAdvancedDay !== day ||
        day < farm.lingyeWeatherUpgrade.activationDay) throw new Error("new_ranch_weather_day_unavailable");
    const weather = nature.weatherPlan.find(entry => entry.dayIndex === day);
    if (!weather) throw new Error("new_ranch_weather_unavailable");
    const initial = { createdAt: now, lastDay: day - 1, lastCondition: null,
        frozenSince: null, iceSince: null, wetSince: null, lastWettedDay: null, protectedThrough: null };
    farm.ranch.lingyeWeatherUpgrade = advanceWinterFacilities(initial, { ...weather, at: now }, activePolicy.ranch);
    return { changed: true, nature: reconcileWinterFarmImpacts(nature, farm, now) };
}

import { createHash } from "node:crypto";
import { beijingDayIndex, beijingDayStart } from "../../nature.js";

// A factual, time-limited projection over the actual stored weather sequence.
// The policy must be supplied by the caller; no chance or display time is set here.
export function projectFrost(world, now, policy) {
    if (!policy) return null;
    if (!world || typeof world.seed !== "string" || !world.seed || !Number.isSafeInteger(now) ||
        !Array.isArray(policy.seasons) || !Array.isArray(policy.previousConditions) ||
        !Array.isArray(policy.currentConditions) || !Number.isFinite(policy.probability) ||
        policy.probability < 0 || policy.probability > 1 ||
        !Number.isSafeInteger(policy.startMinute) || !Number.isSafeInteger(policy.endMinute) ||
        policy.startMinute < 0 || policy.endMinute > 1440 || policy.startMinute >= policy.endMinute)
        throw new Error("weather_frost_policy_unavailable");
    const day = beijingDayIndex(now);
    const today = world.weatherPlan?.find(entry => entry.dayIndex === day);
    const previous = world.weatherPlan?.find(entry => entry.dayIndex === day - 1);
    const minute = (now - beijingDayStart(day)) / 60_000;
    if (!today || !previous || !policy.seasons.includes(today.season) ||
        !policy.previousConditions.includes(previous.condition) ||
        !policy.currentConditions.includes(today.condition) ||
        minute < policy.startMinute || minute >= policy.endMinute) return null;
    const chance = createHash("sha256").update(`${world.seed}\u0000frost:${day}`, "utf8")
        .digest().readUInt32BE(0) / 0x1_0000_0000;
    if (chance >= policy.probability) return null;
    return { dayIndex: day, startsAt: beijingDayStart(day) + policy.startMinute * 60_000,
        endsAt: beijingDayStart(day) + policy.endMinute * 60_000 };
}

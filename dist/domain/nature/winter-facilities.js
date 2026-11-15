import { createHash } from "node:crypto";
import { beijingDayIndex, beijingDayStart } from "../../nature.js";

const DAY_MS = 86_400_000;

function integer(value, name) {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be an integer`);
    return value;
}
function optionalDay(value, name) {
    if (value !== null) integer(value, name);
}
function includes(values, value, name) {
    if (!Array.isArray(values)) throw new TypeError(`${name} conditions required`);
    return values.includes(value);
}

/** Advance actual water, bedding and ice facts; no product rule is defaulted. */
export function advanceWinterFacilities(previous, weather, rules) {
    if (!previous || !weather || !rules) throw new TypeError("facility state, weather and rules required");
    const day = integer(weather.dayIndex, "weather day");
    const lastDay = integer(previous.lastDay, "last weather day");
    const at = integer(weather.at ?? beijingDayStart(day), "weather effective time");
    if (beijingDayIndex(at) !== day) throw new Error("weather_time_day_conflict");
    if (typeof weather.condition !== "string" || !weather.condition) throw new TypeError("weather condition required");
    if (day === lastDay) {
        if (weather.condition !== previous.lastCondition) throw new Error("weather_day_conflict");
        return { ...previous };
    }
    if (day !== lastDay + 1) throw new Error("weather_day_not_next");
    for (const name of ["frozenSince", "iceSince", "wetSince", "lastWettedDay", "protectedThrough"])
        optionalDay(previous[name], name);
    const freezing = includes(rules.freezeTroughWhen, weather.condition, "trough-freezing");
    const icing = includes(rules.freezeGroundWhen, weather.condition, "ground-icing");
    const wetting = includes(rules.wetBeddingWhen, weather.condition, "bedding-wetting");
    const thawing = includes(rules.thawWhen, weather.condition, "thaw");
    const drying = includes(rules.dryBeddingWhen, weather.condition, "bedding-drying");
    const dryingDays = integer(rules.dryingDays, "drying days");
    if (dryingDays < 1 || (thawing && (freezing || icing)) || (wetting && drying))
        throw new Error("winter_weather_rule_conflict");
    const next = { ...previous, lastDay: day, lastCondition: weather.condition };
    if (next.wetSince !== null && Number.isSafeInteger(next.drySinceAt) &&
        at - next.drySinceAt >= dryingDays * DAY_MS) {
        next.wetSince = null;
        next.wetSinceAt = null;
        next.lastWettedDay = null;
        next.drySinceAt = null;
    }
    if (freezing && (next.protectedThrough === null || day > next.protectedThrough) && next.frozenSince === null) {
        next.frozenSince = day;
        next.frozenSinceAt = at;
    }
    if (icing && next.iceSince === null) {
        next.iceSince = day;
        next.iceSinceAt = at;
    }
    if (wetting) {
        if (next.wetSince === null) {
            next.wetSince = day;
            next.wetSinceAt = at;
        }
        next.lastWettedDay = day;
        next.drySinceAt = null;
    }
    if (thawing) {
        next.frozenSince = null;
        next.frozenSinceAt = null;
        next.iceSince = null;
        next.iceSinceAt = null;
    }
    if (!wetting && next.wetSince !== null) next.drySinceAt = drying ? next.drySinceAt ?? at : null;
    return next;
}

/** Pure care effect; inventory, permissions and durable action receipt belong to the caller. */
export function careWinterFacility(previous, day, action, protectionDays) {
    if (!previous || integer(day, "care day") !== previous.lastDay) throw new Error("winter_care_day_not_current");
    const next = { ...previous };
    if (action === "thaw_trough") { next.frozenSince = null; next.frozenSinceAt = null; }
    else if (action === "clear_ice") { next.iceSince = null; next.iceSinceAt = null; }
    else if (action === "replace_bedding") {
        next.wetSince = null; next.wetSinceAt = null; next.lastWettedDay = null; next.drySinceAt = null;
    }
    else if (action === "protect_trough") {
        if (integer(protectionDays, "protection days") < 1) throw new RangeError("protection days must be positive");
        next.protectedThrough = Math.max(next.protectedThrough ?? day - 1, day + protectionDays - 1);
    }
    else throw new Error("winter_care_unknown");
    return next;
}

function stableUnit(...parts) {
    const hash = createHash("sha256").update(parts.join("\u0000"), "utf8").digest();
    return hash.readUInt32BE(0) / 0x1_0000_0000;
}

/**
 * Return the next eligible event/animal exposure check; the caller persists it
 * and transfers a hit through the existing animal-case authority atomically.
 */
export function nextWinterExposure({ eventId, farmId, facility, day, now, animalIds, hasActiveCase, checked, rules }) {
    if (typeof eventId !== "string" || !eventId || typeof farmId !== "string" || !farmId)
        throw new TypeError("event and farm identities required");
    integer(day, "exposure day");
    integer(now, "exposure time");
    if (beijingDayIndex(now) !== day) throw new Error("exposure_time_day_conflict");
    if (!facility || !Array.isArray(animalIds) || animalIds.some(id => typeof id !== "string" || !id) ||
        typeof hasActiveCase !== "boolean" || !Array.isArray(checked) || !Array.isArray(rules))
        throw new TypeError("exposure facts and rules required");
    if (hasActiveCase || !animalIds.length) return null;
    for (const rule of rules) {
        if (typeof rule.condition !== "string" || !rule.condition ||
            !["frozenSince", "wetSince", "iceSince"].includes(rule.sinceField))
            throw new TypeError("invalid exposure rule");
        const duration = integer(rule.durationDays, "exposure duration");
        if (duration < 1 || !Number.isFinite(rule.probability) || rule.probability < 0 || rule.probability > 1)
            throw new RangeError("invalid exposure probability or duration");
        const since = facility[rule.sinceField];
        optionalDay(since, "exposure since day");
        const sinceAt = facility[`${rule.sinceField}At`];
        if (since === null || !Number.isSafeInteger(sinceAt) || now - sinceAt < duration * DAY_MS ||
            checked.includes(rule.condition)) continue;
        const hit = stableUnit(eventId, farmId, rule.condition, "risk") < rule.probability;
        const index = Math.floor(stableUnit(eventId, farmId, rule.condition, "animal") * animalIds.length);
        const animalId = hit ? animalIds[index] : null;
        return { eventId, farmId, condition: rule.condition, sinceDay: since, sinceAt, checkedDay: day, hit, animalId };
    }
    return null;
}

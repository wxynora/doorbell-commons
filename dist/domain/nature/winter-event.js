import { createHash } from "node:crypto";
import {
    advanceNatureWorld, findNatureEvent, markNatureEventReadyForSettlement, normalizeNatureWorld,
} from "../../nature.js";
import { currentP3Sources } from "../../career/p3-world.js";
import { nextWinterExposure } from "./winter-facilities.js";
import { transferExposureToP3 } from "./p3-exposure-adapter.js";

function eventIdentity(world, activeDay) {
    return createHash("sha256").update(`${world.seed}\u0000disaster:winter:${activeDay}`, "utf8").digest("hex").slice(0, 24);
}

// This policy is required explicitly by the caller; no winter weather, trigger
// duration, probability or model-visible text is configured by default.
export function advanceWinterEvent(raw, day, rules) {
    if (!rules || !Array.isArray(rules.triggerWeather) || !Array.isArray(rules.recoveryWeather) ||
        !Number.isSafeInteger(rules.forecastDays) || rules.forecastDays < 0)
        throw new TypeError("winter event rules required");
    const world = normalizeNatureWorld(raw);
    if (world.status !== "active" || world.lastAdvancedDay !== day) throw new Error("winter_event_day_unavailable");
    const weather = world.weatherPlan.find(entry => entry.dayIndex === day);
    if (!weather) throw new Error("winter_event_weather_unavailable");
    if (!world.winterEvent) {
        const candidate = world.weatherPlan.find(entry => entry.dayIndex >= day &&
            entry.dayIndex <= day + rules.forecastDays && rules.triggerWeather.includes(entry.condition) &&
            !world.settledEvents.some(event => event.eventId === eventIdentity(world, entry.dayIndex)));
        if (candidate) {
            const immediate = candidate.dayIndex === day;
            world.winterEvent = {
                eventId: eventIdentity(world, candidate.dayIndex), type: "winter", region: "public_farm",
                phase: immediate ? "active" : "forecast", triggerDays: [candidate.dayIndex],
                forecastedAtDay: day, activeFromDay: candidate.dayIndex,
                activatedAtDay: immediate ? day : null, recoveryAtDay: null,
                readyForSettlementAtDay: null, impacts: [],
            };
        }
    }
    const event = world.winterEvent;
    if (event?.phase === "active" && rules.recoveryWeather.includes(weather.condition)) {
        event.phase = "recovery";
        event.recoveryAtDay = day;
    } else if (event?.phase === "recovery" && rules.triggerWeather.includes(weather.condition)) {
        event.phase = "active";
        event.recoveryAtDay = null;
        event.readyForSettlementAtDay = null;
    }
    return normalizeNatureWorld(world);
}

// Checks and P3 cases live in the same staged farm as the weather facts; the
// existing Farm writer commits that farm and the world event together.
export function advanceWinterAnimalCases(rawWorld, farms, day, now, exposureRules, { beforeWeather = false } = {}) {
    if (!Array.isArray(exposureRules)) throw new TypeError("winter exposure rules required");
    let world = rawWorld;
    const eventId = world.winterEvent?.eventId;
    if (!eventId || !["active", "recovery"].includes(world.winterEvent.phase)) return { world, farms };
    for (let index = 0; index < farms.length; index++) {
        let farm = farms[index];
        if (!farm.lingyeWeatherUpgrade || !farm.doorbellMcpMigration?.migrationId || !farm.ranch?.lingyeWeatherUpgrade)
            continue;
        if (day < farm.lingyeWeatherUpgrade.activationDay) continue;
        const facilityDay = farm.ranch.lingyeWeatherUpgrade.lastDay;
        if (beforeWeather && (facilityDay === day || day - 1 < farm.lingyeWeatherUpgrade.activationDay)) continue;
        if (facilityDay !== (beforeWeather ? day - 1 : day)) throw new Error("winter_animal_weather_day_unavailable");
        const animalIds = (farm.ranch.animals ?? []).map(animal => animal.kindId);
        if (new Set(animalIds).size !== animalIds.length) throw new Error("winter_animal_identity_not_unique");
        while (true) {
            const checked = Object.keys(farm.lingyeWeatherUpgrade.exposureChecks?.[eventId] ?? {});
            const decision = nextWinterExposure({ eventId, farmId: farm.id,
                facility: farm.ranch.lingyeWeatherUpgrade, day, now, animalIds,
                hasActiveCase: !!currentP3Sources(farm).animal, checked, rules: exposureRules });
            if (!decision) break;
            if (decision.hit) {
                const transferred = transferExposureToP3({ world, farm, decision, newlyRecorded: true, now,
                    findAnimalIndex: (target, id) => target.ranch.animals.findIndex(animal => animal.kindId === id) });
                world = transferred.world;
                farm = transferred.farm;
                farms[index] = farm;
            }
            const events = farm.lingyeWeatherUpgrade.exposureChecks ??= {};
            const checks = events[eventId] ??= {};
            checks[decision.condition] = decision;
        }
    }
    return { world, farms };
}

export function finishWinterEvent(rawWorld, farms, now) {
    const event = rawWorld.winterEvent;
    if (!event || event.phase !== "recovery") return rawWorld;
    // A day transition marks this only after all eligible farms were checked.
    // Single-farm care never scans unrelated households to guess completion.
    if (event.impactTrackingComplete !== true || event.impacts.some(impact => impact.resolvedAtDay == null)) return rawWorld;
    const marked = markNatureEventReadyForSettlement(rawWorld, { eventId: event.eventId, now });
    const finished = advanceNatureWorld(marked, now);
    if (findNatureEvent(finished, event.eventId)?.phase !== "settled")
        throw new Error("winter_event_settlement_incomplete");
    return finished;
}

import { agronomyGrowthEffect, animalObservationsFor } from "../../career/p3-world.js";
import { beijingDayIndex, FORECAST_FUTURE_DAYS } from "../../nature.js";
import { projectFrost } from "./frost.js";

// Internal per-household read over already loaded authoritative facts. Caller
// must authenticate the viewer; this function does not advance or write state.
export function projectWeatherForFarm(farm, world, day, options = {}) {
    if (!farm || !Number.isSafeInteger(day)) throw new TypeError("farm and day required");
    if (options.frost && (!Number.isSafeInteger(options.now) || beijingDayIndex(options.now) !== day))
        throw new Error("weather_frost_projection_day_mismatch");
    const weather = world?.weatherPlan?.find(entry => entry.dayIndex === day) ?? null;
    const enabled = farm.lingyeWeatherUpgrade;
    const winter = world?.winterEvent;
    return {
        status: enabled ? "active" : "inactive",
        weather: weather ? { ...weather } : null,
        forecast: (world?.weatherPlan ?? []).filter(entry => entry.dayIndex > day && entry.dayIndex <= day + FORECAST_FUTURE_DAYS)
            .map(entry => ({ ...entry })),
        winterEvent: winter ? { eventId: winter.eventId, phase: winter.phase,
            activeFromDay: winter.activeFromDay, recoveryAtDay: winter.recoveryAtDay } : null,
        ...(options.frost ? { frost: projectFrost(world, options.now, options.frost) } : {}),
        plots: enabled ? (farm.plots ?? []).map(plot => ({ plotId: plot.id,
            moisture: plot.lingyeWeatherUpgrade?.moisture ?? null,
            snow: plot.lingyeWeatherUpgrade?.snow ?? null,
            growthEffect: agronomyGrowthEffect(plot) })) : [],
        ranch: enabled && farm.ranch?.lingyeWeatherUpgrade ? {
            frozenSince: farm.ranch.lingyeWeatherUpgrade.frozenSince,
            iceSince: farm.ranch.lingyeWeatherUpgrade.iceSince,
            wetSince: farm.ranch.lingyeWeatherUpgrade.wetSince,
            protectedThrough: farm.ranch.lingyeWeatherUpgrade.protectedThrough,
            animals: (farm.ranch.animals ?? []).flatMap((animal, index) => {
                const health = animal.lingyeHealth;
                return health && health.status !== "healthy" ? [{ index, kindId: animal.kindId,
                    status: health.status, observations: animalObservationsFor(health.condition) }] : [];
            }),
        } : null,
    };
}

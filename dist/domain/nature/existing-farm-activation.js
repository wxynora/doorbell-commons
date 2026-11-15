import { beijingDayIndex, enableWeatherGeneration } from "../../nature.js";
import { playerFarms, readNatureWorld, replaceFarmsAndNatureAtomic } from "../../store.js";
import { createApprovedWeatherPolicy } from "./approved-weather-policy.js";
import { resumeSavedWeatherPolicy } from "./resume-weather.js";
import { preflightP3WeatherEnable } from "./p3-enable-preflight.js";
import { initializeFarmWeather } from "./initialize-farm-weather.js";
import { neighborhoodWeatherTerrain } from "./neighborhood.js";
import { advanceWinterEvent } from "./winter-event.js";
import { reconcileWinterFarmsImpacts } from "./winter-impacts.js";

// Explicit release-time operation, never invoked by a page read or daily tick.
// Existing P3 history must already be aligned by its own authority.
export function prepareExistingFarmWeatherActivation({ farms, world, terrainByFarmId, rules, now }) {
    const day = beijingDayIndex(now);
    if (!Number.isSafeInteger(now) || world?.status !== "active" || world.lastAdvancedDay !== day)
        throw new Error("weather_activation_day_unavailable");
    const report = preflightP3WeatherEnable({ farms, world, now });
    if (!report.canEnable) {
        const error = new Error("p3_weather_enable_blocked");
        error.report = report;
        throw error;
    }
    const pending = farms.filter(farm => farm.lingyeWeatherUpgrade == null);
    if (!pending.length) return { replacements: [], nextNatureWorld: world };
    const weather = world.weatherPlan.find(entry => entry.dayIndex === day);
    if (!weather || !rules?.plot?.snow || !rules.ranch || !rules.winterEvent )
        throw new Error("weather_activation_policy_unavailable");
    const configuredWorld = enableWeatherGeneration(world, { ...rules.forecast, now });
    const winterWorld = advanceWinterEvent(configuredWorld, day, rules.winterEvent);
    const replacements = pending.map(source => {
        const terrain = terrainByFarmId === undefined ? neighborhoodWeatherTerrain(source.id) : terrainByFarmId[source.id];
        const farm = structuredClone(source);
        initializeFarmWeather(farm, weather, terrain, rules, now);
        return { id: farm.id, farm };
    });
    const nextNatureWorld = reconcileWinterFarmsImpacts(winterWorld, replacements.map(entry => entry.farm), now);
    if (nextNatureWorld.winterEvent) nextNatureWorld.winterEvent.impactTrackingComplete = true;
    return { replacements, nextNatureWorld };
}

export function activateExistingFarmWeather({ terrainByFarmId, rules, now }) {
    const world = readNatureWorld();
    if (rules === undefined) {
        const firstUnpublishedDay = Math.max(beijingDayIndex(now), world.weatherPlan.at(-1)?.dayIndex ?? 0) + 1;
        rules = resumeSavedWeatherPolicy(world, now) ?? createApprovedWeatherPolicy({ startDay: firstUnpublishedDay });
    }
    const prepared = prepareExistingFarmWeatherActivation({ farms: playerFarms(), world, terrainByFarmId, rules, now });
    if (!prepared.replacements.length) return { activated: 0 };
    replaceFarmsAndNatureAtomic(prepared);
    return { activated: prepared.replacements.length };
}

import { beijingDayIndex } from "../../nature.js";
import { advanceFarmGrowth } from "../field/progression.js";
import { advancePlotWeather, combineSnowGrowth } from "./weather-upgrade.js";
import { advanceWinterFacilities } from "./winter-facilities.js";

// Update a staged farm once, at the moment its weather begins.
export function initializeFarmWeather(farm, weather, terrain, rules, now) {
    const day = beijingDayIndex(now);
    if (weather?.dayIndex !== day) throw new Error("weather_activation_day_unavailable");
    if (!terrain || ["riverside", "sheltered", "windy", "sunny"].some(key => typeof terrain[key] !== "boolean"))
        throw new Error(`weather_activation_terrain_unavailable:${farm.id}`);
    if ((farm.plots ?? []).some(plot => plot.lingyeWeatherUpgrade != null) || farm.ranch?.lingyeWeatherUpgrade != null)
        throw new Error(`weather_activation_partial_state:${farm.id}`);
    advanceFarmGrowth(farm, now);
    farm.lingyeWeatherUpgrade = { activationDay: day, activatedAt: now, terrain: structuredClone(terrain) };
    for (const plot of farm.plots ?? []) {
        const state = advancePlotWeather({ lastDay: day - 1, lastCondition: null, snow: 0,
            growthEffect: "normal", ...(rules.plot.moisture ? { moisture: 0 } : {}) }, weather, terrain, rules.plot);
        state.growthEffect = combineSnowGrowth("normal", state.snow, rules.plot.snow.growthThreshold,
            rules.plot.snow.growthEffect);
        plot.lingyeWeatherUpgrade = state;
    }
    if (farm.ranch) {
        farm.ranch.lingyeWeatherUpgrade = advanceWinterFacilities({ createdAt: now,
            lastDay: day - 1, lastCondition: null, frozenSince: null, iceSince: null,
            wetSince: null, lastWettedDay: null, protectedThrough: null }, { ...weather, at: now }, rules.ranch);
    }
}

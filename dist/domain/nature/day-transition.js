import { advancePlotWeather, combineSnowGrowth } from "./weather-upgrade.js";
import { advanceWinterFacilities } from "./winter-facilities.js";

// Domain state is part of the existing Farm's structured per-object records.
// A farm is eligible only after an explicit, separately approved activation has
// installed its terrain and initial plot/ranch facts. Nothing is backfilled here.
export function advanceWeatherForFarm(farm, weather, rules) {
    const enabled = farm?.lingyeWeatherUpgrade;
    if (enabled == null) return false;
    if (!Number.isSafeInteger(enabled.activationDay) || !enabled.terrain || !rules?.plot?.snow || !rules?.ranch)
        throw new Error("weather_upgrade_configuration_unavailable");
    if (weather.dayIndex < enabled.activationDay) return false;
    const threshold = rules.plot.snow.growthThreshold;
    const snowEffect = rules.plot.snow.growthEffect;
    if (!Number.isSafeInteger(threshold) || !["normal", "half", "paused"].includes(snowEffect))
        throw new Error("weather_upgrade_growth_rule_unavailable");
    for (const plot of farm.plots ?? []) {
        if (!plot.lingyeWeatherUpgrade) throw new Error("weather_upgrade_plot_state_unavailable");
        const next = advancePlotWeather(plot.lingyeWeatherUpgrade, weather, enabled.terrain, rules.plot);
        next.growthEffect = combineSnowGrowth("normal", next.snow, threshold, snowEffect);
        plot.lingyeWeatherUpgrade = next;
    }
    if (farm.ranch) {
        if (!farm.ranch.lingyeWeatherUpgrade) throw new Error("weather_upgrade_ranch_state_unavailable");
        farm.ranch.lingyeWeatherUpgrade = advanceWinterFacilities(farm.ranch.lingyeWeatherUpgrade, weather, rules.ranch);
    }
    return true;
}

// Called only after the existing watering action has selected a real plot.
export function applyRealWaterToSoil(farm, plot, day, rule) {
    const enabled = farm?.lingyeWeatherUpgrade;
    if (enabled == null || rule == null || day < enabled.activationDay) return false;
    if (!plot?.lingyeWeatherUpgrade || plot.lingyeWeatherUpgrade.lastDay !== day)
        throw new Error("weather_upgrade_watering_day_unavailable");
    if (!Number.isSafeInteger(rule?.capacity) || rule.capacity < 0 ||
        !Number.isSafeInteger(rule?.wateringAmount) || rule.wateringAmount < 0)
        throw new Error("weather_upgrade_watering_rule_unavailable");
    const state = plot.lingyeWeatherUpgrade;
    if (!Number.isSafeInteger(state.moisture) || state.moisture < 0 || state.moisture > rule.capacity)
        throw new Error("weather_upgrade_moisture_invalid");
    state.moisture = Math.min(rule.capacity, state.moisture + rule.wateringAmount);
    return true;
}

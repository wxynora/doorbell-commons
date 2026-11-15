import { enableWeatherGeneration } from "../../nature.js";
import { createApprovedWeatherPolicy } from "./approved-weather-policy.js";

// Called once after loading the authority, never by a player read.
export function resumeSavedWeatherPolicy(world, now) {
    if (!world?.weatherGeneration) return undefined;
    const rules = createApprovedWeatherPolicy({ startDay: world.weatherGeneration.startDay });
    // Keep the existing authority's conflict check; never replace a saved policy.
    enableWeatherGeneration(world, { ...rules.forecast, now });
    return rules;
}

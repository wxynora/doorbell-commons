import { normalizeFieldLayout } from "../farm-decoration/field-layout.js";

// Expansion appends to the final field, inheriting its connecting plot's weather.
export function newPlotWeatherState(farm) {
    if (!farm.lingyeWeatherUpgrade) return undefined;
    const field = normalizeFieldLayout(farm.farmDecorations?.layout?.field, farm.plots);
    const sourceId = field?.groups?.at(-1)?.plot_ids.at(-1) ?? farm.plots.at(-1)?.id;
    const state = farm.plots.find(plot => plot.id === sourceId)?.lingyeWeatherUpgrade;
    if (!state) throw new Error("weather_upgrade_plot_state_unavailable");
    const { lastDay, lastCondition, moisture, snow, growthEffect } = state;
    return { lastDay, lastCondition, ...(Object.hasOwn(state, "moisture") ? { moisture } : {}), snow, growthEffect };
}

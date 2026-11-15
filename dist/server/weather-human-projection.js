// Read only the already-loaded target objects. No clock advance or store access.
export function humanPlotWeather(plot) {
    const state = plot?.lingyeWeatherUpgrade;
    return state ? { snow_level: state.snow } : {};
}
export function humanRanchWeather(ranch) {
    const state = ranch?.lingyeWeatherUpgrade;
    return state ? { winter_conditions: {
        trough_frozen: state.frozenSince != null,
        ground_icy: state.iceSince != null,
        bedding_wet: state.wetSince != null,
    } } : {};
}

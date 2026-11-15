// Update a single shared event waterline from the authoritative weather day.
// Numeric levels, fish eligibility and animal exposure are explicit policy.
export function advanceFloodWaterline(world, day, policy) {
    const event = world.currentEvent;
    if (!event || event.type !== "flood" || event.storyId || !["active", "recovery"].includes(event.phase)) return world;
    if (!policy || !Number.isSafeInteger(policy.activationDay) || event.activeFromDay < policy.activationDay) return world;
    if (![policy.initialHeight, policy.minHeight, policy.maxHeight, policy.rise, policy.recession].every(Number.isFinite) ||
        policy.minHeight > policy.initialHeight || policy.initialHeight > policy.maxHeight ||
        policy.rise < 0 || policy.recession < 0 || !Array.isArray(policy.risingWeather) ||
        typeof policy.fishForUnflooded !== "boolean" || typeof policy.animalCasesRequireFloodExposure !== "boolean")
        throw new Error("flood_waterline_policy_unavailable");
    const weather = world.weatherPlan.find(entry => entry.dayIndex === day);
    if (!weather) throw new Error("flood_waterline_weather_unavailable");
    const previous = event.floodWaterline;
    if (previous?.day === day) return world;
    if (previous && previous.day !== day - 1) throw new Error("flood_waterline_day_not_next");
    if (!previous && day !== event.activeFromDay) throw new Error("flood_waterline_start_unavailable");
    const change = policy.risingWeather.includes(weather.condition) ? policy.rise : -policy.recession;
    const height = previous ? Math.max(policy.minHeight, Math.min(policy.maxHeight, previous.height + change))
        : policy.initialHeight;
    event.floodWaterline = { day, height };
    return world;
}

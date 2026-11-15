// Durable source facts only. This module never renders text or sends a Bell.
export function snapshotWinterNoticeState(farm) {
    return { plots: new Map((farm.plots ?? []).map(plot => [plot.id, plot.lingyeWeatherUpgrade?.snow ?? null])),
        frozenSince: farm.ranch?.lingyeWeatherUpgrade?.frozenSince ?? null,
        iceSince: farm.ranch?.lingyeWeatherUpgrade?.iceSince ?? null,
        wetSince: farm.ranch?.lingyeWeatherUpgrade?.wetSince ?? null };
}

function record(farm, eventId, kind, objectId, day, extra = {}) {
    const id = `${eventId}:${kind}:${objectId}:${day}`;
    const state = farm.lingyeWeatherUpgrade;
    const facts = state.noticeFacts ??= {};
    if (!Object.hasOwn(facts, id)) facts[id] = { id, eventId, kind, objectId, day, ...extra };
}

export function recordWinterNoticeFacts(farm, event, day, before, weatherPlan = []) {
    if (!farm.lingyeWeatherUpgrade || day < farm.lingyeWeatherUpgrade.activationDay || !event || event.type !== "winter") return;
    if (event.phase === "forecast" && event.forecastedAtDay === day)
        record(farm, event.eventId, "forecast", "farm", day, { forecastDay: event.activeFromDay,
            condition: weatherPlan.find(entry => entry.dayIndex === event.activeFromDay)?.condition ?? null });
    for (const plot of farm.plots ?? []) {
        const oldSnow = before.plots.get(plot.id);
        const snow = plot.lingyeWeatherUpgrade?.snow;
        if (oldSnow === 0 && snow > 0) record(farm, event.eventId, "snow_started", `plot:${plot.id}`, day);
        if (oldSnow > 0 && snow === 0) record(farm, event.eventId, "snow_melted", `plot:${plot.id}`, day);
    }
    const frozen = farm.ranch?.lingyeWeatherUpgrade?.frozenSince ?? null;
    if (before.frozenSince === null && frozen !== null) record(farm, event.eventId, "trough_frozen", "trough", day);
    if (before.frozenSince !== null && frozen === null) record(farm, event.eventId, "trough_thawed", "trough", day);
    const ice = farm.ranch?.lingyeWeatherUpgrade?.iceSince ?? null;
    if (before.iceSince === null && ice !== null) record(farm, event.eventId, "ground_ice_started", "ground", day);
    if (before.iceSince !== null && ice === null) record(farm, event.eventId, "ground_ice_thawed", "ground", day);
    const wet = farm.ranch?.lingyeWeatherUpgrade?.wetSince ?? null;
    if (before.wetSince === null && wet !== null) record(farm, event.eventId, "bedding_wet_started", "bedding", day);
    if (before.wetSince !== null && wet === null) record(farm, event.eventId, "bedding_dried", "bedding", day);
}

export function recordNeighborSnowFact(farm, eventId, plotId, actorFarmId, day, actorName = null, occurredAt = null) {
    if (actorFarmId !== farm.id) record(farm, eventId, "neighbor_snow_cleared", `plot:${plotId}`, day, { actorFarmId, actorName, occurredAt });
}

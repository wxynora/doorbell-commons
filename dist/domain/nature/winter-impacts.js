import { beijingDayIndex, applyWinterImpactChanges } from "../../nature.js";

export function reconcileWinterFarmImpacts(world, farm, now, resolution) {
    return reconcileWinterFarmsImpacts(world, [farm], now, resolution);
}

export function reconcileWinterFarmsImpacts(world, farms, now, resolution = { kind: "natural" }) {
    const event = world.winterEvent;
    if (!event || !["active", "recovery"].includes(event.phase)) return world;
    const unresolvedByFarm = new Map();
    for (const impact of event.impacts) {
        if (impact.resolvedAtDay != null) continue;
        if (!unresolvedByFarm.has(impact.farmId)) unresolvedByFarm.set(impact.farmId, []);
        unresolvedByFarm.get(impact.farmId).push(impact);
    }
    const day = beijingDayIndex(now);
    const registrations = [];
    const resolutions = [];
    for (const farm of farms) {
        if (!farm.lingyeWeatherUpgrade) continue;
        const impacts = unresolvedByFarm.get(farm.id) ?? [];
        const objects = (farm.plots ?? []).map(plot => ({
            base: `plot:${plot.id}`, kind: "plot_snow", active: (plot.lingyeWeatherUpgrade?.snow ?? 0) > 0,
        }));
        const facility = farm.ranch?.lingyeWeatherUpgrade;
        if (facility) {
            objects.push({ base: "ranch:trough", kind: "ranch_trough_frozen", active: facility.frozenSince !== null },
                { base: "ranch:ground", kind: "ranch_ground_ice", active: facility.iceSince !== null },
                { base: "ranch:bedding", kind: "ranch_bedding_wet", active: facility.wetSince !== null });
        }
        for (const object of objects) {
            const prefix = `${object.base}:`;
            const pending = impacts.filter(impact => impact.kind === object.kind && impact.objectId.startsWith(prefix));
            if (object.active && pending.length === 0) {
                registrations.push({ farmId: farm.id, objectId: `${prefix}${day}`, kind: object.kind, now });
            } else if (!object.active) {
                for (const impact of pending)
                    resolutions.push({ impactId: impact.impactId, resolutionKind: resolution.kind, now,
                        resolutionRef: resolution.ref ?? `winter-natural:${event.eventId}:${impact.impactId}:${day}` });
            }
        }
    }
    return applyWinterImpactChanges(world, event.eventId, registrations, resolutions);
}

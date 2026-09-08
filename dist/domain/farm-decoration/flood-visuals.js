// Read-only presentation. Fish have no gameplay plot binding.
export function floodVisuals(world, farm) {
  const plots = new Set(), fish = [];
  for (const event of [world?.currentEvent, world?.storyEvent]) {
    if (!event || event.type !== 'flood' || !['active', 'recovery'].includes(event.phase)) continue;
    const impacts = event.impacts.filter(i => i.farmId === farm.id && i.resolvedAtDay == null);
    for (const impact of impacts) {
      if (impact.kind === 'plot_flooded' && /^plot:\d+$/.test(impact.objectId)) plots.add(Number(impact.objectId.slice(5)));
    }
    for (const entry of farm.lingyeP4?.events?.[event.eventId]?.floodFish ?? []) {
      if (entry.status === 'pending' && impacts.some(i => i.kind === 'flood_fish' && i.impactId === entry.impactId)) {
        fish.push({ id: entry.impactId, fish_id: entry.fishId, size: entry.size });
      }
    }
  }
  return { plot_ids: [...plots], fish };
}

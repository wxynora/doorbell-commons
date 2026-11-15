import boundPlan from '../../../content/neighborhood-plan.json' with { type: 'json' };
const facts = farm => boundPlan[farm?.id] ?? farm?.lingyeWeatherUpgrade?.terrain?.neighborhood;
export function neighborhoodWeatherTerrain(farmId) {
    return { riverside: boundPlan[farmId]?.region === 'river', sheltered: false, windy: false, sunny: false };
}

// Facts are bound to stable farm IDs during neighborhood assignment, never
// inferred from mutable display names or loaded from a directory per visit.
export function areNearNeighbors(actor, target) {
    if (!actor || !target || actor.id === target.id) return false;
    const a = facts(actor);
    const b = facts(target);
    return typeof a?.planId === 'string' && a.planId === b?.planId &&
        a.neighbors?.includes(target.id) === true && b.neighbors?.includes(actor.id) === true;
}
export function neighborhoodArrival(actor, target) {
    if (!actor || !target || actor.id === target.id) return null;
    const name = target.aiName || target.name;
    if (areNearNeighbors(actor, target)) return `沿着门前的小路，几步就到了${name}家。`;
    const a = facts(actor);
    const b = facts(target);
    if (!a?.planId || a.planId !== b?.planId) return null;
    const route = b.arrivals?.[actor.id];
    if (route === 'river_slope') return `绕过河湾，顺着坡路往上走，终于看到了${name}家的院门。`;
    if (route === 'bridge_river') return `穿过桥，沿河走了一段，到了${name}家。`;
    return null;
}

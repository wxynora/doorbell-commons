import { cloneFarmForMutation } from "../../farm-mutation-scope.js";
import { advance } from "../../engine.js";
import { readFarm, readNatureWorld, replaceFarm, replaceFarmsAtomic, replaceFarmsAndNatureAtomic } from "../../store.js";
import { currentDayIndex } from "../../time.js";
import { reachable } from "../../server/farm/social.js";
import { applyWeatherCare, clearFarmSnow, purchaseWeatherSupply } from "./care.js";
import { reconcileWinterFarmImpacts } from "./winter-impacts.js";
import { finishWinterEvent } from "./winter-event.js";
import { hasSnowShovel, consumeSnowShovel } from "./snow-shovel.js";

function commitWinterCare(farm, requestId, actorFarmId, now, actorFarm = null) {
    const replacements = [{ id: farm.id, farm }];
    if (actorFarm && actorFarm.id !== farm.id) replacements.push({ id: actorFarm.id, farm: actorFarm });
    const commitFarms = () => replacements.length === 1 ? replaceFarm(farm.id, farm) : replaceFarmsAtomic(replacements);
    const world = readNatureWorld();
    if (!world?.winterEvent || !["active", "recovery"].includes(world.winterEvent.phase)) {
        commitFarms();
        return;
    }
    if (world.winterEvent.impactTrackingComplete !== true) throw new Error("winter_impact_tracking_unavailable");
    const reconciled = reconcileWinterFarmImpacts(world, farm, now, {
        kind: actorFarmId === farm.id ? "owner" : "visitor", ref: `winter-care:${requestId}`,
    });
    const settled = finishWinterEvent(reconciled, null, now);
    if (settled === world) commitFarms();
    else replaceFarmsAndNatureAtomic({ replacements, nextNatureWorld: settled });
}

// Internal service for an already-authenticated owner. No transport, tool or
// model-visible description is registered until its contract is approved.
export function executeWeatherCareAction(input, rules, now) {
    if (!input || typeof input.farmId !== "string" || input.farmId !== input.actorFarmId ||
        !Number.isSafeInteger(now)) throw new Error("weather_care_authority_unavailable");
    const live = readFarm(input.farmId);
    if (!live) throw new Error("weather_care_farm_unavailable");
    const staged = cloneFarmForMutation(live);
    let result;
    if (input.operation === "buy") result = purchaseWeatherSupply(staged, input, rules?.catalog, now);
    else if (input.operation === "care") result = applyWeatherCare(staged, input, rules, currentDayIndex(now));
    else throw new Error("weather_care_operation_unavailable");
    if (result.ok && !result.replayed) {
        if (input.operation === "care") commitWinterCare(staged, input.requestId, input.actorFarmId, now);
        else replaceFarm(input.farmId, staged);
    }
    return result;
}

// The caller supplies the current trusted visit permission, never a client flag.
export function executeSnowClearing(input, rules, now, authorizeNeighbor) {
    if (!input || typeof input.farmId !== "string" || typeof input.actorFarmId !== "string" ||
        !Number.isSafeInteger(now)) throw new Error("weather_snow_identity_unavailable");
    const owner = readFarm(input.farmId);
    const actor = readFarm(input.actorFarmId);
    if (!owner || !actor) throw new Error("weather_snow_authority_unavailable");
    if (actor.id !== owner.id && (!reachable(actor) || !reachable(owner) ||
        typeof authorizeNeighbor !== "function" || authorizeNeighbor(actor, owner, input, now) !== true))
        throw new Error("weather_snow_authority_unavailable");
    const staged = cloneFarmForMutation(owner);
    if (staged.lingyeWeatherUpgrade?.careReceipts?.[input.requestId])
        return clearFarmSnow(staged, input, rules?.plot?.snow, currentDayIndex(now));
    const day = currentDayIndex(now);
    if (actor.id !== owner.id && owner.snowVisits?.[actor.id] === day)
        return { ok: false, reason: "daily_snow_help_limit", replayed: false };
    if (!hasSnowShovel(actor)) return { ok: false, reason: "snow_shovel_unavailable", replayed: false };
    const winter = readNatureWorld()?.winterEvent;
    if (!winter || winter.eventId !== input.eventId || !["active", "recovery"].includes(winter.phase))
        throw new Error("weather_snow_event_unavailable");
    // The old effect remains in force through the instant of clearing.
    advance(staged, now);
    const stagedActor = actor.id === owner.id ? staged : cloneFarmForMutation(actor);
    const spent = consumeSnowShovel(stagedActor);
    const snowShovel = { remaining: spent.remaining, maximum: spent.maximum, broken: spent.broken,
        ...(spent.broken ? { needsPurchase: !hasSnowShovel(stagedActor) } : {}) };
    const result = clearFarmSnow(staged, input, rules?.plot?.snow, day, snowShovel, { name: actor.name, at: now });
    if (result.ok && !result.replayed) {
        if (actor.id !== owner.id) (staged.snowVisits ??= {})[actor.id] = day;
        commitWinterCare(staged, input.requestId, input.actorFarmId, now, stagedActor);
    }
    return result;
}

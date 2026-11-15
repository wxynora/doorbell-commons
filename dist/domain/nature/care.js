import { isDeepStrictEqual } from "node:util";
import { bumpDaily } from "../../daily.js";
import { careWinterFacility } from "./winter-facilities.js";
import { combineSnowGrowth } from "./weather-upgrade.js";
import { recordNeighborSnowFact } from "./notification-facts.js";

function requestIdentity(farm, input, kind) {
    if (!farm?.lingyeWeatherUpgrade || !farm.ranch || typeof input?.requestId !== "string" || !input.requestId ||
        typeof input.actorFarmId !== "string" || input.actorFarmId !== farm.id)
        throw new Error("weather_care_authority_unavailable");
    return { kind, actorFarmId: input.actorFarmId, itemId: input.itemId ?? null,
        quantity: input.quantity ?? null, action: input.action ?? null };
}
function replay(farm, requestId, identity) {
    const stored = farm.lingyeWeatherUpgrade.careReceipts?.[requestId];
    if (!stored) return null;
    if (!isDeepStrictEqual(stored.identity, identity)) throw new Error("weather_care_request_conflict");
    return { ...stored.result, replayed: true };
}
function commitReceipt(farm, requestId, identity, result) {
    const receipts = farm.lingyeWeatherUpgrade.careReceipts ??= {};
    receipts[requestId] = { identity, result: { ...result } };
    return { ...result, replayed: false };
}

/** The caller authenticates the owner and commits the staged Farm atomically. */
export function purchaseWeatherSupply(farm, input, catalog, now) {
    const identity = requestIdentity(farm, input, "buy");
    if (input.currency === "gold") identity.currency = input.currency;
    const prior = replay(farm, input.requestId, identity);
    if (prior) return prior;
    const spec = catalog?.[input.itemId];
    const currency = input.currency ?? spec?.currency;
    if (typeof input.itemId !== "string" || !input.itemId || !Number.isSafeInteger(input.quantity) || input.quantity < 1 ||
        !Number.isSafeInteger(spec?.price) || spec.price < 0 || currency !== "gold" || currency !== spec.currency)
        throw new Error("weather_care_purchase_rule_unavailable");
    const price = spec.price * input.quantity;
    if (!Number.isSafeInteger(price) || !Number.isSafeInteger(farm.coins) || farm.coins < 0)
        throw new Error("weather_care_balance_invalid");
    if (farm.coins < price) return { ok: false, reason: "insufficient_funds", balance: farm.coins, replayed: false };
    const inventory = farm.lingyeWeatherUpgrade.inventory ??= {};
    const current = inventory[input.itemId] ?? 0;
    if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(current + input.quantity))
        throw new Error("weather_care_inventory_invalid");
    farm.coins -= price;
    inventory[input.itemId] = current + input.quantity;
    const purchases = farm.lingyeWeatherUpgrade.supplyPurchases ??= {};
    purchases[input.itemId] = (purchases[input.itemId] ?? 0) + 1;
    bumpDaily(farm, now, "coinSpend", price);
    return commitReceipt(farm, input.requestId, identity,
        { ok: true, itemId: input.itemId, quantity: input.quantity, price, balance: farm.coins });
}

/** Supplies and action effects are explicit policy, never silently defaulted. */
export function applyWeatherCare(farm, input, policy, day) {
    const identity = requestIdentity(farm, input, "care");
    const prior = replay(farm, input.requestId, identity);
    if (prior) return prior;
    const spec = policy?.actions?.[input.action];
    if (!spec || !Object.hasOwn(spec, "itemId") || (spec.itemId !== null &&
        (typeof spec.itemId !== "string" || !spec.itemId))) throw new Error("weather_care_action_rule_unavailable");
    const current = farm.ranch.lingyeWeatherUpgrade;
    const next = careWinterFacility(current, day, input.action, spec.protectionDays);
    if (isDeepStrictEqual(current, next)) return { ok: false, reason: "nothing_to_care", replayed: false };
    const inventory = farm.lingyeWeatherUpgrade.inventory ?? {};
    if (spec.itemId !== null && (!Number.isSafeInteger(inventory[spec.itemId]) || inventory[spec.itemId] < 1))
        return { ok: false, reason: "missing_supply", replayed: false };
    if (spec.itemId !== null) inventory[spec.itemId] -= 1;
    farm.ranch.lingyeWeatherUpgrade = next;
    return commitReceipt(farm, input.requestId, identity,
        { ok: true, action: input.action, consumedItemId: spec.itemId,
            ...(input.action === "protect_trough" ? { protectedThrough: next.protectedThrough } : {}) });
}

// Authorization is performed by the caller before this staged mutation.
export function clearFarmSnow(farm, input, snowRule, day, snowShovel, actorNotice = {}) {
    if (!farm?.lingyeWeatherUpgrade || typeof input?.requestId !== "string" || !input.requestId ||
        typeof input.actorFarmId !== "string" || !input.actorFarmId ||
        !Number.isSafeInteger(input.plotId) || typeof input.eventId !== "string" || !input.eventId)
        throw new Error("weather_snow_identity_unavailable");
    const identity = { kind: "clear_snow", actorFarmId: input.actorFarmId, plotId: input.plotId, eventId: input.eventId };
    const prior = replay(farm, input.requestId, identity);
    if (prior) return prior;
    const plot = farm.plots?.find(entry => entry.id === input.plotId);
    const state = plot?.lingyeWeatherUpgrade;
    if (!state || state.lastDay !== day) throw new Error("weather_snow_state_unavailable");
    if (!Number.isSafeInteger(state.snow) || state.snow < 0 ||
        !Number.isSafeInteger(snowRule?.growthThreshold) || !snowRule?.growthEffect)
        throw new Error("weather_snow_rule_unavailable");
    if (state.snow === 0) return { ok: false, reason: "nothing_to_clear", replayed: false };
    const before = state.snow;
    state.snow = 0;
    state.growthEffect = combineSnowGrowth("normal", state.snow, snowRule.growthThreshold, snowRule.growthEffect);
    recordNeighborSnowFact(farm, input.eventId, input.plotId, input.actorFarmId, day, actorNotice.name, actorNotice.at);
    return commitReceipt(farm, input.requestId, identity, { ok: true, plotId: input.plotId, eventId: input.eventId,
        actorFarmId: input.actorFarmId, clearedSnow: before, ...(snowShovel ? { snowShovel } : {}) });
}

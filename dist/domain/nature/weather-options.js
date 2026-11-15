import { readFarm, readNatureWorld } from "../../store.js";
import { beijingDayStart } from "../../nature.js";
import { currentDayIndex } from "../../time.js";
import { reachable } from "../../server/farm/social.js";
import { lookupOptionHandle, optionHandles } from "../../server/doorbell/option-handles.js";
import { executeSnowClearing, executeWeatherCareAction } from "./care-action.js";
import { appendVisitServiceProposalOptions } from "../../career/visit-service-options.js";
import { hasSnowShovel } from "./snow-shovel.js";
import { RANCH_WEATHER_SUPPLIES } from "./approved-weather-policy.js";

const STALE = "当前选项已失效或不适用于这项业务；请重新查看当前事实与 option。";
const NO_SHOVEL = "没有可用的雪铲，请先在商店购买。";
const unavailable = () => ({ status: 400, json: { ok: false, code: "OPTION_NOT_AVAILABLE", text: STALE } });
const noShovel = () => ({ status: 400, json: { ok: false, code: "OPTION_NOT_AVAILABLE", text: NO_SHOVEL } });
const CARE = Object.freeze({
    thaw_trough: { since: "frozenSince", fact: "水槽结冰了。", label: "帮水槽解冻", success: "水槽已解冻。" },
    clear_ice: { since: "iceSince", fact: "活动区覆着薄冰。", label: "清理薄冰", success: "活动区的薄冰已清理。" },
    protect_trough: { since: "protectedThrough", label: "套上防冻套" },
    replace_bedding: { since: "wetSince", fact: "垫料潮湿了。", label: "换上干垫料", success: "已使用1份干垫料，垫料已换干。" },
});
const call = (op, handle) => `doorbell(${JSON.stringify({ op, args: { option: handle } })})`;
const encoded = value => `weather:${JSON.stringify(value)}`;
const version = value => JSON.stringify(value);

// Gold-priced options synchronize only the requesting farm, immediately before purchase.
export function isWeatherOptionAction(action, params) {
    return ["visit", "status"].includes(action) && !!params && Object.hasOwn(params, "option");
}

// Explicitly requesting the ordinary status also requires balance projection.
export function isWeatherOptionRequest(body) {
    return !!body && isWeatherOptionAction(body.action, body.params) && body.include_status !== true &&
        body.params && typeof body.params === "object" && !Array.isArray(body.params) &&
        Object.keys(body.params).length === 1 && typeof body.params.option === "string";
}

function activeWinter() {
    const event = readNatureWorld()?.winterEvent;
    return event && ["active", "recovery"].includes(event.phase) && event.impactTrackingComplete === true ? event : null;
}

function snowFact(farm, plot, event) {
    const state = plot?.lingyeWeatherUpgrade;
    if (!state || !Number.isSafeInteger(state.snow) || state.snow <= 0 || !event) return null;
    return { kind: "snow", farmId: farm.id, plotId: plot.id, eventId: event.eventId,
        lastDay: state.lastDay, snow: state.snow, growthEffect: state.growthEffect };
}

function careFact(farm, action, event) {
    const facility = farm.ranch?.lingyeWeatherUpgrade;
    const definition = CARE[action];
    if (!facility || !definition || (action !== "protect_trough" && facility[definition.since] == null)) return null;
    return { kind: "care", farmId: farm.id, action, eventId: event?.eventId ?? null,
        lastDay: facility.lastDay, since: facility[definition.since] ?? null,
        lastWettedDay: action === "replace_bedding" ? facility.lastWettedDay : null };
}

function careAvailable(farm, rules, action, now) {
    const definition = CARE[action];
    const facility = farm.ranch?.lingyeWeatherUpgrade;
    const spec = rules?.actions?.[action];
    if (action === "protect_trough") return !!facility && facility.lastDay === currentDayIndex(now) &&
        (facility.protectedThrough == null || facility.protectedThrough < currentDayIndex(now)) &&
        spec?.itemId === "trough_cover" && spec.protectionDays === 3 &&
        (farm.lingyeWeatherUpgrade?.inventory?.trough_cover ?? 0) > 0;
    if (!definition || !facility || facility.lastDay !== currentDayIndex(now) ||
        facility[definition.since] == null || !spec || !Object.hasOwn(spec, "itemId")) return false;
    // The approved bedding receipt explicitly describes consuming dry bedding.
    if (action === "replace_bedding" && spec.itemId !== "dry_bedding") return false;
    if (action !== "replace_bedding" && spec.itemId !== null) return false;
    return spec.itemId === null || Number.isSafeInteger(farm.lingyeWeatherUpgrade?.inventory?.[spec.itemId]) &&
        farm.lingyeWeatherUpgrade.inventory[spec.itemId] > 0;
}

function canVisit(actor, target) {
    return !!actor && !!target && actor.id !== target.id && reachable(actor) && reachable(target);
}

function snowRuleAvailable(rules) {
    const snow = rules?.plot?.snow;
    return Number.isSafeInteger(snow?.growthThreshold) && snow.growthThreshold >= 0 &&
        ["normal", "half", "paused"].includes(snow.growthEffect);
}

export function appendVisitWeatherOptions({ database, actor, target, result, rules, now, residentId }) {
    appendVisitServiceProposalOptions({ database, actor, target, result, now, residentId });
    if (!rules || !target?.lingyeWeatherUpgrade || result.json?.ok !== true) return result;
    const plots = (target.plots ?? []).filter(plot => (plot.lingyeWeatherUpgrade?.snow ?? 0) > 0);
    if (!plots.length) return result;
    const lines = [`${target.name}家的田地被厚厚的雪盖住了。`];
    const event = activeWinter();
    if (residentId && canVisit(actor, target) && target.snowVisits?.[actor.id] !== currentDayIndex(now) &&
        event && snowRuleAvailable(rules)) {
        if (!hasSnowShovel(actor)) {
            lines.push(NO_SHOVEL);
        } else {
            const candidates = [];
            for (const plot of plots) {
                const fact = snowFact(target, plot, event);
                if (!fact || fact.lastDay !== currentDayIndex(now)) continue;
                candidates.push({ plotId: plot.id, internal: encoded(fact) });
            }
            const handles = optionHandles(database, residentId, "farm.visit", candidates.map(entry => entry.internal), now);
            candidates.forEach((entry, index) => lines.push(`地块 ${entry.plotId}：帮 TA 铲雪：${handles[index]}　→ ${call("farm.visit", handles[index])}`));
        }
    }
    result.json.text += `\n\n${lines.join("\n")}`;
    return result;
}

export function appendOwnWeatherOptions({ database, farm, result, rules, now, residentId, allowActions = true }) {
    if (!rules || !farm?.lingyeWeatherUpgrade || result.json?.ok !== true)
        return result;
    const event = activeWinter();
    const lines = [];
    const candidates = [];
    const snowyPlots = (farm.plots ?? []).filter(plot => (plot.lingyeWeatherUpgrade?.snow ?? 0) > 0);
    for (const plot of snowyPlots) {
        lines.push(`第${plot.id}块地有积雪。`);
        const fact = snowFact(farm, plot, event);
        if (!allowActions || !residentId || !hasSnowShovel(farm) || !snowRuleAvailable(rules) ||
            !fact || fact.lastDay !== currentDayIndex(now)) continue;
        const placeholder = lines.length;
        lines.push(null);
        candidates.push({ placeholder, label: "铲雪", internal: encoded(fact) });
    }
    if (snowyPlots.length && !hasSnowShovel(farm)) lines.push(NO_SHOVEL);
    for (const [action, definition] of Object.entries(CARE)) {
        if (action !== "protect_trough" && farm.ranch?.lingyeWeatherUpgrade?.[definition.since] == null) continue;
        if (definition.fact) lines.push(definition.fact);
        if (!allowActions || !residentId || !careAvailable(farm, rules, action, now)) continue;
        const fact = careFact(farm, action, event);
        const placeholder = lines.length;
        lines.push(null);
        candidates.push({ placeholder, label: definition.label, internal: encoded(fact) });
    }
    if (farm.ranch && allowActions && residentId && rules.catalog) {
        lines.push("牧场商店");
        const facility = farm.ranch.lingyeWeatherUpgrade;
        const inventory = farm.lingyeWeatherUpgrade.inventory;
        const needsBedding = facility?.wetSince != null && !(inventory?.dry_bedding > 0);
        const needsCover = facility && !(facility.protectedThrough >= currentDayIndex(now)) &&
            !(inventory?.trough_cover > 0) && (facility.frozenSince != null ||
                facility.lastCondition === "cold_snap");
        for (const itemId of Object.keys(RANCH_WEATHER_SUPPLIES)) {
            const spec = rules.catalog[itemId];
            if (!spec) continue;
            if (itemId === "dry_bedding" && needsBedding) lines.push("缺少干垫料，可在牧场商店购买。");
            if (itemId === "trough_cover" && needsCover) lines.push("缺少防冻套，可在牧场商店购买。");
            const placeholder = lines.length;
            lines.push(null);
            candidates.push({ placeholder, label: spec.description,
                internal: encoded({ kind: "supply", farmId: farm.id, itemId, price: spec.price,
                    currency: spec.currency, purchases: farm.lingyeWeatherUpgrade.supplyPurchases?.[itemId] ?? 0 }) });
        }
    }
    const handles = optionHandles(database, residentId, "farm.status", candidates.map(entry => entry.internal), now);
    candidates.forEach((entry, index) => { const handle = handles[index];
        lines[entry.placeholder] = `${entry.label}：${handle}　→ ${call("farm.status", handle)}`;
    });
    if (lines.length) result.json.text += `\n\n${lines.join("\n")}`;
    return result;
}

export function executeWeatherOption({ database, actor, action, params, rules, now, residentId, synchronizeGold }) {
    if (!rules || !database || !actor || Object.keys(params).length !== 1 || typeof params.option !== "string")
        return unavailable();
    const operation = action === "visit" ? "farm.visit" : action === "status" ? "farm.status" : null;
    if (!residentId || !operation) return unavailable();
    const stored = lookupOptionHandle(database, residentId, operation, params.option);
    if (!stored?.startsWith("weather:")) return unavailable();
    let fact;
    try { fact = JSON.parse(stored.slice("weather:".length)); } catch { return unavailable(); }
    if (!fact || typeof fact !== "object" || typeof fact.farmId !== "string") return unavailable();
    const owner = readFarm(fact.farmId);
    if (!owner?.lingyeWeatherUpgrade) return unavailable();
    const prior = owner.lingyeWeatherUpgrade.careReceipts?.[params.option];
    if (fact.kind === "snow") {
        const own = action === "status" && owner.id === actor.id;
        if ((!own && (action !== "visit" || !canVisit(actor, owner))) ||
            !Number.isSafeInteger(fact.plotId) || typeof fact.eventId !== "string")
            return unavailable();
        if (!own && !prior && owner.snowVisits?.[actor.id] === currentDayIndex(now)) {
            const text = `${owner.name}｜✓ 帮 TA 铲雪\n明天再来吧。`;
            return { status: 400, json: { ok: false, code: "OPTION_NOT_AVAILABLE", text } };
        }
        if (!prior) {
            const plot = owner.plots?.find(entry => entry.id === fact.plotId);
            if (!snowRuleAvailable(rules) || version(snowFact(owner, plot, activeWinter())) !== version(fact))
                return unavailable();
            if (!hasSnowShovel(actor)) return noShovel();
        }
        const result = executeSnowClearing({ farmId: owner.id, actorFarmId: actor.id, requestId: params.option,
            eventId: fact.eventId, plotId: fact.plotId }, rules, now, canVisit);
        if (!result.ok) return unavailable();
        const shovel = result.snowShovel;
        const warning = shovel.needsPurchase ? "\n雪铲已损坏，请先购买新的雪铲。" : "";
        const success = own ? `第${result.plotId}块地的雪已清理。` : `✓ 帮 TA 铲雪（${result.plotId} 号地）`;
        return { status: 200, json: { ok: true, text: `${success}\n雪铲剩余耐久：${shovel.remaining}／${shovel.maximum}。${warning}` } };
    }
    if (action === "status" && fact.kind === "supply" && fact.farmId === actor.id) {
        const spec = rules.catalog?.[fact.itemId];
        if (!spec || !Object.hasOwn(RANCH_WEATHER_SUPPLIES, fact.itemId) ||
            spec.price !== fact.price) return unavailable();
        // Completed legacy purchases can return their original receipt; an
        // unused old ranch-coins option cannot start another purchase.
        if (fact.currency !== spec.currency && !(prior && fact.currency === "ranch_coins"))
            return unavailable();
        if (!prior && (owner.lingyeWeatherUpgrade.supplyPurchases?.[fact.itemId] ?? 0) !== fact.purchases)
            return unavailable();
        if (!prior) synchronizeGold?.(residentId, owner.id);
        const result = executeWeatherCareAction({ farmId: owner.id, actorFarmId: actor.id,
            requestId: params.option, operation: "buy", itemId: fact.itemId, currency: fact.currency, quantity: 1 }, rules, now);
        if (!result.ok) return { status: 400, json: { ok: false, code: "INSUFFICIENT_FUNDS",
            text: `金币不足（${spec.name}要 ${spec.price}，现有 ${result.balance}）。` } };
        return { status: 200, json: { ok: true, text: fact.currency === "ranch_coins"
            ? spec.description.replace("金币", "牧场金币") : spec.description } };
    }
    if (action === "status" && fact.kind === "care" && fact.farmId === actor.id && CARE[fact.action]) {
        if (!prior && (!careAvailable(owner, rules, fact.action, now) ||
            version(careFact(owner, fact.action, activeWinter())) !== version(fact))) return unavailable();
        const result = executeWeatherCareAction({ farmId: owner.id, actorFarmId: actor.id, requestId: params.option,
            operation: "care", action: fact.action }, rules, now);
        if (!result.ok) return unavailable();
        return { status: 200, json: { ok: true, text: fact.action === "protect_trough"
            ? `已使用1个防冻套，水槽防冻到${new Date(beijingDayStart(result.protectedThrough) + 8 * 3600000).toISOString().slice(0, 10)}结束。`
            : CARE[fact.action].success } };
    }
    return unavailable();
}

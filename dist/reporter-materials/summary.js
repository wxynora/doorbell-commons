import { readReporterMaterialEvents, reporterMaterialsRecordingStartedAt } from "./store.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

// issueDate names the morning at which the half-open reporting window ends.
export function windowForIssueDate(issueDate) {
    if (typeof issueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(issueDate))
        throw new TypeError("Invalid issue date");
    const endMs = Date.parse(`${issueDate}T05:00:00+08:00`);
    if (!Number.isFinite(endMs) || new Date(endMs + BEIJING_OFFSET_MS).toISOString().slice(0, 10) !== issueDate)
        throw new TypeError("Invalid issue date");
    return { startMs: endMs - DAY_MS, endMs, timeZone: "Asia/Shanghai" };
}

function context(database, issueDate) {
    return { window: windowForIssueDate(issueDate), recordingStartedAt: reporterMaterialsRecordingStartedAt(database) };
}

export function collectGlimmerFeedings(database, issueDate, now = Date.now()) {
    const result = { ...context(database, issueDate), variants: [] };
    const groups = new Map();
    for (const event of readReporterMaterialEvents(database, "feeding", result.window.startMs, result.window.endMs, now)) {
        let group = groups.get(event.variantId);
        if (!group) {
            group = { variantId: event.variantId, variantName: event.variantName, baseKindId: event.baseKindId,
                variantType: event.variantType, feedingCount: 0, dishes: [], didNotFollowCount: 0, successes: [] };
            groups.set(event.variantId, group);
            result.variants.push(group);
        }
        group.feedingCount++;
        let dish = group.dishes.find((item) => item.recipeId === event.dishRecipeId);
        if (!dish) {
            dish = { recipeId: event.dishRecipeId, name: event.dishName, quantity: 0 };
            group.dishes.push(dish);
        }
        dish.quantity++;
        if (!event.success) group.didNotFollowCount++;
        else group.successes.push({ farmId: event.farmId, residentId: event.residentId, farmName: event.farmName ?? null,
            at: event.at, attemptInBaseKindPityCycle: event.pityBefore + 1, guaranteed: event.guaranteed,
            pityScope: "base_kind" });
    }
    return result;
}

export function collectNpcSettlements(database, issueDate, now = Date.now()) {
    const result = { ...context(database, issueDate), farms: [] };
    const farms = new Map();
    for (const event of readReporterMaterialEvents(database, "npc", result.window.startMs, result.window.endMs, now)) {
        let farm = farms.get(event.farmId);
        if (!farm) {
            farm = { farmId: event.farmId, farmName: event.farmName ?? null, events: [], groups: new Map() };
            farms.set(event.farmId, farm);
        }
        farm.farmName = event.farmName ?? null;
        const key = JSON.stringify([event.entryId, event.option ?? null, event.outcomeIndex ?? null]);
        let group = farm.groups.get(key);
        if (!group) {
            group = { entryId: event.entryId, npcName: event.npcName, eventName: event.eventName,
                option: event.option ?? null, optionLabel: event.optionLabel ?? null, outcomeIndex: event.outcomeIndex ?? null,
                count: 0, resultVariants: [], effects: [], unknownEffects: [] };
            farm.groups.set(key, group);
            farm.events.push(group);
        }
        group.count++;
        let variant = group.resultVariants.find((item) => item.text === event.resultText);
        if (!variant) group.resultVariants.push(variant = { text: event.resultText, count: 0 });
        variant.count++;
        for (const effect of event.effects) {
            let total = group.effects.find((item) => item.kind === effect.kind && item.id === effect.id && item.direction === effect.direction);
            if (!total) group.effects.push(total = { ...effect, quantity: 0 });
            total.quantity += effect.quantity;
        }
        for (const unknown of event.unknownEffects) {
            if (!group.unknownEffects.includes(unknown)) group.unknownEffects.push(unknown);
        }
    }
    result.farms = [...farms.values()].map(({ groups, ...farm }) => farm);
    return result;
}

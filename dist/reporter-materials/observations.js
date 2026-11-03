import { randomUUID } from "node:crypto";

// This buffer is consumed from a staged farm by the existing world transaction.
export const PENDING_REPORTER_MATERIALS = "reporterMaterialsPending";

export const SUPPORTED_NPC_REWARDS = Object.freeze([
    "none", "coins", "silver", "item", "bait", "ingredient", "dish", "egg", "favorite",
]);
export const SUPPORTED_NPC_COSTS = Object.freeze(["coins", "silver"]);

function inventory(items, idField) {
    const counts = {};
    for (const item of items ?? []) {
        const id = item?.[idField];
        if (typeof id !== "string" || !id) continue;
        const entry = counts[id] ??= { quantity: 0, name: item.name ?? null };
        entry.quantity++;
    }
    return counts;
}

function numbers(object) {
    return Object.fromEntries(Object.entries(object ?? {}).map(([id, quantity]) => [id, {
        quantity: typeof quantity === "number" ? quantity : 0,
        name: null,
    }]));
}

function snapshot(farm) {
    const kitchen = farm.ranch?.kitchen;
    return {
        coins: farm.coins ?? 0,
        silver: farm.silver ?? 0,
        item: numbers(farm.items),
        bait: numbers(farm.fishing?.baitInventory),
        ingredient: numbers(kitchen?.ingredients),
        dish: inventory(kitchen?.dishes, "recipeId"),
        product: inventory(kitchen?.products, "itemId"),
        favorite: Object.fromEntries((farm.glimmer?.favoriteSeen ?? []).map((id) => [id, { quantity: 1, name: null }])),
    };
}

function collectChanges(before, after, labels) {
    const effects = [];
    for (const kind of ["coins", "silver"]) {
        const delta = after[kind] - before[kind];
        if (delta) effects.push({ kind, id: null, name: null, direction: delta > 0 ? "gain" : "loss", quantity: Math.abs(delta) });
    }
    for (const kind of ["item", "bait", "ingredient", "dish", "product", "favorite"]) {
        for (const id of new Set([...Object.keys(before[kind]), ...Object.keys(after[kind])])) {
            const oldValue = before[kind][id];
            const newValue = after[kind][id];
            const delta = (newValue?.quantity ?? 0) - (oldValue?.quantity ?? 0);
            if (!delta) continue;
            effects.push({ kind, id, name: newValue?.name ?? oldValue?.name ?? labels?.[kind]?.[id] ?? null,
                direction: delta > 0 ? "gain" : "loss", quantity: Math.abs(delta) });
        }
    }
    return effects;
}

// Capture cost and reward separately so an event which both spends and gains
// the same currency retains the actual gross amounts, not only the net change.
export function observeNpcEffect(farm, phase, definition, operation, labels = {}) {
    const before = snapshot(farm);
    const result = operation();
    const effects = collectChanges(before, snapshot(farm), labels);
    const supported = phase === "cost" ? SUPPORTED_NPC_COSTS : SUPPORTED_NPC_REWARDS;
    const kind = definition?.kind;
    const unknownEffects = kind && !supported.includes(kind) ? [`${phase}:${kind}`] : [];
    return { result, effects, unknownEffects };
}

function stage(farm, event) {
    (farm[PENDING_REPORTER_MATERIALS] ??= []).push({
        id: randomUUID(),
        farmId: farm.id,
        residentId: farm.doorbellMcpMigration?.residentId ?? null,
        farmName: typeof farm.name === "string" ? farm.name : null,
        ...event,
    });
}

export function stageGlimmerFeeding(farm, input) {
    stage(farm, { type: "feeding", ...input });
}

export function stageNpcSettlement(farm, input) {
    stage(farm, { type: "npc", ...input });
}

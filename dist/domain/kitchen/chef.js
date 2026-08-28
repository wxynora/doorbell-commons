import { Rng } from "../../rng.js";
import { ensureKitchen } from "../ranch/state.js";

/**
 * The chef rules which can be applied without a world/account lookup.
 * Qualification itself is deliberately supplied by the caller: the farm
 * domain must not infer a certificate from a farm doorplate or human key.
 */
export const CHEF_LEVEL_RULES = Object.freeze({
    0: Object.freeze({
        materialRefundChance: 0,
        processingFeeDiscount: 0,
    }),
    1: Object.freeze({
        materialRefundChance: 0.05,
        processingFeeDiscount: 0,
    }),
    2: Object.freeze({
        materialRefundChance: 0.10,
        processingFeeDiscount: 0.05,
    }),
    3: Object.freeze({
        materialRefundChance: 0.15,
        processingFeeDiscount: 0.10,
    }),
    4: Object.freeze({
        materialRefundChance: 0.20,
        processingFeeDiscount: 0.15,
    }),
});

/**
 * Method IDs are content IDs.  The physical tool IDs are kept separate from
 * the older Human purchase IDs because persisted farms can contain either.
 */
export const KITCHEN_METHODS = Object.freeze({
    "stir-fry": Object.freeze({ methodId: "stir-fry", toolId: null }),
    "pan-fry": Object.freeze({ methodId: "pan-fry", toolId: null }),
    stew: Object.freeze({ methodId: "stew", toolId: null }),
    steam: Object.freeze({ methodId: "steam", toolId: "steamer" }),
    roast: Object.freeze({ methodId: "roast", toolId: "oven" }),
    "deep-fry": Object.freeze({ methodId: "deep-fry", toolId: "fryer" }),
    dessert: Object.freeze({ methodId: "dessert", toolId: null }),
    drink: Object.freeze({ methodId: "drink", toolId: null }),
});

export const KITCHEN_TOOL_ALIASES = Object.freeze({
    oven: "oven",
    roast: "oven",
    steamer: "steamer",
    steam: "steamer",
    fryer: "fryer",
    "deep-fry": "fryer",
});

const KITCHEN_METHOD_BY_ID = new Map(Object.values(KITCHEN_METHODS)
    .map((method) => [method.methodId, method]));

function idOf(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLevel(level) {
    return Number.isSafeInteger(level) && level >= 1 && level <= 4 ? level : 0;
}

function canonicalToolId(toolId) {
    const id = idOf(toolId);
    return id ? KITCHEN_TOOL_ALIASES[id] ?? null : null;
}

export function chefLevelRule(level) {
    return CHEF_LEVEL_RULES[normalizeLevel(level)];
}

export function chefMaterialRefundChance(level) {
    return chefLevelRule(level).materialRefundChance;
}

export function chefProcessingFeeDiscount(level) {
    return chefLevelRule(level).processingFeeDiscount;
}

/**
 * Apply only the confirmed fee reduction.  The current farm cooking path has
 * no system-gold processing-fee charge, so this helper is intentionally pure
 * and does not alter dish value or invent a debit.
 */
export function chefProcessingFeeAfterDiscount(processingFee, level) {
    if (!Number.isSafeInteger(processingFee) || processingFee < 0)
        return null;
    const discountPercent = Math.round(chefProcessingFeeDiscount(level) * 100);
    return Math.floor(processingFee * (100 - discountPercent) / 100);
}

export function kitchenMethodDefinition(methodId) {
    return KITCHEN_METHOD_BY_ID.get(idOf(methodId)) ?? null;
}

export function kitchenRecipeMethodId(recipe) {
    return idOf(recipe?.method_id ?? recipe?.method?.id ?? recipe?.methodId);
}

export function kitchenRecipeToolId(recipe) {
    if (recipe && Object.hasOwn(recipe, "tool_id")) {
        if (recipe.tool_id === null)
            return null;
        return canonicalToolId(recipe.tool_id);
    }
    if (recipe && Object.hasOwn(recipe, "toolId")) {
        if (recipe.toolId === null)
            return null;
        return canonicalToolId(recipe.toolId);
    }
    return kitchenMethodDefinition(kitchenRecipeMethodId(recipe))?.toolId ?? null;
}

export function kitchenToolIsOwned(kitchen, toolId) {
    const required = canonicalToolId(toolId);
    if (!required || !Array.isArray(kitchen?.ownedTools))
        return false;
    return kitchen.ownedTools.some((ownedTool) => canonicalToolId(ownedTool) === required);
}

export function kitchenMethodToolStatus(kitchen, methodId) {
    const method = kitchenMethodDefinition(methodId);
    if (!method)
        return { ok: false, code: "method_unavailable", methodId: idOf(methodId), toolId: null };
    if (!method.toolId || kitchenToolIsOwned(kitchen, method.toolId))
        return { ok: true, methodId: method.methodId, toolId: method.toolId };
    return { ok: false, code: "tool_required", methodId: method.methodId, toolId: method.toolId };
}

/** One roll per cooking action; a successful action can return at most one item. */
export function applyChefMaterialRefund(farm, selected, qualificationLevel) {
    const chance = chefMaterialRefundChance(qualificationLevel);
    if (chance <= 0 || !Array.isArray(selected))
        return { applied: false, chance, itemId: null };
    const candidates = selected.filter((item) => item?.source === "ingredient"
        && item.refundEligible !== false
        && item.limited !== true
        && item.activity !== true
        && item.sp !== true
        && item.task !== true);
    if (candidates.length === 0)
        return { applied: false, chance, itemId: null };
    const rng = new Rng(Number.isInteger(farm?.rngState) ? farm.rngState : 1);
    const roll = rng.next();
    farm.rngState = rng.state;
    if (roll >= chance)
        return { applied: false, chance, itemId: null };
    const item = candidates[0];
    const kitchen = ensureKitchen(farm);
    kitchen.ingredients[item.id] = (kitchen.ingredients[item.id] ?? 0) + 1;
    return { applied: true, chance, itemId: item.id };
}

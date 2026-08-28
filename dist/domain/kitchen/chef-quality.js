import { readFileSync } from "node:fs";
import { cookingIngredients, cookingProducts, cookingRecipes } from "../../content.js";
import { KITCHEN_METHODS, kitchenMethodDefinition, kitchenRecipeMethodId } from "./chef.js";

export const CHEF_QUALITY_VERSION = "chef-original-v1";

export const CHEF_ANCHOR_SCORE_BY_RARITY = Object.freeze({
    N: 40,
    R: 60,
    SR: 80,
    SSR: 100,
});

export const CHEF_STRUCTURE_SCORES = Object.freeze({
    CONFLICT_OR_MISSING_ESSENTIAL: 0,
    BARELY: 40,
    MISSING_NONESSENTIAL: 70,
    COMPLETE: 100,
});

const CHEF_STRUCTURE_SCORE_VALUES = new Set(Object.values(CHEF_STRUCTURE_SCORES));

function idOf(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compareIds(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalPairKey(left, right) {
    return [left, right].sort(compareIds).join("|");
}

function tableGet(table, key) {
    if (table instanceof Map)
        return table.get(key);
    return table && typeof table === "object" ? table[key] : undefined;
}

function normalizeIngredients(ingredients) {
    if (!Array.isArray(ingredients))
        return null;
    const counts = new Map();
    for (const raw of ingredients) {
        const id = idOf(typeof raw === "string" ? raw : raw?.id);
        const quantity = typeof raw === "string" ? 1 : raw?.quantity;
        if (!id || !Number.isSafeInteger(quantity) || quantity < 1)
            return null;
        counts.set(id, (counts.get(id) ?? 0) + quantity);
    }
    return [...counts.entries()]
        .sort(([left], [right]) => compareIds(left, right))
        .map(([id, quantity]) => ({ id, quantity }));
}

export function normalizeChefIngredients(ingredients) {
    const entries = normalizeIngredients(ingredients);
    if (!entries)
        return null;
    return entries.map((entry) => ({ ...entry }));
}

export function chefOriginalRecipeKey(ingredients, methodId) {
    const method = idOf(methodId);
    const entries = normalizeIngredients(ingredients);
    if (!method || !entries)
        return null;
    return `${method}|${entries.map(({ id, quantity }) => `${id}:${quantity}`).join(",")}`;
}

/**
 * Build only the mechanically provable anchor rows from the fixed recipe
 * catalog.  Same-class inheritance, role tables, and hard conflicts are not
 * invented here; those must arrive in an explicitly versioned content table.
 */
export function buildChefAnchorTables(recipes = cookingRecipes) {
    if (!Array.isArray(recipes))
        return { ok: false, code: "recipe_catalog_unavailable" };
    const pairScores = {};
    const methodScores = {};
    for (const recipe of recipes) {
        const rarity = idOf(recipe?.rarity);
        const anchor = CHEF_ANCHOR_SCORE_BY_RARITY[rarity];
        const methodId = kitchenRecipeMethodId(recipe);
        const entries = normalizeIngredients(recipe?.ingredients);
        const totalQuantity = entries?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
        if (anchor === undefined || !methodId || !kitchenMethodDefinition(methodId)
            || !entries || totalQuantity < 2 || totalQuantity > 5 || entries.length < 2)
            return { ok: false, code: "recipe_anchor_invalid", recipeId: idOf(recipe?.id) };
        const ids = entries.map(({ id }) => id);
        for (let i = 0; i < ids.length; i++) {
            const methodKey = `${ids[i]}|${methodId}`;
            methodScores[methodKey] = Math.max(methodScores[methodKey] ?? 0, anchor);
            for (let j = i + 1; j < ids.length; j++) {
                const pairKey = canonicalPairKey(ids[i], ids[j]);
                pairScores[pairKey] = Math.max(pairScores[pairKey] ?? 0, anchor);
            }
        }
    }
    return {
        ok: true,
        qualityVersion: CHEF_QUALITY_VERSION,
        pairScores: Object.freeze(Object.fromEntries(Object.entries(pairScores).sort(([left], [right]) => compareIds(left, right)))),
        methodScores: Object.freeze(Object.fromEntries(Object.entries(methodScores).sort(([left], [right]) => compareIds(left, right)))),
    };
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function freezeDeep(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}

function requiredCookableIngredientIds() {
    return new Set([
        ...cookingIngredients.map((item) => item?.id),
        ...cookingProducts.filter((item) => item?.cookable === true).map((item) => item?.id),
        "fish:any",
    ].filter((id) => idOf(id)));
}

function validAnchorKeyPair(key, ingredients) {
    if (typeof key !== "string") return false;
    const separator = key.indexOf("|");
    if (separator <= 0 || separator === key.length - 1 || key.indexOf("|", separator + 1) !== -1)
        return false;
    const left = key.slice(0, separator);
    const right = key.slice(separator + 1);
    return left !== right
        && ingredients.has(left)
        && ingredients.has(right)
        && canonicalPairKey(left, right) === key;
}

function validAnchorKeyMethod(key, ingredients) {
    if (typeof key !== "string") return false;
    const separator = key.lastIndexOf("|");
    if (separator <= 0 || separator === key.length - 1)
        return false;
    const ingredientId = key.slice(0, separator);
    const methodId = key.slice(separator + 1);
    return ingredients.has(ingredientId) && Boolean(kitchenMethodDefinition(methodId));
}

function validateStructureScores(scores) {
    return isRecord(scores)
        && scores.conflict_or_missing_essential === CHEF_STRUCTURE_SCORES.CONFLICT_OR_MISSING_ESSENTIAL
        && scores.barely === CHEF_STRUCTURE_SCORES.BARELY
        && scores.missing_nonessential === CHEF_STRUCTURE_SCORES.MISSING_NONESSENTIAL
        && scores.complete === CHEF_STRUCTURE_SCORES.COMPLETE;
}

function validateChefQualityContent(raw, { verifyAnchors = true } = {}) {
    if (!isRecord(raw) || raw.version !== CHEF_QUALITY_VERSION)
        return { ok: false, code: "quality_content_version_unavailable" };
    if (!validateStructureScores(raw.structure_scores))
        return { ok: false, code: "structure_content_unavailable" };

    const requiredIngredients = requiredCookableIngredientIds();
    const ingredients = raw.ingredients;
    if (!isRecord(ingredients))
        return { ok: false, code: "ingredient_content_unavailable" };
    for (const id of requiredIngredients) {
        const item = ingredients[id];
        if (!isRecord(item)
            || typeof item.class !== "string" || item.class.length === 0
            || !Array.isArray(item.roles) || item.roles.length === 0
            || item.roles.some((role) => typeof role !== "string" || role.length === 0)
            || typeof item.culinary_base !== "number"
            || !Number.isFinite(item.culinary_base) || item.culinary_base <= 0)
            return { ok: false, code: "ingredient_content_unavailable", ingredientId: id };
    }

    const methods = raw.methods;
    if (!isRecord(methods))
        return { ok: false, code: "method_content_unavailable" };
    for (const methodId of Object.keys(KITCHEN_METHODS)) {
        const method = methods[methodId];
        if (!isRecord(method) || !Array.isArray(method.required_role_groups)
            || method.required_role_groups.length < 2)
            return { ok: false, code: "method_content_unavailable", methodId };
        let hasEssential = false;
        let hasNonessential = false;
        for (const group of method.required_role_groups) {
            if (!isRecord(group) || typeof group.essential !== "boolean"
                || !Array.isArray(group.roles) || group.roles.length === 0
                || group.roles.some((role) => typeof role !== "string" || role.length === 0))
                return { ok: false, code: "method_content_unavailable", methodId };
            if (group.essential) hasEssential = true;
            else hasNonessential = true;
        }
        if (!hasEssential || !hasNonessential)
            return { ok: false, code: "method_content_unavailable", methodId };
        const roleGroups = method.required_role_groups.map((group) => new Set(group.roles));
        const essentialRoles = new Set(roleGroups
            .filter((_, index) => method.required_role_groups[index].essential)
            .flatMap((roles) => [...roles]));
        const nonessentialRoles = new Set(roleGroups
            .filter((_, index) => !method.required_role_groups[index].essential)
            .flatMap((roles) => [...roles]));
        const coreMethod = ["stir-fry", "pan-fry", "stew", "steam", "roast", "deep-fry"].includes(methodId);
        const roleContractMatches = coreMethod
            ? (["body", "structure"].some((role) => essentialRoles.has(role))
                && ["auxiliary", "flavor", "seasoning"].some((role) => nonessentialRoles.has(role)))
            : methodId === "dessert"
                ? essentialRoles.has("dessert_structure")
                    && ["sweet", "flavor"].some((role) => nonessentialRoles.has(role))
                : methodId === "drink"
                    ? essentialRoles.has("liquid") && nonessentialRoles.has("flavor")
                    : false;
        if (!roleContractMatches)
            return { ok: false, code: "method_content_unavailable", methodId };
    }

    const pairAnchors = raw.pair_anchors;
    const methodAnchors = raw.method_anchors;
    if (!isRecord(pairAnchors) || !isRecord(methodAnchors))
        return { ok: false, code: "anchor_content_unavailable" };
    for (const [key, score] of Object.entries(pairAnchors)) {
        if (!validAnchorKeyPair(key, requiredIngredients) || invalidScore(score))
            return { ok: false, code: "anchor_content_unavailable", key };
    }
    for (const [key, score] of Object.entries(methodAnchors)) {
        if (!validAnchorKeyMethod(key, requiredIngredients) || invalidScore(score))
            return { ok: false, code: "anchor_content_unavailable", key };
    }

    const conflicts = raw.hard_conflicts;
    if (!isRecord(conflicts) || !Array.isArray(conflicts.pairs) || !isRecord(conflicts.method_classes))
        return { ok: false, code: "hard_conflict_content_unavailable" };
    for (const pair of conflicts.pairs) {
        if (typeof pair !== "string" || !validAnchorKeyPair(pair, requiredIngredients))
            return { ok: false, code: "hard_conflict_content_unavailable", pair };
    }
    for (const [methodId, classes] of Object.entries(conflicts.method_classes)) {
        if (!kitchenMethodDefinition(methodId) || !Array.isArray(classes)
            || classes.some((classId) => typeof classId !== "string" || classId.length === 0))
            return { ok: false, code: "hard_conflict_content_unavailable", methodId };
    }

    if (verifyAnchors) {
        const mechanical = buildChefAnchorTables(cookingRecipes);
        if (!mechanical.ok)
            return { ok: false, code: "recipe_anchor_invalid" };
        if (!isRecord(raw.anchor_source)
            || raw.anchor_source.recipe_catalog !== "content/cooking.json"
            || raw.anchor_source.recipe_count !== cookingRecipes.length
            || JSON.stringify(raw.anchor_source.rarity_scores) !== JSON.stringify(CHEF_ANCHOR_SCORE_BY_RARITY))
            return { ok: false, code: "anchor_source_unavailable" };
        for (const [key, score] of Object.entries(mechanical.pairScores)) {
            if (pairAnchors[key] !== score)
                return { ok: false, code: "anchor_mismatch", key, expected: score, actual: pairAnchors[key] };
        }
        for (const [key, score] of Object.entries(mechanical.methodScores)) {
            if (methodAnchors[key] !== score)
                return { ok: false, code: "anchor_mismatch", key, expected: score, actual: methodAnchors[key] };
        }
    }
    return { ok: true, content: raw };
}

function readChefQualityContent() {
    try {
        return JSON.parse(readFileSync(new URL("../../../content/chef-quality-v1.json", import.meta.url), "utf8"));
    }
    catch {
        return null;
    }
}

export function loadChefQualityContent(raw = readChefQualityContent()) {
    const validation = validateChefQualityContent(raw);
    if (!validation.ok)
        return validation;
    return { ok: true, content: freezeDeep(validation.content) };
}

const QUALITY_CONTENT_RESULT = loadChefQualityContent();
export const CHEF_QUALITY_CONTENT = QUALITY_CONTENT_RESULT.ok ? QUALITY_CONTENT_RESULT.content : null;
export const CHEF_QUALITY_CONTENT_ERROR = QUALITY_CONTENT_RESULT.ok ? null : QUALITY_CONTENT_RESULT.code;
export const CHEF_CULINARY_BASES = Object.freeze(Object.fromEntries(
    Object.entries(CHEF_QUALITY_CONTENT?.ingredients ?? {})
        .map(([id, item]) => [id, item.culinary_base]),
));

function resolveChefQualityContent(content) {
    if (!content)
        return { ok: false, code: CHEF_QUALITY_CONTENT_ERROR ?? "quality_content_unavailable" };
    if (content === CHEF_QUALITY_CONTENT)
        return { ok: true, content };
    return validateChefQualityContent(content, { verifyAnchors: false });
}

export function chefStructureScore({ ingredients, methodId, content = CHEF_QUALITY_CONTENT } = {}) {
    const resolved = resolveChefQualityContent(content);
    if (!resolved.ok)
        return resolved;
    const method = idOf(methodId);
    if (!method || !kitchenMethodDefinition(method))
        return { ok: false, code: "method_unavailable" };
    const entries = normalizeIngredients(ingredients);
    const totalQuantity = entries?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
    if (!entries || totalQuantity < 2 || totalQuantity > 5 || entries.length < 2)
        return { ok: false, code: "recipe_shape_invalid" };
    const ingredientRows = entries.map(({ id }) => resolved.content.ingredients[id]);
    if (ingredientRows.some((item) => !item))
        return { ok: false, code: "ingredient_content_unavailable" };
    const groups = resolved.content.methods[method]?.required_role_groups;
    if (!Array.isArray(groups) || groups.length === 0)
        return { ok: false, code: "method_content_unavailable", methodId: method };
    const satisfiedGroups = groups.map((group) => ingredientRows.some((item) =>
        group.roles.some((role) => item.roles.includes(role))));
    const essentialMissing = groups.some((group, index) => group.essential && !satisfiedGroups[index]);
    const optionalMissing = groups.filter((group, index) => !group.essential && !satisfiedGroups[index]).length;
    let structureScore;
    if (essentialMissing)
        structureScore = resolved.content.structure_scores.conflict_or_missing_essential;
    else if (satisfiedGroups.every(Boolean))
        structureScore = resolved.content.structure_scores.complete;
    else if (optionalMissing === 1)
        structureScore = resolved.content.structure_scores.missing_nonessential;
    else
        structureScore = resolved.content.structure_scores.barely;
    return { ok: true, methodId: method, structureScore, satisfiedGroups };
}

export function chefHardConflict({ ingredients, methodId, content = CHEF_QUALITY_CONTENT } = {}) {
    const resolved = resolveChefQualityContent(content);
    if (!resolved.ok)
        return resolved;
    const method = idOf(methodId);
    if (!method || !kitchenMethodDefinition(method))
        return { ok: false, code: "method_unavailable" };
    const entries = normalizeIngredients(ingredients);
    const totalQuantity = entries?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
    if (!entries || totalQuantity < 2 || totalQuantity > 5 || entries.length < 2)
        return { ok: false, code: "recipe_shape_invalid" };
    const ingredientRows = entries.map(({ id }) => resolved.content.ingredients[id]);
    if (ingredientRows.some((item) => !item))
        return { ok: false, code: "ingredient_content_unavailable" };
    const pairConflicts = new Set(resolved.content.hard_conflicts.pairs);
    for (let left = 0; left < entries.length; left++) {
        for (let right = left + 1; right < entries.length; right++) {
            const pair = canonicalPairKey(entries[left].id, entries[right].id);
            if (pairConflicts.has(pair))
                return { ok: true, hardConflict: true, kind: "pair", pair };
        }
    }
    const forbiddenClasses = resolved.content.hard_conflicts.method_classes[method] ?? [];
    for (let index = 0; index < ingredientRows.length; index++) {
        if (forbiddenClasses.includes(ingredientRows[index].class))
            return {
                ok: true,
                hardConflict: true,
                kind: "method_class",
                methodId: method,
                class: ingredientRows[index].class,
                ingredientId: entries[index].id,
            };
    }
    return { ok: true, hardConflict: false };
}

function invalidScore(value) {
    return typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100;
}

/**
 * Evaluate the confirmed B/P/S algorithm.  Pair, method, structure, and
 * conflict facts are inputs from versioned content; missing facts fail closed.
 */
export function evaluateChefOriginalQuality({
    ingredients,
    methodId,
    content = CHEF_QUALITY_CONTENT,
    ingredientBases,
    pairScores,
    methodScores,
    structureScore,
    hardConflict,
    qualityVersion = CHEF_QUALITY_VERSION,
} = {}) {
    const resolvedContent = resolveChefQualityContent(content);
    if (!resolvedContent.ok)
        return resolvedContent;
    content = resolvedContent.content;
    const method = idOf(methodId);
    const methodDefinition = kitchenMethodDefinition(method);
    if (!method || !methodDefinition)
        return { ok: false, code: "method_unavailable" };
    const entries = normalizeIngredients(ingredients);
    const totalQuantity = entries?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
    if (!entries || totalQuantity < 2 || totalQuantity > 5 || entries.length < 2)
        return { ok: false, code: "recipe_shape_invalid" };
    if (entries.some(({ id }) => !Object.hasOwn(content.ingredients, id)))
        return { ok: false, code: "ingredient_content_unavailable" };
    if (structureScore === undefined) {
        const structure = chefStructureScore({ ingredients, methodId: method, content });
        if (!structure.ok)
            return structure;
        structureScore = structure.structureScore;
    }
    if (!Number.isInteger(structureScore) || !CHEF_STRUCTURE_SCORE_VALUES.has(structureScore))
        return { ok: false, code: "structure_score_unavailable" };
    if (hardConflict === undefined) {
        const conflict = chefHardConflict({ ingredients, methodId: method, content });
        if (!conflict.ok)
            return conflict;
        hardConflict = conflict.hardConflict;
    }
    if (typeof hardConflict !== "boolean")
        return { ok: false, code: "hard_conflict_unavailable" };
    if (typeof qualityVersion !== "string" || qualityVersion.length === 0)
        return { ok: false, code: "quality_version_unavailable" };
    if (qualityVersion !== content.version)
        return { ok: false, code: "quality_version_mismatch" };

    const contentIngredientBases = Object.fromEntries(
        Object.entries(content.ingredients).map(([id, item]) => [id, item.culinary_base]),
    );
    const resolvedIngredientBases = ingredientBases ?? contentIngredientBases;
    const resolvedPairScores = pairScores ?? content.pair_anchors;
    const resolvedMethodScores = methodScores ?? content.method_anchors;
    // The approved content table is sparse by design: an otherwise valid
    // ingredient pair or method with no existing recipe anchor contributes
    // zero.  Caller-supplied score tables remain strict so a missing injected
    // fact cannot silently become a quality result.
    const defaultPairScores = pairScores === undefined;
    const defaultMethodScores = methodScores === undefined;

    const baseValues = entries.flatMap(({ id, quantity }) => {
        const value = tableGet(resolvedIngredientBases, id);
        return Array.from({ length: quantity }, () => value);
    });
    if (baseValues.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0))
        return { ok: false, code: "culinary_base_unavailable" };
    const B = baseValues.reduce((product, value) => product * value, 1) ** (1 / baseValues.length);
    if (hardConflict || structureScore === 0) {
        return {
            ok: true,
            odd: true,
            hardConflict,
            rarity: null,
            qualityVersion,
            contentVersion: content.version,
            identity: chefOriginalRecipeKey(ingredients, method),
            B,
            pairScore: null,
            methodScore: null,
            structureScore,
            P: null,
            S: null,
        };
    }

    const pairValues = [];
    for (let left = 0; left < entries.length; left++) {
        for (let right = left + 1; right < entries.length; right++) {
            const value = tableGet(resolvedPairScores, canonicalPairKey(entries[left].id, entries[right].id));
            if (value === undefined && defaultPairScores) {
                pairValues.push(0);
                continue;
            }
            if (invalidScore(value))
                return { ok: false, code: "pair_score_unavailable" };
            pairValues.push(value);
        }
    }
    const methodValues = [];
    for (const { id, quantity } of entries) {
        let value = tableGet(resolvedMethodScores, `${id}|${method}`);
        if (value === undefined) {
            const nested = tableGet(resolvedMethodScores, id);
            value = tableGet(nested, method);
        }
        if (value === undefined && defaultMethodScores)
            value = 0;
        if (invalidScore(value))
            return { ok: false, code: "method_score_unavailable" };
        for (let n = 0; n < quantity; n++) methodValues.push(value);
    }

    const pairScore = pairValues.reduce((sum, value) => sum + value, 0) / pairValues.length;
    const methodScore = methodValues.reduce((sum, value) => sum + value, 0) / methodValues.length;
    const P = Math.round(0.50 * pairScore + 0.30 * methodScore + 0.20 * structureScore);
    const S = B * P;
    const result = {
        ok: true,
        odd: hardConflict || structureScore === 0 || P < 45,
        hardConflict,
        rarity: null,
        qualityVersion,
        contentVersion: content.version,
        identity: chefOriginalRecipeKey(ingredients, method),
        B,
        pairScore,
        methodScore,
        structureScore,
        P,
        S,
    };
    if (result.odd)
        return result;

    let rarity = S < 60 ? "N" : S < 75 ? "R" : S < 90 ? "SR" : "SSR";
    if (P < 60 && rarity !== "N") rarity = "N";
    else if (P < 75 && (rarity === "SR" || rarity === "SSR")) rarity = "R";
    else if (P < 90 && rarity === "SSR") rarity = "SR";
    if (rarity === "SSR" && (P < 90 || B < 1.01)) rarity = "SR";
    return { ...result, odd: false, rarity };
}

export const chefOriginalQuality = evaluateChefOriginalQuality;

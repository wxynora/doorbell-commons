/**
 * The server-only bridge for original Chef recipes.
 *
 * Original recipes live in Commons SQLite.  A farm save only keeps the
 * durable receipt for a successful cooking action; it does not become a
 * second recipe/entitlement database.  `originalRecipes` and access
 * callbacks are therefore deliberately supplied by the server and are not
 * read from a browser request.
 */

export const CHEF_ORIGINAL_COOKING_RECEIPTS_FIELD = "chefOriginalCookingReceipts";
export const CHEF_ORIGINAL_COOKING_RECEIPT_VERSION = 1;
export const CHEF_ORIGINAL_COOKING_RECEIPT_KIND = "chef_original_cooking";

const RECIPE_RARITIES = new Set(["N", "R", "SR", "SSR"]);

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value) {
    return typeof value === "string" && value.length > 0 && value.trim() === value
        ? value
        : null;
}

function positiveInteger(value) {
    return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function recipeIdOf(recipe) {
    return identifier(recipe?.recipeId ?? recipe?.recipe_id ?? recipe?.id);
}

function authorResidentIdOf(recipe) {
    return identifier(
        recipe?.authorResidentId ?? recipe?.author_resident_id ?? recipe?.authorId ??
        recipe?.ownerResidentId ?? recipe?.residentId ?? recipe?.resident_id,
    );
}

function methodIdOf(recipe) {
    return identifier(recipe?.methodId ?? recipe?.method_id ?? recipe?.method?.id);
}

function normalizeIngredients(raw) {
    if (!Array.isArray(raw) || raw.length < 2)
        return null;
    const counts = new Map();
    for (const entry of raw) {
        const id = typeof entry === "string"
            ? identifier(entry)
            : identifier(entry?.id ?? entry?.ingredientId ?? entry?.ingredient_id);
        const quantity = typeof entry === "string" ? 1 : positiveInteger(entry?.quantity ?? entry?.qty ?? 1);
        if (!id || !quantity)
            return null;
        counts.set(id, (counts.get(id) ?? 0) + quantity);
    }
    if (counts.size < 2)
        return null;
    const ingredients = [...counts]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([id, quantity]) => ({ id, quantity }));
    const total = ingredients.reduce((sum, entry) => sum + entry.quantity, 0);
    return total >= 2 && total <= 5 ? ingredients : null;
}

/** Return a deterministic multiset key for a recipe or selected item ids. */
export function chefOriginalIngredientKey(raw) {
    const ingredients = normalizeIngredients(raw);
    if (!ingredients)
        return null;
    return ingredients.map(({ id, quantity }) => `${id}:${quantity}`).join(",");
}

export function normalizeOriginalRecipe(raw) {
    if (!isRecord(raw))
        return null;
    const recipeId = recipeIdOf(raw);
    const authorResidentId = authorResidentIdOf(raw);
    const methodId = methodIdOf(raw);
    const name = identifier(raw.name ?? raw.recipeName ?? raw.recipe_name);
    const rarity = identifier(raw.rarity);
    const ingredients = normalizeIngredients(raw.ingredients ?? raw.items);
    if (!recipeId || !authorResidentId || !methodId || !name || !rarity || !RECIPE_RARITIES.has(rarity) || !ingredients)
        return null;
    return {
        recipeId,
        id: recipeId,
        name,
        authorResidentId,
        methodId,
        method_id: methodId,
        rarity,
        ingredients,
        identityKey: identifier(raw.identityKey ?? raw.identity_key) ?? `${methodId}|${chefOriginalIngredientKey(ingredients)}`,
        ...(raw.recipeVersion === undefined && raw.recipe_version === undefined
            ? {}
            : { recipeVersion: raw.recipeVersion ?? raw.recipe_version }),
        ...(raw.qualityVersion === undefined && raw.quality_version === undefined
            ? {}
            : { qualityVersion: raw.qualityVersion ?? raw.quality_version }),
    };
}

export function normalizeOriginalRecipes(rawRecipes) {
    if (!Array.isArray(rawRecipes))
        return [];
    const seen = new Set();
    const result = [];
    for (const raw of rawRecipes) {
        const recipe = normalizeOriginalRecipe(raw);
        if (!recipe || seen.has(recipe.recipeId))
            continue;
        seen.add(recipe.recipeId);
        result.push(recipe);
    }
    return result;
}

export function findOriginalRecipe(rawRecipes, selector) {
    const key = identifier(String(selector ?? "").trim());
    if (!key)
        return null;
    return normalizeOriginalRecipes(rawRecipes).find((recipe) => recipe.recipeId === key || recipe.name === key) ?? null;
}

export function originalRecipeMatchesIngredients(recipe, itemIds, methodId = null) {
    const normalized = normalizeOriginalRecipe(recipe);
    if (!normalized || !Array.isArray(itemIds))
        return false;
    const selected = itemIds.map((id) => identifier(id)).filter(Boolean);
    if (selected.length !== itemIds.length)
        return false;
    const selectedKey = chefOriginalIngredientKey(selected);
    if (selectedKey !== chefOriginalIngredientKey(normalized.ingredients))
        return false;
    return !methodId || normalized.methodId === methodId;
}

function accessibleRecipeIds(options) {
    const ids = options?.accessibleOriginalRecipeIds;
    if (ids instanceof Set)
        return ids;
    if (Array.isArray(ids))
        return new Set(ids.filter((id) => identifier(id)));
    return null;
}

/**
 * Access is an authorization fact supplied by the server.  A candidate list
 * alone is not an entitlement: direct original-recipe cooking only succeeds
 * when the server callback or resident-scoped id set says so.  Authors are
 * entitled to their own recipe without a purchase row.
 */
export function canUseOriginalRecipe(recipe, options = {}) {
    const normalized = normalizeOriginalRecipe(recipe);
    if (!normalized)
        return false;
    const residentId = identifier(options.cookResidentId);
    if (residentId && normalized.authorResidentId === residentId)
        return true;
    if (typeof options.canUseOriginalRecipe === "function") {
        try {
            return options.canUseOriginalRecipe(normalized.recipeId) === true;
        }
        catch {
            return false;
        }
    }
    return accessibleRecipeIds(options)?.has(normalized.recipeId) === true;
}

function receiptLedger(farm) {
    const value = farm?.[CHEF_ORIGINAL_COOKING_RECEIPTS_FIELD];
    if (value === undefined)
        return {};
    return isRecord(value) ? value : null;
}

function sameReceiptRequest(receipt, { methodId, ingredientKey, requestFingerprint }) {
    if (!isRecord(receipt))
        return false;
    if (receipt.methodId !== methodId || receipt.ingredientKey !== ingredientKey)
        return false;
    return requestFingerprint === undefined || receipt.requestFingerprint === requestFingerprint;
}

/** Read a farm-persisted receipt without exposing any farm credentials. */
export function resolveChefOriginalCookingReceipt(farm, receiptId) {
    const id = identifier(receiptId);
    if (!id)
        return null;
    const ledger = receiptLedger(farm);
    if (!ledger)
        return null;
    const receipt = ledger[id];
    return isRecord(receipt) && receipt.kind === CHEF_ORIGINAL_COOKING_RECEIPT_KIND
        ? structuredClone(receipt)
        : null;
}

export function listChefOriginalCookingReceipts(farm) {
    const ledger = receiptLedger(farm);
    if (!ledger)
        return [];
    return Object.values(ledger)
        .filter((receipt) => isRecord(receipt) && receipt.kind === CHEF_ORIGINAL_COOKING_RECEIPT_KIND)
        .map((receipt) => structuredClone(receipt));
}

/**
 * Build and persist the farm-side half of a successful original cook.  The
 * caller must save the containing farm through its normal replaceFarm
 * authority.  This function never calls Commons or pays a resident.
 */
export function persistChefOriginalCookingReceipt(farm, recipe, dish, options = {}, now = Date.now()) {
    const normalized = normalizeOriginalRecipe(recipe);
    if (!normalized || !isRecord(dish) || !identifier(dish.id) || !Number.isSafeInteger(now) || now < 0)
        return null;
    const receiptId = identifier(options.cookingReceiptId) ?? `chef-cooking:${dish.id}`;
    const cookResidentId = identifier(options.cookResidentId);
    // Original recipe settlement is resident-scoped.  A farm-side receipt
    // without the server-injected resident would be impossible to reconcile
    // safely with Commons entitlement and author commission records.
    if (!cookResidentId)
        return null;
    const methodId = normalized.methodId;
    const ingredientKey = chefOriginalIngredientKey(normalized.ingredients);
    const receipt = {
        version: CHEF_ORIGINAL_COOKING_RECEIPT_VERSION,
        kind: CHEF_ORIGINAL_COOKING_RECEIPT_KIND,
        receiptId,
        cookingReceiptId: receiptId,
        success: true,
        original: true,
        recipeId: normalized.recipeId,
        authorResidentId: normalized.authorResidentId,
        rarity: normalized.rarity,
        cookResidentId,
        residentId: cookResidentId,
        methodId,
        ingredientKey,
        requestFingerprint: options.cookingRequestFingerprint ?? null,
        dishId: dish.id,
        dish: structuredClone(dish),
        createdAt: now,
        originalRecipe: structuredClone(normalized),
    };
    const ledger = receiptLedger(farm);
    if (!ledger)
        return null;
    const existing = ledger[receiptId];
    if (existing) {
        if (!sameReceiptRequest(existing, { methodId, ingredientKey, requestFingerprint: options.cookingRequestFingerprint }))
            return null;
        return structuredClone(existing);
    }
    farm[CHEF_ORIGINAL_COOKING_RECEIPTS_FIELD] = {
        ...ledger,
        [receiptId]: receipt,
    };
    return structuredClone(receipt);
}

export function replayChefOriginalCookingResult(receipt) {
    if (!isRecord(receipt) || receipt.kind !== CHEF_ORIGINAL_COOKING_RECEIPT_KIND || !isRecord(receipt.dish))
        return null;
    const recipe = normalizeOriginalRecipe(receipt.originalRecipe);
    if (!recipe)
        return null;
    return {
        ok: true,
        alreadyCooked: true,
        dish: structuredClone(receipt.dish),
        recipe,
        originalRecipe: recipe,
        discovered: false,
        odd: false,
        ingredients: recipe.ingredients.map(({ id }) => id),
        baseValue: null,
        materialRefund: { applied: false, chance: null, itemId: null },
        qixi: null,
        cookingReceipt: structuredClone(receipt),
    };
}

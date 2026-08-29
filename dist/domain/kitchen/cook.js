import { randomUUID } from "node:crypto";
import { cooking, cookingRecipeById, cookingRecipes } from "../../content.js";
import { removeFishingCatchIds } from "../../fishing.js";
import { glimmerBuffMultiplier } from "../../glimmer.js";
import { submitQixi2026Dish } from "../../qixi-2026.js";
import { ensureKitchen } from "../ranch/state.js";
import {
    applyChefMaterialRefund,
    kitchenMethodToolStatus,
    kitchenRecipeMethodId,
} from "./chef.js";
import {
    canUseOriginalRecipe,
    chefOriginalIngredientKey,
    findOriginalRecipe,
    normalizeOriginalRecipes,
    originalRecipeMatchesIngredients,
    persistChefOriginalCookingReceipt,
    replayChefOriginalCookingResult,
    resolveChefOriginalCookingReceipt,
} from "./original.js";
import { COOKING_PRICE_VERSION } from "./pricing.js";
import { selectCookingItems } from "./selection.js";

export const cookingKey = (ids) => [...ids].sort().join("|");

function originalIngredientRefs(recipe) {
    return Array.isArray(recipe?.ingredients)
        ? recipe.ingredients.flatMap((entry) => {
            const id = typeof entry === "string" ? entry : entry?.id;
            const quantity = typeof entry === "string" ? 1 : entry?.quantity ?? 1;
            return typeof id === "string" && Number.isSafeInteger(quantity) && quantity >= 1
                ? Array.from({ length: quantity }, () => id)
                : [];
        })
        : [];
}

function originalRecipeForId(rawRecipes, recipeId) {
    const id = typeof recipeId === "string" && recipeId.trim() ? recipeId.trim() : null;
    if (!id)
        return null;
    return normalizeOriginalRecipes(rawRecipes).find((recipe) => recipe.recipeId === id) ?? null;
}

function originalReceiptReplay(farm, options) {
    const receiptId = typeof options?.cookingReceiptId === "string" && options.cookingReceiptId.trim()
        ? options.cookingReceiptId.trim()
        : null;
    if (!receiptId)
        return null;
    const receipt = resolveChefOriginalCookingReceipt(farm, receiptId);
    if (!receipt)
        return null;
    const replay = replayChefOriginalCookingResult(receipt);
    if (!replay)
        return { ok: false, code: "original_cooking_receipt_unavailable" };
    const expectedFingerprint = options.cookingRequestFingerprint;
    if (expectedFingerprint !== undefined && receipt.requestFingerprint !== expectedFingerprint)
        return { ok: false, code: "cooking_receipt_conflict" };
    return replay;
}

function originalReceiptCanBePersisted(farm, recipe, options, now) {
    try {
        const preview = structuredClone(farm);
        const previewDish = { id: "chef-receipt-preview" };
        return persistChefOriginalCookingReceipt(preview, recipe, previewDish, options, now) !== null;
    }
    catch {
        return false;
    }
}

export function kitchenCook(farm, refs, now, options = {}) {
    const cookOptions = typeof options === "string" ? { methodId: options } : (options ?? {});
    const replay = originalReceiptReplay(farm, cookOptions);
    if (replay)
        return replay;
    // Selection also initializes the fishing state.  Resolve it on an
    // isolated copy so an original-recipe request that is going to fail its
    // server-resident receipt check cannot change the live farm before the
    // first durable cooking mutation.
    let selectionFarm;
    try {
        selectionFarm = structuredClone(farm);
    }
    catch {
        return { ok: false, code: "cook_unavailable" };
    }
    const selectionKitchen = ensureKitchen(selectionFarm);
    const methodId = typeof cookOptions.methodId === "string" ? cookOptions.methodId.trim() : null;
    if (cookOptions.requireMethodId === true && !methodId)
        return { ok: false, code: "method_required" };
    if (methodId) {
        const methodStatus = kitchenMethodToolStatus(selectionKitchen, methodId);
        if (!methodStatus.ok)
            return { ok: false, code: methodStatus.code, methodId: methodStatus.methodId, toolId: methodStatus.toolId };
    }
    let picked;
    let matchingRecipes;
    const originalRecipes = normalizeOriginalRecipes(cookOptions.originalRecipes);
    const directOriginalRecipe = originalRecipeForId(originalRecipes, cookOptions.originalRecipeId);
    if (methodId) {
        const preview = selectCookingItems(selectionFarm, refs);
        if (!preview.ok)
            return preview;
        matchingRecipes = cookingRecipes.filter((item) => cookingKey(item.ingredients) === cookingKey(preview.selected.map((entry) => entry.id)));
        matchingRecipes = [
            ...originalRecipes.filter((item) => originalRecipeMatchesIngredients(item, preview.selected.map((entry) => entry.id), methodId)),
            ...matchingRecipes,
        ];
        if (matchingRecipes.length > 0 && !matchingRecipes.some((item) => kitchenRecipeMethodId(item) === methodId))
            return { ok: false, code: "recipe_method_mismatch", methodId };
        picked = preview;
    }
    else {
        picked = selectCookingItems(selectionFarm, refs);
        if (picked.ok) {
            const selectedIds = picked.selected.map((item) => item.id);
            matchingRecipes = [
                ...originalRecipes.filter((item) => originalRecipeMatchesIngredients(item, selectedIds)),
                ...cookingRecipes.filter((item) => cookingKey(item.ingredients) === cookingKey(selectedIds)),
            ];
        }
    }
    if (!picked.ok)
        return picked;
    let recipe = methodId
        ? matchingRecipes.find((item) => kitchenRecipeMethodId(item) === methodId)
        : matchingRecipes[0];
    if (directOriginalRecipe) {
        if (!originalRecipeMatchesIngredients(directOriginalRecipe, picked.selected.map((item) => item.id), methodId))
            return { ok: false, code: "original_recipe_ingredients_mismatch" };
        if (!canUseOriginalRecipe(directOriginalRecipe, cookOptions))
            return { ok: false, code: "chef_original_recipe_not_unlocked", error: "还没有解锁这份原创食谱。" };
        recipe = directOriginalRecipe;
    }
    const isOriginalRecipe = Boolean(recipe && originalRecipeForId(originalRecipes, recipe.recipeId));
    if (isOriginalRecipe && !originalReceiptCanBePersisted(farm, recipe, cookOptions, now))
        return { ok: false, code: "original_cooking_receipt_unavailable" };
    const kitchen = ensureKitchen(farm);
    kitchen.products = kitchen.products.filter((item) => !picked.usedProducts.has(item.id));
    removeFishingCatchIds(farm, picked.usedFish);
    for (const [id, n] of Object.entries(picked.ingredientCounts)) {
        kitchen.ingredients[id] -= n;
        if (kitchen.ingredients[id] <= 0)
            delete kitchen.ingredients[id];
    }
    const materialRefund = applyChefMaterialRefund(farm, picked.selected, cookOptions.chefQualificationLevel);
    const baseValue = picked.selected.reduce((sum, item) => sum + item.value, 0);
    let dish;
    let discovered = false;
    if (recipe) {
        if (isOriginalRecipe) {
            // The canonical entitlement is held in Commons SQLite.  The farm
            // save only carries the receipt, so do not mirror original ids in
            // kitchen.knownRecipes.
            discovered = !canUseOriginalRecipe(recipe, cookOptions);
        }
        else {
            discovered = !kitchen.knownRecipes.includes(recipe.id);
        }
        if (discovered && !isOriginalRecipe)
            kitchen.knownRecipes.push(recipe.id);
        dish = {
            id: randomUUID(), recipeId: recipe.id, name: recipe.name, rarity: recipe.rarity,
            value: Math.round(baseValue * (1 + cooking.processingFeeRate) * cooking.recyclePremium[recipe.rarity] * glimmerBuffMultiplier("dishValue", now)),
            image: `${recipe.id}.webp`, createdAt: now, pricingVersion: COOKING_PRICE_VERSION,
        };
    }
    else {
        dish = { id: randomUUID(), recipeId: "odd_dish", name: "微妙的料理", rarity: "N", value: 1, image: "odd-dish.webp", createdAt: now, pricingVersion: COOKING_PRICE_VERSION };
    }
    kitchen.dishes.push(dish);
    const qixi = submitQixi2026Dish(farm, kitchen, dish, now);
    const cookingReceipt = isOriginalRecipe
        ? persistChefOriginalCookingReceipt(farm, recipe, dish, cookOptions, now)
        : null;
    if (isOriginalRecipe && !cookingReceipt)
        return { ok: false, code: "original_cooking_receipt_unavailable" };
    return {
        ok: true,
        dish,
        recipe,
        itemRefs: picked.selected.map((item) => item.instanceId ?? item.id),
        discovered,
        odd: !recipe,
        ingredients: picked.selected.map((item) => item.name),
        baseValue,
        materialRefund,
        qixi,
        ...(cookingReceipt ? { cookingReceipt, originalRecipe: recipe } : {}),
    };
}

/** 已解锁食谱可按名称或 id 直接制作；库存取用仍复用普通下锅的真实选择与扣除逻辑。 */
export function kitchenCookKnownRecipe(farm, selector, now, options = {}) {
    const kitchen = ensureKitchen(farm);
    const key = String(selector ?? "").trim();
    const recipe = cookingRecipeById.get(key) ?? cookingRecipes.find((item) => item.name === key);
    const originalRecipe = recipe ? null : findOriginalRecipe(options?.originalRecipes, key);
    if (!recipe && !originalRecipe)
        return { ok: false, error: `没有找到食谱「${key || "未填写"}」。` };
    if (originalRecipe) {
        if (!canUseOriginalRecipe(originalRecipe, options))
            return { ok: false, code: "chef_original_recipe_not_unlocked", error: "还没有解锁这份原创食谱。" };
        const methodId = kitchenRecipeMethodId(originalRecipe);
        if (!methodId)
            return { ok: false, code: "recipe_method_missing" };
        return kitchenCook(farm, originalIngredientRefs(originalRecipe), now, {
            ...(options ?? {}),
            methodId,
            originalRecipeId: originalRecipe.recipeId,
        });
    }
    if (!kitchen.knownRecipes.includes(recipe.id))
        return { ok: false, error: `还没有解锁「${recipe.name}」食谱。` };
    const methodId = kitchenRecipeMethodId(recipe);
    if (!methodId)
        return { ok: false, code: "recipe_method_missing" };
    return kitchenCook(farm, recipe.ingredients, now, {
        ...(options ?? {}),
        methodId,
    });
}

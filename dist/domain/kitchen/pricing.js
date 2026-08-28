import { cooking, cookingIngredientById, cookingRecipeById } from "../../content.js";
export { chefProcessingFeeAfterDiscount, chefProcessingFeeDiscount } from "./chef.js";

export const COOKING_PRICE_VERSION = 2;
const COOKING_PRICE_V2_DEPLOYED_AT = 1785908900000; // 2026-08-05 13:48:20 Asia/Shanghai；新公式首次生产生效

/**
 * 统一新公式上线前已做好的料理锁价。
 * 旧倍率均大于 1，因此由旧成品价反推整数旧基价时至多命中一个值；不需要猜生产存档里的动态产物价值。
 */
export function normalizeDishPricing(dish) {
    if (!dish || typeof dish !== "object" || dish.pricingVersion === COOKING_PRICE_VERSION)
        return false;
    if (dish.recipeId === "odd_dish") {
        dish.value = 1;
        dish.pricingVersion = COOKING_PRICE_VERSION;
        return true;
    }
    const createdAt = Number(dish.createdAt);
    if (Number.isFinite(createdAt) && createdAt >= COOKING_PRICE_V2_DEPLOYED_AT) {
        dish.pricingVersion = COOKING_PRICE_VERSION;
        return true;
    }
    const recipe = cookingRecipeById.get(String(dish.recipeId));
    const premium = Number(cooking.recyclePremium[dish.rarity]);
    const oldValue = Number(dish.value);
    if (!recipe || !Number.isFinite(premium) || premium <= 1 || !Number.isSafeInteger(oldValue) || oldValue < 1)
        return false;
    const ingredientValue = recipe.ingredients.reduce((sum, id) => sum + (cookingIngredientById.get(id)?.price ?? 0), 0);
    const low = Math.max(0, Math.floor((oldValue - 0.5) / premium) - 1);
    const high = Math.ceil((oldValue + 0.5) / premium) + 1;
    let oldBaseValue;
    for (let candidate = low; candidate <= high; candidate++) {
        if (Math.round(candidate * premium) === oldValue) {
            oldBaseValue = candidate;
            break;
        }
    }
    if (oldBaseValue === undefined || oldBaseValue < ingredientValue)
        return false;
    const dynamicProductValue = oldBaseValue - ingredientValue;
    const currentBaseValue = dynamicProductValue + ingredientValue * cooking.ingredientRecycleValueMultiplier;
    dish.value = Math.round(currentBaseValue * (1 + cooking.processingFeeRate) * premium);
    dish.pricingVersion = COOKING_PRICE_VERSION;
    return true;
}

/** 正常料理回收返银：保留稀有度下限，并按锁定金币价值额外返约 1/50。 */
export function dishSystemRecycleSilver(dish) {
    if (!dish || dish.recipeId === "odd_dish")
        return 0;
    const rarityFloor = Math.max(0, Math.floor(Number(cooking.systemRecycleSilver[dish.rarity]) || 0));
    const valueReward = Math.max(0, Math.round((Number(dish.value) || 0) / 50));
    return Math.max(rarityFloor, valueReward);
}

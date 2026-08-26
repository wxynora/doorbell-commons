import { randomUUID } from "node:crypto";
import { cooking, cookingRecipeById, cookingRecipes } from "../../content.js";
import { removeFishingCatchIds } from "../../fishing.js";
import { glimmerBuffMultiplier } from "../../glimmer.js";
import { submitQixi2026Dish } from "../../qixi-2026.js";
import { ensureKitchen } from "../ranch/state.js";
import { COOKING_PRICE_VERSION } from "./pricing.js";
import { selectCookingItems } from "./selection.js";

export const cookingKey = (ids) => [...ids].sort().join("|");

export function kitchenCook(farm, refs, now) {
    const kitchen = ensureKitchen(farm);
    const picked = selectCookingItems(farm, refs);
    if (!picked.ok)
        return picked;
    const recipe = cookingRecipes.find((item) => cookingKey(item.ingredients) === cookingKey(picked.selected.map((item) => item.id)));
    kitchen.products = kitchen.products.filter((item) => !picked.usedProducts.has(item.id));
    removeFishingCatchIds(farm, picked.usedFish);
    for (const [id, n] of Object.entries(picked.ingredientCounts)) {
        kitchen.ingredients[id] -= n;
        if (kitchen.ingredients[id] <= 0)
            delete kitchen.ingredients[id];
    }
    const baseValue = picked.selected.reduce((sum, item) => sum + item.value, 0);
    let dish;
    let discovered = false;
    if (recipe) {
        discovered = !kitchen.knownRecipes.includes(recipe.id);
        if (discovered)
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
    return { ok: true, dish, recipe, discovered, odd: !recipe, ingredients: picked.selected.map((item) => item.name), baseValue, qixi };
}

/** 已解锁食谱可按名称或 id 直接制作；库存取用仍复用普通下锅的真实选择与扣除逻辑。 */
export function kitchenCookKnownRecipe(farm, selector, now) {
    const kitchen = ensureKitchen(farm);
    const key = String(selector ?? "").trim();
    const recipe = cookingRecipeById.get(key) ?? cookingRecipes.find((item) => item.name === key);
    if (!recipe)
        return { ok: false, error: `没有找到食谱「${key || "未填写"}」。` };
    if (!kitchen.knownRecipes.includes(recipe.id))
        return { ok: false, error: `还没有解锁「${recipe.name}」食谱。` };
    return kitchenCook(farm, recipe.ingredients, now);
}

import { cooking, cookingIngredientById, cookingIngredients, cookingRecipeById } from "../../content.js";
import { fishingKitchenProducts } from "../../fishing.js";
import { ensureKitchen } from "../ranch/state.js";
import { activeCookingDebuff } from "./effects.js";
import { dishSystemRecycleSilver } from "./pricing.js";
import { selectCookingItems } from "./selection.js";
import { kitchenIngredientDailyBuyLimit, refreshKitchenShop } from "./shop.js";

/** 料理台当前的真实库存、商店、配方与效果，AI 与人类页共用。 */
export function kitchenView(farm, now, options = {}) {
    const kitchen = ensureKitchen(farm);
    const shop = refreshKitchenShop(farm, now);
    const ingredients = cookingIngredients
        .filter((item) => item.staple || shop.ingredientIds.includes(item.id))
        .map((item) => ({ ...item, dailyBuyLimit: kitchenIngredientDailyBuyLimit(item, options), owned: kitchen.ingredients[item.id] ?? 0, bought: shop.bought[`ingredient:${item.id}`] ?? 0 }));
    const recipeOffers = shop.recipeIds.map((id) => cookingRecipeById.get(id)).filter(Boolean)
        .map((recipe) => ({ ...recipe, price: cooking.recipePrices[recipe.rarity], known: kitchen.knownRecipes.includes(recipe.id) }));
    return {
        products: [...kitchen.products, ...fishingKitchenProducts(farm)],
        ingredients,
        ownedIngredients: Object.entries(kitchen.ingredients).filter(([, qty]) => qty > 0)
            .map(([id, qty]) => ({ ...cookingIngredientById.get(id), id, qty })),
        dishes: kitchen.dishes.map((dish) => ({ ...dish, recycleSilver: dishSystemRecycleSilver(dish) })),
        recipeOffers,
        knownRecipes: kitchen.knownRecipes.map((id) => cookingRecipeById.get(id)).filter(Boolean)
            .map((recipe) => ({ ...recipe, canCook: selectCookingItems(farm, recipe.ingredients).ok })),
        debuff: activeCookingDebuff(farm, now),
        shop,
    };
}

import { cooking } from "../../content.js";
import { cookingIngredientById, cookingIngredients, cookingProductById, cookingProducts } from "../../content.js";
import { fishingKitchenProducts } from "../../fishing.js";
import { ensureKitchen } from "../ranch/state.js";

export function selectCookingItems(farm, refs) {
    const kitchen = ensureKitchen(farm);
    if (!Array.isArray(refs) || refs.length < 2 || refs.length > 5)
        return { ok: false, error: "每次请放 2～5 份食材。" };
    const usedProducts = new Set();
    const usedFish = new Set();
    const fishProducts = fishingKitchenProducts(farm);
    const ingredientCounts = {};
    const selected = [];
    for (const raw of refs) {
        const ref = String(raw ?? "").trim();
        let product = kitchen.products.find((item) => item.id === ref && !usedProducts.has(item.id));
        const productDef = cookingProductById.get(ref) ?? cookingProducts.find((item) => item.name === ref);
        if (!product && productDef)
            product = kitchen.products.find((item) => item.itemId === productDef.id && !usedProducts.has(item.id));
        if (product) {
            const def = cookingProductById.get(product.itemId);
            if (!def?.cookable)
                return { ok: false, error: `「${def?.name ?? product.name}」不能下锅，可以直接系统回收。` };
            usedProducts.add(product.id);
            selected.push({ source: "product", id: product.itemId, instanceId: product.id, name: def.name, value: product.value });
            continue;
        }
        let fish = fishProducts.find((item) => item.id === ref && !usedFish.has(item.id));
        if (!fish && ref === "fish:any")
            fish = fishProducts.find((item) => !usedFish.has(item.id));
        if (!fish)
            fish = fishProducts.find((item) => (item.fishId === ref || item.name === ref) && !usedFish.has(item.id));
        if (fish) {
            usedFish.add(fish.id);
            selected.push({ source: "fish", id: "fish:any", instanceId: fish.id, name: fish.name, value: fish.value });
            continue;
        }
        const ingredient = cookingIngredientById.get(ref) ?? cookingIngredients.find((item) => item.name === ref);
        if (!ingredient)
            return { ok: false, error: `食材柜里找不到「${ref}」。` };
        ingredientCounts[ingredient.id] = (ingredientCounts[ingredient.id] ?? 0) + 1;
        if ((kitchen.ingredients[ingredient.id] ?? 0) < ingredientCounts[ingredient.id])
            return { ok: false, error: `「${ingredient.name}」数量不够。` };
        selected.push({ source: "ingredient", id: ingredient.id, name: ingredient.name, value: ingredient.price * cooking.ingredientRecycleValueMultiplier });
    }
    return { ok: true, selected, usedProducts, usedFish, ingredientCounts };
}

export function takeKitchenDish(kitchen, dishId) {
    const dish = kitchen.dishes.find((item) => item.id === String(dishId));
    if (!dish)
        return null;
    kitchen.dishes = kitchen.dishes.filter((item) => item !== dish);
    return dish;
}

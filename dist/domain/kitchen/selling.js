import { cookingIngredientById, cookingIngredients } from "../../content.js";
import { ensureKitchen, ensureRanch } from "../ranch/state.js";
import { dishSystemRecycleSilver } from "./pricing.js";

export function kitchenSell(farm, itemId, to, price, now) {
    const kitchen = ensureKitchen(farm);
    const product = kitchen.products.find((item) => item.id === String(itemId));
    const dish = kitchen.dishes.find((item) => item.id === String(itemId));
    if (!product && !dish)
        return { ok: false, error: "食材柜或料理柜里没有这个实例。" };
    if (to === "system") {
        const item = product ?? dish;
        if (product)
            kitchen.products = kitchen.products.filter((entry) => entry !== product);
        else
            kitchen.dishes = kitchen.dishes.filter((entry) => entry !== dish);
        ensureRanch(farm).coins += item.value;
        const silver = dishSystemRecycleSilver(dish);
        farm.silver += silver;
        return { ok: true, to, name: item.name, value: item.value, silver, item };
    }
    if (to !== "market")
        return { ok: false, error: "to 只能是 system 或 market。" };
    if (!dish)
        return { ok: false, error: "只有正常料理能摆进玩家摊位；牧场原产物只能系统回收。" };
    if (dish.recipeId === "odd_dish")
        return { ok: false, error: "微妙的料理不能摆摊；你可以把它交给系统回收 1 金，或自己吃下。" };
    const silverPrice = Math.floor(Number(price));
    if (!Number.isSafeInteger(silverPrice) || silverPrice <= 0)
        return { ok: false, error: "摆摊价格要填写正整数银币。" };
    kitchen.dishes = kitchen.dishes.filter((entry) => entry !== dish);
    (farm.market ??= []).push({ kind: "dish", id: dish.id, qty: 1, price: silverPrice, dish: structuredClone(dish), listedAt: now });
    return { ok: true, to, name: dish.name, price: silverPrice, item: dish };
}

/** 人类料理台批量售卖：先完整校验所选实例，再一次性回收或逐份上架，避免中途失败造成部分扣除。 */
export function kitchenSellMany(farm, itemIds, qty, to, price, now) {
    const kitchen = ensureKitchen(farm);
    const ids = Array.isArray(itemIds) ? itemIds.map((id) => String(id)) : [];
    const n = Number(qty);
    if (!Number.isSafeInteger(n) || n < 1)
        return { ok: false, error: "售卖数量要填写正整数。" };
    if (n > ids.length)
        return { ok: false, error: `当前这一组最多只能售卖 ${ids.length} 份。` };
    const selectedIds = ids.slice(0, n);
    if (new Set(selectedIds).size !== selectedIds.length)
        return { ok: false, error: "售卖清单里有重复实例，请刷新页面后重试。" };
    const selected = [];
    for (const id of selectedIds) {
        const product = kitchen.products.find((item) => item.id === id);
        const dish = kitchen.dishes.find((item) => item.id === id);
        if (!product && !dish)
            return { ok: false, error: "食材柜或料理柜里的数量已经变化，请刷新后重试。" };
        selected.push({ kind: product ? "product" : "dish", item: product ?? dish });
    }
    const name = selected.every((entry) => entry.item.name === selected[0].item.name)
        ? selected[0].item.name
        : `${selected.length} 份物品`;
    if (to === "system") {
        const productIds = new Set(selected.filter((entry) => entry.kind === "product").map((entry) => entry.item.id));
        const dishIds = new Set(selected.filter((entry) => entry.kind === "dish").map((entry) => entry.item.id));
        const value = selected.reduce((sum, entry) => sum + entry.item.value, 0);
        const silver = selected.reduce((sum, entry) => sum + (entry.kind === "dish" ? dishSystemRecycleSilver(entry.item) : 0), 0);
        kitchen.products = kitchen.products.filter((entry) => !productIds.has(entry.id));
        kitchen.dishes = kitchen.dishes.filter((entry) => !dishIds.has(entry.id));
        ensureRanch(farm).coins += value;
        farm.silver += silver;
        return { ok: true, to, name, qty: n, value, silver, items: selected.map((entry) => entry.item) };
    }
    if (to !== "market")
        return { ok: false, error: "to 只能是 system 或 market。" };
    if (selected.some((entry) => entry.kind !== "dish"))
        return { ok: false, error: "只有正常料理能摆进玩家摊位；牧场原产物只能系统回收。" };
    if (selected.some((entry) => entry.item.recipeId === "odd_dish"))
        return { ok: false, error: "微妙的料理不能摆摊；你可以把它交给系统回收 1 金，或自己吃下。" };
    const silverPrice = Math.floor(Number(price));
    if (!Number.isSafeInteger(silverPrice) || silverPrice <= 0)
        return { ok: false, error: "摆摊价格要填写正整数银币。" };
    const dishIds = new Set(selected.map((entry) => entry.item.id));
    kitchen.dishes = kitchen.dishes.filter((entry) => !dishIds.has(entry.id));
    for (const entry of selected)
        (farm.market ??= []).push({ kind: "dish", id: entry.item.id, qty: 1, price: silverPrice, dish: structuredClone(entry.item), listedAt: now });
    return { ok: true, to, name, qty: n, price: silverPrice, items: selected.map((entry) => entry.item) };
}

/** AI 工具可直接用中文产物名／料理名；旧实例 UUID 继续兼容。 */
export function kitchenSellSelected(farm, selectorRaw, qty, to, price, now) {
    const kitchen = ensureKitchen(farm);
    const selector = String(selectorRaw);
    const ingredient = cookingIngredientById.get(selector) ?? cookingIngredients.find((item) => item.name === selector);
    if (ingredient && to === "market") {
        const n = Number(qty);
        if (!Number.isSafeInteger(n) || n < 1)
            return { ok: false, error: "售卖数量要填写正整数。" };
        if ((kitchen.ingredients[ingredient.id] ?? 0) < n)
            return { ok: false, error: `「${ingredient.name}」数量不够。` };
        const silverPrice = Math.floor(Number(price));
        if (!Number.isSafeInteger(silverPrice) || silverPrice <= 0)
            return { ok: false, error: "摆摊价格要填写正整数银币。" };
        kitchen.ingredients[ingredient.id] -= n;
        if (kitchen.ingredients[ingredient.id] <= 0)
            delete kitchen.ingredients[ingredient.id];
        const listing = (farm.market ??= []).find((item) => item.kind === "ingredient" && item.id === ingredient.id);
        if (listing) {
            listing.qty += n;
            listing.price = silverPrice;
            listing.listedAt = now;
        }
        else {
            farm.market.push({ kind: "ingredient", id: ingredient.id, qty: n, price: silverPrice, listedAt: now });
        }
        return { ok: true, to, name: ingredient.name, qty: n, price: silverPrice, item: ingredient };
    }
    const exactProduct = kitchen.products.find((item) => item.id === selector);
    const exactDish = kitchen.dishes.find((item) => item.id === selector);
    if (exactProduct || exactDish)
        return kitchenSellMany(farm, [(exactProduct ?? exactDish).id], qty, to, price, now);
    let matches = kitchen.products.filter((item) => item.itemId === selector || item.name === selector);
    if (matches.length === 0)
        matches = kitchen.dishes.filter((item) => item.recipeId === selector || item.name === selector);
    if (matches.length === 0)
        return { ok: false, error: `食材柜或料理柜里没有「${selector}」。` };
    return kitchenSellMany(farm, matches.map((item) => item.id), qty, to, price, now);
}

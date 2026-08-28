import { Rng } from "../../rng.js";
import { currentDayIndex } from "../../time.js";
import { cooking, cookingIngredientById, cookingIngredients, cookingRecipeById, cookingRecipes } from "../../content.js";
import { isQixiLantern2026Active } from "../../qixi-lantern-2026.js";
import { ensureKitchen } from "../ranch/state.js";

function kitchenIngredientRefreshRules() {
    const rules = cooking.ingredientShopRefresh;
    const dailyLimit = rules?.dailyLimit;
    const costStepCoins = rules?.costStepCoins;
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 ||
        !Number.isSafeInteger(costStepCoins) || costStepCoins < 1)
        return null;
    return { dailyLimit, costStepCoins };
}

function kitchenIngredientRefreshCount(shop, day, dailyLimit) {
    if (shop.refreshWindowId === undefined && shop.refreshCount === undefined)
        return 0;
    if (!Number.isSafeInteger(shop.refreshWindowId) || shop.refreshWindowId < 0 ||
        !Number.isSafeInteger(shop.refreshCount) || shop.refreshCount < 0 ||
        shop.refreshCount > dailyLimit)
        return null;
    return shop.refreshWindowId === day ? shop.refreshCount : 0;
}

function shuffledWithFarmRng(farm, values) {
    const out = [...values];
    const rng = new Rng(farm.rngState ?? 1);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    farm.rngState = rng.state;
    return out;
}

function ensureQixiLanternTeaOffer(shop, now) {
    if (isQixiLantern2026Active(now) && !shop.ingredientIds.includes("tea"))
        shop.ingredientIds.push("tea");
    return shop;
}

function kitchenRotatingIngredients() {
    return cookingIngredients.filter((item) => !item.staple).map((item) => item.id);
}

function ingredientDailyBuyMultiplier(options) {
    return options?.ingredientDailyBuyMultiplier === 2 ? 2 : 1;
}

export function kitchenIngredientDailyBuyLimit(item, options = {}) {
    const base = Math.max(1, Math.floor(Number(item?.dailyBuyLimit) || cooking.dailyBuyLimit));
    return base * ingredientDailyBuyMultiplier(options);
}

/** 每座牧场自己的每日食材/食谱货架；UTC+8 零点刷新。 */
export function refreshKitchenShop(farm, now) {
    const kitchen = ensureKitchen(farm);
    const day = currentDayIndex(now);
    if (kitchen.shop?.day === day)
        return ensureQixiLanternTeaOffer(kitchen.shop, now);
    const rotating = kitchenRotatingIngredients();
    const unknown = cookingRecipes.filter((recipe) => !kitchen.knownRecipes.includes(recipe.id)).map((recipe) => recipe.id);
    kitchen.shop = {
        day,
        ingredientIds: shuffledWithFarmRng(farm, rotating).slice(0, cooking.dailyRotatingCount),
        recipeIds: shuffledWithFarmRng(farm, unknown).slice(0, cooking.dailyRecipeCount),
        bought: {},
        refreshWindowId: day,
        refreshCount: 0,
    };
    return ensureQixiLanternTeaOffer(kitchen.shop, now);
}

/**
 * 料理台食材栏的人工刷新权威结算：只重抽食材，不碰食谱、库存或购买计数。
 * 调用方应在外层 clone 后保存；本函数仍会在生成失败时保持输入不变。
 */
export function refreshKitchenIngredients(farm, now = Date.now()) {
    const rules = kitchenIngredientRefreshRules();
    const day = currentDayIndex(now);
    const kitchen = farm?.ranch?.kitchen;
    const shop = kitchen?.shop;
    if (!rules || !kitchen || !shop || shop.day !== day ||
        !Array.isArray(shop.ingredientIds) || !Array.isArray(shop.recipeIds) ||
        !shop.bought || typeof shop.bought !== "object" || Array.isArray(shop.bought)) {
        return { ok: false, code: "shop_unavailable", error: "今天的食材铺不可刷新。" };
    }
    const usedCount = kitchenIngredientRefreshCount(shop, day, rules.dailyLimit);
    if (usedCount === null)
        return { ok: false, code: "farm_unavailable", error: "食材铺刷新状态无效。" };
    if (usedCount >= rules.dailyLimit)
        return { ok: false, code: "refresh_exhausted", error: "今天的食材铺刷新次数已用完。" };
    if (!Number.isSafeInteger(farm.coins) || farm.coins < 0)
        return { ok: false, code: "farm_unavailable", error: "农场金币余额无效。" };
    const costCoins = (usedCount + 1) * rules.costStepCoins;
    if (!Number.isSafeInteger(costCoins) || farm.coins < costCoins)
        return { ok: false, code: "insufficient_coins", error: `金币不足，本次刷新需要 ${costCoins} 金币。` };

    const rotating = kitchenRotatingIngredients();
    if (!Array.isArray(rotating) || rotating.length < 1 || !Number.isSafeInteger(cooking.dailyRotatingCount) ||
        cooking.dailyRotatingCount < 1) {
        return { ok: false, code: "farm_unavailable", error: "食材刷新内容无效。" };
    }
    let generatedFarm;
    let ingredientIds;
    try {
        generatedFarm = structuredClone(farm);
        ingredientIds = shuffledWithFarmRng(generatedFarm, rotating)
            .slice(0, cooking.dailyRotatingCount);
        const generatedShop = { ...shop, ingredientIds: [...ingredientIds] };
        ensureQixiLanternTeaOffer(generatedShop, now);
        ingredientIds = generatedShop.ingredientIds;
    }
    catch {
        return { ok: false, code: "farm_unavailable", error: "食材刷新生成失败。" };
    }
    if (!Array.isArray(ingredientIds) || ingredientIds.some((id) => typeof id !== "string" || !id))
        return { ok: false, code: "farm_unavailable", error: "食材刷新生成失败。" };

    farm.rngState = generatedFarm.rngState;
    farm.coins -= costCoins;
    shop.ingredientIds = ingredientIds;
    shop.refreshWindowId = day;
    shop.refreshCount = usedCount + 1;
    return {
        ok: true,
        cost: costCoins,
        coins: farm.coins,
        refreshWindowId: day,
        refreshCount: usedCount + 1,
        refreshLimit: rules.dailyLimit,
        nextCostCoins: Math.min(
            (usedCount + 2) * rules.costStepCoins,
            rules.dailyLimit * rules.costStepCoins,
        ),
        canRefresh: usedCount + 1 < rules.dailyLimit,
    };
}

export function kitchenBuy(farm, kind, id, qty, now, options = {}) {
    const kitchen = ensureKitchen(farm);
    const shop = refreshKitchenShop(farm, now);
    if (kind === "ingredient") {
        const item = cookingIngredientById.get(String(id));
        if (!item || (!item.staple && !shop.ingredientIds.includes(item.id)))
            return { ok: false, error: "今天的食材铺没有这个。" };
        const n = Math.max(1, Math.floor(Number(qty) || 1));
        const key = `ingredient:${item.id}`;
        const bought = shop.bought[key] ?? 0;
        const dailyBuyLimit = kitchenIngredientDailyBuyLimit(item, options);
        if (bought + n > dailyBuyLimit)
            return { ok: false, error: `${item.name}每天最多买 ${dailyBuyLimit} 份，今天还可买 ${Math.max(0, dailyBuyLimit - bought)} 份。` };
        const cost = item.price * n;
        if (farm.silver < cost)
            return { ok: false, error: `银币不足，买 ${n} 份${item.name}要 🪙${cost}（你有 ${farm.silver}）。` };
        farm.silver -= cost;
        kitchen.ingredients[item.id] = (kitchen.ingredients[item.id] ?? 0) + n;
        shop.bought[key] = bought + n;
        return { ok: true, kind, name: item.name, qty: n, cost };
    }
    if (kind === "recipe") {
        const recipe = cookingRecipeById.get(String(id));
        if (!recipe || !shop.recipeIds.includes(recipe.id))
            return { ok: false, error: "今天的食谱铺没有这张食谱。" };
        if (kitchen.knownRecipes.includes(recipe.id))
            return { ok: false, error: `已经会做「${recipe.name}」了。` };
        const cost = cooking.recipePrices[recipe.rarity];
        if (farm.silver < cost)
            return { ok: false, error: `银币不足，这张 ${recipe.rarity} 食谱要 🪙${cost}（你有 ${farm.silver}）。` };
        farm.silver -= cost;
        kitchen.knownRecipes.push(recipe.id);
        return { ok: true, kind, name: recipe.name, rarity: recipe.rarity, cost };
    }
    return { ok: false, error: "kind 只能是 ingredient 或 recipe。" };
}

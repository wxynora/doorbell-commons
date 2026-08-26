import { Rng } from "../../rng.js";
import { COOKING_DEBUFF_MS } from "../../config.js";
import { cooking } from "../../content.js";
import { ensureKitchen } from "../ranch/state.js";
import { takeKitchenDish } from "./selection.js";

const HOUR_MS = 60 * 60 * 1000;

export function activeCookingDebuff(farm, now = Date.now()) {
    if (!farm)
        return null;
    const kitchen = ensureKitchen(farm);
    if (kitchen.debuff && kitchen.debuff.until <= now)
        delete kitchen.debuff;
    return kitchen.debuff ?? null;
}

export function cookingDebuffReason(farm, action, body, now) {
    const debuff = activeCookingDebuff(farm, now);
    if (!debuff)
        return "";
    const blocked = (debuff.kind === "farm_lock" && !!action && action !== "status")
        || (debuff.kind === "no_steal" && action === "steal")
        || (debuff.kind === "no_water" && action === "water")
        || (debuff.kind === "no_harvest" && (action === "harvest" || (action === "run" && (body?.harvest || body?.harvestFirst || body?.harvestAfter))));
    if (!blocked)
        return "";
    const minutes = Math.max(1, Math.ceil((debuff.until - now) / 60000));
    return `🥴 你吃下的微妙料理还在发作：${debuff.name}（约 ${minutes} 分钟后恢复）。这个效果只影响你使用农场工具，人类伴侣仍可正常操作。`;
}

const ODD_DEBUFFS = [
    { kind: "no_steal", name: "手脚发软，暂时不能偷菜" },
    { kind: "no_harvest", name: "眼冒金星，暂时不能收菜" },
    { kind: "no_water", name: "闻水就晕，暂时不能浇水" },
    { kind: "farm_lock", name: "料理后劲太大，农场工具暂时罢工" },
    { kind: "dog_disliked", name: "狗都嫌，去有狗的人家偷菜会 100% 被拦" },
];

const COOKING_DEBUFF_STATUS = {
    no_steal: { label: "手脚发软", impact: "暂时不能偷菜" },
    no_harvest: { label: "眼冒金星", impact: "暂时不能收菜" },
    no_water: { label: "闻水就晕", impact: "暂时不能浇水" },
    farm_lock: { label: "料理后劲太大", impact: "除查看状态外，农场工具暂时无法使用" },
    dog_disliked: { label: "狗都嫌", impact: "去有看家狗的人家偷菜会 100% 被拦住" },
};

/** 当前料理负面状态：连接 status 持续展示，到期后由 activeCookingDebuff 自动清除。 */
export function cookingDebuffStatusText(farm, now = Date.now()) {
    const debuff = activeCookingDebuff(farm, now);
    if (!debuff)
        return "";
    const status = COOKING_DEBUFF_STATUS[debuff.kind] ?? { label: debuff.name, impact: debuff.name };
    const totalMinutes = Math.max(1, Math.ceil((debuff.until - now) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const remaining = hours ? `${hours} 小时${minutes ? ` ${minutes} 分钟` : ""}` : `${minutes} 分钟`;
    const dishName = debuff.dishName || "微妙的料理";
    const source = debuff.fedBy
        ? `${debuff.fedBy}给你喂了「${dishName}」；`
        : `你吃下了「${dishName}」；`;
    return `🍽️ ${source}你当前处于「${status.label}」状态，剩余 ${remaining}：${status.impact}。这个效果只影响你使用农场工具，人类伴侣仍可正常操作。`;
}

export function kitchenUse(farm, dishId, target, now) {
    const kitchen = ensureKitchen(farm);
    const selector = String(dishId);
    const dish = kitchen.dishes.find((item) => item.id === selector)
        ?? kitchen.dishes.find((item) => item.recipeId === selector || item.name === selector);
    if (!dish)
        return { ok: false, error: "料理柜里没有这份料理。" };
    if (target === "self") {
        if (dish.recipeId !== "odd_dish")
            return { ok: false, error: "正常料理不能由你吃下；你可以把它喂给猫狗、交给系统回收、摆摊，或用来贿赂看家狗。" };
        const rng = new Rng(farm.rngState ?? 1);
        const debuff = ODD_DEBUFFS[Math.floor(rng.next() * ODD_DEBUFFS.length)];
        farm.rngState = rng.state;
        kitchen.debuff = { ...debuff, until: now + COOKING_DEBUFF_MS };
        takeKitchenDish(kitchen, dish.id);
        return { ok: true, target, dish, debuff: kitchen.debuff };
    }
    if (target !== "cat" && target !== "dog")
        return { ok: false, error: "target 只能是 cat、dog、self 或 guard-dog。" };
    if (dish.recipeId === "odd_dish")
        return { ok: false, error: "微妙的料理不能喂宠物。" };
    const pet = (farm.ranch?.pets ?? []).find((item) => item.kindId === target);
    if (!pet)
        return { ok: false, error: `牧场还没有${target === "cat" ? "小猫" : "小狗"}。` };
    const buff = cooking.petDishBuffs[dish.rarity];
    pet.dishBuff = { bonus: buff.bonus, endsAt: now + buff.hours * HOUR_MS, dishName: dish.name, rarity: dish.rarity };
    takeKitchenDish(kitchen, dish.id);
    return { ok: true, target, dish, buff: pet.dishBuff };
}

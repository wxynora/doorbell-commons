import {
    NPC_ID,
    NPC_LIMITED_SEED_CHANCE,
    POTION_SET_CHANCE,
    POTION_SET_PRICE,
    POTION_SET_QTY,
    RECIPE_PRICE,
    SEED_PRICE,
    SHOP_RECIPE_CHANCE,
    SHOP_REFRESH_MS,
} from "../../config.js";
import { cropById, recipes } from "../../content.js";
import { bumpDaily } from "../../daily.js";
import { Rng } from "../../rng.js";
import { activeFestivals } from "../../time.js";
import { isQixi2026CropId } from "../../qixi-2026.js";
import { pushLog } from "../shared/notifications.js";
import { isLimitedAvailable } from "./availability.js";

// —— 第一层商店：每 SHOP_REFRESH_MS 刷新一次，小概率上架一张未学的隐藏配方 ——
export function refreshShop(farm, now) {
    if (now - farm.shop.refreshAt < SHOP_REFRESH_MS)
        return;
    farm.shop.refreshAt = now;
    const rng = new Rng(farm.rngState);
    const unknown = recipes.filter((r) => !farm.knownRecipes.includes(r.output) && cropById.get(r.output));
    farm.shop.recipe = unknown.length && rng.next() < SHOP_RECIPE_CHANCE ? unknown[rng.int(unknown.length)].output : null;
    // 药水套装：随机刷出（不固定售卖），每份限购 1（buyers 记录已买过的农场，刷新即清空=新一份）
    farm.shop.potionSet = rng.next() < POTION_SET_CHANCE ? { price: POTION_SET_PRICE, qty: POTION_SET_QTY, buyers: [] } : null;
    // 限定种子：从「本农场可进随机库」的限定里，极小概率随机刷出一颗（金币结算，每种每天限购 1）。
    // 阿土(NPC)是 magic vendor → 无视自身进度给全部可上架限定；普通玩家按自己解锁(isLimitedAvailable)。
    const limPool = limitedShopPool(farm, now, farm.id === NPC_ID);
    const lim = (rng.next() < NPC_LIMITED_SEED_CHANCE && limPool.length) ? limPool[rng.int(limPool.length)] : null;
    farm.shop.npcSeed = lim ? { id: lim.id, price: lim.seedPrice } : null;
    farm.rngState = rng.state;
}

/** 商店随机限定的候选池：
 *  · 节日限定 → 只在对应节日窗口出现；
 *  · 纯熔炼组（无解锁规则、非图鉴%）→ 永不进商店（只能熔炼）；
 *  · 其余（图鉴%/条件解锁/不可炼，如植物学家玫瑰）→ 按本农场是否已解锁。
 *  allUnlocked=true 时（阿土这类常驻 vendor）无视本农场进度，给出所有"能在商店出现"的限定。 */
export function limitedShopPool(farm, now, allUnlocked = false) {
    return [...cropById.values()].filter((c) => {
        if (c.category !== "limited")
            return false;
        if (isQixi2026CropId(c.id))
            return false;
        if (c.unlockType === "festival")
            return activeFestivals(now).some((f) => f.cropId === c.id);
        if (!c.unlockRule && c.unlockType !== "codex")
            return false; // 纯熔炼组：不进商店
        return allUnlocked || isLimitedAvailable(c, farm, now);
    });
}

/** 买下第一层在售的配方（学会它） */
export function buyRecipe(farm, now) {
    refreshShop(farm, now);
    const out = farm.shop.recipe;
    if (!out)
        return { ok: false, error: "商店现在没有配方在售（每隔几小时刷新，看缘分）" };
    if (farm.knownRecipes.includes(out)) {
        farm.shop.recipe = null;
        return { ok: false, error: "这个配方你已经学过了" };
    }
    if (farm.coins < RECIPE_PRICE)
        return { ok: false, error: `金币不足，配方要 ${RECIPE_PRICE}` };
    farm.coins -= RECIPE_PRICE;
    bumpDaily(farm, now, "coinSpend", RECIPE_PRICE);
    farm.knownRecipes.push(out);
    farm.shop.recipe = null;
    const name = cropById.get(out)?.name ?? out;
    pushLog(farm, `学会配方：${name}`);
    return { ok: true, output: out, name };
}

// —— 商店：总是有普通/奇幻种子；限定只剩「本农场今日随机刷出的那一颗」（refreshShop 已写入 shop.npcSeed）。
//    没有任何限定常驻上架——解锁只是让它能进随机库被 roll。调用前请确保已 refreshShop(farm, now)。
export function shopOffer(farm, _now) {
    const ns = farm.shop.npcSeed;
    const lim = ns && !isQixi2026CropId(ns.id) ? cropById.get(ns.id) : null;
    return {
        common: { type: "common", price: SEED_PRICE.common },
        fantasy: { type: "fantasy", price: SEED_PRICE.fantasy },
        limited: lim ? [{ id: lim.id, name: lim.name, price: ns.price, cond: lim.unlockCond ?? "限定" }] : [],
    };
}

/** 跨农场购买商店随机刷新的「药水套装」：shopFarm 的店里有套装时，buyer 出钱买（每份每人限购 1）。
 *  自家买：shopFarm === buyer。串门买别家：shopFarm = 目标农场、buyer = 来访者。*/
export function buyPotionSet(shopFarm, buyer, now) {
    refreshShop(shopFarm, now);
    const set = shopFarm.shop.potionSet;
    if (!set)
        return { ok: false, error: "这座农场的商店现在没有「药水套装」（随机刷新，看缘分）。" };
    if (set.buyers.includes(buyer.id))
        return { ok: false, error: "你已经买过这一份药水套装了（每份限购 1）。" };
    if (buyer.coins < set.price)
        return { ok: false, error: `金币不足，药水套装（${set.qty} 瓶）要 ${set.price}，你只有 ${buyer.coins}。` };
    buyer.coins -= set.price;
    bumpDaily(buyer, now, "coinSpend", set.price);
    buyer.items.speed_potion = (buyer.items.speed_potion ?? 0) + set.qty;
    set.buyers.push(buyer.id);
    pushLog(buyer, `买下药水套装（${set.qty} 瓶加速药水）`);
    if (shopFarm.id !== buyer.id)
        pushLog(shopFarm, `${buyer.name} 买走了你商店刷新的药水套装`);
    return { ok: true, qty: set.qty, cost: set.price, left: buyer.items.speed_potion };
}

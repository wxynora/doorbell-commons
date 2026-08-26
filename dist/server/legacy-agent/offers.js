import { kitchenView, nextUpgradeReq, potionDailyLeft } from "../../engine.js";
import { ranchAgentSection, refPrice } from "../../game.js";
import { EXP_DAILY_CAP, EXP_MAX_CHARGES_PER_ENTRY, POTION_DAILY_CAP, RECIPE_PRICE, SEED_PRICE } from "../../config.js";
import { expEventById, getCrop, materialById } from "../../content.js";
import { currentDayIndex } from "../../time.js";
import { hasOpenOffer, offerSummary } from "../../tasks.js";

/** 自动取 3 个素材（凑齐已学配方优先，否则按库存取前 3 个）*/
export function autoPickMaterials(f) {
    const flat = [];
    for (const [id, n] of Object.entries(f.materials))
        for (let i = 0; i < n; i++)
            flat.push(id);
    return flat.length >= 3 ? flat.slice(0, 3) : null;
}

/** 本农场可做的动作（参数化的做成预设，因为 AI 只能点不能填）*/
export function selfActions(f, now) {
    const empty = f.plots.filter((p) => !p.crop).length;
    const ripe = f.plots.filter((p) => p.crop?.ripe).length;
    const growing = f.plots.filter((p) => p.crop && !p.crop.ripe).length;
    const potions = f.items.speed_potion ?? 0;
    const L = [];
    if (hasOpenOffer(f, now))
        L.push({ label: `📋 接取任务：${offerSummary(f)}`, action: "accept-task", params: {} });
    if (ripe > 0 || (potions > 0 && (empty > 0 || growing > 0))) {
        const params = { water: "if-any", potion: "all-if-any", harvestAfter: true };
        if (empty > 0)
            params.plant = { common: empty };
        L.push({ label: "🌀 组合一轮：种满普通种子+浇水+催熟+收获", action: "run", params });
    }
    if (empty > 0 && f.coins >= SEED_PRICE.common) {
        L.push({ label: "🌱 种 1 棵普通种子", action: "run", params: { plant: { common: 1 }, water: "if-any" } });
        if (empty >= 3 && f.coins >= SEED_PRICE.common * 3)
            L.push({ label: "🌱 种 3 棵普通种子", action: "run", params: { plant: { common: 3 }, water: "if-any" } });
    }
    if (empty > 0 && f.coins >= SEED_PRICE.fantasy) {
        L.push({ label: "✨ 种 1 棵奇幻种子", action: "run", params: { plant: { fantasy: 1 }, water: "if-any" } });
        if (empty >= 3 && f.coins >= SEED_PRICE.fantasy * 3)
            L.push({ label: "✨ 种 3 棵奇幻种子", action: "run", params: { plant: { fantasy: 3 }, water: "if-any" } });
    }
    if (empty > 0) {
        for (const [sid, sq] of Object.entries(f.seeds).filter(([, q]) => q > 0).slice(0, 6)) {
            const nm = getCrop(sid)?.name ?? sid;
            L.push({ label: `🌷 种下「${nm}」×1（剩 ${sq}）`, action: "run", params: { plant: { limited: [sid] }, water: "if-any" } });
        }
    }
    if (ripe > 0)
        L.push({ label: `🧺 只收已熟的（${ripe} 块，不催熟在长的）`, action: "harvest", params: {} });
    if (ripe > 0 || (growing > 0 && potions > 0))
        L.push({ label: "⚡ 一键催熟+收获", action: "run", params: { potion: "all-if-any", harvestAfter: true } });
    const up = nextUpgradeReq(f);
    if (up)
        L.push({ label: `🌟 升级土地 → ${up.next.name}（${up.req.coins}金 + 图鉴条件）`, action: "upgrade-land", params: {} });
    L.push(...potionBuyActions(f, now));
    L.push({ label: "🎒 看背包 / 素材", action: "bag", params: {} });
    L.push({ label: "🏪 看商店", action: "shop", params: {} });
    L.push({ label: "🧺 看我的摊位", action: "market", params: {} });
    L.push({ label: "🍳 打开料理台", action: "kitchen", params: {} });
    L.push({ label: "🏡 查看我的公开农场 / 留言板（别人串门看到的页）", action: "mypage", params: {} });
    L.push({ label: "🚶 出门随机逛逛（找别家偷 / 串门）", action: "wander", params: {} });
    const exp = f.expedition;
    if (exp?.pending?.type === "choice") {
        const e = expEventById.get(exp.pending.eventId);
        for (const o of e?.options ?? [])
            L.push({ label: `🔀 ${e?.title}：${o.label}`, action: "choose", params: { option: o.key } });
    }
    else if (exp?.pending?.type === "combat") {
        const e = expEventById.get(exp.pending.eventId);
        L.push({ label: `🎲 自己掷骰打【${e?.foe}】（更建议让 ${f.humanName || "伴侣"} 帮你摇，+1同心）`, action: "roll", params: {} });
    }
    else if (exp) {
        L.push({ label: "🗺️ 继续往里走", action: "explore", params: {} });
        L.push({ label: "🏃 见好就收，撤回落袋", action: "retreat", params: {} });
    }
    else {
        const used = f.expDaily && f.expDaily.day === currentDayIndex(now) ? f.expDaily.n : 0;
        const left = EXP_DAILY_CAP - used;
        if (left > 0) {
            L.push({ label: `🗺️ 出门探险（花 1 次数·3 段际遇，今日剩 ${left}）`, action: "explore", params: { charges: 1 } });
            const big = Math.min(left, EXP_MAX_CHARGES_PER_ENTRY);
            if (big >= 2)
                L.push({ label: `🗺️ 一口气深挖（花 ${big} 次数·${big * 3} 段，同一秘境）`, action: "explore", params: { charges: big } });
        }
    }
    L.push({ label: "🏆 看全服排行榜", action: "leaderboard", params: {} });
    return L;
}

export function potionBuyActions(f, now) {
    const L = [];
    const potionLeft = potionDailyLeft(f, now);
    const potionUsed = POTION_DAILY_CAP - potionLeft;
    if (potionLeft > 0 && f.coins >= 50) {
        L.push({ label: `🧪 买 1 瓶加速药水（50 金·今日已购 ${potionUsed}/${POTION_DAILY_CAP}）`, action: "buy-item", params: { item: "speed_potion", qty: 1 } });
        if (potionLeft > 1 && f.coins >= potionLeft * 50)
            L.push({ label: `🧪 买满剩余限额（${potionLeft} 瓶·${potionLeft * 50} 金）`, action: "buy-item", params: { item: "speed_potion", qty: potionLeft } });
    }
    return L;
}

export function listInventoryActions(f) {
    const L = [];
    for (const [sid, sn] of Object.entries(f.seeds).filter(([, q]) => q > 0).slice(0, 8)) {
        const nm = getCrop(sid)?.name ?? sid;
        L.push({ label: `🧺 上架种子「${nm}」×${sn} 卖（参考价 🪙${refPrice("seed", sid)}银/个）`, action: "list", params: { kind: "seed", id: sid, qty: sn } });
    }
    for (const [mid, mn] of Object.entries(f.materials).filter(([, q]) => q > 0).slice(0, 8)) {
        const nm = materialById.get(mid)?.name ?? mid;
        L.push({ label: `🧺 上架素材「${nm}」×${mn} 卖（参考价 🪙${refPrice("material", mid)}银/个）`, action: "list", params: { kind: "material", id: mid, qty: mn } });
    }
    return L;
}

export function shopActions(f, now) {
    const L = [];
    const ripe = f.plots.filter((p) => p.crop?.ripe).length;
    const growing = f.plots.filter((p) => p.crop && !p.crop.ripe).length;
    if (ripe > 0 || (growing > 0 && (f.items.speed_potion ?? 0) > 0))
        L.push({ label: "⚡ 一键催熟+收获", action: "run", params: { potion: "all-if-any", harvestAfter: true } });
    L.push(...potionBuyActions(f, now));
    const set = f.shop?.potionSet;
    if (set && !set.buyers.includes(f.id) && f.coins >= set.price)
        L.push({ label: `🎁 买药水套装（${set.qty} 瓶 ${set.price} 金，限购 1）`, action: "buy-potion-set", params: {} });
    if (f.shop?.recipe && f.coins >= RECIPE_PRICE)
        L.push({ label: `📜 买商店在售的隐藏配方（${RECIPE_PRICE} 金）`, action: "buy-recipe", params: {} });
    const ls = f.shop?.npcSeed;
    if (ls && f.coins >= ls.price)
        L.push({ label: `🎏 买店里刷出的限定种子「${getCrop(ls.id)?.name ?? ls.id}」×1（💰${ls.price} 金，每天限 1）`, action: "buy-seed", params: { id: ls.id } });
    const ranch = ranchAgentSection(f);
    for (const btn of ranch.buttons) {
        if (btn.id === "patrol-goose")
            L.push({ label: btn.label, action: "buy-patrol-goose", params: {} });
        else if (btn.id.startsWith("pet:"))
            L.push({ label: btn.label, action: "buy-pet", params: { id: btn.id.slice(4) } });
        else
            L.push({ label: btn.label, action: "buy-animal", params: { id: btn.id } });
    }
    L.push({ label: "🔙 回我的农场", action: "status", params: {} });
    return L;
}

export function bagActions(f) {
    const L = [];
    const empty = f.plots.filter((p) => !p.crop).length;
    if (empty > 0)
        for (const [sid, sq] of Object.entries(f.seeds).filter(([, q]) => q > 0).slice(0, 6)) {
            const nm = getCrop(sid)?.name ?? sid;
            L.push({ label: `🌷 种下「${nm}」×1（剩 ${sq}）`, action: "run", params: { plant: { limited: [sid] }, water: "if-any" } });
        }
    L.push(...listInventoryActions(f));
    const mats = Object.values(f.materials).reduce((a, b) => a + b, 0);
    if (mats >= 3)
        L.push({ label: "⚗️ 熔炼（自动取 3 个素材出限定种子）", action: "craft", params: { auto: true } });
    L.push({ label: "🔙 回我的农场", action: "status", params: {} });
    return L;
}

export function kitchenAgentActions(f, now) {
    const view = kitchenView(f, now);
    const L = [];
    for (const item of view.ingredients.slice(0, 10))
        if (item.bought < 3 && f.silver >= item.price)
            L.push({ label: `🧺 买${item.name}×1（🪙${item.price}·今日 ${item.bought}/3）`, action: "kitchen", params: { op: "buy", kind: "ingredient", id: item.id, qty: 1 } });
    for (const recipe of view.recipeOffers)
        if (!recipe.known && f.silver >= recipe.price)
            L.push({ label: `📜 买食谱「${recipe.name}·${recipe.rarity}」（🪙${recipe.price}）`, action: "kitchen", params: { op: "buy", kind: "recipe", id: recipe.id } });
    const availableRefs = (recipe) => {
        const products = [...view.products];
        const counts = Object.fromEntries(view.ownedIngredients.map((item) => [item.id, item.qty]));
        const refs = [];
        for (const id of recipe.ingredients) {
            const product = products.find((item) => item.itemId === id);
            if (product) {
                refs.push(product.id);
                products.splice(products.indexOf(product), 1);
            }
            else if ((counts[id] ?? 0) > 0) {
                refs.push(id);
                counts[id] -= 1;
            }
            else
                return null;
        }
        return refs;
    };
    for (const recipe of view.knownRecipes.slice(0, 12)) {
        const items = availableRefs(recipe);
        if (items)
            L.push({ label: `🍲 做「${recipe.name}·${recipe.rarity}」`, action: "kitchen", params: { op: "cook", items } });
    }
    for (const dish of view.dishes.slice(0, 8)) {
        if (dish.recipeId === "odd_dish")
            L.push({ label: "🥴 自己吃「微妙的料理」", action: "kitchen", params: { op: "use", dishId: dish.id, target: "self" } });
        else {
            if (f.ranch?.pets?.some((pet) => pet.kindId === "cat"))
                L.push({ label: `🐱 把「${dish.name}·${dish.rarity}」喂猫`, action: "kitchen", params: { op: "use", dishId: dish.id, target: "cat" } });
            if (f.ranch?.pets?.some((pet) => pet.kindId === "dog"))
                L.push({ label: `🐶 把「${dish.name}·${dish.rarity}」喂狗`, action: "kitchen", params: { op: "use", dishId: dish.id, target: "dog" } });
        }
        L.push({ label: `♻️ 系统回收「${dish.name}」（${dish.value}牧场金${dish.recipeId === "odd_dish" ? "" : ` + ${dish.recycleSilver}银`}）`, action: "kitchen", params: { op: "sell", itemId: dish.id, to: "system" } });
    }
    for (const product of view.products.slice(0, 6))
        L.push({ label: `♻️ 系统回收「${product.name}」（${product.value}牧场金）`, action: "kitchen", params: { op: "sell", itemId: product.id, to: "system" } });
    L.push({ label: "🔙 回我的农场", action: "status", params: {} });
    return L;
}

export function suggest(f) {
    const empty = f.plots.filter((p) => !p.crop).length;
    const ripe = f.plots.filter((p) => p.crop?.ripe).length;
    const growing = f.plots.filter((p) => p.crop && !p.crop.ripe).length;
    const mats = Object.values(f.materials).reduce((a, b) => a + b, 0);
    if (ripe > 0)
        return "有成熟作物了，先点「收获」。";
    if (empty > 0)
        return "有空地，点「种…」或「组合一轮」种上。";
    if (growing > 0 && (f.items.speed_potion ?? 0) > 0)
        return "作物在长，可「催熟」立刻成熟，或「出门逛逛」找别家偷。";
    if (mats >= 3)
        return "素材够了，去「背包 / 素材」里可以熔炼试试出限定种子。";
    if (growing > 0)
        return "作物在长，等等就熟，或「出门逛逛」串门/偷菜。";
    return "可以「出门逛逛」、看商店，或上架卖点东西换银币。";
}

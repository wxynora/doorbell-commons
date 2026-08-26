// 核心引擎：惰性生长 + 抽卡收获 + 浇水运气 + 偷菜 + 商店 + 土地升级。
import { Rng } from "./rng.js";
import { rollCrop, rollQuality, cropValue } from "./gacha.js";
import { currentSeason, currentDayIndex } from "./time.js";
import { TICK_MS, SEED_PRICE, NEW_CODEX_REWARD, HARVEST_EVENT_CHANCE, MATERIAL_DROP_CHANCE, MATERIAL_DROP_WEIGHT, POTION_DROP_CHANCE, STEAL_COOLDOWN_MS, STEAL_DAILY_CAP, STEAL_SHIELD_MS, HUMAN_HARVEST_DAILY_CAP, NPC_ID, } from "./config.js";
import { crops, getCrop, animals, animalById, pets, petById, qualities, materials, materialById, specialEvents, cookingIngredients, cookingRecipes, cookingIngredientById, cookingRecipeById, } from "./content.js";
import { onTaskEvent } from "./tasks.js";
import { glimmerBuffMultiplier } from "./glimmer.js";
import { qixi2026HarvestSilver, qixi2026TransferAllowed, recordQixi2026Harvest } from "./qixi-2026.js";
import { pushInbox, pushLog, pushSocialInbox, pushTrail, takeInbox } from "./domain/shared/notifications.js";
import {
    affordablePotions,
    buyItem,
    buyPotionSet,
    buyRecipe,
    circledNum,
    codexCountByCategory,
    collectionPct,
    craft,
    designCrop,
    isLimitedAvailable,
    isStarred,
    limitedShopPool,
    newVarietiesAtTier,
    nextUpgradeReq,
    officialCodexCount,
    plant,
    plantBatch,
    plotRemainMs,
    potionCost,
    potionDailyLeft,
    potionTargets,
    refreshShop,
    shopOffer,
    toggleStar,
    tryWaterReward,
    upgradeLand,
    useItem,
    usePotionBatch,
    usePotionPlots,
    visitorWater,
    water,
    waterAll,
} from "./domain/field/index.js";
import { addCodex } from "./domain/field/codex.js";
import {
    activeCookingDebuff,
    cookingDebuffReason,
    cookingDebuffStatusText,
    dishSystemRecycleSilver,
    kitchenBuy,
    kitchenCook,
    kitchenCookKnownRecipe,
    kitchenSell,
    kitchenSellMany,
    kitchenSellSelected,
    kitchenUse,
    kitchenView,
    normalizeDishPricing,
    refreshKitchenIngredients,
    refreshKitchenShop,
} from "./domain/kitchen/index.js";
import { takeKitchenDish as takeDish } from "./domain/kitchen/selection.js";
import {
    RANCH_RAID_DAILY_CAP,
    animalRoamLine,
    animalUpgradeCost,
    buyPatrolGoose,
    catchRanchRaid,
    decorLines,
    dispatchRanchRaid,
    farmSendRanch,
    petBuffs,
    petRoamLine,
    ranchAnimalCurrentProduceValue,
    ranchBuyAccessory,
    ranchBuyDecoration,
    ranchCollect,
    ranchFeedAnimal,
    ranchNameAnimal,
    ranchNamePatrolGoose,
    ranchNamePet,
    ranchPlaceDecoration,
    ranchRaidCoins,
    ranchRaidDebtTotal,
    ranchRaidForAnimal,
    ranchRemit,
    ranchRoamLine,
    ranchTakeOffAccessory,
    ranchTogglePin,
    ranchUnplaceDecoration,
    ranchUpgradeAnimal,
    ranchWearAccessory,
    refreshRanchShop,
    settleRanchRaids,
} from "./domain/ranch/index.js";
import { ensureKitchen, ensureRanch } from "./domain/ranch/state.js";
import { pushRanchNotice, takeRanchNotices } from "./domain/ranch/notices.js";
import { advanceRanch } from "./domain/ranch/progression.js";
import { aiDisplay, humanDisplay } from "./domain/ranch/display.js";
import { pushLedger } from "./domain/ranch/ledger.js";
import { randomUUID } from "node:crypto";
export { pushInbox, pushLog, pushSocialInbox, pushTrail, takeInbox } from "./domain/shared/notifications.js";
export {
    affordablePotions,
    buyItem,
    buyPotionSet,
    buyRecipe,
    circledNum,
    codexCountByCategory,
    collectionPct,
    craft,
    designCrop,
    isLimitedAvailable,
    isStarred,
    limitedShopPool,
    newVarietiesAtTier,
    nextUpgradeReq,
    officialCodexCount,
    plant,
    plantBatch,
    plotRemainMs,
    potionCost,
    potionDailyLeft,
    potionTargets,
    refreshShop,
    shopOffer,
    toggleStar,
    tryWaterReward,
    upgradeLand,
    useItem,
    usePotionBatch,
    usePotionPlots,
    visitorWater,
    water,
    waterAll,
};
export {
    activeCookingDebuff,
    cookingDebuffReason,
    cookingDebuffStatusText,
    dishSystemRecycleSilver,
    kitchenBuy,
    kitchenCook,
    kitchenCookKnownRecipe,
    kitchenSell,
    kitchenSellMany,
    kitchenSellSelected,
    kitchenUse,
    kitchenView,
    normalizeDishPricing,
    refreshKitchenIngredients,
    refreshKitchenShop,
};
export {
    RANCH_RAID_DAILY_CAP,
    animalRoamLine,
    animalUpgradeCost,
    buyPatrolGoose,
    catchRanchRaid,
    decorLines,
    dispatchRanchRaid,
    ensureKitchen,
    ensureRanch,
    farmSendRanch,
    petBuffs,
    petRoamLine,
    pushRanchNotice,
    ranchAnimalCurrentProduceValue,
    ranchBuyAccessory,
    ranchBuyDecoration,
    ranchCollect,
    ranchFeedAnimal,
    ranchNameAnimal,
    ranchNamePatrolGoose,
    ranchNamePet,
    ranchPlaceDecoration,
    ranchRaidCoins,
    ranchRaidDebtTotal,
    ranchRaidForAnimal,
    ranchRemit,
    ranchRoamLine,
    ranchTakeOffAccessory,
    ranchTogglePin,
    ranchUnplaceDecoration,
    ranchUpgradeAnimal,
    ranchWearAccessory,
    refreshRanchShop,
    settleRanchRaids,
    takeRanchNotices,
};
/** 取（必要时补发）人类前端钥匙。老农场没有就现生成一把；调用方负责 save()。 */
export function ensureHumanKey(farm) {
    if (!farm.humanKey)
        farm.humanKey = randomUUID().replace(/-/g, "");
    return farm.humanKey;
}
// —— 惰性结算（纯时间生长，无缺水停滞）——
export function advance(farm, now) {
    const elapsed = Math.floor((now - farm.lastTickAt) / TICK_MS);
    if (elapsed <= 0)
        return 0;
    for (const p of farm.plots) {
        if (p.crop && !p.crop.ripe) {
            p.crop.progress = Math.min(p.crop.growTicks, p.crop.progress + elapsed);
            if (p.crop.progress >= p.crop.growTicks)
                p.crop.ripe = true;
        }
    }
    advanceRanch(farm, elapsed);
    farm.lastTickAt += elapsed * TICK_MS;
    return elapsed;
}
// —— 揭晓 roll（收获/偷菜共用）——
function reveal(farm, plot, now) {
    const rng = new Rng(farm.rngState);
    const c = plot.crop;
    let crop;
    if (c.seedType === "limited") {
        const planted = getCrop(c.limitedId);
        if (!planted)
            return { ok: false, error: "这块地里的作物数据已失效，无法揭晓" };
        crop = planted;
    }
    else
        crop = rollCrop(rng, c.seedType, farm.landTier, c.waterCount, currentSeason(now).name);
    const { quality } = rollQuality(rng);
    farm.rngState = rng.state;
    return { ok: true, crop, quality, value: cropValue(crop, quality) };
}
function qualityTierFromName(name) {
    if (name.includes("优"))
        return 3; // "优品" ≈ 良品
    return qualities.find((q) => q.name === name)?.tier ?? 3;
}
function pickMaterial(rng) {
    return materials[rng.weighted(materials.map((m) => MATERIAL_DROP_WEIGHT[m.rarity] ?? 1))];
}
function ripenAdjacent(farm, exclude, n) {
    let c = 0;
    for (const p of farm.plots) {
        if (c >= n)
            break;
        if (p === exclude || !p.crop || p.crop.ripe)
            continue;
        p.crop.ripe = true;
        p.crop.progress = p.crop.growTicks;
        c++;
    }
    return c;
}
function rollBonusEvent(rng) {
    if (rng.next() >= HARVEST_EVENT_CHANCE)
        return null;
    const ev = specialEvents.bonus;
    return ev.length ? ev[rng.weighted(ev.map((e) => e.weight))] : null;
}
// 季节收获事件:这批是否还能吃到效果(带计数上限的如知时雨/蜂媒最多 6 株)
const seasonApplies = (mod) => !!mod && (!mod.capLeft || mod.capLeft.n > 0);
const qualityByTier = (t) => qualities.find((q) => q.tier === t);
// —— 收获 ——
// seasonMod：季节「收获型」事件的本批修正（rollSeasonHarvest 给的）；非空即触发了季节事件 → 抑制原有收获奖励事件（互斥）。
export function harvest(farm, plotId, now, seasonMod) {
    const plot = farm.plots.find((p) => p.id === plotId);
    if (!plot || !plot.crop)
        return { ok: false, error: `${plotId} 号地没有作物` };
    if (!plot.crop.ripe)
        return { ok: false, error: "作物还没成熟" };
    const rng = new Rng(farm.rngState);
    const c = plot.crop;
    const buffs = petBuffs(farm); // 招财猫：稀有运气 + 掉落倍率（温和）
    const apply = seasonApplies(seasonMod); // 这一株是否吃季节效果（受 capLeft 限）
    const seasonLuck = apply && seasonMod.type === "rare_luck" ? (seasonMod.value ?? 0) : 0; // 蜂媒：roll 前抬运气
    const crop = c.seedType === "limited" ? getCrop(c.limitedId) : rollCrop(rng, c.seedType, farm.landTier, c.waterCount, currentSeason(now).name, buffs.luck + seasonLuck);
    let quality = rollQuality(rng).quality;
    // 季节品相覆盖（萤照=极品/骄阳=最低/虫客=降档）
    if (apply) {
        if (seasonMod.type === "quality_top")
            quality = qualityByTier(4) ?? quality; // 极品
        else if (seasonMod.type === "quality_min")
            quality = qualityByTier(1) ?? quality; // 袖珍
        else if (seasonMod.type === "quality_down")
            quality = qualityByTier(Math.max(1, quality.tier - (seasonMod.value ?? 1))) ?? quality;
    }
    // 奖励事件（季节事件触发时抑制，互斥）
    const ev = seasonMod ? null : rollBonusEvent(rng);
    let bonus = null;
    if (ev) {
        if (ev.effectType === "品相保底") {
            const t = qualityTierFromName(ev.param);
            if (quality.tier < t)
                quality = qualities.find((q) => q.tier === t) ?? quality;
        }
        const extraCoins = ev.effectType === "额外金币" ? Number(ev.param) || 0 : 0;
        const ripened = ev.effectType === "连收" ? ripenAdjacent(farm, plot, Number(ev.param) || 0) : 0;
        bonus = { name: ev.name, text: ev.text, effectType: ev.effectType, extraCoins, ripened };
    }
    const qixiSilver = qixi2026HarvestSilver(crop, quality);
    if (qixiSilver !== null && bonus?.effectType === "倍率")
        bonus = null; // 七夕作物只按审定的基础银币与品相倍率结算，不展示未生效的金币价值倍率事件
    let value = qixiSilver ?? cropValue(crop, quality);
    if (qixiSilver === null) {
        if (ev?.effectType === "倍率")
            value = Math.round(value * (Number(ev.param) || 1));
        if (apply && seasonMod.type === "value_mult")
            value = Math.round(value * (seasonMod.value ?? 1)); // 知时雨/雪被：本批价值×2
        value = Math.round(value * glimmerBuffMultiplier("cropValue", now));
    }
    if (apply && seasonMod.capLeft)
        seasonMod.capLeft.n -= 1; // 吃掉一株名额
    if (qixiSilver === null)
        farm.coins += value;
    else
        farm.silver += value;
    if (bonus?.extraCoins)
        farm.coins += bonus.extraCoins;
    // 素材掉落（攒来熔炼限定种子；招财猫把概率温和拉高）
    let drop = null;
    if (rng.next() < MATERIAL_DROP_CHANCE * buffs.dropMult) {
        const m = pickMaterial(rng);
        farm.materials[m.id] = (farm.materials[m.id] ?? 0) + 1;
        drop = { id: m.id, name: m.name, rarity: m.rarity, desc: m.desc };
    }
    // 加速药水掉落（副产品，缓解后期药水开销；招财猫同样温和拉高）
    const potionDrop = rng.next() < POTION_DROP_CHANCE * buffs.dropMult;
    if (potionDrop)
        farm.items.speed_potion = (farm.items.speed_potion ?? 0) + 1;
    farm.rngState = rng.state;
    // 新图鉴奖励
    const isNew = addCodex(farm, crop.id, quality.tier, now);
    // 自创作物不给图鉴金币奖励（自创重在收集，不作金钱来源）
    const codexReward = isNew && crop.category !== "ugc" ? NEW_CODEX_REWARD[crop.rarity] ?? 0 : 0;
    if (codexReward)
        farm.coins += codexReward;
    plot.crop = null;
    farm.harvested = (farm.harvested ?? 0) + 1; // 勤劳榜累计
    const qixiEvents = recordQixi2026Harvest(farm, crop, c.seedType, now);
    onTaskEvent(farm, "harvest", now, { rarity: crop.rarity, isNew, isUgc: crop.category === "ugc" }); // 随机任务：收获N株R/SR/收新图鉴
    pushLog(farm, `收获 ${crop.name}（${quality.name}），+${value}${qixiSilver === null ? "金" : "银"}${drop ? ` 掉素材[${drop.name}]` : ""}${potionDrop ? " 掉药水" : ""}`);
    return { ok: true, crop, quality, value, currency: qixiSilver === null ? "gold" : "silver", isNew, codexReward, bonus, drop, potionDrop, qixi: qixiEvents.find((event) => event.completed) };
}
/** 人类当天还可替自己的 AI 执行几次一键收获；所有每日限制统一按 UTC+8 零点换日。 */
export function humanHarvestLeft(farm, now) {
    const day = currentDayIndex(now);
    const used = farm.humanHarvestDaily?.day === day ? farm.humanHarvestDaily.n ?? 0 : 0;
    return Math.max(0, HUMAN_HARVEST_DAILY_CAP - used);
}
/** humanKey 页面一键收获：当批至少收到一株才计 1 次，没有成熟作物不消耗次数。 */
export function humanHarvestAll(farm, now, seasonMod) {
    const day = currentDayIndex(now);
    const daily = farm.humanHarvestDaily?.day === day
        ? farm.humanHarvestDaily
        : { day, n: 0 };
    if ((daily.n ?? 0) >= HUMAN_HARVEST_DAILY_CAP)
        return { ok: false, error: `今天已经帮 TA 一键收过 ${HUMAN_HARVEST_DAILY_CAP} 次菜了，明天再来吧。` };
    const results = harvestAll(farm, now, seasonMod);
    if (!results.length)
        return { ok: false, error: "现在没有成熟的作物可收。" };
    farm.humanHarvestDaily = daily;
    daily.n = (daily.n ?? 0) + 1;
    return { ok: true, results, count: results.length, used: daily.n, left: Math.max(0, HUMAN_HARVEST_DAILY_CAP - daily.n) };
}
function stealQuota(farm, now) {
    const day = currentDayIndex(now);
    if (!farm.stealQuota || farm.stealQuota.day !== day)
        farm.stealQuota = { day, n: 0 };
    return farm.stealQuota;
}
const fmtStealRemain = (ms) => {
    const min = Math.max(1, Math.ceil(ms / 60000));
    return min >= 60 ? `${Math.ceil(min / 60)}小时` : `${min}分钟`;
};
export function stealAvailability(thief, now) {
    if (!thief)
        return { ok: true, left: STEAL_DAILY_CAP };
    const q = stealQuota(thief, now);
    if ((q.n ?? 0) >= STEAL_DAILY_CAP)
        return { ok: false, reason: `今天已经偷满 ${STEAL_DAILY_CAP} 次了，明天再出门吧。` };
    const leftMs = q.lastAt ? q.lastAt + STEAL_COOLDOWN_MS - now : 0;
    if (leftMs > 0)
        return { ok: false, reason: `刚偷过菜，先歇一会儿，约 ${fmtStealRemain(leftMs)} 后再来。` };
    return { ok: true, left: STEAL_DAILY_CAP - (q.n ?? 0) };
}
export function canStealNow(thief, now) {
    return stealAvailability(thief, now).ok;
}
/** 放偷冷却：本农场被偷一次后 30 分钟内谁都偷不了；返回剩余毫秒（0=没保护/已过期）。 */
export function stealShieldRemain(victim, now) {
    return Math.max(0, (victim.stealShieldUntil ?? 0) - now);
}
/** 这株是不是原创(ugc)作物——原创受保护、禁止偷，只能去集市买种子自己种。 */
export function isUgcCrop(crop) {
    return !!crop && crop.seedType === "limited" && !!crop.limitedId && getCrop(crop.limitedId)?.category === "ugc";
}
function recordStealAttempt(thief, now) {
    if (!thief)
        return;
    const q = stealQuota(thief, now);
    q.n = (q.n ?? 0) + 1;
    q.lastAt = now;
}
// —— 偷菜（访客；继承该株浇水运气；每次后 1 小时冷却、每天最多 10 次；得金币+图鉴）——
export function steal(victim, plotId, by, now, thief, options = {}) {
    if (victim.id === by)
        return { ok: false, error: "不能偷自己的菜；收自己地里的作物请用 harvest" };
    if (!options.resumeGuard && thief)
        delete ensureKitchen(thief).pendingGuard;
    if (!options.resumeGuard) {
        const avail = stealAvailability(thief, now);
        if (!avail.ok)
            return { ok: false, error: avail.reason };
    }
    // 同一家每天只能被同一小偷偷 1 次（被看家狗吓退也算用掉机会）；该限制不消耗小偷的全局每日次数。
    const lastHit = victim.stealCooldowns[by];
    if (!options.resumeGuard && lastHit !== undefined && currentDayIndex(lastHit) === currentDayIndex(now))
        return { ok: false, error: "今天已经偷过这家了，明天再来（同一家每天只能偷一次）" };
    // 放偷冷却：这家刚被偷过，30 分钟内谁都下不了手
    const shieldMs = stealShieldRemain(victim, now);
    if (shieldMs > 0)
        return { ok: false, error: `这家刚被偷过还在防备，约 ${fmtStealRemain(shieldMs)} 后才能再下手。` };
    const plot = victim.plots.find((p) => p.id === plotId);
    if (!plot || !plot.crop)
        return { ok: false, error: `${plotId} 号地没有作物，晚了一步` };
    if (!plot.crop.ripe)
        return { ok: false, error: "作物还没成熟，偷不了" };
    // 原创作物受保护：不能偷，只能去集市买种子自己种（不消耗小偷的机会/冷却，直接挡回）
    if (isUgcCrop(plot.crop))
        return { ok: false, error: "这是别人的原创作物，受保护偷不了——想要就去集市买它的种子自己种。" };
    // 看家狗：概率把小偷吓退（被吓退也算用掉小偷今天对这家的机会——狗真的护住了这块地）
    const foil = petBuffs(victim, now).foil;
    if (!options.resumeGuard && foil > 0) {
        const disliked = activeCookingDebuff(thief, now)?.kind === "dog_disliked";
        const grng = disliked ? null : new Rng(victim.rngState);
        const foiled = disliked || grng.next() < foil;
        if (grng)
            victim.rngState = grng.state;
        if (foiled) {
            const guard = (victim.ranch?.pets ?? []).map((p) => ({ p, k: petById.get(p.kindId) })).find((x) => x.k?.buff === "guard");
            const dogName = guard ? (guard.p.name || guard.k.name) : "看家狗";
            recordStealAttempt(thief, now);
            victim.stealCooldowns[by] = now;
            if (thief) {
                const kitchen = ensureKitchen(thief);
                kitchen.pendingGuard = { victimId: victim.id, plotId, by, at: now };
            }
            pushLog(victim, `🐶 ${by} 想偷 ${plotId} 号地，被${dogName}一通狂吠吓跑了！`);
            pushTrail(victim, { t: now, kind: "foiled", by: thief?.name ?? by, plotId }); // 足迹：谁来偷被狗吓退
            return { ok: false, guardBlocked: true, dogName, error: `刚摸到 ${plotId} 号地，${dogName}就冲出来狂吠，你只好空手溜走。` };
        }
    }
    const revealed = reveal(victim, plot, now);
    if (!revealed.ok)
        return revealed;
    const { crop, quality, value } = revealed;
    // 被偷方返还种子费的一半（小补偿；按下种时的种子价：普通/奇幻按 SEED_PRICE，限定按作物 seedPrice）
    const seedCost = plot.crop.seedType === "limited" ? (getCrop(plot.crop.limitedId)?.seedPrice ?? 0) : (SEED_PRICE[plot.crop.seedType] ?? 0);
    const refund = Math.round(seedCost * 0.5);
    if (refund > 0)
        victim.coins += refund;
    plot.crop = null;
    if (!options.resumeGuard)
        recordStealAttempt(thief, now);
    victim.stealCooldowns[by] = now;
    if (victim.id !== NPC_ID)
        victim.stealShieldUntil = now + STEAL_SHIELD_MS; // 放偷冷却：这家 30 分钟内谁都偷不了（阿土是常驻练手靶，豁免）
    victim.gotStolen = (victim.gotStolen ?? 0) + 1; // 倒霉称号累计
    pushTrail(victim, { t: now, kind: "stolen", by: thief?.name ?? by, plotId, crop: crop.name }); // 足迹：谁偷走了什么
    onTaskEvent(victim, "got_stolen", now); // 随机任务：被偷一次菜
    pushLog(victim, `⚠️ ${by} 偷走了 ${plotId} 号地的 ${crop.name}！${refund > 0 ? `（返还种子费一半 +${refund}金）` : ""}`);
    let isNewForThief = false;
    let codexReward = 0;
    if (thief) {
        thief.coins += value;
        thief.stolen = (thief.stolen ?? 0) + 1; // 大盗榜累计
        isNewForThief = addCodex(thief, crop.id, quality.tier, now);
        if (isNewForThief && crop.category !== "ugc") {
            codexReward = NEW_CODEX_REWARD[crop.rarity] ?? 0;
            thief.coins += codexReward;
        }
        onTaskEvent(thief, "steal", now); // 随机任务：偷一次菜得手
        pushLog(thief, `从「${victim.name}」偷到 ${crop.name}，+${value}${codexReward ? ` 新图鉴+${codexReward}` : ""}`);
    }
    return { ok: true, crop, quality, value, isNewForThief, codexReward };
}
// —— 牧场（人机互动 2.0）：AI 图鉴解锁动物→上架自家商店→买给伴侣；伴侣在人类前端养/收/卖/回传 ——
/** 某动物是否已被 AI 的图鉴进度解锁（人能买的动物档位被机的图鉴收集总数卡着）。 */
export function animalUnlocked(farm, kind) {
    return officialCodexCount(farm) >= kind.unlockCodex;
}
/** 当前已解锁、会自动上架 AI 商店的动物（按解锁门槛排序）。 */
export function shopAnimals(farm) {
    return animals.filter((a) => animalUnlocked(farm, a)).sort((a, b) => a.unlockCodex - b.unlockCodex);
}
/** 还没解锁的下一只动物（给"再集 N 种图鉴解锁 X"的提示）。 */
export function nextLockedAnimal(farm) {
    return animals.filter((a) => !animalUnlocked(farm, a)).sort((a, b) => a.unlockCodex - b.unlockCodex)[0] ?? null;
}
const HUMAN_BARTER_KINDS = new Set(["seed", "material", "ingredient", "dish"]);
function humanBarterDefinition(kindRaw, idRaw) {
    const kind = String(kindRaw ?? "");
    const key = String(idRaw ?? "").trim();
    if (!HUMAN_BARTER_KINDS.has(kind))
        return null;
    if (kind === "material") {
        const item = materialById.get(key) ?? materials.find((entry) => entry.name === key);
        return item ? { kind, id: item.id, name: item.name } : null;
    }
    if (kind === "seed") {
        const item = getCrop(key) ?? crops.find((entry) => entry.name === key);
        return item && ["limited", "ugc"].includes(item.category) ? { kind, id: item.id, name: item.name } : null;
    }
    if (kind === "ingredient") {
        const item = cookingIngredientById.get(key) ?? cookingIngredients.find((entry) => entry.name === key);
        return item ? { kind, id: item.id, name: item.name } : null;
    }
    const item = cookingRecipeById.get(key) ?? cookingRecipes.find((entry) => entry.name === key);
    return item ? { kind, id: item.id, name: item.name } : null;
}
function humanBarterQty(raw) {
    const qty = Number(raw);
    return Number.isSafeInteger(qty) && qty > 0 ? qty : null;
}
function humanBarterStockSelection(farm, def, qty) {
    if (def.kind === "dish") {
        const dishes = ensureKitchen(farm).dishes.filter((dish) => dish.recipeId === def.id && dish.recipeId !== "odd_dish").slice(0, qty);
        return dishes.length >= qty
            ? { ok: true, dishes }
            : { ok: false, error: `「${def.name}」只有 ${dishes.length} 份，不够 ${qty} 份。` };
    }
    const stock = def.kind === "material"
        ? farm.materials
        : def.kind === "seed"
            ? farm.seeds
            : ensureKitchen(farm).ingredients;
    const available = stock[def.id] ?? 0;
    return available >= qty
        ? { ok: true, dishes: [] }
        : { ok: false, error: `「${def.name}」只有 ${available} 份，不够 ${qty} 份。` };
}
function humanBarterRemoveStock(farm, def, qty, selection) {
    if (def.kind === "dish") {
        const ids = new Set(selection.dishes.map((dish) => dish.id));
        ensureKitchen(farm).dishes = ensureKitchen(farm).dishes.filter((dish) => !ids.has(dish.id));
        return;
    }
    const stock = def.kind === "material"
        ? farm.materials
        : def.kind === "seed"
            ? farm.seeds
            : ensureKitchen(farm).ingredients;
    stock[def.id] -= qty;
    if (stock[def.id] <= 0)
        delete stock[def.id];
}
function humanBarterAddStock(farm, def, qty, dishes = []) {
    if (def.kind === "dish") {
        ensureKitchen(farm).dishes.push(...dishes.map((dish) => structuredClone(dish)));
        return;
    }
    const stock = def.kind === "material"
        ? farm.materials
        : def.kind === "seed"
            ? farm.seeds
            : ensureKitchen(farm).ingredients;
    stock[def.id] = (stock[def.id] ?? 0) + qty;
}
export function humanBarterItemName(kind, id) {
    return humanBarterDefinition(kind, id)?.name ?? String(id ?? "");
}
export function humanBarterInventoryCount(farm, kind, id) {
    const def = humanBarterDefinition(kind, id);
    if (!def)
        return 0;
    if (def.kind === "dish")
        return ensureKitchen(farm).dishes.filter((dish) => dish.recipeId === def.id && dish.recipeId !== "odd_dish").length;
    const stock = def.kind === "material"
        ? farm.materials
        : def.kind === "seed"
            ? farm.seeds
            : ensureKitchen(farm).ingredients;
    return stock[def.id] ?? 0;
}
export function humanBarterInventory(farm) {
    const kitchen = ensureKitchen(farm);
    const rows = [];
    for (const [id, qty] of Object.entries(farm.seeds ?? {})) {
        const def = humanBarterDefinition("seed", id);
        if (def && qty > 0)
            rows.push({ ...def, qty });
    }
    for (const [id, qty] of Object.entries(farm.materials ?? {})) {
        const def = humanBarterDefinition("material", id);
        if (def && qty > 0)
            rows.push({ ...def, qty });
    }
    for (const [id, qty] of Object.entries(kitchen.ingredients)) {
        const def = humanBarterDefinition("ingredient", id);
        if (def && qty > 0)
            rows.push({ ...def, qty });
    }
    const dishCounts = new Map();
    for (const dish of kitchen.dishes) {
        if (dish.recipeId === "odd_dish")
            continue;
        dishCounts.set(dish.recipeId, (dishCounts.get(dish.recipeId) ?? 0) + 1);
    }
    for (const [id, qty] of dishCounts) {
        const def = humanBarterDefinition("dish", id);
        if (def)
            rows.push({ ...def, qty });
    }
    return rows;
}
export function humanBarterListings(farm) {
    return Array.isArray(farm.humanBarters) ? farm.humanBarters : [];
}
/** 人类集市上架一整单换物；物品先从小机库存移入订单，避免重复使用。 */
export function humanBarterList(farm, giveKind, giveId, giveQtyRaw, wantKind, wantId, wantQtyRaw, now) {
    const give = humanBarterDefinition(giveKind, giveId);
    const want = humanBarterDefinition(wantKind, wantId);
    const giveQty = humanBarterQty(giveQtyRaw);
    const wantQty = humanBarterQty(wantQtyRaw);
    if (!give || !want)
        return { ok: false, error: "请选择可以交换的种子、素材、商店食材或正常料理。" };
    if (!giveQty || !wantQty)
        return { ok: false, error: "拿出数量和想换数量都要填写正整数。" };
    if (give.kind === want.kind && give.id === want.id)
        return { ok: false, error: "拿同一种东西换自己没有意义，换个目标吧。" };
    const selected = humanBarterStockSelection(farm, give, giveQty);
    if (!selected.ok)
        return selected;
    humanBarterRemoveStock(farm, give, giveQty, selected);
    const listing = {
        id: randomUUID(),
        give: { ...give, qty: giveQty, ...(give.kind === "dish" ? { dishes: selected.dishes.map((dish) => structuredClone(dish)) } : {}) },
        want: { ...want, qty: wantQty },
        listedAt: now,
    };
    (farm.humanBarters ??= []).push(listing);
    return { ok: true, listing, give, giveQty, want, wantQty };
}
export function humanBarterUnlist(farm, listingId) {
    const listings = humanBarterListings(farm);
    const listing = listings.find((entry) => entry.id === String(listingId));
    if (!listing)
        return { ok: false, error: "这张换物单已经不存在了。" };
    const give = humanBarterDefinition(listing.give?.kind, listing.give?.id);
    const giveQty = humanBarterQty(listing.give?.qty);
    const dishes = Array.isArray(listing.give?.dishes) ? listing.give.dishes : [];
    if (!give || !giveQty || (give.kind === "dish" && dishes.length !== giveQty))
        return { ok: false, error: "这张换物单的数据不完整，暂时不能下架。" };
    humanBarterAddStock(farm, give, giveQty, dishes);
    farm.humanBarters = listings.filter((entry) => entry !== listing);
    return { ok: true, give, giveQty };
}
/** 人类之间接受一张整单换物；先完整校验双方，再一次性互换。 */
export function humanBarterAccept(seller, buyer, listingId, now = Date.now()) {
    if (seller.id === buyer.id)
        return { ok: false, error: "不能接受自己挂出的换物单；不想换了可以直接下架。" };
    const listings = humanBarterListings(seller);
    const listing = listings.find((entry) => entry.id === String(listingId));
    if (!listing)
        return { ok: false, error: "这张换物单已经被换走或下架了。" };
    const give = humanBarterDefinition(listing.give?.kind, listing.give?.id);
    const want = humanBarterDefinition(listing.want?.kind, listing.want?.id);
    const giveQty = humanBarterQty(listing.give?.qty);
    const wantQty = humanBarterQty(listing.want?.qty);
    const giveDishes = Array.isArray(listing.give?.dishes) ? listing.give.dishes : [];
    if (!give || !want || !giveQty || !wantQty || (give.kind === "dish" && giveDishes.length !== giveQty))
        return { ok: false, error: "这张换物单的数据不完整，暂时不能交换。" };
    if ((give.kind === "seed" && !qixi2026TransferAllowed(buyer, give.id, now))
        || (want.kind === "seed" && !qixi2026TransferAllowed(seller, want.id, now)))
        return { ok: false, error: "完成对应七夕任务后解锁。" };
    const payment = humanBarterStockSelection(buyer, want, wantQty);
    if (!payment.ok)
        return payment;
    humanBarterRemoveStock(buyer, want, wantQty, payment);
    humanBarterAddStock(seller, want, wantQty, payment.dishes);
    humanBarterAddStock(buyer, give, giveQty, giveDishes);
    seller.humanBarters = listings.filter((entry) => entry !== listing);
    return { ok: true, give, giveQty, want, wantQty };
}
/** 看家狗已拦住的同一次偷菜，用一份正常料理续上；不会再记次数或冷却。 */
export function bribeGuardDog(thief, victim, dishId, now) {
    const kitchen = ensureKitchen(thief);
    const pending = kitchen.pendingGuard;
    if (!pending || pending.victimId !== victim.id || currentDayIndex(pending.at) !== currentDayIndex(now)) {
        delete kitchen.pendingGuard;
        return { ok: false, error: "现在没有这家的看家狗拦截可继续。" };
    }
    const selector = String(dishId);
    const dish = kitchen.dishes.find((item) => item.id === selector)
        ?? kitchen.dishes.find((item) => item.recipeId === selector || item.name === selector);
    if (!dish)
        return { ok: false, error: "料理柜里没有这份料理。" };
    if (dish.recipeId === "odd_dish")
        return { ok: false, error: "微妙的料理连狗都不收，不能拿来贿赂。" };
    const result = steal(victim, pending.plotId, pending.by, now, thief, { resumeGuard: true });
    delete kitchen.pendingGuard;
    if (!result.ok)
        return { ...result, dishKept: true };
    takeDish(kitchen, dish.id);
    return { ...result, bribed: true, dishName: dish.name };
}
/** AI 买一只已解锁的动物送给伴侣（花 farm.coins，动物进牧场；这是机→人的"金币互传往来"）。 */
export function buyAnimalForPartner(farm, id, now) {
    const kind = animalById.get(String(id));
    if (!kind)
        return { ok: false, error: `没有这种动物：${id}（看商店里已解锁的动物）` };
    if (!animalUnlocked(farm, kind))
        return { ok: false, error: `${kind.name}还没解锁——${kind.unlockCond ?? `图鉴集齐 ${kind.unlockCodex} 种`}（你现在 ${officialCodexCount(farm)} 种）` };
    if (farm.ranch?.animals.some((a) => a.kindId === kind.id))
        return { ok: false, error: `${kind.name}已送养过，不再上架。` };
    if (farm.coins < kind.buyCost)
        return { ok: false, error: `金币不足，${kind.name}要 ${kind.buyCost} 金（你有 ${farm.coins}）` };
    farm.coins -= kind.buyCost;
    const ranch = ensureRanch(farm);
    ranch.animals.push({ kindId: kind.id, ticksSinceProduce: 0, pending: 0, level: 1 });
    pushLedger(farm, "buy-animal", kind.buyCost, `买下${kind.name}送进牧场`, now);
    pushLog(farm, `给伴侣买了一只${kind.name}（-${kind.buyCost}）`);
    return { ok: true, name: kind.name, cost: kind.buyCost };
}
// —— 宠物（AI 买、归伴侣养：和动物一样进牧场、能穿衣服，但不产出、可被伴侣改名，给农场一份温和 buff）——
/** 某宠物是否已被 AI 图鉴进度解锁（门槛同动物，靠 unlockCodex）。 */
export function petUnlocked(farm, kind) {
    return officialCodexCount(farm) >= kind.unlockCodex;
}
/** 当前已解锁、会上架商店的宠物。 */
export function shopPets(farm) {
    return pets.filter((p) => petUnlocked(farm, p)).sort((a, b) => a.unlockCodex - b.unlockCodex);
}
/** 还没解锁的下一只宠物（给"再集 N 种图鉴解锁 X"提示）。 */
export function nextLockedPet(farm) {
    return pets.filter((p) => !petUnlocked(farm, p)).sort((a, b) => a.unlockCodex - b.unlockCodex)[0] ?? null;
}
/** AI 买一只已解锁的宠物送给伴侣（花 farm.coins，宠物进牧场；每种限 1 只）。 */
export function buyPetForPartner(farm, id, now) {
    const kind = petById.get(String(id));
    if (!kind)
        return { ok: false, error: `没有这种宠物：${id}（看商店里已解锁的宠物）` };
    if (!petUnlocked(farm, kind))
        return { ok: false, error: `${kind.name}还没解锁——${kind.unlockCond ?? `图鉴集齐 ${kind.unlockCodex} 种`}（你现在 ${officialCodexCount(farm)} 种）` };
    const ranch = ensureRanch(farm);
    if ((ranch.pets ?? []).some((p) => p.kindId === kind.id))
        return { ok: false, error: `${kind.name}已送养过，不再上架。` };
    if (farm.coins < kind.buyCost)
        return { ok: false, error: `金币不足，${kind.name}要 ${kind.buyCost} 金（你有 ${farm.coins}）` };
    farm.coins -= kind.buyCost;
    (ranch.pets ??= []).push({ kindId: kind.id });
    pushLedger(farm, "buy-pet", kind.buyCost, `买下${kind.name}送进牧场`, now);
    pushLog(farm, `给伴侣买了一只${kind.name}（-${kind.buyCost}）`);
    return { ok: true, name: kind.name, cost: kind.buyCost };
}
/** 收所有成熟的地（seasonMod=季节收获事件的本批修正，传同一个对象让 capLeft 跨株累计消费）*/
export function harvestAll(farm, now, seasonMod) {
    const results = [];
    for (const p of farm.plots) {
        if (p.crop?.ripe) {
            const r = harvest(farm, p.id, now, seasonMod);
            if (r.ok)
                results.push(r);
        }
    }
    return results;
}
//# sourceMappingURL=engine.js.map

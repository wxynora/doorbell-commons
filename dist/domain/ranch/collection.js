import { randomUUID } from "node:crypto";
import { Rng } from "../../rng.js";
import { currentDayIndex } from "../../time.js";
import {
    RANCH_ANIMAL_MAX_LEVEL,
    RANCH_FEED_BONUS_RATE,
    RANCH_POTION_DAILY_CAP,
    RANCH_POTION_DROP_CHANCE,
} from "../../config.js";
import { animalById, cooking, cookingProductById } from "../../content.js";
import { humanDisplay, aiDisplay } from "./display.js";
import { pushLedger } from "./ledger.js";
import { creditRanchHarvestAfterDebts, ranchRaidDebtTotal } from "./raids.js";
import { ensureKitchen } from "./state.js";
import { animalUpgradeCost, ranchAnimalCurrentProduceValue } from "./value.js";

/** 伴侣收牧场产品：欠款存在时按动物稳定顺序整份回收还债；可烹饪产物锁价入柜，其余当场回收为牧场金币。 */
export function ranchCollect(farm, farms, now) {
    const ranch = farm.ranch;
    if (!ranch || !ranch.animals.length)
        return { ok: false, error: `牧场还没有动物——让${aiDisplay(farm)}在商店买一只送进来。` };
    const kitchen = ensureKitchen(farm);
    let gross = 0;
    let gain = 0;
    let debtPaid = 0;
    let storedCount = 0;
    let nonCookableCount = 0;
    let nonCookableGain = 0;
    const autoRecycled = [];
    const nonCookableDetail = {};
    const detail = {};
    const receive = (item) => {
        gross += item.value;
        detail[item.name] = (detail[item.name] ?? 0) + 1;
        if (ranchRaidDebtTotal(farm) > 0) {
            const credited = creditRanchHarvestAfterDebts(farm, farms, item.value);
            gain += credited.gain;
            debtPaid += credited.debtPaid;
            autoRecycled.push(item);
        }
        else if (!cookingProductById.get(item.itemId)?.cookable) {
            ranch.coins += item.value;
            nonCookableCount += 1;
            nonCookableGain += item.value;
            nonCookableDetail[item.name] = (nonCookableDetail[item.name] ?? 0) + 1;
        }
        else {
            kitchen.products.push(item);
            storedCount += 1;
        }
    };
    for (const a of ranch.animals) {
        const kind = animalById.get(a.kindId);
        if (!kind)
            continue;
        const pending = Math.max(0, Math.floor(Number(a.pending) || 0));
        if (pending > 0) {
            const def = cookingProductById.get(kind.produceId);
            const base = ranchAnimalCurrentProduceValue(a);
            for (let i = 0; i < pending; i++) {
                const value = i === 0 && a.pendingBoost ? Math.round(base * (1 + RANCH_FEED_BONUS_RATE)) : base;
                receive({ id: randomUUID(), itemId: kind.produceId, name: def?.name ?? kind.produce, emoji: def?.emoji ?? kind.emoji, value, createdAt: now });
            }
            a.pending = 0;
            a.pendingBoost = false;
        }
        const pendingMeat = Math.max(0, Math.floor(Number(a.pendingMeat) || 0));
        if (pendingMeat > 0 && kind.meatId) {
            const def = cookingProductById.get(kind.meatId);
            const value = Math.round(ranchAnimalCurrentProduceValue(a) * cooking.meatValueMultiplier);
            for (let i = 0; i < pendingMeat; i++)
                receive({ id: randomUUID(), itemId: kind.meatId, name: def?.name ?? kind.meat, emoji: def?.emoji ?? "🥩", value, createdAt: now });
            a.pendingMeat = 0;
        }
    }
    if (gross <= 0)
        return { ok: false, error: "暂时没有可收的产出，再等等动物攒一攒。" };
    // 掉药水 → AI 仓库（概率 + 每日封顶，防伴侣狂收刷药水）
    let potion = 0;
    const day = currentDayIndex(now);
    const pd = (ranch.potionDrop ??= { day, n: 0 });
    if (pd.day !== day) {
        pd.day = day;
        pd.n = 0;
    }
    if (pd.n < RANCH_POTION_DAILY_CAP) {
        const rng = new Rng(farm.rngState);
        const hit = rng.next() < RANCH_POTION_DROP_CHANCE;
        farm.rngState = rng.state;
        if (hit) {
            potion = 1;
            pd.n += 1;
            farm.items.speed_potion = (farm.items.speed_potion ?? 0) + 1;
            pushLedger(farm, "potion", 1, `${humanDisplay(farm)}收获时掉落，入仓库`, now);
        }
    }
    return { ok: true, gain, gross, debtPaid, detail, potion, storedCount, autoRecycled, nonCookableCount, nonCookableGain, nonCookableDetail };
}

/** 伴侣花牧场金币把某动物升一级（每级每周期多产 1 份，封顶 RANCH_ANIMAL_MAX_LEVEL）。 */
export function ranchUpgradeAnimal(farm, animalIdx) {
    const ranch = farm.ranch;
    if (!ranch || !ranch.animals.length)
        return { ok: false, error: "牧场还没有动物。" };
    const a = ranch.animals[Math.floor(Number(animalIdx))];
    if (!a)
        return { ok: false, error: "选的动物不存在。" };
    const kind = animalById.get(a.kindId);
    if (!kind)
        return { ok: false, error: "未知动物。" };
    const lvl = a.level ?? 1;
    if (lvl >= RANCH_ANIMAL_MAX_LEVEL)
        return { ok: false, error: `${kind.name}已经满级（${RANCH_ANIMAL_MAX_LEVEL} 级）了。` };
    const cost = animalUpgradeCost(kind, lvl);
    if (ranch.coins < cost)
        return { ok: false, error: `牧场金币不足（升到 ${lvl + 1} 级要 ${cost}，现有 ${ranch.coins}）。` };
    ranch.coins -= cost;
    a.level = lvl + 1;
    return { ok: true, name: kind.name, level: a.level, cost };
}

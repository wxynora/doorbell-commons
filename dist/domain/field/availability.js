import { activeFestivals, currentDayIndex, currentHour } from "../../time.js";
import { collectionPct, officialCodexCount } from "./codex.js";
import { nextUpgradeReq } from "./land.js";

/** 按 农场id+日 的确定性 0~1 值（不消耗 rngState；同一天同一农场恒定）。给夜间商店「有概率刷出」用。 */
function dayHash(id, day) {
    let h = (2166136261 ^ day) >>> 0;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}

// —— 限定作物可种判定（公历节日 + 结构化解锁规则 unlockRule；回落老的图鉴%文案）——
export function isLimitedAvailable(crop, farm, now) {
    if (crop.category !== "limited")
        return false;
    if (crop.unlockType === "festival") {
        return activeFestivals(now).some((f) => f.cropId === crop.id);
    }
    // 结构化规则优先（action / 计数类 / 夜间商店）
    const rule = crop.unlockRule;
    if (rule) {
        switch (rule.kind) {
            case "codexCount": return officialCodexCount(farm) >= (rule.n ?? 0);
            case "codexPct": return collectionPct(farm) * 100 >= (rule.n ?? 0);
            case "landMax": return nextUpgradeReq(farm) === null;
            case "nightShop": // 仅 UTC+8 凌晨 0:00–3:59，且当天 roll 命中（整段窗口稳定）
                return currentHour(now) < 4 && dayHash(farm.id, currentDayIndex(now)) < (rule.chance ?? 0.2);
            default: return false;
        }
    }
    // 回落：老的图鉴百分比文案（"N%"）
    if (crop.unlockType === "codex") {
        const m = (crop.unlockCond ?? "").match(/(\d+)\s*%/);
        return m ? collectionPct(farm) * 100 >= +m[1] : false;
    }
    return false;
}

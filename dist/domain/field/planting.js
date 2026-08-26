import { GROW_TICKS, SEED_PRICE, WATER_LUCK_CAP, WATER_LUCK_PER } from "../../config.js";
import { crops, getCrop } from "../../content.js";
import { onTaskEvent } from "../../tasks.js";
import { currentDayIndex } from "../../time.js";
import { canPlantQixi2026Crop } from "../../qixi-2026.js";
import { pushLog, pushTrail } from "../shared/notifications.js";

/** 把"限定/自创种子"的引用解析成作物 id：接受 id 或中文名（背包/熔炼都给中文名，玩家自然照着填）。
 *  重名时优先用玩家背包里已有的那颗；官方限定（条件/金币种）按名字全库找。 */
function resolveLimitedRef(farm, ref) {
    ref = String(ref ?? "").trim();
    if (!ref)
        return undefined;
    const direct = getCrop(ref); // 已经是 id
    if (direct && (direct.category === "limited" || direct.category === "ugc" || (farm.seeds[direct.id] ?? 0) > 0))
        return direct.id;
    for (const id of Object.keys(farm.seeds)) { // 按中文名找背包里有的（含自己设计/熔炼/买来的）
        const c = getCrop(id);
        if (c && c.name === ref && (c.category === "limited" || c.category === "ugc" || (farm.seeds[id] ?? 0) > 0))
            return id;
    }
    return crops.find((c) => c.category === "limited" && c.name === ref)?.id; // 官方限定按名字全库找
}

// —— 播种 ——
export function plant(farm, plotId, seedType, limitedId, now) {
    const plot = farm.plots.find((p) => p.id === plotId);
    if (!plot)
        return { ok: false, error: `没有 ${plotId} 号地` };
    if (plot.crop)
        return { ok: false, error: `${plotId} 号地已经种着东西了` };
    // 防作弊：seedType 只能是这三种——非法值会让 SEED_PRICE[x]=undefined，把 coins 算成 NaN（之后任何价格判定都失效）
    if (seedType !== "common" && seedType !== "fantasy" && seedType !== "limited")
        return { ok: false, error: "种子类型只能是 common / fantasy / limited" };
    if (seedType === "limited") {
        const resolved = resolveLimitedRef(farm, String(limitedId ?? "")); // 兼容 id 和中文名
        if (!resolved)
            return { ok: false, error: "没有这种限定/自创作物（填它的中文名或 id，名字去 bag 抄）" };
        limitedId = resolved;
        const crop = getCrop(limitedId);
        if (!canPlantQixi2026Crop(farm, limitedId, now))
            return { ok: false, error: "完成对应七夕任务后解锁。" };
        // 限定/自创只能用手里已有的种子来种（熔炼产出 / 自己设计 / 商店随机刷出时花金币买来的）。
        // 不再有"满足解锁条件就花金币无限直接种"的途径——限定要稀缺，解锁只是让它能进商店随机库被 roll。
        if ((farm.seeds[limitedId] ?? 0) > 0) {
            farm.seeds[limitedId] -= 1;
            if (farm.seeds[limitedId] <= 0)
                delete farm.seeds[limitedId];
        }
        else {
            return { ok: false, error: `你没有「${crop.name}」的种子——${crop.category === "ugc" ? "先设计它、或去摊位买" : "去熔炼，或等它在商店随机刷出来时买（每种每天限 1 颗）"}。` };
        }
        plot.crop = { seedType: "limited", limitedId, growTicks: crop.growTicks, progress: 0, ripe: false, waterCount: 0 };
        if (crop.category === "ugc")
            onTaskEvent(farm, "plant_ugc", now); // 随机任务：种下一株自创作物
        pushLog(farm, `种下限定 ${crop.name}`);
        return { ok: true, seedType: "limited", limitedId }; // 回传解析后的 id，供 plantBatch 记录专属文案
    }
    const price = SEED_PRICE[seedType];
    if (farm.coins < price)
        return { ok: false, error: `金币不足，${seedType === "common" ? "普通" : "奇幻"}种子要 ${price}` };
    farm.coins -= price;
    plot.crop = { seedType, growTicks: GROW_TICKS[seedType], progress: 0, ripe: false, waterCount: 0 };
    pushLog(farm, `种下一颗${seedType === "common" ? "普通" : "奇幻"}种子`);
    return { ok: true, seedType };
}

// —— 主人浇水（提升稀有概率，封顶；只用于自家地）——
const WATER_CAP_COUNT = Math.round(WATER_LUCK_CAP / WATER_LUCK_PER);

export function water(farm, plotId, by, isOwner) {
    const plot = farm.plots.find((p) => p.id === plotId);
    if (!plot || !plot.crop)
        return { ok: false, error: `${plotId} 号地没有作物` };
    const capped = plot.crop.waterCount >= WATER_CAP_COUNT;
    if (!capped)
        plot.crop.waterCount += 1;
    pushLog(farm, `${by}给 ${plotId} 号地浇了水`);
    return { ok: true, by, isOwner, capped };
}

// —— 串门浇水（帮别家加速：每浇 1 次让作物进度 +1 tick = 30 分钟；不提升稀有度）——
// 给了 plotId 就浇那一块；否则默认浇「剩余时间最短」的生长地块（最接近成熟的先催）。
// 防互刷：同一访客对同一农场每天只能帮浇 1 次（已浇过当天再来 → 提示明天再来）。
const remainingTicks = (c) => c.growTicks - c.progress;

export function visitorWater(farm, visitorId, plotId, by, now) {
    const day = currentDayIndex(now);
    if (farm.waterVisits?.[visitorId] === day)
        return { ok: false, error: "已浇过水，明天再来吧。" };
    let plot;
    if (plotId != null) {
        plot = farm.plots.find((p) => p.id === plotId);
        if (!plot || !plot.crop)
            return { ok: false, error: `${plotId} 号地没有作物` };
        if (plot.crop.ripe)
            return { ok: false, error: `${plotId} 号地的作物已经熟了，浇了也没用` };
    }
    else {
        const growing = farm.plots.filter((p) => p.crop && !p.crop.ripe);
        if (!growing.length)
            return { ok: false, error: "对方没有可浇水的作物" };
        plot = growing.reduce((best, p) => remainingTicks(p.crop) < remainingTicks(best.crop) ? p : best);
    }
    const crop = plot.crop;
    crop.progress = Math.min(crop.growTicks, crop.progress + 1); // +1 tick = 30 分钟
    const ripened = crop.progress >= crop.growTicks;
    if (ripened)
        crop.ripe = true;
    (farm.waterVisits ??= {})[visitorId] = day; // 标记今天已帮这家浇过（每家每天 1 次）
    pushLog(farm, `${by}帮 ${plot.id} 号地浇水，加速 30 分钟${ripened ? "，正好催熟" : ""}`);
    pushTrail(farm, { t: now, kind: "watered", by, plotId: plot.id }); // 足迹：谁帮浇了水
    return { ok: true, plotId: plot.id, ripened };
}

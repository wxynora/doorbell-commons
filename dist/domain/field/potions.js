import {
    ITEMS,
    POTION_CAP_LINE,
    POTION_DAILY_CAP,
    TICK_MS,
    rarityIndex,
} from "../../config.js";
import { cropById, getCrop } from "../../content.js";
import { currentDayIndex } from "../../time.js";
import { bumpDaily } from "../../daily.js";
import { pushLog } from "../shared/notifications.js";

// —— 道具：买 / 用 ——
/** 加速药水按瓶单价（官方店）。防作弊：非数/负数一律当 0，避免把 coins 算成 NaN。 */
export function potionCost(qty) {
    const q = Math.floor(Number(qty));
    if (!Number.isFinite(q) || q <= 0)
        return 0;
    return q * ITEMS.speed_potion.price;
}

/** 现有金币最多能买几瓶加速药水。 */
export function affordablePotions(coins) {
    const price = ITEMS.speed_potion.price;
    if (!Number.isFinite(coins) || coins < price)
        return 0;
    return Math.floor(coins / price);
}

/** 官方店今天这座农场还能买几瓶加速药水（每日上限 POTION_DAILY_CAP）。 */
export function potionDailyLeft(farm, now) {
    const day = currentDayIndex(now);
    const bought = farm.potionBuy && farm.potionBuy.day === day ? farm.potionBuy.n : 0;
    return Math.max(0, POTION_DAILY_CAP - bought);
}

export function buyItem(farm, item, qty = 1, now = Date.now()) {
    const def = ITEMS[item];
    if (!def)
        return { ok: false, error: `没有这种物品: ${item}` };
    // 防作弊：数量必须是正整数，否则按 1（杜绝 NaN/负数把 coins 算坏）
    const q0 = Math.floor(Number(qty));
    let want = Number.isFinite(q0) && q0 > 0 ? q0 : 1;
    if (item === "speed_potion") {
        // 官方店每天每农场限购：超过当日上限不卖，截到剩余额度内
        const day = currentDayIndex(now);
        if (!farm.potionBuy || farm.potionBuy.day !== day)
            farm.potionBuy = { day, n: 0 };
        const left = Math.max(0, POTION_DAILY_CAP - farm.potionBuy.n);
        if (left <= 0)
            return { ok: false, error: `🌙 官方药水今日已购满 ${POTION_DAILY_CAP}/${POTION_DAILY_CAP}——${POTION_CAP_LINE}（还能买随机「药水套装」buy-potion-set、给别人浇水、或等收获随机掉落）` };
        want = Math.min(want, left);
    }
    const cost = item === "speed_potion" ? potionCost(want) : def.price * want;
    if (farm.coins < cost)
        return { ok: false, error: `金币不足，${want} 个${def.name}要 ${cost}` };
    farm.coins -= cost;
    bumpDaily(farm, now, "coinSpend", cost);
    farm.items[item] = (farm.items[item] ?? 0) + want;
    if (item === "speed_potion")
        farm.potionBuy.n += want;
    pushLog(farm, `买了 ${want} 个${def.name}`);
    return { ok: true, name: def.name, qty: want, left: farm.items[item], cost };
}

export function useItem(farm, item, plotId) {
    const def = ITEMS[item];
    if (!def)
        return { ok: false, error: `没有这种物品: ${item}` };
    if ((farm.items[item] ?? 0) <= 0)
        return { ok: false, error: `你没有${def.name}了` };
    if (item === "speed_potion") {
        const plot = farm.plots.find((p) => p.id === plotId);
        if (!plot || !plot.crop)
            return { ok: false, error: `${plotId} 号地没有作物` };
        if (plot.crop.ripe)
            return { ok: false, error: "这株已经成熟了，不用加速" };
        plot.crop.progress = plot.crop.growTicks;
        plot.crop.ripe = true;
        farm.items[item] -= 1;
        pushLog(farm, `用${def.name}催熟了 ${plotId} 号地`);
        return { ok: true, name: def.name, plotId, left: farm.items[item] };
    }
    return { ok: false, error: `${def.name}暂无可用效果` };
}

/** 按明确地块集合原子催熟：任一目标无效或药水不足时整次不执行。 */
export function usePotionPlots(farm, plotIds) {
    if (!Array.isArray(plotIds) || plotIds.length === 0)
        return { ok: false, error: "请在 plots 里填写至少一个地块编号" };
    if (plotIds.some((id) => !Number.isSafeInteger(id) || id <= 0))
        return { ok: false, error: "plots 里的地块编号必须是正整数" };
    if (new Set(plotIds).size !== plotIds.length)
        return { ok: false, error: "plots 里不能重复填写同一块地" };
    for (const plotId of plotIds) {
        const plot = farm.plots.find((item) => item.id === plotId);
        if (!plot || !plot.crop)
            return { ok: false, error: `${plotId} 号地没有作物` };
        if (plot.crop.ripe)
            return { ok: false, error: `${plotId} 号地的作物已经成熟了，不用加速` };
    }
    const have = farm.items.speed_potion ?? 0;
    if (have < plotIds.length)
        return { ok: false, error: `加速药水不足：要 ${plotIds.length} 瓶，现有 ${have} 瓶` };
    for (const plotId of plotIds)
        useItem(farm, "speed_potion", plotId);
    return { ok: true, plotIds: [...plotIds], count: plotIds.length, left: farm.items.speed_potion ?? 0 };
}

/** 圈数字 ①②③…⑳（>20 回落普通数字）：催熟候选列表展示用。 */
export const circledNum = (n) => (n >= 1 && n <= 20) ? String.fromCodePoint(0x245F + n) : `${n}`;

/** 催熟优先级：限定/自创（已知作物，按稀有度再抬）> 奇幻（未揭晓但整体更稀有）> 普通。 */
function plotPriority(p) {
    const c = p.crop;
    if (c.seedType === "limited" && c.limitedId) {
        const crop = cropById.get(c.limitedId) ?? getCrop(c.limitedId);
        return 200 + (crop ? rarityIndex(crop.rarity) : 0);
    }
    return c.seedType === "fantasy" ? 100 : 10;
}

/** 这块离成熟还差多少（含当前未结算的零头，给真实倒计时）。 */
export function plotRemainMs(p, farm, now) {
    const c = p.crop;
    const whole = (c.growTicks - c.progress) * TICK_MS;
    const partial = Math.max(0, now - farm.lastTickAt);
    return Math.max(0, whole - partial);
}

function fmtRemain(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    return min >= 60 ? `${Math.round(min / 6) / 10}小时` : `${min}分钟`;
}

/** 催熟时显示的作物标签：限定/自创已知作物给名+稀有度；普通/奇幻收获才揭晓，只标种子类型。 */
function plotCropLabel(p) {
    const c = p.crop;
    if (c.seedType === "limited" && c.limitedId) {
        const crop = cropById.get(c.limitedId) ?? getCrop(c.limitedId);
        return crop ? `${crop.name}·${crop.rarity}` : "限定作物";
    }
    return c.seedType === "fantasy" ? "奇幻种子·?" : "普通种子·?";
}

/** "正在生长且可催熟"的地块，按催熟优先级排序（限定/稀有优先，其次剩余时间最长）。空地/已熟/无作物全部略过。 */
export function potionTargets(farm, now) {
    const ps = farm.plots.filter((p) => p.crop && !p.crop.ripe);
    ps.sort((a, b) => (plotPriority(b) - plotPriority(a)) || (plotRemainMs(b, farm, now) - plotRemainMs(a, farm, now)));
    return ps.map((p) => ({ plotId: p.id, label: plotCropLabel(p), remain: fmtRemain(plotRemainMs(p, farm, now)) }));
}

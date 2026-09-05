import { WATER_REWARD_DAILY_CAP } from "../../config.js";
import { currentDayIndex } from "../../time.js";
import { pushLog } from "../shared/notifications.js";
import { plant, water } from "./planting.js";
import { useItem } from "./potions.js";

// ——————————— 批量动作（减少 AI 的 tool 往返）———————————
/** 批量播种：按数量填入空地（普通/奇幻/限定 id 列表）。便宜的先种，买不起就停。 */
export function plantBatch(farm, spec, now) {
    const queue = [];
    for (let i = 0; i < (spec.common ?? 0); i++)
        queue.push({ type: "common" });
    for (let i = 0; i < (spec.fantasy ?? 0); i++)
        queue.push({ type: "fantasy" });
    // limited 容错：契约是 string[]，但 AI 常误传数字/单个字符串。数字 1 直接 for..of 会抛
    // "number 1 is not iterable"；单字符串 for..of 会拆成单字。统一归一成干净的 id 数组。
    const limitedList = typeof spec.limited === "string" ? [spec.limited]
        : Array.isArray(spec.limited) ? spec.limited.filter((x) => typeof x === "string" && x.length > 0)
            : [];
    for (const id of limitedList)
        queue.push({ type: "limited", id });
    if (!queue.length)
        return { ok: false, planted: {}, limitedIds: [], spent: 0, leftover: 0, error: "没说要种什么（common/fantasy/limited）" };
    const before = farm.coins;
    const planted = { common: 0, fantasy: 0, limited: 0 };
    const limitedIds = []; // 实际种下的限定作物 id（给专属播种文案用）
    const empties = farm.plots.filter((p) => !p.crop);
    let qi = 0;
    let lastErr; // 记下最后一次失败的真实原因（限定/UGC 种子失败不是"买不起"，是解析不到/没库存）
    for (const plot of empties) {
        if (qi >= queue.length)
            break;
        const s = queue[qi];
        const r = plant(farm, plot.id, s.type, s.id, now);
        if (r.ok) {
            planted[s.type]++;
            if (s.type === "limited" && r.limitedId)
                limitedIds.push(r.limitedId);
            qi++;
        }
        else {
            lastErr = r.error;
            break;
        } // 买不起/不可种 → 停（队列已按便宜在前）
    }
    // 部分成功也保留停止原因；限定种子失败不能被改写成金币不足。
    const error = qi < queue.length
        ? (lastErr ?? "没有空地可种（先收获或升级土地）")
        : undefined;
    return { ok: qi > 0, planted, limitedIds, spent: before - farm.coins, leftover: queue.length - qi, error };
}

/** 浇所有生长中的地（主人或访客）。helped = 真正涨了浇水运气的地块数（已封顶的不算，给"帮浇水掉药水"判定用）*/
export function waterAll(farm, by, isOwner, now = Date.now()) {
    let count = 0, helped = 0;
    for (const p of farm.plots) {
        if (p.crop && !p.crop.ripe) {
            const r = water(farm, p.id, by, isOwner, now);
            count++;
            if (r.ok && !r.capped)
                helped++;
        }
    }
    return { ok: count > 0, count, helped };
}

/** 帮别人浇水的回报：给浇水者(visitor)掉 1 瓶加速药水。
 *  「1 家 1 天只浇 1 次」已由 visitorWater 拦在前面，故每家每天天然最多掉 1 瓶；
 *  这里只再压一道「浇水者每天最多 WATER_REWARD_DAILY_CAP 瓶」的总上限。*/
export function tryWaterReward(target, visitor, now) {
    if (target.id === visitor.id)
        return false;
    const day = currentDayIndex(now);
    if (!visitor.waterReward || visitor.waterReward.day !== day)
        visitor.waterReward = { day, n: 0 };
    if (visitor.waterReward.n >= WATER_REWARD_DAILY_CAP)
        return false;
    visitor.items.speed_potion = (visitor.items.speed_potion ?? 0) + 1;
    visitor.waterReward.n += 1;
    pushLog(visitor, `帮「${target.name}」浇水，掉落 1 瓶加速药水 🧪`);
    return true;
}

/** 批量用加速药水催熟生长中的地（all 或 count） */
export function usePotionBatch(farm, opts) {
    const growing = farm.plots.filter((p) => p.crop && !p.crop.ripe);
    const want = opts.all ? growing.length : Math.max(0, Math.floor(opts.count ?? 0));
    const use = Math.min(want, growing.length, farm.items.speed_potion ?? 0);
    let count = 0;
    for (const p of growing) {
        if (count >= use)
            break;
        if (useItem(farm, "speed_potion", p.id).ok)
            count++;
    }
    return { ok: count > 0, count, left: farm.items.speed_potion ?? 0 };
}

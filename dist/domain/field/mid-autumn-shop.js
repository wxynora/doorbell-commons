import { cropById } from "../../content.js";
import { bumpDaily } from "../../daily.js";
import { currentDayIndex } from "../../time.js";
import { MID_AUTUMN_SEED_TASKS, isMidAutumnSeedActive, normalizeMidAutumnSeedFarm } from "../../mid-autumn-seeds.js";

export const MID_AUTUMN_DAILY_SEED_LIMIT = 5;
const count = (value) => Number.isSafeInteger(value) && value > 0 ? value : 0;

// Read-only projection: browsing the shop must not create or mutate event state.
export function midAutumnSeedShopRows(farm, now = Date.now()) {
    if (!isMidAutumnSeedActive(now)) return [];
    const state = farm.midAutumnSeeds2026;
    const buys = state?.seedBuys?.day === currentDayIndex(now) ? state.seedBuys.counts : {};
    return MID_AUTUMN_SEED_TASKS.filter((task) => state?.tasks?.[task.id]?.completedAt)
        .map((task) => {
            const crop = cropById.get(task.cropId);
            const bought = count(buys?.[task.cropId]);
            return crop ? { id: crop.id, name: crop.name, rarity: crop.rarity, price: crop.seedPrice, bought, left: Math.max(0, MID_AUTUMN_DAILY_SEED_LIMIT - bought) } : null;
        }).filter((row) => row && row.left > 0);
}

export function buyMidAutumnSeed(farm, ref, now = Date.now(), qty = 1) {
    const crop = MID_AUTUMN_SEED_TASKS.map((task) => cropById.get(task.cropId)).find((item) => item && (item.id === ref || item.name === ref));
    if (!crop) return { handled: false };
    const fail = (error) => ({ handled: true, ok: false, error });
    if (!isMidAutumnSeedActive(now)) return fail("中秋限定种子当前未开放售卖。");
    const task = MID_AUTUMN_SEED_TASKS.find((item) => item.cropId === crop.id);
    if (!farm.midAutumnSeeds2026?.tasks?.[task.id]?.completedAt) return fail("完成对应中秋任务后解锁。");
    if (!Number.isSafeInteger(qty) || qty <= 0) return fail("购买数量必须是正整数。");
    const row = midAutumnSeedShopRows(farm, now).find((item) => item.id === crop.id);
    if (!row || qty > row.left) return fail("每种每天最多购买 5 颗，请按今日剩余数量购买。");
    const cost = row.price * qty;
    if (farm.coins < cost) return fail(`金币不足，${crop.name}种子要 ${cost}。`);
    const state = normalizeMidAutumnSeedFarm(farm, now);
    const day = currentDayIndex(now);
    if (state.seedBuys.day !== day) state.seedBuys = { day, counts: {} };
    farm.coins -= cost;
    bumpDaily(farm, now, "coinSpend", cost);
    farm.seeds ??= {};
    farm.seeds[crop.id] = count(farm.seeds[crop.id]) + qty;
    state.seedBuys.counts[crop.id] = row.bought + qty;
    return { handled: true, ok: true, id: crop.id, name: crop.name, qty, cost, left: row.left - qty };
}

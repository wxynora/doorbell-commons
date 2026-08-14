import { cropById, qixi2026 } from "./content.js";
import { currentDayIndex } from "./time.js";

const STARTS_AT = Date.parse(qixi2026.startsAt);
const ENDS_AT = Date.parse(qixi2026.endsAt);
const TASKS = qixi2026.tasks;
const TASK_BY_ID = new Map(TASKS.map((task) => [task.id, task]));
const TASK_BY_KIND = new Map(TASKS.map((task) => [task.kind, task]));
const TASK_BY_CROP = new Map(TASKS.map((task) => [task.cropId, task]));
const QIXI_CROP_IDS = new Set(TASKS.map((task) => task.cropId));
const QIXI_2026_HIGH_SEED_PRICES = new Map(TASKS.map((task) => {
    const crop = cropById.get(task.cropId);
    return [task.cropId, crop?.rarity === "SSR" ? 1200 : 600];
}));

const cleanInt = (value) => Math.max(0, Math.floor(Number(value) || 0));
const validTime = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function isQixi2026Active(now = Date.now()) {
    return now >= STARTS_AT && now < ENDS_AT;
}

export function isQixi2026CropId(id) {
    return QIXI_CROP_IDS.has(String(id ?? ""));
}

export function normalizeQixi2026Farm(farm, now = Date.now(), force = false) {
    if (!farm.qixi2026 || typeof farm.qixi2026 !== "object") {
        if (!force && !isQixi2026Active(now))
            return null;
        farm.qixi2026 = { startedAt: now, quietSince: now, tasks: {}, seedBuys: { day: -1, counts: {} }, harvestedCropIds: [] };
    }
    const state = farm.qixi2026;
    state.startedAt = validTime(state.startedAt, now);
    state.quietSince = Math.max(state.startedAt, validTime(state.quietSince, state.startedAt));
    state.tasks = state.tasks && typeof state.tasks === "object" ? state.tasks : {};
    for (const task of TASKS) {
        const saved = state.tasks[task.id];
        state.tasks[task.id] = saved && typeof saved === "object" ? saved : {};
        state.tasks[task.id].progress = Math.min(task.target, cleanInt(state.tasks[task.id].progress));
        if (!Number.isFinite(Number(state.tasks[task.id].completedAt)))
            delete state.tasks[task.id].completedAt;
        else
            state.tasks[task.id].completedAt = Number(state.tasks[task.id].completedAt);
    }
    state.seedBuys = state.seedBuys && typeof state.seedBuys === "object" ? state.seedBuys : { day: -1, counts: {} };
    state.seedBuys.day = Number.isSafeInteger(state.seedBuys.day) ? state.seedBuys.day : -1;
    state.seedBuys.counts = state.seedBuys.counts && typeof state.seedBuys.counts === "object" ? state.seedBuys.counts : {};
    state.harvestedCropIds = Array.isArray(state.harvestedCropIds)
        ? [...new Set(state.harvestedCropIds.filter((id) => QIXI_CROP_IDS.has(id)))]
        : [];
    return state;
}

function taskState(farm, task, now) {
    return normalizeQixi2026Farm(farm, now)?.tasks?.[task.id];
}

function completeTask(farm, task, now) {
    const saved = taskState(farm, task, now);
    if (!saved || saved.completedAt)
        return null;
    saved.progress = task.target;
    saved.completedAt = now;
    farm.seeds ??= {};
    farm.seeds[task.cropId] = cleanInt(farm.seeds[task.cropId]) + qixi2026.starterSeeds;
    const crop = cropById.get(task.cropId);
    return {
        taskId: task.id,
        cropId: task.cropId,
        cropName: crop?.name ?? task.cropId,
        progress: task.target,
        target: task.target,
        completed: true,
    };
}

export function qixi2026CropUnlocked(farm, cropId, now = Date.now()) {
    const task = TASK_BY_CROP.get(String(cropId ?? ""));
    if (!task)
        return true;
    return !!normalizeQixi2026Farm(farm, now)?.tasks?.[task.id]?.completedAt;
}

export function canPlantQixi2026Crop(farm, cropId, now = Date.now()) {
    return !isQixi2026CropId(cropId) || !isQixi2026Active(now) || qixi2026CropUnlocked(farm, cropId, now);
}

export function recordQixi2026StealAttempt(farm, now = Date.now()) {
    if (!isQixi2026Active(now))
        return false;
    const task = TASK_BY_KIND.get("quiet");
    const state = normalizeQixi2026Farm(farm, now);
    if (!task || state.tasks[task.id].completedAt)
        return false;
    state.quietSince = now;
    state.tasks[task.id].progress = 0;
    return true;
}

export function settleQixi2026QuietTask(farm, now = Date.now()) {
    if (!isQixi2026Active(now))
        return null;
    const task = TASK_BY_KIND.get("quiet");
    const state = normalizeQixi2026Farm(farm, now);
    if (!task || state.tasks[task.id].completedAt)
        return null;
    const elapsed = Math.max(0, now - state.quietSince);
    state.tasks[task.id].progress = Math.min(task.target, elapsed);
    return elapsed >= task.target ? completeTask(farm, task, now) : null;
}

export function recordQixi2026Progress(farm, kind, amount = 1, now = Date.now()) {
    if (!isQixi2026Active(now))
        return null;
    const task = TASK_BY_KIND.get(kind);
    const saved = task && taskState(farm, task, now);
    if (!task || !saved || saved.completedAt)
        return null;
    saved.progress = Math.min(task.target, saved.progress + cleanInt(amount));
    if (saved.progress >= task.target)
        return completeTask(farm, task, now);
    return { taskId: task.id, cropId: task.cropId, progress: saved.progress, target: task.target, completed: false };
}

export function submitQixi2026Fish(farm, fishingState, newCatchIds, now = Date.now()) {
    if (!isQixi2026Active(now))
        return null;
    const task = TASK_BY_KIND.get("fish");
    const saved = task && taskState(farm, task, now);
    if (!task || !saved || saved.completedAt)
        return null;
    const ids = new Set(newCatchIds);
    const needed = Math.max(0, task.target - saved.progress);
    const submittedIds = [];
    for (const item of fishingState.catchInventory) {
        if (submittedIds.length >= needed)
            break;
        if (ids.has(item.id) && item.fishId === task.itemId)
            submittedIds.push(item.id);
    }
    if (!submittedIds.length)
        return null;
    const remove = new Set(submittedIds);
    fishingState.catchInventory = fishingState.catchInventory.filter((item) => !remove.has(item.id));
    const progress = recordQixi2026Progress(farm, "fish", submittedIds.length, now);
    return { ...progress, submitted: submittedIds.length, submittedIds };
}

export function submitQixi2026Dish(farm, kitchen, dish, now = Date.now()) {
    if (!isQixi2026Active(now))
        return null;
    const task = TASK_BY_KIND.get("dish");
    const saved = task && taskState(farm, task, now);
    if (!task || !saved || saved.completedAt || dish?.recipeId !== task.itemId)
        return null;
    kitchen.dishes = kitchen.dishes.filter((item) => item !== dish);
    const progress = recordQixi2026Progress(farm, "dish", 1, now);
    return { ...progress, submitted: 1 };
}

export function recordQixi2026Harvest(farm, crop, seedType, now = Date.now()) {
    const events = [];
    if (isQixi2026Active(now)) {
        const kind = seedType === "common" ? "harvest_common" : seedType === "fantasy" ? "harvest_fantasy" : "";
        const event = kind ? recordQixi2026Progress(farm, kind, 1, now) : null;
        if (event)
            events.push(event);
    }
    if (isQixi2026CropId(crop?.id)) {
        const state = normalizeQixi2026Farm(farm, now, true);
        if (state && !state.harvestedCropIds.includes(crop.id))
            state.harvestedCropIds.push(crop.id);
    }
    return events;
}

export function qixi2026CollectionComplete(farm) {
    const got = new Set(farm.qixi2026?.harvestedCropIds ?? []);
    return [...QIXI_CROP_IDS].every((id) => got.has(id));
}

export function qixi2026HarvestSilver(crop, quality) {
    if (!isQixi2026CropId(crop?.id))
        return null;
    return Math.max(0, Math.round(cleanInt(crop.qixiSilverBase) * (Number(quality?.priceFactor) || 1)));
}

export function qixi2026CompletionText(event) {
    return event?.completed
        ? `✅ 已解锁「${event.cropName}」，并获得种子 ×${qixi2026.starterSeeds}。去商店购买更多七夕限定种子吧。`
        : "";
}

export function qixi2026FishText(event) {
    if (!event?.submitted)
        return "";
    return [`🎋 七夕任务：银鲦 ×${event.submitted} 已自动提交（${event.progress}/3）。`, qixi2026CompletionText(event)].filter(Boolean).join("\n");
}

export function qixi2026TaskView(farm, now = Date.now()) {
    if (!isQixi2026Active(now))
        return null;
    const state = normalizeQixi2026Farm(farm, now);
    const quiet = TASK_BY_KIND.get("quiet");
    if (quiet && !state.tasks[quiet.id].completedAt)
        state.tasks[quiet.id].progress = Math.min(quiet.target, Math.max(0, now - state.quietSince));
    const tasks = TASKS.filter((task) => !state.tasks[task.id].completedAt).map((task) => {
        const progress = state.tasks[task.id].progress;
        return {
            ...task,
            cropName: cropById.get(task.cropId)?.name ?? task.cropId,
            progress,
            progressText: task.kind === "quiet"
                ? `${Math.min(48, Math.floor(progress / 3600000))}/48 小时`
                : `${progress}/${task.target}`,
        };
    });
    return { tasks, allComplete: tasks.length === 0 };
}

export function qixi2026TaskText(farm, now = Date.now()) {
    const view = qixi2026TaskView(farm, now);
    if (!view || view.allComplete)
        return "";
    return `🎋 七夕限定任务\n${view.tasks.map((task) => `· ${task.label}（${task.progressText}）→ ${task.cropName}`).join("\n")}`;
}

function seedBuysForDay(state, now) {
    const day = currentDayIndex(now);
    if (state.seedBuys.day !== day)
        state.seedBuys = { day, counts: {} };
    return state.seedBuys.counts;
}

export function qixi2026ShopRows(farm, now = Date.now()) {
    if (!isQixi2026Active(now))
        return [];
    const state = normalizeQixi2026Farm(farm, now);
    const buys = seedBuysForDay(state, now);
    return TASKS.filter((task) => state.tasks[task.id].completedAt).map((task) => {
        const crop = cropById.get(task.cropId);
        const bought = cleanInt(buys[task.cropId]);
        return { id: task.cropId, name: crop?.name ?? task.cropId, rarity: crop?.rarity ?? "", price: crop?.seedPrice ?? 0, bought, left: Math.max(0, qixi2026.dailySeedLimit - bought) };
    });
}

export function buyQixi2026Seed(farm, ref, now = Date.now(), requestedQty = 1) {
    if (!isQixi2026Active(now))
        return { handled: false };
    const crop = [...QIXI_CROP_IDS].map((id) => cropById.get(id)).find((item) => item && (item.id === String(ref ?? "") || item.name === String(ref ?? "")));
    if (!crop)
        return { handled: false };
    const state = normalizeQixi2026Farm(farm, now);
    if (!qixi2026CropUnlocked(farm, crop.id, now))
        return { handled: true, ok: false, error: "完成对应七夕任务后解锁。" };
    const buys = seedBuysForDay(state, now);
    const bought = cleanInt(buys[crop.id]);
    if (bought >= qixi2026.dailySeedLimit)
        return { handled: true, ok: false, error: `每种每天最多购买 ${qixi2026.dailySeedLimit} 颗。` };
    if (!Number.isSafeInteger(requestedQty) || requestedQty <= 0)
        return { handled: true, ok: false, error: "购买数量必须是正整数。" };
    const qty = Math.min(requestedQty, qixi2026.dailySeedLimit - bought);
    const cost = crop.seedPrice * qty;
    if (farm.coins < cost)
        return { handled: true, ok: false, error: `金币不足，${crop.name}种子要 ${cost}。` };
    farm.coins -= cost;
    farm.seeds ??= {};
    farm.seeds[crop.id] = cleanInt(farm.seeds[crop.id]) + qty;
    buys[crop.id] = bought + qty;
    return { handled: true, ok: true, id: crop.id, name: crop.name, cost, qty, left: qixi2026.dailySeedLimit - buys[crop.id] };
}

export function buyAllQixi2026Seeds(farm, now = Date.now()) {
    if (!isQixi2026Active(now))
        return { handled: true, ok: false, error: "七夕限定种子已经下架。" };
    const rows = qixi2026ShopRows(farm, now);
    if (!rows.length)
        return { handled: true, ok: false, error: "还没有已解锁的七夕限定种子。" };
    const items = rows.filter((item) => item.left > 0).map((item) => ({ ...item, qty: item.left, cost: item.price * item.left }));
    if (!items.length)
        return { handled: true, ok: false, error: "今天已经把所有已解锁的七夕限定种子买满了。" };
    const cost = items.reduce((sum, item) => sum + item.cost, 0);
    if (farm.coins < cost)
        return { handled: true, ok: false, error: `金币不足，全部买满还差 ${cost - farm.coins} 金，本次没有购买。` };
    const state = normalizeQixi2026Farm(farm, now);
    const buys = seedBuysForDay(state, now);
    farm.coins -= cost;
    farm.seeds ??= {};
    for (const item of items) {
        farm.seeds[item.id] = cleanInt(farm.seeds[item.id]) + item.qty;
        buys[item.id] = cleanInt(buys[item.id]) + item.qty;
    }
    return { handled: true, ok: true, items, cost };
}

export function settleQixi2026SeedPriceRefund(farm, now = Date.now()) {
    const state = normalizeQixi2026Farm(farm, now);
    if (!state || state.seedBuys.day !== currentDayIndex(now))
        return { coins: 0, seeds: 0, items: [] };
    const items = [];
    let coins = 0;
    let seeds = 0;
    for (const task of TASKS) {
        const crop = cropById.get(task.cropId);
        const count = Math.min(qixi2026.dailySeedLimit, cleanInt(state.seedBuys.counts[task.cropId]));
        const refundEach = Math.max(0, cleanInt(QIXI_2026_HIGH_SEED_PRICES.get(task.cropId)) - cleanInt(crop?.seedPrice));
        if (!crop || count <= 0 || refundEach <= 0)
            continue;
        const refund = count * refundEach;
        items.push({ id: crop.id, name: crop.name, count, refundEach, refund });
        coins += refund;
        seeds += count;
    }
    if (coins > 0)
        farm.coins = cleanInt(farm.coins) + coins;
    return { coins, seeds, items };
}

export function qixi2026TransferAllowed(farm, cropId, now = Date.now()) {
    return !isQixi2026CropId(cropId) || !isQixi2026Active(now) || qixi2026CropUnlocked(farm, cropId, now);
}

export function qixi2026TaskDefinition(id) {
    return TASK_BY_ID.get(id);
}

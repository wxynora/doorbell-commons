import { crops } from "./content.js";
import { currentDayIndex } from "./time.js";

const EVENT_ID = "new-version-welfare-v1";
const START_DATE_ENV = "AIFARM_WELFARE_WEEK_START_DATE";
const DAY_COUNT = 7;
const TASK_LABELS = Object.freeze({
    daily_task: "完成一个普通任务",
    glimmer_ticket: "购买当天的流光原野通票",
    harvest: "收获作物",
    plant: "种下任意种子",
    water: "给地块浇水",
});
const DAYS = Object.freeze([
    { tasks: { plant: 3, water: 3 }, coins: 20_000, silver: 30 },
    { tasks: { harvest: 3, plant: 3 }, coins: 20_000, silver: 30 },
    { tasks: { water: 5, glimmer_ticket: 1 }, coins: 20_000, silver: 30 },
    { tasks: { harvest: 5, daily_task: 1 }, coins: 20_000, silver: 30 },
    { tasks: { plant: 5, water: 5, harvest: 5 }, coins: 20_000, silver: 30 },
    { tasks: { plant: 6, water: 6, harvest: 6 }, coins: 20_000, silver: 30 },
    {
        tasks: { plant: 7, water: 7, harvest: 7 },
        coins: 30_000,
        silver: 60,
        seeds: { SP: 2, SSR: 4 },
    },
]);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const SP_SEEDS = crops
    .filter((crop) => crop?.rarity === "SP" && crop?.category !== "ugc")
    .sort((left, right) => compareText(String(left.id), String(right.id)));
const SSR_SEEDS = crops
    .filter((crop) => crop?.rarity === "SSR" && crop?.category !== "ugc")
    .sort((left, right) => compareText(String(left.id), String(right.id)));

if (SP_SEEDS.length < 2 || SSR_SEEDS.length < 4)
    throw new Error("new version welfare seed pools are incomplete");

const cleanInt = (value) => Math.max(0, Math.floor(Number(value) || 0));

function configuredStartDay() {
    const value = String(process.env[START_DATE_ENV] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const startsAt = Date.parse(`${value}T00:00:00+08:00`);
    if (!Number.isFinite(startsAt))
        return null;
    const normalized = new Date(startsAt + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
    return normalized === value ? currentDayIndex(startsAt) : null;
}

export function welfareWeekDay(now = Date.now()) {
    const startDay = configuredStartDay();
    if (startDay === null)
        return null;
    const day = currentDayIndex(now) - startDay + 1;
    return day >= 1 && day <= DAY_COUNT ? day : null;
}

export function normalizeWelfareWeekFarm(farm) {
    if (!farm.welfareWeekV1 || typeof farm.welfareWeekV1 !== "object")
        return null;
    const state = farm.welfareWeekV1;
    state.eventId = EVENT_ID;
    state.days = state.days && typeof state.days === "object" ? state.days : {};
    for (const [key, value] of Object.entries(state.days)) {
        const day = Number(key);
        if (!Number.isSafeInteger(day) || day < 1 || day > DAY_COUNT || !value || typeof value !== "object") {
            delete state.days[key];
            continue;
        }
        const definition = DAYS[day - 1];
        value.progress = value.progress && typeof value.progress === "object" ? value.progress : {};
        for (const [kind, target] of Object.entries(definition.tasks))
            value.progress[kind] = Math.min(target, cleanInt(value.progress[kind]));
        for (const kind of Object.keys(value.progress))
            if (!(kind in definition.tasks))
                delete value.progress[kind];
        if (!Number.isFinite(Number(value.completedAt)))
            delete value.completedAt;
        else
            value.completedAt = Number(value.completedAt);
        if (typeof value.pendingNotice !== "string" || !value.pendingNotice)
            delete value.pendingNotice;
    }
    return state;
}

function ensureState(farm) {
    const state = normalizeWelfareWeekFarm(farm);
    if (state)
        return state;
    farm.welfareWeekV1 = { eventId: EVENT_ID, days: {} };
    return farm.welfareWeekV1;
}

function ensureDayState(farm, day) {
    const state = ensureState(farm);
    const definition = DAYS[day - 1];
    const saved = state.days[day] && typeof state.days[day] === "object"
        ? state.days[day]
        : (state.days[day] = { progress: {} });
    saved.progress = saved.progress && typeof saved.progress === "object" ? saved.progress : {};
    for (const [kind, target] of Object.entries(definition.tasks))
        saved.progress[kind] = Math.min(target, cleanInt(saved.progress[kind]));
    return saved;
}

function hash(text) {
    let value = 2166136261;
    for (const character of String(text)) {
        value ^= character.charCodeAt(0);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
}

function pickUniqueSeeds(pool, count, farmId, rarity) {
    const available = [...pool];
    const selected = [];
    for (let index = 0; index < count; index += 1) {
        const picked = hash(`${EVENT_ID}:${farmId}:${rarity}:${index}`) % available.length;
        selected.push(available.splice(picked, 1)[0]);
    }
    return selected;
}

function completionText(day, definition) {
    if (day === 7)
        return "🎁 新版本七日福利：第 7 天任务完成，获得 30,000 金、60 银、随机 SP 种子 ×2、随机 SSR 种子 ×4。";
    return `🎁 新版本七日福利：第 ${day} 天任务完成，获得 ${definition.coins.toLocaleString("en-US")} 金、${definition.silver} 银。`;
}

function grantDayReward(farm, day, now, saved) {
    const definition = DAYS[day - 1];
    const selected = [
        ...pickUniqueSeeds(SP_SEEDS, definition.seeds?.SP ?? 0, farm.id, "SP"),
        ...pickUniqueSeeds(SSR_SEEDS, definition.seeds?.SSR ?? 0, farm.id, "SSR"),
    ];
    farm.coins = cleanInt(farm.coins) + definition.coins;
    farm.silver = cleanInt(farm.silver) + definition.silver;
    farm.seeds ??= {};
    for (const seed of selected)
        farm.seeds[seed.id] = cleanInt(farm.seeds[seed.id]) + 1;
    saved.completedAt = now;
    saved.reward = {
        coins: definition.coins,
        silver: definition.silver,
        seeds: selected.map((seed) => ({ id: seed.id, name: seed.name, rarity: seed.rarity, quantity: 1 })),
    };
    saved.pendingNotice = completionText(day, definition);
    return saved.reward;
}

export function recordWelfareWeekProgress(farm, kind, amount = 1, now = Date.now()) {
    const day = welfareWeekDay(now);
    if (day === null)
        return { active: false, changed: false, completed: false };
    const definition = DAYS[day - 1];
    const target = definition.tasks[kind];
    if (!target)
        return { active: true, changed: false, completed: false, day };
    const saved = ensureDayState(farm, day);
    if (saved.completedAt)
        return { active: true, changed: false, completed: true, day, reward: saved.reward };
    const before = cleanInt(saved.progress[kind]);
    saved.progress[kind] = Math.min(target, before + cleanInt(amount));
    const completed = Object.entries(definition.tasks)
        .every(([taskKind, taskTarget]) => cleanInt(saved.progress[taskKind]) >= taskTarget);
    const reward = completed ? grantDayReward(farm, day, now, saved) : undefined;
    return {
        active: true,
        changed: saved.progress[kind] !== before || completed,
        completed,
        day,
        progress: saved.progress[kind],
        reward,
        target,
    };
}

export function welfareWeekView(farm, now = Date.now()) {
    const day = welfareWeekDay(now);
    if (day === null)
        return null;
    const definition = DAYS[day - 1];
    const saved = ensureDayState(farm, day);
    return {
        day,
        completed: !!saved.completedAt,
        reward: saved.reward ?? null,
        tasks: Object.entries(definition.tasks).map(([kind, target]) => ({
            kind,
            label: TASK_LABELS[kind],
            progress: Math.min(target, cleanInt(saved.progress[kind])),
            target,
        })),
    };
}

export function welfareWeekText(farm, now = Date.now()) {
    const view = welfareWeekView(farm, now);
    if (!view)
        return "";
    return [
        `🎉 新版本七日福利（第 ${view.day}/7 天）`,
        "今天完成这些小任务，奖励会在全部完成后自动到账。",
        ...view.tasks.map((task) => `· ${task.label}（${task.progress}/${task.target}）`),
    ].join("\n");
}

export function takeWelfareWeekNotice(farm) {
    const state = normalizeWelfareWeekFarm(farm);
    if (!state)
        return "";
    for (let day = 1; day <= DAY_COUNT; day += 1) {
        const saved = state.days[day];
        if (!saved?.pendingNotice)
            continue;
        const notice = saved.pendingNotice;
        delete saved.pendingNotice;
        return notice;
    }
    return "";
}

export const WELFARE_WEEK_START_DATE_ENV = START_DATE_ENV;

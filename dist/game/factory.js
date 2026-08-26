import { randomUUID, randomBytes } from "node:crypto";
import { shopAnimals, shopPets } from "../engine.js";
import { landTierByLevel } from "../content.js";
import { STARTING_COINS, STARTER_POTIONS, UGC_NAME_MAX } from "../config.js";
import { freshSeed } from "../rng.js";

/** 农场门牌号字符集：大写字母 + 数字，剔除易混的 I/L/O/0/1。 */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** 生成 6 位门牌号（公开 id，串门/排行榜展示用；唯一性由 store.createFarm 兜底）。 */
export function genCode() {
    const b = randomBytes(6);
    let s = "";
    for (let i = 0; i < 6; i++)
        s += CODE_CHARS[b[i] % CODE_CHARS.length];
    return s;
}
/** 识别客户端在发送前已经有损替换的公开名称；服务端无法从问号反推原文。 */
export function hasDamagedPublicName(value) {
    const name = String(value ?? "").trim();
    return name !== "" && (/^[?？]+$/u.test(name) || name.includes("\uFFFD"));
}
/** 构造一个全新农场对象（不落盘）。HTTP 存档与 CLI 共用，保证结构一致。 */
export function makeFarm(name, seed, opts) {
    const id = genCode();
    const now = Date.now();
    const plotCount = landTierByLevel(1).plots;
    const plots = Array.from({ length: plotCount }, (_, i) => ({ id: i + 1, crop: null }));
    const clean = (s) => { const t = String(s ?? "").trim(); return t ? t.slice(0, UGC_NAME_MAX) : undefined; };
    const farm = {
        id, name: name?.trim().slice(0, UGC_NAME_MAX) || `${id} 的农场`,
        aiName: clean(opts?.aiName), humanName: clean(opts?.humanName),
        coins: STARTING_COINS, silver: 0, landTier: 1, plots,
        rngState: (seed != null && Number.isFinite(seed)) ? (seed | 0) || 1 : freshSeed(),
        codex: {}, materials: {}, seeds: {}, items: { speed_potion: STARTER_POTIONS },
        shop: { refreshAt: 0, recipe: null }, knownRecipes: [], market: [], stealCooldowns: {}, announcedUnlocks: [],
        token: randomUUID().replace(/-/g, ""), humanKey: randomUUID().replace(/-/g, ""), messages: [],
        lastTickAt: now, createdAt: now, log: ["农场创建啦 🌱"],
    };
    farm.announcedUnlocks = [...shopAnimals(farm).map((a) => a.id), ...shopPets(farm).map((p) => p.id)];
    return farm;
}

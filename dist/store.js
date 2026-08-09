// 农场仓库：唯一 id、内存索引、JSON 存档（含 rngState）、健壮读档。
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeFarm, genCode, makeNpcFarm } from "./game.js";
import { normalizeDishPricing, pushInbox, pushRanchNotice } from "./engine.js";
import { dumpUgc, loadUgc } from "./ugc.js";
import { NPC_ID } from "./config.js";
import { ensureFishing } from "./fishing.js";
import { normalizeGlimmerFarm, normalizeGlimmerWorld } from "./glimmer.js";
const DATA_DIR = process.env.AIFARM_DATA_DIR
    ? resolve(process.env.AIFARM_DATA_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const WORLD_FILE = resolve(DATA_DIR, "world.json");
const DATA_FILE = resolve(DATA_DIR, "farms.json");
const UGC_FILE = resolve(DATA_DIR, "ugc.json");
const farms = new Map();
const MAINTENANCE_SILVER_GRANT_ID = "maintenance-20260809-glimmer-meadow";
const MAINTENANCE_SILVER_GRANT_AMOUNT = 150;
const MAINTENANCE_SILVER_GRANT_NOTICE = "🎁 流光原野更新福利：已发放 🪙150 银币。";
let appliedMaintenanceGrantIds = [];
let glimmerWorld = normalizeGlimmerWorld({});
export function normalizeFarm(f) {
    f.materials ??= {};
    f.seeds ??= {};
    f.shop ??= { refreshAt: 0, recipe: null, potionSet: null };
    if (f.shop.potionSet === undefined)
        f.shop.potionSet = null;
    f.knownRecipes ??= [];
    f.market ??= [];
    f.silver ??= 0;
    f.codex ??= {};
    f.items ??= {};
    f.stealCooldowns ??= {};
    f.waterVisits ??= {};
    f.messages ??= [];
    f.ledger ??= [];
    if (f.ranch) {
        f.ranch.animals ??= [];
        f.ranch.coins ??= 0;
        f.ranch.raids ??= [];
        f.ranch.raidDebts ??= [];
        f.ranch.pets ??= [];
        f.ranch.kitchen ??= {};
        f.ranch.kitchen.products ??= [];
        f.ranch.kitchen.ingredients ??= {};
        f.ranch.kitchen.dishes ??= [];
        f.ranch.kitchen.knownRecipes ??= [];
        for (const dish of f.ranch.kitchen.dishes)
            normalizeDishPricing(dish);
        for (const listing of f.market) {
            if (listing?.kind === "dish" && listing.dish)
                normalizeDishPricing(listing.dish);
        }
        for (const animal of f.ranch.animals) {
            animal.pending ??= 0;
            animal.pendingMeat ??= 0;
            animal.feedBoostPending ??= false;
            animal.pendingBoost ??= false;
        }
    }
    ensureFishing(f);
    normalizeGlimmerFarm(f);
    return f;
}
export function createFarm(name, opts) {
    const farm = makeFarm(name, undefined, opts);
    while (farms.has(farm.id))
        farm.id = genCode(); // 门牌号撞号兜底（6 位空间大，几乎不会触发）
    farms.set(farm.id, farm);
    save();
    return farm;
}
export const getFarm = (id) => farms.get(id);
export const allFarms = () => [...farms.values()];
/** 真实玩家农场（排除常驻 NPC 阿土）——排行榜等"只算玩家"的地方用。 */
export const playerFarms = () => [...farms.values()].filter((f) => f.id !== NPC_ID);
export const getGlimmerWorld = () => glimmerWorld;
/** 在本次生产启动时给当时已经存在的真实玩家一次性发放维护福利；全局 ID 与余额同一次原子保存。 */
export function applyMaintenanceSilverGrant(farmValues = farms.values(), now = Date.now()) {
    if (appliedMaintenanceGrantIds.includes(MAINTENANCE_SILVER_GRANT_ID))
        return { applied: false, count: 0, amount: MAINTENANCE_SILVER_GRANT_AMOUNT };
    let count = 0;
    for (const farm of farmValues) {
        if (!farm || farm.id === NPC_ID)
            continue;
        farm.silver = Math.max(0, Math.floor(Number(farm.silver) || 0)) + MAINTENANCE_SILVER_GRANT_AMOUNT;
        pushInbox(farm, MAINTENANCE_SILVER_GRANT_NOTICE, now);
        pushRanchNotice(farm, MAINTENANCE_SILVER_GRANT_NOTICE, now);
        count += 1;
    }
    appliedMaintenanceGrantIds.push(MAINTENANCE_SILVER_GRANT_ID);
    return { applied: true, count, amount: MAINTENANCE_SILVER_GRANT_AMOUNT };
}
export function insertFarm(farm) {
    if (farms.has(farm.id))
        throw new Error(`farm id already exists: ${farm.id}`);
    farms.set(farm.id, normalizeFarm(farm));
    try {
        save();
    }
    catch (err) {
        farms.delete(farm.id);
        throw err;
    }
}
export function replaceFarm(id, farm) {
    const before = farms.get(id);
    if (!before)
        throw new Error(`farm not found: ${id}`);
    farm.id = id;
    farms.set(id, normalizeFarm(farm));
    try {
        save();
    }
    catch (err) {
        farms.set(id, before);
        throw err;
    }
}
/** 确保常驻 NPC 阿土在库里（首次启动 / 老存档没有时建一座）。返回是否新建。 */
function ensureNpc() {
    if (farms.has(NPC_ID))
        return false;
    farms.set(NPC_ID, makeNpcFarm());
    return true;
}
export function save() {
    mkdirSync(DATA_DIR, { recursive: true });
    // 原子写：先写 .tmp 再 rename（rename 在同一文件系统是原子的）——避免写到一半进程崩导致整库损坏/清空
    const writeAtomic = (file, data) => {
        const tmp = file + ".tmp";
        writeFileSync(tmp, data, "utf8");
        renameSync(tmp, file);
    };
    writeAtomic(WORLD_FILE, JSON.stringify({
        format: "aifarm-world",
        version: 1,
        maintenanceGrantIds: appliedMaintenanceGrantIds,
        farms: [...farms.values()],
        ugc: dumpUgc(),
        glimmer: glimmerWorld,
    }, null, 2));
}
export function load() {
    if (existsSync(WORLD_FILE)) {
        try {
            const world = JSON.parse(readFileSync(WORLD_FILE, "utf8"));
            if (world?.format !== "aifarm-world" || world?.version !== 1 || !Array.isArray(world?.farms)) {
                throw new Error("unknown world format");
            }
            appliedMaintenanceGrantIds = Array.isArray(world.maintenanceGrantIds)
                ? world.maintenanceGrantIds.map(String)
                : [];
            glimmerWorld = normalizeGlimmerWorld(world.glimmer);
            loadUgc(Array.isArray(world.ugc) ? world.ugc : []);
            farms.clear();
            for (const f of world.farms)
                farms.set(f.id, normalizeFarm(f));
            console.log(`[store] 已载入 ${farms.size} 个农场`);
            const npcCreated = ensureNpc();
            const grant = applyMaintenanceSilverGrant();
            if (grant.applied)
                console.log(`[store] 维护福利已发放 ${grant.count} 个玩家农场，每家 ${grant.amount} 银`);
            if (npcCreated || grant.applied)
                save();
            return;
        }
        catch (err) {
            const bak = WORLD_FILE + ".corrupt";
            try {
                renameSync(WORLD_FILE, bak);
            }
            catch { }
            console.error(`[store] 联机世界存档损坏，已备份到 ${bak}:`, err);
        }
    }
    if (existsSync(UGC_FILE)) {
        try {
            loadUgc(JSON.parse(readFileSync(UGC_FILE, "utf8")));
        }
        catch { /* 忽略 */ }
    }
    appliedMaintenanceGrantIds = [];
    glimmerWorld = normalizeGlimmerWorld({});
    if (!existsSync(DATA_FILE)) {
        ensureNpc();
        applyMaintenanceSilverGrant();
        save();
        return;
    } // 全新启动：先把常驻 NPC 阿土建出来
    try {
        const arr = JSON.parse(readFileSync(DATA_FILE, "utf8"));
        farms.clear();
        for (const f of arr)
            farms.set(f.id, normalizeFarm(f));
        console.log(`[store] 已载入 ${farms.size} 个农场`);
    }
    catch (err) {
        const bak = DATA_FILE + ".corrupt";
        try {
            renameSync(DATA_FILE, bak);
        }
        catch { }
        console.error(`[store] 存档损坏，已备份到 ${bak}，以空状态启动:`, err);
    }
    ensureNpc();
    const grant = applyMaintenanceSilverGrant();
    if (grant.applied)
        console.log(`[store] 维护福利已发放 ${grant.count} 个玩家农场，每家 ${grant.amount} 银`);
    save(); // 老格式只读一次，随后迁入单文件原子 world.json
}
//# sourceMappingURL=store.js.map

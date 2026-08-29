// 农场仓库：唯一 id、内存索引、JSON 存档（含 rngState）、健壮读档。
import { createHash, randomInt } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeFarm, genCode, makeNpcFarm } from "./game.js";
import { normalizeDishPricing, pushInbox, pushLog, pushRanchNotice } from "./engine.js";
import { dumpUgc, loadUgc } from "./ugc.js";
import { NPC_ID } from "./config.js";
import { ensureFishing } from "./fishing.js";
import { glimmerAchievementRewardText, normalizeGlimmerFarm, normalizeGlimmerWorld, settleGlimmerAchievementRewards } from "./glimmer.js";
import { normalizePublicExpeditionWorld } from "./public-expedition.js";
import { activateNatureWorld, advanceNatureWorld, normalizeNatureWorld } from "./nature.js";
import { setNatureWorldProvider } from "./time.js";
import { crops } from "./content.js";
import { normalizeQixi2026Farm, settleQixi2026SeedPriceRefund } from "./qixi-2026.js";
import { normalizeQixiLantern2026Farm, normalizeQixiLantern2026World } from "./qixi-lantern-2026.js";
import { normalizeWelfareWeekFarm } from "./welfare-week.js";
const DATA_DIR = process.env.AIFARM_DATA_DIR
    ? resolve(process.env.AIFARM_DATA_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../data");
const WORLD_FILE = resolve(DATA_DIR, "world.json");
const DATA_FILE = resolve(DATA_DIR, "farms.json");
const UGC_FILE = resolve(DATA_DIR, "ugc.json");
const farms = new Map();
const MAINTENANCE_GRANTS = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../content/maintenance-grants.json"), "utf8"));
let appliedMaintenanceGrantIds = [];
let doorbellWelcomeRewardGrants = [];
let doorbellFarmCreations = [];
let glimmerWorld = normalizeGlimmerWorld({});
let publicExpeditionWorld = normalizePublicExpeditionWorld({});
let qixiLantern2026World = normalizeQixiLantern2026World({});
let natureWorld = normalizeNatureWorld(null);
let worldCommitCoordinator = null;
const worldCommitContext = new AsyncLocalStorage();
setNatureWorldProvider(() => natureWorld);
const DOORBELL_WELCOME_SILVER = 200;
const SSR_CROPS = crops.filter((crop) => crop?.rarity === "SSR");
const QIXI_2026_PRICE_REFUND_ID = "qixi-2026-seed-price-refund-20260815";
const NAZHI_EXCLUSIVE_TITLE_GRANT_ID = "exclusive-title-nazhi-wangwang-delivery-20260815";
const NAZHI_FARM_ID = "4ZSDR3";
const NAZHI_EXCLUSIVE_TITLE_ID = "nazhi_wangwang_delivery";
const NAZHI_EXCLUSIVE_TITLE_NAME = "汪汪送餐员";
export class DoorbellWelcomeRewardError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "DoorbellWelcomeRewardError";
        this.status = status;
        this.code = code;
    }
}
export class DoorbellFarmCreationError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "DoorbellFarmCreationError";
        this.code = code;
    }
}
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
    normalizeQixi2026Farm(f);
    normalizeQixiLantern2026Farm(f);
    normalizeWelfareWeekFarm(f);
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
function doorbellFarmCreationFingerprint(name, opts) {
    return createHash("sha256").update(JSON.stringify([
        String(name ?? "").trim(),
        String(opts?.aiName ?? "").trim(),
        String(opts?.humanName ?? "").trim(),
    ]), "utf8").digest("hex");
}
export function findDoorbellFarmCreation(creationId, name, opts) {
    const normalizedCreationId = String(creationId ?? "").trim();
    const existing = doorbellFarmCreations.find((entry) => entry.creationId === normalizedCreationId);
    if (!existing)
        return undefined;
    const fingerprint = doorbellFarmCreationFingerprint(name, opts);
    if (existing.requestFingerprint !== fingerprint)
        throw new DoorbellFarmCreationError("creation_conflict", "The creation ID is already bound to different farm details");
    const farm = farms.get(existing.farmId);
    if (!farm)
        throw new DoorbellFarmCreationError("creation_contract_unavailable", "The creation receipt no longer resolves to a farm");
    return { created: false, farm };
}
export function createDoorbellFarm(creationId, name, opts) {
    const existing = findDoorbellFarmCreation(creationId, name, opts);
    if (existing)
        return existing;
    const normalizedCreationId = String(creationId ?? "").trim();
    const farm = makeFarm(name, undefined, opts);
    while (farms.has(farm.id))
        farm.id = genCode();
    const record = {
        creationId: normalizedCreationId,
        farmId: farm.id,
        requestFingerprint: doorbellFarmCreationFingerprint(name, opts),
        createdAt: farm.createdAt,
    };
    farms.set(farm.id, farm);
    doorbellFarmCreations.push(record);
    try {
        save();
    }
    catch (error) {
        doorbellFarmCreations.pop();
        farms.delete(farm.id);
        throw error;
    }
    return { created: true, farm };
}
export const getFarm = (id) => farms.get(id);
export const allFarms = () => [...farms.values()];
/** 真实玩家农场（排除常驻 NPC 阿土）——排行榜等"只算玩家"的地方用。 */
export const playerFarms = () => [...farms.values()].filter((f) => f.id !== NPC_ID);
export const getGlimmerWorld = () => glimmerWorld;
export const getPublicExpeditionWorld = () => publicExpeditionWorld;
export const getQixiLantern2026World = () => qixiLantern2026World;
export const getNatureWorld = () => natureWorld;
export function commitNatureWorld(next) {
    const before = natureWorld;
    natureWorld = normalizeNatureWorld(next);
    try {
        save();
    }
    catch (error) {
        natureWorld = before;
        throw error;
    }
    return natureWorld;
}
export function activateStoredNatureWorld({ now, seed }) {
    return commitNatureWorld(activateNatureWorld(natureWorld, { now, seed }));
}
export function advanceStoredNatureWorld(now) {
    const next = advanceNatureWorld(natureWorld, now);
    if (JSON.stringify(next) === JSON.stringify(natureWorld))
        return natureWorld;
    return commitNatureWorld(next);
}
/** 启动时依次应用尚未发放的维护福利；以后只追加 content/maintenance-grants.json，不改发放逻辑。 */
export function applyMaintenanceSilverGrant(farmValues = farms.values(), now = Date.now()) {
    const players = [...farmValues].filter((farm) => farm && farm.id !== NPC_ID);
    const campaigns = [];
    for (const raw of MAINTENANCE_GRANTS) {
        const id = String(raw?.id ?? "").trim();
        const amount = Math.max(0, Math.floor(Number(raw?.silver) || 0));
        const notice = String(raw?.notice ?? "").trim();
        if (!id || amount <= 0 || !notice || appliedMaintenanceGrantIds.includes(id))
            continue;
        for (const farm of players) {
            farm.silver = Math.max(0, Math.floor(Number(farm.silver) || 0)) + amount;
            pushInbox(farm, notice, now);
            pushRanchNotice(farm, notice, now);
        }
        appliedMaintenanceGrantIds.push(id);
        campaigns.push({ id, amount, count: players.length });
    }
    return { applied: campaigns.length > 0, campaigns };
}
/** 七夕种子降价差额：只按冻结当日的真实购买计数结算一次，任务赠送的起步种子不计。 */
export function applyQixi2026SeedPriceRefund(farmValues = farms.values(), now = Date.now()) {
    if (appliedMaintenanceGrantIds.includes(QIXI_2026_PRICE_REFUND_ID))
        return { applied: false, count: 0, coins: 0, seeds: 0 };
    let count = 0;
    let coins = 0;
    let seeds = 0;
    for (const farm of farmValues) {
        if (!farm || farm.id === NPC_ID)
            continue;
        const refund = settleQixi2026SeedPriceRefund(farm, now);
        if (refund.coins <= 0)
            continue;
        const notice = `🎋 七夕限定种子已经降价，先前购买多付的 ${refund.coins} 金币已全部退回。`;
        pushInbox(farm, notice, now);
        pushRanchNotice(farm, notice, now);
        count += 1;
        coins += refund.coins;
        seeds += refund.seeds;
    }
    appliedMaintenanceGrantIds.push(QIXI_2026_PRICE_REFUND_ID);
    return { applied: true, count, coins, seeds };
}
/** 那智专属称号：按稳定公开门牌只发一次，不开放全服条件或领取入口。 */
export function applyNazhiExclusiveTitleGrant(farmValues = farms.values()) {
    if (appliedMaintenanceGrantIds.includes(NAZHI_EXCLUSIVE_TITLE_GRANT_ID))
        return { applied: false, count: 0, missing: false };
    const target = [...farmValues].find((farm) => farm?.id === NAZHI_FARM_ID);
    if (!target)
        return { applied: false, count: 0, missing: true };
    target.titles ??= [];
    let count = 0;
    if (!target.titles.includes(NAZHI_EXCLUSIVE_TITLE_ID)) {
        target.titles.push(NAZHI_EXCLUSIVE_TITLE_ID);
        pushLog(target, `🎖️ 解锁称号「${NAZHI_EXCLUSIVE_TITLE_NAME}」——可让 ${target.humanName || "伴侣"} 帮你佩戴`);
        count = 1;
    }
    appliedMaintenanceGrantIds.push(NAZHI_EXCLUSIVE_TITLE_GRANT_ID);
    return { applied: true, count, missing: false };
}
/** 启动时补发已经达标但尚未领取的流光原野成就奖励；每项成就 ID 自身保证幂等。 */
export function applyGlimmerAchievementRewardBackfill(farmValues = farms.values(), now = Date.now()) {
    let count = 0;
    let achievements = 0;
    let coins = 0;
    let silver = 0;
    for (const farm of farmValues) {
        if (!farm || farm.id === NPC_ID)
            continue;
        const grants = settleGlimmerAchievementRewards(farm);
        if (!grants.length)
            continue;
        const notice = glimmerAchievementRewardText(grants, true);
        pushInbox(farm, notice, now);
        pushRanchNotice(farm, notice, now);
        count += 1;
        achievements += grants.length;
        coins += grants.reduce((sum, item) => sum + item.coins, 0);
        silver += grants.reduce((sum, item) => sum + item.silver, 0);
    }
    return { applied: count > 0, count, achievements, coins, silver };
}
/** Doorbell 欢迎礼物：服务端 humanKey 定位、grantId 全局幂等，不复制到农场旧通知。 */
export function grantDoorbellWelcomeReward(humanKey, grantId, now = Date.now(), chooseIndex = randomInt) {
    const normalizedHumanKey = typeof humanKey === "string" ? humanKey : "";
    const normalizedGrantId = typeof grantId === "string" ? grantId.trim() : "";
    if (!normalizedHumanKey || !normalizedGrantId) {
        throw new DoorbellWelcomeRewardError(400, "invalid_request", "human_key and grant_id are required");
    }
    const farm = playerFarms().find((candidate) => candidate.humanKey === normalizedHumanKey);
    if (!farm) {
        throw new DoorbellWelcomeRewardError(404, "farm_credential_invalid", "The farm human credential is invalid");
    }
    const existing = doorbellWelcomeRewardGrants.find((grant) => grant.grantId === normalizedGrantId);
    if (existing) {
        if (existing.farmId !== farm.id) {
            throw new DoorbellWelcomeRewardError(409, "grant_target_mismatch", "The grant is already bound to another farm");
        }
        return { applied: false, ...existing };
    }
    if (SSR_CROPS.length === 0) {
        throw new DoorbellWelcomeRewardError(503, "reward_catalog_unavailable", "No SSR seed is available");
    }
    const selectedIndex = chooseIndex(SSR_CROPS.length);
    const seed = SSR_CROPS[selectedIndex];
    if (!seed) {
        throw new DoorbellWelcomeRewardError(503, "reward_catalog_unavailable", "No SSR seed is available");
    }
    normalizeFarm(farm);
    const previousSilver = farm.silver;
    const previousSeedCount = farm.seeds[seed.id] ?? 0;
    const grant = {
        grantId: normalizedGrantId,
        farmId: farm.id,
        seedId: seed.id,
        seedName: seed.name,
        grantedAt: now,
    };
    farm.silver = previousSilver + DOORBELL_WELCOME_SILVER;
    farm.seeds[seed.id] = previousSeedCount + 1;
    doorbellWelcomeRewardGrants.push(grant);
    try {
        save();
    }
    catch (error) {
        farm.silver = previousSilver;
        if (previousSeedCount === 0)
            delete farm.seeds[seed.id];
        else
            farm.seeds[seed.id] = previousSeedCount;
        doorbellWelcomeRewardGrants.pop();
        throw error;
    }
    return { applied: true, ...grant };
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
function worldSnapshot(farmValues = farms.values(), ugcValues = dumpUgc(), natureValue = natureWorld) {
    return {
        format: "aifarm-world",
        version: 1,
        maintenanceGrantIds: appliedMaintenanceGrantIds,
        doorbellWelcomeRewardGrants,
        doorbellFarmCreations,
        farms: [...farmValues],
        ugc: ugcValues,
        glimmer: glimmerWorld,
        publicExpedition: publicExpeditionWorld,
        qixiLantern2026: qixiLantern2026World,
        nature: natureValue,
    };
}
function writeWorldAtomic(world) {
    mkdirSync(DATA_DIR, { recursive: true });
    // 原子写：先写 .tmp 再 rename（rename 在同一文件系统是原子的）——避免写到一半进程崩导致整库损坏/清空。
    const tmp = WORLD_FILE + ".tmp";
    const data = JSON.stringify(world, null, 2);
    writeFileSync(tmp, data, "utf8");
    renameSync(tmp, WORLD_FILE);
}
function commitWorld(world) {
    const write = () => writeWorldAtomic(world);
    return worldCommitCoordinator
        ? worldCommitCoordinator(world, worldCommitContext.getStore() ?? null, write)
        : write();
}
export function setWorldCommitCoordinator(coordinator) {
    if (coordinator !== null && typeof coordinator !== "function")
        throw new TypeError("world commit coordinator must be a function or null");
    worldCommitCoordinator = coordinator;
}
export function withWorldCommitContext(context, operation) {
    if (!context || typeof context !== "object" || typeof operation !== "function")
        throw new TypeError("world commit context and operation are required");
    return worldCommitContext.run(Object.freeze({ ...context }), operation);
}
export function snapshotWorldForRollback() {
    return structuredClone(worldSnapshot());
}
export function restoreWorldSnapshotInMemory(snapshot) {
    if (snapshot?.format !== "aifarm-world" || snapshot?.version !== 1 || !Array.isArray(snapshot?.farms))
        throw new TypeError("valid farm world snapshot is required");
    appliedMaintenanceGrantIds = [...snapshot.maintenanceGrantIds];
    doorbellWelcomeRewardGrants = structuredClone(snapshot.doorbellWelcomeRewardGrants);
    doorbellFarmCreations = structuredClone(snapshot.doorbellFarmCreations);
    glimmerWorld = normalizeGlimmerWorld(snapshot.glimmer);
    publicExpeditionWorld = normalizePublicExpeditionWorld(snapshot.publicExpedition);
    qixiLantern2026World = normalizeQixiLantern2026World(snapshot.qixiLantern2026);
    natureWorld = normalizeNatureWorld(snapshot.nature);
    loadUgc(structuredClone(snapshot.ugc));
    farms.clear();
    for (const farm of snapshot.farms)
        farms.set(farm.id, normalizeFarm(structuredClone(farm)));
}
/**
 * Replace several existing farms and the shared UGC catalog in one durable
 * world-file commit. The replacements must already be isolated working
 * copies; the live maps are not touched until the single rename succeeds.
 */
export function replaceFarmsAtomic(replacements, ugcValues = dumpUgc()) {
    if (!Array.isArray(replacements) || replacements.length === 0)
        throw new TypeError("farm replacements must be a non-empty array");
    const staged = new Map();
    for (const entry of replacements) {
        const id = String(entry?.id ?? entry?.farm?.id ?? "");
        if (!id || staged.has(id))
            throw new Error("farm replacements must contain each farm exactly once");
        const before = farms.get(id);
        if (!before)
            throw new Error(`farm not found: ${id}`);
        const farm = structuredClone(entry.farm);
        farm.id = id;
        staged.set(id, normalizeFarm(farm));
    }
    const nextUgc = structuredClone(ugcValues);
    const nextFarms = [...farms.values()].map((farm) => staged.get(farm.id) ?? farm);
    commitWorld(worldSnapshot(nextFarms, nextUgc));
    // Map.set and loadUgc do not perform I/O; the world file is already
    // committed, so publish both sides together after rename succeeds.
    loadUgc(nextUgc);
    for (const [id, farm] of staged)
        farms.set(id, farm);
    return [...staged.values()];
}
/**
 * Commit farm replacements, the shared UGC catalog, and nature authority in
 * the same world-file rename. Live state is published only after that rename.
 */
export function replaceFarmsAndNatureAtomic({ replacements, nextNatureWorld, ugc = dumpUgc() }) {
    if (!Array.isArray(replacements) || replacements.length === 0)
        throw new TypeError("farm replacements must be a non-empty array");
    if (nextNatureWorld == null)
        throw new TypeError("next nature world is required");
    if (!Array.isArray(ugc))
        throw new TypeError("UGC catalog must be an array");
    const staged = new Map();
    for (const entry of replacements) {
        const id = String(entry?.id ?? entry?.farm?.id ?? "");
        if (!id || staged.has(id))
            throw new Error("farm replacements must contain each farm exactly once");
        if (!farms.has(id))
            throw new Error(`farm not found: ${id}`);
        const farm = structuredClone(entry.farm);
        farm.id = id;
        staged.set(id, normalizeFarm(farm));
    }
    const nextUgc = structuredClone(ugc);
    const stagedNature = normalizeNatureWorld(nextNatureWorld);
    const nextFarms = [...farms.values()].map((farm) => staged.get(farm.id) ?? farm);
    commitWorld(worldSnapshot(nextFarms, nextUgc, stagedNature));
    loadUgc(nextUgc);
    for (const [id, farm] of staged)
        farms.set(id, farm);
    natureWorld = stagedNature;
    return { farms: [...staged.values()], nature: stagedNature };
}
/** 确保常驻 NPC 阿土在库里（首次启动 / 老存档没有时建一座）。返回是否新建。 */
function ensureNpc() {
    if (farms.has(NPC_ID))
        return false;
    farms.set(NPC_ID, makeNpcFarm());
    return true;
}
export function save() {
    commitWorld(worldSnapshot());
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
            doorbellWelcomeRewardGrants = Array.isArray(world.doorbellWelcomeRewardGrants)
                ? world.doorbellWelcomeRewardGrants.filter((grant) => grant && typeof grant.grantId === "string" && typeof grant.farmId === "string" && typeof grant.seedId === "string" && typeof grant.seedName === "string" && Number.isFinite(grant.grantedAt))
                : [];
            doorbellFarmCreations = Array.isArray(world.doorbellFarmCreations)
                ? world.doorbellFarmCreations.filter((entry) => entry && typeof entry.creationId === "string" && typeof entry.farmId === "string" && typeof entry.requestFingerprint === "string" && Number.isFinite(entry.createdAt))
                : [];
            glimmerWorld = normalizeGlimmerWorld(world.glimmer);
            publicExpeditionWorld = normalizePublicExpeditionWorld(world.publicExpedition);
            qixiLantern2026World = normalizeQixiLantern2026World(world.qixiLantern2026);
            natureWorld = normalizeNatureWorld(world.nature);
            loadUgc(Array.isArray(world.ugc) ? world.ugc : []);
            farms.clear();
            for (const f of world.farms)
                farms.set(f.id, normalizeFarm(f));
            console.log(`[store] 已载入 ${farms.size} 个农场`);
            const npcCreated = ensureNpc();
            const grant = applyMaintenanceSilverGrant();
            for (const campaign of grant.campaigns)
                console.log(`[store] 维护福利 ${campaign.id} 已发放 ${campaign.count} 个玩家农场，每家 ${campaign.amount} 银`);
            const qixiRefund = applyQixi2026SeedPriceRefund();
            if (qixiRefund.applied)
                console.log(`[store] 七夕种子降价退款已发放 ${qixiRefund.count} 个玩家农场、${qixiRefund.seeds} 颗种子，共 ${qixiRefund.coins} 金`);
            const nazhiTitleGrant = applyNazhiExclusiveTitleGrant();
            if (nazhiTitleGrant.applied)
                console.log(`[store] 那智专属称号已发放 ${nazhiTitleGrant.count} 个玩家农场`);
            const achievementBackfill = applyGlimmerAchievementRewardBackfill();
            if (achievementBackfill.applied)
                console.log(`[store] 流光原野成就奖励已补发 ${achievementBackfill.count} 个玩家农场、${achievementBackfill.achievements} 项，共 ${achievementBackfill.coins} 金、${achievementBackfill.silver} 银`);
            if (npcCreated || grant.applied || qixiRefund.applied || nazhiTitleGrant.applied || achievementBackfill.applied)
                save();
            return;
        }
        catch (err) {
            console.error(`[store] 联机世界存档损坏，拒绝启动并保留原文件 ${WORLD_FILE}:`, err);
            throw new Error(`联机世界存档损坏，拒绝启动：${WORLD_FILE}`, { cause: err });
        }
    }
    if (existsSync(UGC_FILE)) {
        try {
            loadUgc(JSON.parse(readFileSync(UGC_FILE, "utf8")));
        }
        catch { /* 忽略 */ }
    }
    appliedMaintenanceGrantIds = [];
    doorbellWelcomeRewardGrants = [];
    doorbellFarmCreations = [];
    glimmerWorld = normalizeGlimmerWorld({});
    publicExpeditionWorld = normalizePublicExpeditionWorld({});
    qixiLantern2026World = normalizeQixiLantern2026World({});
    natureWorld = normalizeNatureWorld(null);
    if (!existsSync(DATA_FILE)) {
        ensureNpc();
        applyMaintenanceSilverGrant();
        applyQixi2026SeedPriceRefund();
        applyNazhiExclusiveTitleGrant();
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
    for (const campaign of grant.campaigns)
        console.log(`[store] 维护福利 ${campaign.id} 已发放 ${campaign.count} 个玩家农场，每家 ${campaign.amount} 银`);
    const qixiRefund = applyQixi2026SeedPriceRefund();
    if (qixiRefund.applied)
        console.log(`[store] 七夕种子降价退款已发放 ${qixiRefund.count} 个玩家农场、${qixiRefund.seeds} 颗种子，共 ${qixiRefund.coins} 金`);
    const nazhiTitleGrant = applyNazhiExclusiveTitleGrant();
    if (nazhiTitleGrant.applied)
        console.log(`[store] 那智专属称号已发放 ${nazhiTitleGrant.count} 个玩家农场`);
    const achievementBackfill = applyGlimmerAchievementRewardBackfill();
    if (achievementBackfill.applied)
        console.log(`[store] 流光原野成就奖励已补发 ${achievementBackfill.count} 个玩家农场、${achievementBackfill.achievements} 项，共 ${achievementBackfill.coins} 金、${achievementBackfill.silver} 银`);
    save(); // 老格式只读一次，随后迁入单文件原子 world.json
}
//# sourceMappingURL=store.js.map

// 公共农场附属钓鱼：数据与确定性抽取逻辑改编自 tutusagi/ai-fishing-game v1.2-lite。
// 许可与 Required Notice 见 ../THIRD_PARTY_NOTICES.md。这里不引入独立点数、季节或升级。
import {
    fishing, fishingSpots, fishingFish, fishingBaits, fishingEvents, fishingItems,
    fishingSpotById, fishingFishById, fishingBaitById, fishingEventById, fishingItemById,
} from "./content.js";
import { currentSeason, currentDayIndex } from "./time.js";
import { randomUUID } from "node:crypto";
import { glimmerBuffMultiplier } from "./glimmer.js";

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const ECOLOGY_NOTICE = "🌿 为了让鱼群休息、繁衍，也给水域留一点恢复时间，每座农场每天最多钓 20 竿。无论钓到鱼、宝箱还是旧靴子，只要鱼线抛进水里都算一竿；北京时间 0 点刷新。";
const DAILY_LIMIT_REACHED = "🌿 今天已经钓满 20 竿啦。鱼群需要休息，水面也该安静一会儿；先整理鱼篓、卖鱼或做料理吧，北京时间 0 点后再来。";

class FishingRng {
    constructor(state, calls = 0) {
        this.state = Number(state) >>> 0;
        this.calls = Math.max(0, Math.floor(Number(calls) || 0));
    }
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        this.calls++;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(min, max) {
        return min + Math.floor(this.next() * (max - min + 1));
    }
}

function seedForFarm(farm) {
    let h = 2166136261;
    for (const ch of String(farm.id ?? "farm")) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) ^ (Number(farm.rngState) >>> 0) ^ 0x9E3779B9) >>> 0;
}

function cleanCount(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}

/** 老存档第一次接触钓鱼时补默认值；不建立第二份存档。 */
export function ensureFishing(farm) {
    const state = (farm.fishing && typeof farm.fishing === "object") ? farm.fishing : (farm.fishing = {});
    state.version ??= 1;
    state.rngState = Number.isFinite(state.rngState) ? (state.rngState >>> 0) : seedForFarm(farm);
    state.rngCalls = cleanCount(state.rngCalls);
    state.locationId = fishingSpotById.has(state.locationId) ? state.locationId : fishing.initialLocationId;
    state.activeUntil = Number.isFinite(state.activeUntil) ? Math.max(0, state.activeUntil) : 0;
    state.baitInventory = (state.baitInventory && typeof state.baitInventory === "object")
        ? state.baitInventory : structuredClone(fishing.initialBaitInventory);
    for (const bait of fishingBaits)
        state.baitInventory[bait.id] = cleanCount(state.baitInventory[bait.id]);
    state.catchInventory = Array.isArray(state.catchInventory) ? state.catchInventory : [];
    state.items = (state.items && typeof state.items === "object") ? state.items : {};
    state.pendingChests = Array.isArray(state.pendingChests) ? state.pendingChests : [];
    state.seenLetters = (state.seenLetters && typeof state.seenLetters === "object") ? state.seenLetters : {};
    state.codex = (state.codex && typeof state.codex === "object") ? state.codex : {};
    state.stats = (state.stats && typeof state.stats === "object") ? state.stats : {};
    state.stats.totalCasts = cleanCount(state.stats.totalCasts);
    state.stats.totalCaught = cleanCount(state.stats.totalCaught);
    state.stats.totalChests = cleanCount(state.stats.totalChests);
    state.dailyCasts = (state.dailyCasts && typeof state.dailyCasts === "object") ? state.dailyCasts : {};
    state.dailyCasts.day = Number.isSafeInteger(state.dailyCasts.day) ? state.dailyCasts.day : -1;
    state.dailyCasts.count = cleanCount(state.dailyCasts.count);
    state.fever = cleanCount(state.fever);
    state.freeBait = cleanCount(state.freeBait);
    state.lastBaitId = fishingBaitById.has(state.lastBaitId) ? state.lastBaitId : "basic_worm";
    return state;
}

const byIdOrName = (items, value) => {
    const q = String(value ?? "").trim();
    return items.find((item) => item.id === q || item.name === q);
};

const seasonDef = (now) => {
    const active = currentSeason(now).name;
    return fishing.seasons.find((item) => item.name === active) ?? fishing.seasons[0];
};

const sumBait = (state) => Object.values(state.baitInventory).reduce((sum, n) => sum + cleanCount(n), 0);

function dailyCasts(state, now) {
    const day = currentDayIndex(now);
    if (state.dailyCasts.day !== day)
        state.dailyCasts = { day, count: 0 };
    return state.dailyCasts;
}

export function fishingStatusLine(farm, now) {
    const state = ensureFishing(farm);
    const spot = fishingSpotById.get(state.locationId);
    const season = seasonDef(now);
    const today = dailyCasts(state, now);
    return `🎣 ${spot?.name ?? "农场鱼塘"}·${season.name}｜余饵 ${sumBait(state)}｜鱼篓 ${state.catchInventory.length}｜图鉴 ${Object.keys(state.codex).length}/${fishingFish.length}｜今日 ${today.count}/${fishing.dailyCastLimit} 竿｜💰${farm.coins}｜🪙${farm.silver}`;
}

function activeAtSpot(farms, spotId, now, excludeId) {
    return farms.filter((farm) => farm.id !== excludeId
        && farm.fishing?.locationId === spotId
        && Number(farm.fishing?.activeUntil ?? 0) > now);
}

export function fishingSpotOccupancy(farms, spotId, now) {
    return activeAtSpot(farms, spotId, now).length;
}

function claimSpot(farm, farms, now) {
    const state = ensureFishing(farm);
    const others = activeAtSpot(farms, state.locationId, now, farm.id);
    if (others.length >= fishing.capacityPerSpot) {
        const spot = fishingSpotById.get(state.locationId);
        return { ok: false, error: `🎣 【${spot?.name ?? state.locationId}】已经坐满 ${fishing.capacityPerSpot} 家了，换个钓点或过会儿再来。` };
    }
    state.activeUntil = now + fishing.leaseMs;
    return { ok: true };
}

function weightedPick(rng, items, weightOf) {
    const weights = items.map((item) => Math.max(0, Number(weightOf(item)) || 0));
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (total <= 0)
        return items[0];
    let needle = rng.next() * total;
    for (let i = 0; i < items.length; i++) {
        needle -= weights[i];
        if (needle <= 0)
            return items[i];
    }
    return items.at(-1);
}

function eligibleFish(fish, spotId, seasonId) {
    return (fish.spots.includes("all") || fish.spots.includes(spotId))
        && (fish.seasons.includes("all") || fish.seasons.includes(seasonId));
}

function fishWeight(fishDef, spot, season, bait, now) {
    let weight = fishing.rarities[fishDef.rarity].weight * (fishDef.individual_weight ?? 1);
    for (const tag of fishDef.tags ?? []) {
        weight *= spot.tagWeightMult?.[tag] ?? 1;
        weight *= season.tag_weight_mult?.[tag] ?? 1;
        weight *= bait.effects?.tag_weight_mult?.[tag] ?? 1;
    }
    weight *= bait.effects?.rarity_weight_mult?.[fishDef.rarity] ?? 1;
    if ((RARITY_RANK[fishDef.rarity] ?? 0) >= RARITY_RANK.rare)
        weight *= glimmerBuffMultiplier("fishingRareWeight", now);
    return weight;
}

function rollSize(rng, fishDef) {
    return rng.int(fishDef.size_min, fishDef.size_max);
}

function rawFishValue(fishDef, size) {
    const mid = (fishDef.size_min + fishDef.size_max) / 2;
    return Math.max(1, Math.round(fishDef.base_value * (size / mid) ** 1.5));
}

function fishSilver(fishDef, rawValue) {
    return Math.max(fishing.rarities[fishDef.rarity].silverFloor, Math.round(rawValue / 10));
}

function recordCatch(farm, state, fishDef, size) {
    const rawValue = rawFishValue(fishDef, size);
    const sellSilver = fishSilver(fishDef, rawValue);
    state.stats.totalCaught++;
    const instance = {
        id: `fish_${randomUUID()}`,
        fishId: fishDef.id,
        size,
        rawValue,
        sellSilver,
    };
    state.catchInventory.push(instance);
    const first = !state.codex[fishDef.id];
    const entry = (state.codex[fishDef.id] ??= { count: 0, maxSize: 0 });
    entry.count++;
    entry.maxSize = Math.max(entry.maxSize, size);
    const bonus = first ? fishing.rarities[fishDef.rarity].firstBonusSilver : 0;
    if (bonus)
        farm.silver += bonus;
    return { instance, first, bonus };
}

function addReward(farm, state, rng, reward) {
    const parts = [];
    if (reward?.silverRange) {
        const amount = rng.int(reward.silverRange[0], reward.silverRange[1]);
        farm.silver += amount;
        parts.push(`+${amount} 银`);
    }
    for (const item of reward?.items ?? []) {
        state.items[item.id] = cleanCount(state.items[item.id]) + cleanCount(item.qty);
        parts.push(`${fishingItemById.get(item.id)?.name ?? item.id}×${item.qty}`);
    }
    for (const bait of reward?.bait ?? []) {
        state.baitInventory[bait.id] = cleanCount(state.baitInventory[bait.id]) + cleanCount(bait.qty);
        parts.push(`${fishingBaitById.get(bait.id)?.name ?? bait.id}×${bait.qty}`);
    }
    return parts;
}

function resolveFishingEvent(farm, state, rng) {
    const pool = fishingEvents.filter((event) => {
        if (!event.unique || !event.messages?.length)
            return true;
        return (state.seenLetters[event.id]?.length ?? 0) < event.messages.length;
    });
    const event = weightedPick(rng, pool, (item) => item.weight);
    if (event.type === "bottle") {
        const seen = (state.seenLetters[event.id] ??= []);
        const unseen = event.messages.map((_, index) => index).filter((index) => !seen.includes(index));
        const index = unseen[rng.int(0, unseen.length - 1)];
        seen.push(index);
        return { kind: "event", text: `🌊 漂流瓶：${event.messages[index]}` };
    }
    if (event.type === "chest") {
        state.stats.totalChests++;
        const chest = { id: `chest_${randomUUID()}`, eventId: event.id };
        state.pendingChests.push(chest);
        return { kind: "event", text: `📦 钓到【${event.name}】〔${chest.id}〕，先放进鱼篓；用 open 打开。` };
    }
    const rewards = addReward(farm, state, rng, event.rewards ?? {});
    return { kind: "event", text: `🌊 ${event.name}${rewards.length ? `：${rewards.join("、")}` : "。"}` };
}

function rollLuckyEvent(farm, state, rng, pool, bait, primary) {
    if (rng.next() >= fishing.luckChance)
        return null;
    const event = weightedPick(rng, fishing.luckyEvents, (item) => item.weight);
    if (event.id === "split_hook") {
        const got = [];
        for (let i = 0; i < 2; i++) {
            const fishDef = weightedPick(rng, pool, (item) => fishWeight(item, fishingSpotById.get(state.locationId), seasonDef(primary.now), bait, primary.now));
            const result = recordCatch(farm, state, fishDef, rollSize(rng, fishDef));
            got.push(`${fishDef.name}${result.first ? "★新" : ""}`);
        }
        return { id: event.id, text: `🪝✨ 分裂鱼钩！又钓上两条：${got.join("、")}。` };
    }
    if (event.id === "golden_touch") {
        const before = primary.instance.sellSilver;
        primary.instance.sellSilver *= 3;
        return { id: event.id, text: `✨💰 点石成金！这条鱼的可售银币 ×3：${before} → ${primary.instance.sellSilver} 银。` };
    }
    if (event.id === "fever") {
        state.fever += fishing.feverCatches;
        return { id: event.id, text: `🔥 渔获热潮！接下来钓到的 ${fishing.feverCatches} 条鱼都会额外复制一条。` };
    }
    if (event.id === "river_blessing") {
        state.baitInventory[bait.id] = cleanCount(state.baitInventory[bait.id]) + 1;
        state.freeBait += fishing.freeBaitCasts;
        return { id: event.id, text: `🌊 河神祝福！退回这一竿的鱼饵，接下来 ${fishing.freeBaitCasts} 竿不消耗鱼饵。` };
    }
    if (event.id === "tide_record") {
        const fishDef = fishingFishById.get(primary.instance.fishId);
        primary.instance.size = fishDef.size_max;
        primary.instance.rawValue = rawFishValue(fishDef, fishDef.size_max);
        primary.instance.sellSilver = fishSilver(fishDef, primary.instance.rawValue);
        state.codex[fishDef.id].maxSize = Math.max(state.codex[fishDef.id].maxSize, fishDef.size_max);
        return { id: event.id, text: `🌊📏 千载难逢的涨潮！这条鱼长到极限 ${fishDef.size_max}${fishDef.size_unit}，可卖 ${primary.instance.sellSilver} 银。` };
    }
    const treasures = fishingItems.filter((item) => item.sellable);
    const item = treasures[rng.int(0, treasures.length - 1)];
    state.items[item.id] = cleanCount(state.items[item.id]) + 1;
    return { id: event.id, text: `🦪✨ 蚌中生珠！鱼肚里找到${item.name}。` };
}

function castStep(farm, state, rng, bait, now) {
    if (state.freeBait > 0)
        state.freeBait--;
    else
        state.baitInventory[bait.id]--;
    state.lastBaitId = bait.id;
    state.stats.totalCasts++;
    dailyCasts(state, now).count++;
    if (rng.next() < fishing.eventChance)
        return { consumed: true, ...resolveFishingEvent(farm, state, rng) };
    const junkChance = fishing.junkChance * (bait.effects?.junk_chance_mult ?? 1) * glimmerBuffMultiplier("fishingJunk", now);
    if (rng.next() < junkChance) {
        const junk = fishing.junk[rng.int(0, fishing.junk.length - 1)];
        return { consumed: true, kind: "junk", text: `🪣 钓上来${junk}。空军一竿。` };
    }
    const season = seasonDef(now);
    const spot = fishingSpotById.get(state.locationId);
    const pool = fishingFish.filter((fishDef) => eligibleFish(fishDef, spot.id, season.id));
    if (!pool.length)
        return { consumed: true, kind: "empty", text: `浮标纹丝不动……${spot.name}这个季节没有鱼咬钩。` };
    const fishDef = weightedPick(rng, pool, (item) => fishWeight(item, spot, season, bait, now));
    const caught = recordCatch(farm, state, fishDef, rollSize(rng, fishDef));
    let feverText = "";
    if (state.fever > 0) {
        state.fever--;
        const duplicate = recordCatch(farm, state, fishDef, caught.instance.size);
        feverText = `\n🔥 热潮翻倍：又得到一条${fishDef.name}〔${duplicate.instance.id}〕。`;
    }
    const lucky = rollLuckyEvent(farm, state, rng, pool, bait, { ...caught, now });
    const rarity = fishing.rarities[fishDef.rarity].label;
    const first = caught.first ? `\n🆕 首次收录，额外 +${caught.bonus} 银。` : "";
    const luck = lucky ? `\n${lucky.text}` : "";
    return {
        consumed: true, kind: "fish", fishName: fishDef.name, rarity: fishDef.rarity,
        first: caught.first, luck: lucky?.id,
        text: `🐟 ${fishDef.name} · ${rarity} · ${caught.instance.size}${fishDef.size_unit} · 可卖 ${caught.instance.sellSilver} 银〔${caught.instance.id}〕${first}${feverText}${luck}`,
    };
}

function chooseCastBait(state, requested) {
    if (requested !== undefined) {
        const bait = byIdOrName(fishingBaits, requested);
        if (!bait)
            return { ok: false, error: `没有这种鱼饵：${requested}。` };
        if (state.freeBait <= 0 && cleanCount(state.baitInventory[bait.id]) <= 0)
            return { ok: false, error: `${bait.name}已经用光了。先买饵再抛竿。` };
        return { ok: true, bait };
    }
    const available = fishingBaits.filter((bait) => cleanCount(state.baitInventory[bait.id]) > 0)
        .sort((a, b) => a.cost - b.cost);
    if (!available.length && state.freeBait <= 0)
        return { ok: false, error: "没有鱼饵了；这次没有抛竿，也没有占用钓位。" };
    const bait = available[0] ?? fishingBaitById.get(state.lastBaitId) ?? fishingBaits[0];
    return { ok: true, bait };
}

function parseStop(value) {
    const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
    const stop = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
    const invalid = stop.find((item) => !["new", "rare", "event"].includes(item));
    return invalid ? { ok: false, error: `stop 不认识「${invalid}」，只接受 new、rare、event。` } : { ok: true, stop: new Set(stop) };
}

function castMany(farm, state, farms, params, now) {
    const times = params.times === undefined ? 1 : Number(params.times);
    if (!Number.isSafeInteger(times) || times < 1 || times > 20)
        return { ok: false, text: "times 只接受 1～20 的整数。" };
    const parsedStop = parseStop(params.stop);
    if (!parsedStop.ok)
        return { ok: false, text: parsedStop.error };
    const today = dailyCasts(state, now);
    const remaining = Math.max(0, fishing.dailyCastLimit - today.count);
    if (remaining === 0)
        return { ok: false, text: DAILY_LIMIT_REACHED };
    const castTimes = Math.min(times, remaining);
    const ecologyLimit = times > remaining
        ? `🌿 今天只剩 ${remaining} 竿生态额度，本次已自动按 ${remaining} 竿收竿。再多抛就要把鱼群吓跑啦。`
        : "";
    const chosen = chooseCastBait(state, params.bait);
    if (!chosen.ok)
        return { ok: false, text: chosen.error };
    const claimed = claimSpot(farm, farms, now);
    if (!claimed.ok)
        return { ok: false, text: claimed.error };
    const rng = new FishingRng(state.rngState, state.rngCalls);
    const highlights = [];
    const caught = new Map();
    let done = 0, fishCount = 0, junkCount = 0, eventCount = 0, stopReason = "";
    for (let i = 0; i < castTimes; i++) {
        const nextBait = chooseCastBait(state, params.bait);
        if (!nextBait.ok) {
            highlights.push(nextBait.error);
            stopReason = "·鱼饵用完";
            break;
        }
        const result = castStep(farm, state, rng, nextBait.bait, now);
        done++;
        if (result.kind === "fish") {
            fishCount++;
            caught.set(result.fishName, (caught.get(result.fishName) ?? 0) + 1);
        }
        else if (result.kind === "junk" || result.kind === "empty")
            junkCount++;
        else if (result.kind === "event")
            eventCount++;
        const rare = (RARITY_RANK[result.rarity] ?? -1) >= RARITY_RANK.rare;
        if (times === 1 || result.first || rare || result.kind === "event" || result.luck)
            highlights.push(result.text);
        const stopped = (parsedStop.stop.has("new") && result.first)
            || (parsedStop.stop.has("rare") && rare)
            || (parsedStop.stop.has("event") && (result.kind === "event" || result.luck));
        if (stopped) {
            stopReason = result.first ? "·发现新种" : rare ? "·钓到稀有" : "·遇到事件";
            break;
        }
    }
    state.rngState = rng.state;
    state.rngCalls = rng.calls;
    state.activeUntil = now + fishing.leaseMs;
    if (times === 1)
        return { ok: true, text: highlights.join("\n") };
    const haul = [...caught].map(([name, count]) => `${name}×${count}`).join("、") || "无";
    const summary = `🎣 连钓 ${done} 竿${stopReason}｜鱼 ${fishCount} 条：${haul}｜垃圾/空竿 ${junkCount}｜事件 ${eventCount}`;
    const text = highlights.length ? `${highlights.join("\n———\n")}\n\n${summary}` : summary;
    return { ok: true, text: ecologyLimit ? `${text}\n${ecologyLimit}` : text };
}

function buyBait(farm, state, requested, qty) {
    const bait = byIdOrName(fishingBaits, requested ?? "basic_worm");
    if (!bait)
        return { ok: false, text: `没有这种鱼饵：${requested}。` };
    const count = Number(qty);
    if (!Number.isSafeInteger(count) || count < 1)
        return { ok: false, text: "buy 只接受正整数数量。" };
    const cost = bait.cost * count;
    if (farm.coins < cost)
        return { ok: false, text: `金币不足：${bait.name}×${count}要 ${cost} 金（你有 ${farm.coins}）。` };
    farm.coins -= cost;
    state.baitInventory[bait.id] = cleanCount(state.baitInventory[bait.id]) + count;
    return { ok: true, text: `🎣 买下${bait.name}×${count}，花 ${cost} 金；现有 ${bait.name}×${state.baitInventory[bait.id]}。` };
}

function chooseSpot(state, requested) {
    const spot = byIdOrName(fishingSpots, requested);
    if (!spot)
        return { ok: false, text: `没有这个钓点：${requested}。用 view:"spots" 看清单。` };
    const changed = state.locationId !== spot.id;
    state.locationId = spot.id;
    if (changed)
        state.activeUntil = 0;
    return { ok: true, text: `🎣 已选【${spot.name}】${changed ? "，原钓点已释放" : ""}。` };
}

function sellFishing(farm, state, target) {
    const q = String(target ?? "").trim();
    const sellableItems = () => Object.entries(state.items).filter(([id, qty]) => cleanCount(qty) > 0 && fishingItemById.get(id)?.sellable);
    if (q === "all") {
        const fishGain = state.catchInventory.reduce((sum, item) => sum + cleanCount(item.sellSilver), 0);
        const itemRows = sellableItems();
        const itemGain = itemRows.reduce((sum, [id, qty]) => sum + fishingItemById.get(id).sellSilver * cleanCount(qty), 0);
        const fishCount = state.catchInventory.length;
        state.catchInventory = [];
        for (const [id] of itemRows)
            state.items[id] = 0;
        const gain = fishGain + itemGain;
        if (!gain)
            return { ok: false, text: "鱼篓里没有可卖的鱼或财宝。" };
        farm.silver += gain;
        return { ok: true, text: `♻️ 卖出 ${fishCount} 条鱼${itemRows.length ? `和 ${itemRows.length} 类财宝` : ""}，+${gain} 银；图鉴记录保留。` };
    }
    const instance = state.catchInventory.find((item) => item.id === q);
    if (instance) {
        state.catchInventory = state.catchInventory.filter((item) => item !== instance);
        farm.silver += instance.sellSilver;
        return { ok: true, text: `♻️ 卖出${fishingFishById.get(instance.fishId)?.name ?? instance.fishId}〔${instance.id}〕，+${instance.sellSilver} 银。` };
    }
    const fishDef = byIdOrName(fishingFish, q);
    if (fishDef) {
        const rows = state.catchInventory.filter((item) => item.fishId === fishDef.id);
        if (!rows.length)
            return { ok: false, text: `鱼篓里没有${fishDef.name}。` };
        const gain = rows.reduce((sum, item) => sum + item.sellSilver, 0);
        state.catchInventory = state.catchInventory.filter((item) => item.fishId !== fishDef.id);
        farm.silver += gain;
        return { ok: true, text: `♻️ 卖出${fishDef.name}×${rows.length}，+${gain} 银。` };
    }
    const itemDef = byIdOrName(fishingItems, q);
    if (itemDef?.sellable) {
        const qty = cleanCount(state.items[itemDef.id]);
        if (!qty)
            return { ok: false, text: `鱼篓里没有${itemDef.name}。` };
        const gain = qty * itemDef.sellSilver;
        state.items[itemDef.id] = 0;
        farm.silver += gain;
        return { ok: true, text: `♻️ 卖出${itemDef.name}×${qty}，+${gain} 银。` };
    }
    return { ok: false, text: `鱼篓里找不到「${q}」。` };
}

function openChest(farm, state, chestId) {
    const chest = state.pendingChests.find((item) => item.id === String(chestId ?? ""));
    if (!chest)
        return { ok: false, text: `鱼篓里没有这个宝箱：${chestId}。` };
    const event = fishingEventById.get(chest.eventId);
    const lock = event?.lock ?? {};
    let paid = "";
    if (lock.requiresItem && cleanCount(state.items[lock.requiresItem]) > 0) {
        state.items[lock.requiresItem]--;
        paid = `用掉${fishingItemById.get(lock.requiresItem)?.name ?? lock.requiresItem}`;
    }
    else if (lock.orGold !== undefined) {
        if (farm.coins < lock.orGold) {
            const key = lock.requiresItem ? `${fishingItemById.get(lock.requiresItem)?.name ?? lock.requiresItem}，或` : "";
            return { ok: false, text: `打开【${event.name}】需要${key}花 ${lock.orGold} 金（你有 ${farm.coins}）。` };
        }
        farm.coins -= lock.orGold;
        paid = `花 ${lock.orGold} 金`;
    }
    const rng = new FishingRng(state.rngState, state.rngCalls);
    const row = weightedPick(rng, event.lootTable ?? [], (item) => item.weight);
    const rewards = addReward(farm, state, rng, row?.reward ?? {});
    state.rngState = rng.state;
    state.rngCalls = rng.calls;
    state.pendingChests = state.pendingChests.filter((item) => item !== chest);
    return { ok: true, text: `📦 ${paid ? paid + "，" : ""}打开【${event.name}】：${rewards.join("、") || "里面空空如也"}。` };
}

function basketView(state) {
    const fishRows = state.catchInventory.map((item) => {
        const fishDef = fishingFishById.get(item.fishId);
        return `${fishDef?.name ?? item.fishId}〔${item.id}〕·${item.size}${fishDef?.size_unit ?? "cm"}·可卖 ${item.sellSilver} 银`;
    });
    const itemRows = Object.entries(state.items).filter(([, qty]) => cleanCount(qty) > 0)
        .map(([id, qty]) => `${fishingItemById.get(id)?.name ?? id}〔${id}〕×${qty}`);
    const chestRows = state.pendingChests.map((chest) => `${fishingEventById.get(chest.eventId)?.name ?? chest.eventId}〔${chest.id}〕`);
    return `🧺 鱼篓\n鱼：${fishRows.length ? `\n  ${fishRows.join("\n  ")}` : "（空）"}\n财宝：${itemRows.length ? itemRows.join("、") : "（空）"}\n宝箱：${chestRows.length ? chestRows.join("、") : "（空）"}`;
}

function codexView(state) {
    const counts = Object.keys(fishing.rarities).map((rarity) => {
        const total = fishingFish.filter((item) => item.rarity === rarity).length;
        const got = fishingFish.filter((item) => item.rarity === rarity && state.codex[item.id]).length;
        return `${fishing.rarities[rarity].label} ${got}/${total}`;
    });
    const rows = fishingFish.filter((item) => state.codex[item.id]).map((item) => {
        const entry = state.codex[item.id];
        return `${item.name}·${fishing.rarities[item.rarity].label}×${entry.count}·最大 ${entry.maxSize}${item.size_unit}`;
    });
    return `📖 钓鱼图鉴 ${Object.keys(state.codex).length}/${fishingFish.length}｜${counts.join("｜")}\n${rows.length ? rows.join("\n") : "（还没钓到鱼）"}`;
}

function spotsView(farm, state, farms, now) {
    const season = seasonDef(now);
    const rows = fishingSpots.map((spot) => {
        const occupied = activeAtSpot(farms, spot.id, now, farm.id).length + (state.locationId === spot.id && state.activeUntil > now ? 1 : 0);
        const fishCount = fishingFish.filter((item) => eligibleFish(item, spot.id, season.id)).length;
        return `${state.locationId === spot.id ? "✦" : "·"} ${spot.name}〔${spot.id}〕 ${occupied}/${fishing.capacityPerSpot}｜${season.name}季 ${fishCount} 种鱼`;
    });
    return `🎣 钓点（每处最多 ${fishing.capacityPerSpot} 家，抛竿后占位 10 分钟）\n${rows.join("\n")}\n\n${ECOLOGY_NOTICE}`;
}

export function fishingKitchenProducts(farm) {
    const state = ensureFishing(farm);
    return state.catchInventory.map((item) => ({
        id: item.id,
        itemId: "fish:any",
        fishId: item.fishId,
        name: fishingFishById.get(item.fishId)?.name ?? item.fishId,
        emoji: "🐟",
        value: item.sellSilver * 5,
        sellSilver: item.sellSilver,
        source: "fish",
    }));
}

export function removeFishingCatchIds(farm, ids) {
    if (!ids?.size)
        return;
    const state = ensureFishing(farm);
    state.catchInventory = state.catchInventory.filter((item) => !ids.has(item.id));
}

/** 单一 farm 工具下的扁平 fish 动作。全服 farms 用于钓位容量判定。 */
export function runFishing(farm, params, now, farms) {
    const state = ensureFishing(farm);
    const finish = (result) => ({ ...result, text: `${result.text}\n${fishingStatusLine(farm, now)}` });
    if (params.leave === true || params.leave === "true" || params.leave === "1") {
        state.activeUntil = 0;
        return finish({ ok: true, text: "🎣 已收竿离开，钓位立即释放。" });
    }
    if (params.view !== undefined) {
        const view = String(params.view);
        if (view === "basket")
            return finish({ ok: true, text: basketView(state) });
        if (view === "codex")
            return finish({ ok: true, text: codexView(state) });
        if (view === "spots")
            return finish({ ok: true, text: spotsView(farm, state, farms, now) });
        return finish({ ok: false, text: `view 不认识「${view}」，只接受 basket、codex、spots。` });
    }
    if (params.sell !== undefined)
        return finish(sellFishing(farm, state, params.sell));
    if (params.open !== undefined)
        return finish(openChest(farm, state, params.open));
    const out = [];
    if (params.buy !== undefined) {
        const bought = buyBait(farm, state, params.bait, Number(params.buy));
        if (!bought.ok)
            return finish(bought);
        out.push(bought.text);
    }
    if (params.location !== undefined) {
        const moved = chooseSpot(state, params.location);
        if (!moved.ok)
            return finish(moved);
        out.push(moved.text);
    }
    const shouldCast = params.times !== undefined || (params.bait !== undefined && params.buy === undefined)
        || (params.buy === undefined && params.location === undefined);
    if (shouldCast) {
        const cast = castMany(farm, state, farms, params, now);
        if (!cast.ok)
            return finish(cast);
        out.push(cast.text);
    }
    return finish({ ok: true, text: out.join("\n") });
}

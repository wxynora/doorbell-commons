import { randomUUID } from "node:crypto";
import {
    glimmer, glimmerVariants, glimmerEncounters, glimmerCoopEvents, glimmerVariantById,
    ranchSkinById, ranchVariantById,
    animals, animalById, pets, petById, cropById, cooking, cookingProducts,
    cookingProductById, cookingIngredients, cookingIngredientById, cookingRecipes,
    cookingRecipeById, fishingFishById, fishingBaitById, titles,
} from "./content.js";
import { currentDayIndex, currentSeason } from "./time.js";
import { bumpDaily } from "./daily.js";
import { Rng } from "./rng.js";
import { RANCH_LEVEL_INCOME_STEP } from "./config.js";
import { recordWelfareWeekProgress, takeWelfareWeekNotice } from "./welfare-week.js";
import { ranchSkinVariantsFor } from "./domain/ranch/skins.js";

const MAX_HISTORY = 30;
const MAX_PUBLIC_LOGS = 10;
const GLIMMER_ACHIEVEMENT_FIELDS = new Set(["glimmerEncounters", "glimmerVariants", "glimmerCoops"]);
const GLIMMER_ACHIEVEMENTS = titles.filter((item) => GLIMMER_ACHIEVEMENT_FIELDS.has(item.field));
const GLIMMER_ACHIEVEMENT_IDS = new Set(GLIMMER_ACHIEVEMENTS.map((item) => item.id));
const GLIMMER_KIND_IDS = new Set(glimmerVariants.map((item) => item.kindId));
const CAPTURE_PITY_LIMIT = Math.max(1, Math.floor(Number(glimmer.capturePityLimit) || 20));
const ANIMAL_INDEX = new Map(animals.map((item, index) => [item.id, index]));
const PET_INDEX = new Map(pets.map((item, index) => [item.id, animals.length + index]));
const GOOSE_INDEX = animals.length + pets.length;

function cleanCount(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}

export function normalizeGlimmerFarm(farm) {
    const state = farm.glimmer && typeof farm.glimmer === "object" ? farm.glimmer : (farm.glimmer = {});
    state.ticketDay = Number.isSafeInteger(state.ticketDay) ? state.ticketDay : -1;
    state.daily = state.daily && typeof state.daily === "object" ? state.daily : {};
    state.daily.day = Number.isSafeInteger(state.daily.day) ? state.daily.day : -1;
    state.daily.explores = cleanCount(state.daily.explores);
    state.daily.captures = cleanCount(state.daily.captures);
    state.daily.lastCatchAt = Number.isFinite(state.daily.lastCatchAt) ? Math.max(0, state.daily.lastCatchAt) : 0;
    state.unlocked = Array.isArray(state.unlocked)
        ? [...new Set(state.unlocked.map(String).filter((id) => glimmerVariantById.has(id)))] : [];
    state.encounterSeen = Array.isArray(state.encounterSeen)
        ? [...new Set(state.encounterSeen.map(String))] : [];
    state.favoriteSeen = Array.isArray(state.favoriteSeen)
        ? [...new Set(state.favoriteSeen.map(String))] : [];
    const capturePity = state.capturePity && typeof state.capturePity === "object" ? state.capturePity : {};
    state.capturePity = {};
    for (const [kindId, count] of Object.entries(capturePity)) {
        const normalized = Math.min(CAPTURE_PITY_LIMIT - 1, cleanCount(count));
        if (GLIMMER_KIND_IDS.has(kindId) && normalized > 0)
            state.capturePity[kindId] = normalized;
    }
    state.achievementRewards = Array.isArray(state.achievementRewards)
        ? [...new Set(state.achievementRewards.map(String).filter((id) => GLIMMER_ACHIEVEMENT_IDS.has(id)))] : [];
    state.pending = state.pending && typeof state.pending === "object" ? state.pending : null;
    state.history = Array.isArray(state.history) ? state.history.slice(0, MAX_HISTORY) : [];
    state.stats = state.stats && typeof state.stats === "object" ? state.stats : {};
    state.stats.encounters = cleanCount(state.stats.encounters);
    state.stats.variants = Math.max(cleanCount(state.stats.variants), state.unlocked.length);
    state.stats.coops = cleanCount(state.stats.coops);
    const unlocked = new Set(state.unlocked);
    for (const animal of farm.ranch?.animals ?? []) {
        animal.glimmerVariants = Array.isArray(animal.glimmerVariants)
            ? [...new Set(animal.glimmerVariants.filter((id) => unlocked.has(id)))]
            : glimmerVariants.filter((v) => v.type === "animal" && v.kindId === animal.kindId && unlocked.has(v.id)).map((v) => v.id);
        const skinIds = ranchSkinVariantsFor(farm, "animal", animal.kindId).map((skin) => skin.id);
        if (animal.variantId && !animal.glimmerVariants.includes(animal.variantId) && !skinIds.includes(animal.variantId))
            delete animal.variantId;
        animal.glimmerBoost = animal.glimmerVariants.length > 0;
    }
    for (const pet of farm.ranch?.pets ?? []) {
        pet.glimmerVariants = Array.isArray(pet.glimmerVariants)
            ? [...new Set(pet.glimmerVariants.filter((id) => unlocked.has(id)))]
            : glimmerVariants.filter((v) => v.type === "pet" && v.kindId === pet.kindId && unlocked.has(v.id)).map((v) => v.id);
        const skinIds = ranchSkinVariantsFor(farm, "pet", pet.kindId).map((skin) => skin.id);
        if (pet.variantId && !pet.glimmerVariants.includes(pet.variantId) && !skinIds.includes(pet.variantId))
            delete pet.variantId;
    }
    if (farm.ranch?.patrolGoose) {
        const goose = farm.ranch.patrolGoose;
        goose.glimmerVariants = Array.isArray(goose.glimmerVariants)
            ? [...new Set(goose.glimmerVariants.filter((id) => unlocked.has(id)))]
            : glimmerVariants.filter((v) => v.type === "goose" && unlocked.has(v.id)).map((v) => v.id);
        if (goose.variantId && !goose.glimmerVariants.includes(goose.variantId))
            delete goose.variantId;
    }
    return state;
}

export function normalizeGlimmerWorld(value) {
    const world = value && typeof value === "object" ? value : {};
    world.day = Number.isSafeInteger(world.day) ? world.day : -1;
    world.coop = world.coop && typeof world.coop === "object" ? world.coop : null;
    world.logs = Array.isArray(world.logs) ? world.logs.slice(0, MAX_PUBLIC_LOGS) : [];
    return world;
}

function resetDaily(farm, now) {
    const state = normalizeGlimmerFarm(farm);
    const day = currentDayIndex(now);
    if (state.daily.day !== day) {
        state.daily = { day, explores: 0, captures: 0, lastCatchAt: 0 };
        state.pending = null;
    }
    return state;
}

function hash(text) {
    let value = 2166136261;
    for (const ch of String(text)) {
        value ^= ch.charCodeAt(0);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
}

function pickByDay(items, day, salt) {
    return items[hash(`${day}:${salt}`) % items.length];
}

function ensureWorldDay(worldValue, now) {
    const world = normalizeGlimmerWorld(worldValue);
    const day = currentDayIndex(now);
    if (world.day !== day) {
        const event = pickByDay(glimmerCoopEvents, day, "coop");
        world.day = day;
        world.coop = { eventId: event.id, contributors: [], completedAt: 0 };
    }
    world.coop.contributors = Array.isArray(world.coop.contributors) ? world.coop.contributors : [];
    return world;
}

function localParts(now) {
    const d = new Date(now + 8 * 60 * 60 * 1000);
    return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export function glimmerBuffActive(now = Date.now()) {
    const { hour } = localParts(now);
    return hour >= glimmer.openHour && hour < glimmer.closeHour;
}

export function glimmerBuffMultiplier(kind, now = Date.now()) {
    return glimmerBuffActive(now) ? Number(glimmer.buffs[kind] ?? 1) : 1;
}

function fmtCooldown(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}

function hasTicket(state, now) {
    return state.ticketDay === currentDayIndex(now);
}

export function glimmerStatusLine(farm, now = Date.now()) {
    const state = resetDaily(farm, now);
    const { hour } = localParts(now);
    if (hour < glimmer.openHour)
        return "✨ 流光原野今日 20:00–22:00 开放。";
    if (hour >= glimmer.closeHour)
        return "✨ 流光原野已关闭｜下次明日 20:00 开放";
    if (!hasTicket(state, now))
        return "✨ 流光原野开放中（至 22:00）｜今日通票：未购买（500 金）｜全服增益已生效";
    const wait = Math.max(0, state.daily.lastCatchAt + glimmer.captureCooldownMs - now);
    return `✨ 流光原野开放中（至 22:00）｜今日通票：已购买｜奇遇剩 ${Math.max(0, glimmer.dailyExploreLimit - state.daily.explores)}/${glimmer.dailyExploreLimit}｜异色捕获 ${state.daily.captures}/${glimmer.dailyCaptureLimit}｜诱捕冷却：${wait ? fmtCooldown(wait) : "可用"}`;
}

export const GLIMMER_BUFF_TEXT = "🌟 流光时刻：种地收成 +15%，正常料理锁价 +10%，牧场产物 +10%，钓鱼稀有及以上权重 ×1.5、垃圾率减半；原每日上限不变。";

function officialCodexCount(farm) {
    return Object.keys(farm.codex ?? {}).filter((id) => cropById.has(id)).length;
}

function variantBase(variant) {
    if (variant.type === "animal")
        return animalById.get(variant.kindId);
    if (variant.type === "pet")
        return petById.get(variant.kindId);
    return { id: "patrol_goose", name: "巡逻鹅", category: "普通", unlockCodex: 0 };
}

function variantIsFantasy(variant) {
    return variant.type === "animal" && animalById.get(variant.kindId)?.category === "奇幻";
}

export function glimmerAnimalVariantMultiplier(animal) {
    const skin = ranchSkinById.get(animal?.variantId);
    if (Number.isFinite(Number(skin?.bonus?.produceValueMultiplier)))
        return Number(skin.bonus.produceValueMultiplier);
    const unlocked = new Set(Array.isArray(animal?.glimmerVariants) ? animal.glimmerVariants : []);
    const variants = glimmerVariants.filter((item) => item.type === "animal" && item.kindId === animal?.kindId);
    if (variants.length === 3 && variants.every((item) => unlocked.has(item.id)))
        return 1.25;
    if (animal?.glimmerBoost || unlocked.size)
        return 1.2;
    return 1;
}

function trackPools() {
    const earlyIds = new Set(animals.filter((item) => item.category !== "奇幻" && item.unlockCodex <= 12).map((item) => item.id));
    const ordinaryIds = new Set(animals.filter((item) => item.category !== "奇幻" && item.unlockCodex > 12).map((item) => item.id));
    return {
        early: glimmerVariants.filter((item) => item.type === "animal" && earlyIds.has(item.kindId)),
        ordinary: glimmerVariants.filter((item) => (item.type === "animal" && ordinaryIds.has(item.kindId)) || item.type === "pet" || item.type === "goose"),
        rare: glimmerVariants.filter((item) => variantIsFantasy(item)),
    };
}

export function glimmerTracks(now, worldValue) {
    const day = currentDayIndex(now);
    const pools = trackPools();
    const base = [
        pickByDay(pools.early, day, "early"),
        pickByDay(pools.ordinary, day, "ordinary"),
        pickByDay(pools.rare, day, "rare"),
    ];
    const world = ensureWorldDay(worldValue, now);
    if (world.coop.completedAt) {
        const extra = pickByDay(pools.rare.filter((item) => item.id !== base[2].id), day, "extra");
        base.push(extra);
    }
    return base;
}

function timeLabel(at) {
    const date = new Date(at + 8 * 60 * 60 * 1000);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function publicLogText(item) {
    const text = String(item?.text ?? "").replace(/^(?:(?:\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2})\s*·\s*/, "");
    const at = Number(item?.at);
    return Number.isFinite(at) ? `${timeLabel(at)} · ${text}` : String(item?.text ?? "");
}

function publicLog(world, farm, text, now, kind, refId) {
    world.logs.unshift({ at: now, farmId: farm.id, farmName: farm.name, text, kind, refId });
    if (world.logs.length > MAX_PUBLIC_LOGS)
        world.logs.length = MAX_PUBLIC_LOGS;
}

function history(farm, item) {
    const state = normalizeGlimmerFarm(farm);
    state.history.unshift(item);
    if (state.history.length > MAX_HISTORY)
        state.history.length = MAX_HISTORY;
}

function withStatus(farm, now, text) {
    return `${text}\n${glimmerStatusLine(farm, now)}`;
}

function requireOpenTicket(farm, now) {
    if (!glimmerBuffActive(now))
        return { ok: false, text: `流光原野现在没有开放。下次开放时间：${localParts(now).hour < glimmer.openHour ? "今日 20:00" : "明日 20:00"}。` };
    const state = resetDaily(farm, now);
    if (!hasTicket(state, now))
        return { ok: false, text: "还没有今天的流光原野通票。先购买当天通票：doorbell({\"op\":\"farm.glimmer.ticket\",\"args\":{}})" };
    return { ok: true, state };
}

function dishValue(recipe) {
    const animalValue = new Map(animals.map((item) => [item.produceId, item.producePrice]));
    const base = recipe.ingredients.reduce((sum, id) => sum + (cookingIngredientById.get(id)?.price ?? animalValue.get(id) ?? (id === "fish:any" ? 100 : 10)), 0);
    return Math.max(1, Math.round(base * (1 + cooking.processingFeeRate) * cooking.recyclePremium[recipe.rarity] * glimmer.buffs.dishValue));
}

function grantReward(farm, reward, rng, now) {
    if (!reward || reward.kind === "none")
        return "";
    if (reward.kind === "coins") {
        farm.coins += reward.amount;
        return "";
    }
    if (reward.kind === "silver") {
        farm.silver = (farm.silver ?? 0) + reward.amount;
        return "";
    }
    if (reward.kind === "item") {
        farm.items[reward.id] = (farm.items[reward.id] ?? 0) + reward.amount;
        return "";
    }
    if (reward.kind === "bait") {
        farm.fishing ??= {};
        farm.fishing.baitInventory ??= {};
        farm.fishing.baitInventory[reward.id] = (farm.fishing.baitInventory[reward.id] ?? 0) + reward.amount;
        return "";
    }
    const kitchen = ((farm.ranch ??= { coins: 0, animals: [], pets: [] }).kitchen ??= { products: [], ingredients: {}, dishes: [], knownRecipes: [] });
    kitchen.products ??= [];
    kitchen.ingredients ??= {};
    kitchen.dishes ??= [];
    kitchen.knownRecipes ??= [];
    if (reward.kind === "ingredient") {
        const item = rng.pick(cookingIngredients);
        kitchen.ingredients[item.id] = (kitchen.ingredients[item.id] ?? 0) + 1;
        return `\n🎁 获得「${item.name}」×1。`;
    }
    if (reward.kind === "dish") {
        const pool = cookingRecipes.filter((item) => item.rarity !== "SP");
        const recipe = rng.pick(pool);
        kitchen.dishes.push({ id: randomUUID(), recipeId: recipe.id, name: recipe.name, rarity: recipe.rarity, value: dishValue(recipe), image: `${recipe.id}.webp`, createdAt: now, pricingVersion: 2 });
        return `\n🎁 获得「${recipe.name}」×1。`;
    }
    if (reward.kind === "egg") {
        const pool = animals.filter((item) => item.produceId?.includes("egg"));
        const animal = rng.pick(pool);
        kitchen.products.push({ id: randomUUID(), itemId: animal.produceId, name: animal.produce, emoji: "🥚", value: animal.producePrice, createdAt: now });
        return `\n🎁 获得「${animal.produce}」×1。`;
    }
    if (reward.kind === "favorite") {
        const state = normalizeGlimmerFarm(farm);
        const unseen = Object.keys(glimmer.favorites).filter((kindId) => !state.favoriteSeen.includes(kindId));
        const kindId = rng.pick(unseen.length ? unseen : Object.keys(glimmer.favorites));
        if (!state.favoriteSeen.includes(kindId))
            state.favoriteSeen.push(kindId);
        const variant = glimmerVariants.find((item) => item.kindId === kindId);
        const recipe = cookingRecipeById.get(glimmer.favorites[kindId]);
        return `\n💡 ${variantBase(variant)?.name ?? kindId}喜欢「${recipe?.name ?? glimmer.favorites[kindId]}」。`;
    }
    return "";
}

function encounterPrompt(event) {
    if (event.type !== "choice")
        return event.text;
    return `${event.text}\nA. ${event.options.A.label}\nB. ${event.options.B.label}\n继续选择：doorbell({"op":"farm.glimmer.choose","args":{"option":"A"}})`;
}

function explore(farm, world, now) {
    const gate = requireOpenTicket(farm, now);
    if (!gate.ok)
        return gate;
    if (gate.state.pending)
        return { ok: false, text: "先处理当前奇遇选择：doorbell({\"op\":\"farm.glimmer.choose\",\"args\":{\"option\":\"A\"}})" };
    if (gate.state.daily.explores >= glimmer.dailyExploreLimit)
        return { ok: false, text: "今天的 3 次奇遇已经走完，北京时间 0 点刷新。" };
    const rng = new Rng(farm.rngState ?? 1);
    const unseen = glimmerEncounters.filter((item) => !gate.state.encounterSeen.includes(item.id));
    const event = rng.pick(unseen.length ? unseen : glimmerEncounters);
    farm.rngState = rng.state;
    gate.state.daily.explores++;
    gate.state.stats.encounters++;
    if (!gate.state.encounterSeen.includes(event.id))
        gate.state.encounterSeen.push(event.id);
    publicLog(world, farm, `${timeLabel(now)} · 「${farm.name}」遇见了〔${event.name}〕`, now, "encounter", event.id);
    history(farm, { at: now, kind: "encounter", refId: event.id, text: event.name });
    let suffix = "";
    if (event.type === "choice")
        gate.state.pending = { eventId: event.id, day: currentDayIndex(now) };
    else {
        suffix = grantReward(farm, event.reward, rng, now);
        farm.rngState = rng.state;
    }
    return { ok: true, text: withStatus(farm, now, encounterPrompt(event) + suffix) };
}

function choose(farm, now, option) {
    const gate = requireOpenTicket(farm, now);
    if (!gate.ok)
        return gate;
    const pending = gate.state.pending;
    const event = pending ? glimmerEncounters.find((item) => item.id === pending.eventId) : null;
    if (!event || event.type !== "choice") {
        gate.state.pending = null;
        return { ok: false, text: "现在没有待处理的流光原野选择。" };
    }
    const key = String(option ?? "").toUpperCase();
    const selected = event.options[key];
    if (!selected)
        return { ok: false, text: "流光原野选择只接受 A 或 B。示例：doorbell({\"op\":\"farm.glimmer.choose\",\"args\":{\"option\":\"A\"}})" };
    gate.state.pending = null;
    const rng = new Rng(farm.rngState ?? 1);
    const suffix = grantReward(farm, selected.reward, rng, now);
    farm.rngState = rng.state;
    history(farm, { at: now, kind: "choice", refId: event.id, option: key, text: selected.text });
    return { ok: true, text: withStatus(farm, now, selected.text + suffix) };
}

function findDish(farm, query) {
    const dishes = farm.ranch?.kitchen?.dishes ?? [];
    const q = String(query ?? "").trim();
    return dishes.find((item) => item.id === q)
        ?? dishes.find((item) => item.recipeId === q || item.name === q);
}

function findDishDefinition(query) {
    const q = String(query ?? "").trim();
    return cookingRecipeById.get(q) ?? cookingRecipes.find((item) => item.name === q);
}

function resolveTrack(query, tracks) {
    const q = String(query ?? "").trim();
    if ((typeof query === "number" || /^\d+$/.test(q)) && Number.isSafeInteger(Number(q)))
        return tracks[Number(q) - 1];
    return tracks.find((item) => item.id === q || item.name === q)
        ?? tracks.find((item) => variantBase(item)?.name === q);
}

function baseUnlockError(farm, variant) {
    if (variant.type === "goose")
        return "";
    const base = variantBase(variant);
    return officialCodexCount(farm) >= (base?.unlockCodex ?? 0)
        ? "" : `你还没有达到${base?.name ?? variant.kindId}的基础解锁条件，可以观察它，但暂时不能诱捕。料理没有消耗。`;
}

function addVariantToResident(resident, variant) {
    resident.glimmerVariants ??= [];
    if (!resident.glimmerVariants.includes(variant.id))
        resident.glimmerVariants.push(variant.id);
    resident.variantId = variant.id;
}

function capturePityCount(state, kindId) {
    return Math.min(CAPTURE_PITY_LIMIT - 1, cleanCount(state.capturePity?.[kindId]));
}

function catchVariant(farm, world, now, animalQuery, dishQuery) {
    const gate = requireOpenTicket(farm, now);
    if (!gate.ok)
        return gate;
    if (gate.state.daily.captures >= glimmer.dailyCaptureLimit)
        return { ok: false, text: "今天已经成功捕获 1 只异色动物，料理没有消耗。" };
    const wait = gate.state.daily.lastCatchAt + glimmer.captureCooldownMs - now;
    if (wait > 0)
        return { ok: false, text: `还要等 ${fmtCooldown(wait)} 才能再次诱捕，料理没有消耗。` };
    const tracks = glimmerTracks(now, world);
    const variant = resolveTrack(animalQuery, tracks);
    if (!variant)
        return { ok: false, text: "今日踪迹里没有这只异色动物，料理没有消耗。" };
    if (gate.state.unlocked.includes(variant.id))
        return { ok: false, text: `「${variant.name}」已经收录，料理没有消耗。` };
    const locked = baseUnlockError(farm, variant);
    if (locked)
        return { ok: false, text: locked };
    const dish = findDish(farm, dishQuery);
    if (!dish || dish.recipeId === "odd_dish") {
        const definition = findDishDefinition(dishQuery);
        if (!dish && definition)
            return { ok: false, text: `料理柜里「${definition.name}」不足，料理没有消耗。` };
        return { ok: false, text: "料理柜里没有这份正常料理，料理没有消耗。" };
    }
    const dishes = farm.ranch.kitchen.dishes;
    const favorite = dish.recipeId === glimmer.favorites[variant.kindId];
    if (favorite && !gate.state.favoriteSeen.includes(variant.kindId))
        gate.state.favoriteSeen.push(variant.kindId);
    const pityBefore = capturePityCount(gate.state, variant.kindId);
    const guaranteed = pityBefore + 1 >= CAPTURE_PITY_LIMIT;
    const chance = variantIsFantasy(variant)
        ? (favorite ? glimmer.fantasyFavoriteChance : glimmer.fantasyChance)
        : (favorite ? glimmer.ordinaryFavoriteChance : glimmer.ordinaryChance);
    dishes.splice(dishes.findIndex((item) => item.id === dish.id), 1);
    gate.state.daily.lastCatchAt = now;
    const rng = new Rng(farm.rngState ?? 1);
    const roll = rng.next();
    const success = guaranteed || roll < chance;
    farm.rngState = rng.state;
    if (!success) {
        const pityAfter = pityBefore + 1;
        gate.state.capturePity[variant.kindId] = pityAfter;
        const text = favorite
            ? `🐾 ${variant.name}很喜欢「${dish.name}」，但最后还是没有跟你走。料理已消耗；该种异色保底 ${pityAfter}/${CAPTURE_PITY_LIMIT}，20 分钟后可以再次尝试。`
            : `🐾 ${variant.name}吃完「${dish.name}」，绕着你看了两圈，还是跑进了草丛。料理已消耗；该种异色保底 ${pityAfter}/${CAPTURE_PITY_LIMIT}，20 分钟后可以再次尝试。`;
        history(farm, { at: now, kind: "capture-fail", refId: variant.id, dish: dish.name, pity: pityAfter });
        return { ok: true, text: withStatus(farm, now, text), success: false };
    }
    delete gate.state.capturePity[variant.kindId];
    gate.state.unlocked.push(variant.id);
    gate.state.daily.captures++;
    gate.state.stats.variants = gate.state.unlocked.length;
    farm.ranch ??= { coins: 0, animals: [], pets: [] };
    farm.ranch.animals ??= [];
    farm.ranch.pets ??= [];
    let existing = false;
    let resultText;
    if (variant.type === "animal") {
        const base = animalById.get(variant.kindId);
        let resident = farm.ranch.animals.find((item) => item.kindId === variant.kindId);
        existing = !!resident;
        if (!resident) {
            resident = { kindId: variant.kindId, ticksSinceProduce: 0, pending: 0, pendingMeat: 0, level: 1, feedBoostPending: false, pendingBoost: false };
            farm.ranch.animals.push(resident);
        }
        const oldValue = Math.round(base.producePrice * (1 + ((resident.level ?? 1) - 1) * RANCH_LEVEL_INCOME_STEP));
        addVariantToResident(resident, variant);
        resident.glimmerBoost = true;
        const variantMultiplier = glimmerAnimalVariantMultiplier(resident);
        const newValue = Math.round(oldValue * variantMultiplier);
        resultText = existing && variantMultiplier === 1.25
            ? `🌈 捕捉成功！${variant.name}认出了牧场里的同伴。原有${base.name}保留等级、名字、生产进度和当前状态；同种三只异色已经集齐，当前等级产值加成由 20% 提高到 25%（${oldValue}→${newValue} 金/份）。今日异色捕获 1/1。`
            : existing
                ? `🌈 捕捉成功！${variant.name}认出了牧场里的同伴。原有${base.name}保留等级、名字、生产进度和当前状态，并永久获得当前等级产值 +20%（${oldValue}→${newValue} 金/份）。今日异色捕获 1/1。`
                : `🌈 捕捉成功！${variant.name}吃完「${dish.name}」后跟你回了牧场，成为一只 1 级${variant.name}。它的当前等级产值永久提高 20%。今日异色捕获 1/1。`;
    }
    else if (variant.type === "pet") {
        let resident = farm.ranch.pets.find((item) => item.kindId === variant.kindId);
        existing = !!resident;
        if (!resident) {
            resident = { kindId: variant.kindId };
            farm.ranch.pets.push(resident);
        }
        addVariantToResident(resident, variant);
        resultText = `🌈 捕捉成功！${variant.name}吃完「${dish.name}」后跟你回了牧场。${existing ? "原有宠物的名字、穿戴和状态不变。" : "它已经入住牧场。"}今日异色捕获 1/1。`;
    }
    else {
        const goose = farm.ranch.patrolGoose;
        if (goose)
            addVariantToResident(goose, variant);
        resultText = `🌈 捕捉成功！已解锁巡逻鹅服装「${variant.name}」。${goose ? "巡逻鹅已经换上新装。" : "购买巡逻鹅后即可穿戴；本次不会免费获得巡逻鹅。"}今日异色捕获 1/1。`;
    }
    if (guaranteed)
        resultText += `\n🎯 第 ${CAPTURE_PITY_LIMIT} 次有效诱捕触发保底，该种异色保底已清零。`;
    publicLog(world, farm, `${timeLabel(now)} · 「${farm.name}」带走了异色外观「${variant.name}」`, now, "variant", variant.id);
    history(farm, { at: now, kind: "capture", refId: variant.id, dish: dish.name, guaranteed });
    return { ok: true, text: withStatus(farm, now, resultText), success: true, variant };
}

function takeCoopItem(farm, event, query) {
    const q = String(query ?? "").trim();
    const kitchen = farm.ranch?.kitchen;
    if (event.kind === "dish") {
        const item = (kitchen?.dishes ?? []).find((entry) => entry.id === q || entry.recipeId === q || entry.name === q);
        if (!item || item.recipeId === "odd_dish") {
            const definition = findDishDefinition(q);
            return !item && definition
                ? { status: "insufficient", name: definition.name }
                : { status: "unsupported" };
        }
        return { status: "available", name: item.name, consume: () => kitchen.dishes.splice(kitchen.dishes.indexOf(item), 1) };
    }
    if (event.kind === "product") {
        const item = (kitchen?.products ?? []).find((entry) => entry.id === q || entry.itemId === q || entry.name === q);
        if (!item) {
            const definition = cookingProductById.get(q) ?? cookingProducts.find((entry) => entry.name === q);
            return definition
                ? { status: "insufficient", name: definition.name }
                : { status: "unsupported" };
        }
        return { status: "available", name: item.name, consume: () => kitchen.products.splice(kitchen.products.indexOf(item), 1) };
    }
    if (event.kind === "cookable") {
        const productDef = cookingProductById.get(q) ?? cookingProducts.find((entry) => entry.name === q);
        const product = (kitchen?.products ?? []).find((entry) => entry.id === q || (productDef && entry.itemId === productDef.id));
        if (product) {
            const definition = cookingProductById.get(product.itemId);
            if (!definition?.cookable)
                return { status: "unsupported" };
            return { status: "available", name: definition.name, consume: () => kitchen.products.splice(kitchen.products.indexOf(product), 1) };
        }
        if (productDef)
            return productDef.cookable
                ? { status: "insufficient", name: productDef.name }
                : { status: "unsupported" };
        const catches = Array.isArray(farm.fishing?.catchInventory) ? farm.fishing.catchInventory : [];
        const exactCatch = catches.find((entry) => entry.id === q);
        const fishDefinition = fishingFishById.get(q)
            ?? [...fishingFishById.values()].find((entry) => entry.name === q);
        const fish = exactCatch
            ?? (q === "fish:any" ? catches[0] : undefined)
            ?? (fishDefinition ? catches.find((entry) => entry.fishId === fishDefinition.id) : undefined);
        if (fish) {
            const definition = fishingFishById.get(fish.fishId);
            return { status: "available", name: definition?.name ?? fish.fishId, consume: () => catches.splice(catches.indexOf(fish), 1) };
        }
        if (q === "fish:any")
            return { status: "insufficient", name: "任意鱼" };
        if (fishDefinition)
            return { status: "insufficient", name: fishDefinition.name };
        const item = cookingIngredientById.get(q) ?? cookingIngredients.find((entry) => entry.name === q);
        if (!item)
            return { status: "unsupported" };
        if ((kitchen?.ingredients?.[item.id] ?? 0) < 1)
            return { status: "insufficient", name: item.name };
        return { status: "available", name: item.name, consume: () => { kitchen.ingredients[item.id]--; if (kitchen.ingredients[item.id] <= 0) delete kitchen.ingredients[item.id]; } };
    }
    const bait = fishingBaitById.get(q) ?? [...fishingBaitById.values()].find((entry) => entry.name === q);
    if (!bait)
        return { status: "unsupported" };
    if ((farm.fishing?.baitInventory?.[bait.id] ?? 0) < 1)
        return { status: "insufficient", name: bait.name };
    return { status: "available", name: bait.name, consume: () => { farm.fishing.baitInventory[bait.id]--; } };
}

function assist(farm, world, now, itemQuery) {
    const gate = requireOpenTicket(farm, now);
    if (!gate.ok)
        return gate;
    ensureWorldDay(world, now);
    const event = glimmerCoopEvents.find((item) => item.id === world.coop.eventId);
    if (world.coop.completedAt)
        return { ok: false, text: `🤝〔${event.name}〕今日协作已经完成，物品没有消耗。` };
    if (world.coop.contributors.some((item) => item.farmId === farm.id))
        return { ok: false, text: "🤝 今天已经为这个事件贡献过一次，物品没有消耗。" };
    const item = takeCoopItem(farm, event, itemQuery);
    if (item.status === "insufficient")
        return { ok: false, text: `〔${event.name}〕「${item.name}」不足，无法提交${event.requirement}，没有消耗。` };
    if (item.status === "unsupported")
        return { ok: false, text: `〔${event.name}〕不支持你填写的「${String(itemQuery ?? "")}」；这里需要提交${event.requirement}，没有消耗。` };
    item.consume();
    world.coop.contributors.push({ farmId: farm.id, farmName: farm.name, at: now, item: item.name });
    farm.coins += glimmer.coopRewardCoins;
    farm.silver = (farm.silver ?? 0) + glimmer.coopRewardSilver;
    gate.state.stats.coops++;
    publicLog(world, farm, `${timeLabel(now)} · 「${farm.name}」为〔${event.name}〕补上了「${item.name}」`, now, "coop", event.id);
    history(farm, { at: now, kind: "coop", refId: event.id, item: item.name });
    const count = world.coop.contributors.length;
    if (count >= glimmer.coopRequired && !world.coop.completedAt) {
        world.coop.completedAt = now;
        return { ok: true, text: withStatus(farm, now, `🤝 你为〔${event.name}〕交出「${item.name}」，共享进度 ${count}/${glimmer.coopRequired}。\n✨〔${event.name}〕协作完成！至少三家农场已经接力，流光原野出现了一条额外稀有踪迹。你获得 100 金、20 银。`) };
    }
    return { ok: true, text: withStatus(farm, now, `🤝 你为〔${event.name}〕交出「${item.name}」，共享进度 ${Math.min(count, glimmer.coopRequired)}/${glimmer.coopRequired}。\n你获得 100 金、20 银。`) };
}

function ticket(farm, now) {
    if (!glimmerBuffActive(now))
        return { ok: false, text: `流光原野现在没有开放，不能提前购买通票。下次开放时间：${localParts(now).hour < glimmer.openHour ? "今日 20:00" : "明日 20:00"}。` };
    const state = resetDaily(farm, now);
    if (hasTicket(state, now)) {
        recordWelfareWeekProgress(farm, "glimmer_ticket", 1, now);
        const notice = takeWelfareWeekNotice(farm);
        return { ok: true, text: withStatus(farm, now, `🎫 今天的通票已经买过了，不会重复扣款。${notice ? `\n${notice}` : ""}`) };
    }
    if (farm.coins < glimmer.ticketCost)
        return { ok: false, text: `金币不足，通票要 500 金（你有 ${farm.coins} 金）。` };
    farm.coins -= glimmer.ticketCost;
    bumpDaily(farm, now, "coinSpend", glimmer.ticketCost);
    state.ticketDay = currentDayIndex(now);
    history(farm, { at: now, kind: "ticket", text: "今日通票" });
    recordWelfareWeekProgress(farm, "glimmer_ticket", 1, now);
    const notice = takeWelfareWeekNotice(farm);
    return { ok: true, text: withStatus(farm, now, `🎫 买下「流光原野」今日通票，-500 金。今天开放期间可以反复进入。${notice ? `\n${notice}` : ""}`) };
}

function glimmerDishInventoryLine(farm) {
    const counts = new Map();
    for (const dish of farm.ranch?.kitchen?.dishes ?? []) {
        if (!dish || dish.recipeId === "odd_dish")
            continue;
        const name = String(dish.name ?? "").trim();
        if (name)
            counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (!counts.size)
        return "🍲 可用于诱捕的料理：暂无正常料理；先去料理台制作。";
    return `🍲 可用于诱捕的料理：${[...counts].map(([name, count]) => `${name}×${count}`).join("、")}`;
}

function glimmerFavoriteLine(farm) {
    const state = normalizeGlimmerFarm(farm);
    const kindIds = state.favoriteSeen.filter((kindId) => glimmer.favorites[kindId]);
    const entries = kindIds.map((kindId) => {
        const variant = glimmerVariants.find((item) => item.kindId === kindId);
        const recipe = cookingRecipeById.get(glimmer.favorites[kindId]);
        return `${variant ? variantBase(variant)?.name ?? kindId : kindId}→${recipe?.name ?? glimmer.favorites[kindId]}`;
    });
    return `💡 已发现偏好 ${entries.length}/${Object.keys(glimmer.favorites).length}：${entries.length ? entries.join("｜") : "暂无"}`;
}

export function glimmerView(farm, worldValue, now = Date.now()) {
    const state = resetDaily(farm, now);
    const world = ensureWorldDay(worldValue, now);
    const tracks = glimmerTracks(now, world);
    const event = glimmerCoopEvents.find((item) => item.id === world.coop.eventId);
    const lines = [
        `✨ 流光原野 · ${currentSeason(now).name}`,
        glimmerStatusLine(farm, now),
        glimmerBuffActive(now) ? GLIMMER_BUFF_TEXT : "",
        `🐾 今日动物踪迹：${tracks.map((item, index) => `${index + 1}.${item.name}（保底 ${capturePityCount(state, item.kindId)}/${CAPTURE_PITY_LIMIT}）`).join("、")}`,
        glimmerDishInventoryLine(farm),
        glimmerFavoriteLine(farm),
        `🤝 今日协作：〔${event.name}〕· ${Math.min(world.coop.contributors.length, glimmer.coopRequired)}/${glimmer.coopRequired}${world.coop.completedAt ? " · 已完成，额外稀有踪迹已出现" : ""}`,
        world.logs.length ? `📜 最新公共事件：\n${world.logs.map(publicLogText).join("\n")}` : "📜 最新公共事件：暂无",
    ].filter(Boolean);
    if (state.pending) {
        const pending = glimmerEncounters.find((item) => item.id === state.pending.eventId);
        if (pending)
            lines.push(encounterPrompt(pending));
    }
    return lines.join("\n");
}

function achievementMetric(state, field) {
    if (field === "glimmerEncounters")
        return state.stats.encounters;
    if (field === "glimmerVariants")
        return state.stats.variants;
    if (field === "glimmerCoops")
        return state.stats.coops;
    return 0;
}

export function settleGlimmerAchievementRewards(farm) {
    const state = normalizeGlimmerFarm(farm);
    const rewarded = new Set(state.achievementRewards);
    const grants = [];
    for (const achievement of GLIMMER_ACHIEVEMENTS) {
        if (rewarded.has(achievement.id) || achievementMetric(state, achievement.field) < achievement.min)
            continue;
        const coins = cleanCount(achievement.reward?.coins);
        const silver = cleanCount(achievement.reward?.silver);
        farm.coins = cleanCount(farm.coins) + coins;
        farm.silver = cleanCount(farm.silver) + silver;
        state.achievementRewards.push(achievement.id);
        rewarded.add(achievement.id);
        grants.push({ id: achievement.id, name: achievement.name, coins, silver });
    }
    return grants;
}

export function glimmerAchievementRewardText(grants, legacy = false) {
    if (!grants.length)
        return "";
    if (legacy) {
        const coins = grants.reduce((sum, item) => sum + item.coins, 0);
        const silver = grants.reduce((sum, item) => sum + item.silver, 0);
        return `🎁 流光原野成就补发：已补发 ${grants.length} 项，共 ${coins} 金、${silver} 银。`;
    }
    return grants.map((item) => `🎖️ 成就达成「${item.name}」：获得 ${item.coins} 金、${item.silver} 银。`).join("\n");
}

function runGlimmerAction(farm, worldValue, params, now) {
    const world = ensureWorldDay(worldValue, now);
    const op = String(params?.op ?? "view");
    if (op === "view")
        return { ok: true, text: glimmerView(farm, world, now), changed: true };
    if (op === "ticket")
        return { ...ticket(farm, now), changed: true };
    if (op === "explore")
        return { ...explore(farm, world, now), changed: true };
    if (op === "choose")
        return { ...choose(farm, now, params?.option), changed: true };
    if (op === "catch")
        return { ...catchVariant(farm, world, now, params?.animal, params?.dish), changed: true };
    if (op === "assist")
        return { ...assist(farm, world, now, params?.item), changed: true };
    return { ok: false, text: "流光原野只提供查看、购票、探索、选择、诱捕和协作。查看正式操作说明：doorbell({\"op\":\"farm.help\",\"args\":{\"operation\":\"farm.glimmer.status\"}})", changed: false };
}

export function runGlimmer(farm, worldValue, params, now = Date.now()) {
    const legacyGrants = settleGlimmerAchievementRewards(farm);
    const result = runGlimmerAction(farm, worldValue, params, now);
    const freshGrants = settleGlimmerAchievementRewards(farm);
    const rewardText = [glimmerAchievementRewardText(legacyGrants, true), glimmerAchievementRewardText(freshGrants)].filter(Boolean).join("\n");
    return rewardText ? { ...result, text: `${result.text}\n${rewardText}` } : result;
}

export function glimmerVariantSpriteInfo(entity, kindId, type = "animal") {
    const variant = ranchVariantById.get(entity?.variantId);
    const index = type === "animal" ? ANIMAL_INDEX.get(kindId) : type === "pet" ? PET_INDEX.get(kindId) : GOOSE_INDEX;
    return { index, set: variant?.set ?? 0, variant };
}

export function glimmerVariantsFor(farm, kindId, type) {
    const state = normalizeGlimmerFarm(farm);
    return [
        ...glimmerVariants.filter((item) => item.kindId === kindId && item.type === type && state.unlocked.includes(item.id)),
        ...ranchSkinVariantsFor(farm, type, kindId),
    ];
}

export function setGlimmerVariant(farm, type, kindId, variantId) {
    const variants = glimmerVariantsFor(farm, kindId, type);
    let resident;
    if (type === "animal")
        resident = farm.ranch?.animals?.find((item) => item.kindId === kindId);
    else if (type === "pet")
        resident = farm.ranch?.pets?.find((item) => item.kindId === kindId);
    else
        resident = farm.ranch?.patrolGoose;
    if (!resident)
        return { ok: false, error: "牧场里还没有这只动物。" };
    if (variantId === "base") {
        delete resident.variantId;
        return { ok: true, name: "原始" };
    }
    const variant = variants.find((item) => item.id === variantId);
    if (!variant)
        return { ok: false, error: "这个异色外观还没有解锁。" };
    if (ranchSkinById.has(variant.id))
        resident.variantId = variant.id;
    else
        addVariantToResident(resident, variant);
    return { ok: true, name: variant.name };
}

export function glimmerHumanData(farm, worldValue, now = Date.now()) {
    const state = resetDaily(farm, now);
    const world = ensureWorldDay(worldValue, now);
    const tracks = glimmerTracks(now, world);
    const event = glimmerCoopEvents.find((item) => item.id === world.coop.eventId);
    return {
        name: glimmer.name,
        season: currentSeason(now).name,
        open: glimmerBuffActive(now),
        status: glimmerStatusLine(farm, now),
        buffText: GLIMMER_BUFF_TEXT,
        tracks,
        coop: { ...world.coop, event },
        logs: world.logs.map((item) => ({ ...item, text: publicLogText(item) })),
        variants: glimmerVariants,
        unlocked: new Set(state.unlocked),
        encounterSeen: new Set(state.encounterSeen),
        rewardedAchievements: new Set(state.achievementRewards),
        encounters: glimmerEncounters,
        stats: state.stats,
        history: state.history,
    };
}

import {acceptCommittedFarmRecords} from "../../farm-mutation-scope.js";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { decorationState } from "../../domain/farm-decoration/state.js";
import { isDecorationGachaEligible, isDecorationSaleOpen } from "../../domain/farm-decoration/catalog.js";
import { farmRecordPath, findFarmIdByHumanKey, readFarmStatePaths,
  readFarmStateRevision, writeFarmStatePaths } from "../../farm-state-records.js";
import { runLingyeWorldTransaction } from "../../lingye-world-database.js";
import { isQixi2026CropId } from "../../qixi-2026.js";
import { getFarm } from "../../store.js";
import { NPC_ID } from "../../config.js";

export const GACHA_PRICE_GOLD = 500;
export const GACHA_DAILY_LIMIT = 100;
export const GACHA_PITY_LIMIT = 100;
export const GACHA_RECEIPT_SCOPE = "/doorbellGachaReceipts";

// Percentages are part of the Farm candidate contract. They are returned to
// the Main client as data; the request cannot supply or override them.
export const GACHA_PROBABILITIES = Object.freeze({
  gold: 29.1,
  silver: 20,
  ingredient: 18,
  dish: 10,
  material: 16,
  sr_seed: 5.9,
  decor: 0.4,
  sp_material: 0.2,
  sp_seed: 0.1,
  ssr_seed: 0.3,
});

const GACHA_WEIGHTS = Object.freeze({
  gold: 2910,
  silver: 2000,
  ingredient: 1800,
  dish: 1000,
  material: 1600,
  sr_seed: 590,
  decor: 40,
  sp_material: 20,
  sp_seed: 10,
  ssr_seed: 30,
});

const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GOLD_REWARD_WEIGHTS = Object.freeze([
  Object.freeze({ amount: 50, weight: 35 }),
  Object.freeze({ amount: 100, weight: 30 }),
  Object.freeze({ amount: 200, weight: 20 }),
  Object.freeze({ amount: 500, weight: 10 }),
  Object.freeze({ amount: 1_000, weight: 5 }),
]);
const REWARD_CATEGORIES = Object.freeze(Object.keys(GACHA_WEIGHTS));
export const GACHA_TEN_DRAW_SIZE = 10;
export const GACHA_TEN_DRAW_PRICE_GOLD = GACHA_PRICE_GOLD * GACHA_TEN_DRAW_SIZE;
const RARE_REWARD_CATEGORIES = Object.freeze([
  "decor",
  "sp_material",
  "sp_seed",
  "ssr_seed",
]);

export class GachaError extends Error {
  constructor(code, message = code, details = {}) {
    super(message);
    this.name = "GachaError";
    this.code = code;
    this.details = details;
  }
}

export function beijingDay(timestamp) {
  return Math.floor((timestamp + BEIJING_OFFSET_MS) / DAY_MS);
}

export function beijingDate(timestamp) {
  return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function hashPayload(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function requireNonEmptyString(value, code, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GachaError(code, `${field} is required`, { field });
  }
  return value;
}

function assertInput(input, { action }) {
  if (!isObject(input)) throw new GachaError("GACHA_INVALID_REQUEST", "Request is invalid");
  const humanKey = requireNonEmptyString(
    input.farmHumanKey,
    "GACHA_INVALID_REQUEST",
    "farmHumanKey",
  );
  const doorplate = requireNonEmptyString(
    input.expectedFarmDoorplate,
    "GACHA_INVALID_REQUEST",
    "expectedFarmDoorplate",
  );
  if (!DOORPLATE_RE.test(doorplate)) {
    throw new GachaError("GACHA_INVALID_REQUEST", "expectedFarmDoorplate is invalid");
  }
  if (action === "draw") {
    const idempotencyKey = requireNonEmptyString(
      input.idempotencyKey,
      "GACHA_INVALID_REQUEST",
      "idempotencyKey",
    );
    if (!UUID_RE.test(idempotencyKey)) {
      throw new GachaError("GACHA_INVALID_REQUEST", "idempotencyKey must be a UUID");
    }
    return { humanKey, doorplate, idempotencyKey };
  }
  return { humanKey, doorplate };
}

function bindingFromEntry(entry, humanKey, expectedDoorplate) {
  if (!entry || !isObject(entry.farm)) {
    throw new GachaError("GACHA_FARM_NOT_FOUND", "The bound farm was not found");
  }
  const farm = entry.farm;
  const farmId = String(entry.farmId ?? farm.id ?? "");
  if (!farmId || farm.id !== farmId) {
    throw new GachaError("GACHA_STATE_INVALID", "The farm identity is invalid");
  }
  if (farm.humanKey !== humanKey) {
    throw new GachaError("GACHA_CREDENTIAL_INVALID", "The farm human credential is invalid");
  }
  if (farmId !== expectedDoorplate) {
    throw new GachaError(
      "GACHA_DOORPLATE_MISMATCH",
      "The farm human credential does not match the expected doorplate",
    );
  }
  const residentId = String(farm.doorbellMcpMigration?.residentId ?? "").trim();
  if (!residentId) {
    throw new GachaError("GACHA_BINDING_UNAVAILABLE", "The farm has no active Doorbell binding");
  }
  return { farm, farmId, residentId };
}

function economyParts(backend) {
  const commands = backend?.trustedSystemCommands ?? backend;
  const queries = backend?.trustedQueries ?? backend;
  if (
    typeof commands?.chargeToSystem !== "function" ||
    typeof commands?.creditFromSystem !== "function" ||
    typeof queries?.getAccount !== "function"
  ) {
    throw new GachaError("GACHA_ECONOMY_UNAVAILABLE", "The trusted economy service is unavailable");
  }
  return { commands, queries };
}

function availableBalance(account, currency) {
  const key = currency === "gold" ? "availableGold" : "availableSilver";
  const value = Number(account?.[key]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GachaError("GACHA_ECONOMY_UNAVAILABLE", "The economy account is invalid");
  }
  return value;
}

function mapEconomyError(error) {
  if (error instanceof GachaError) return error;
  switch (error?.code) {
    case "BALANCE_INSUFFICIENT":
      return new GachaError("GACHA_INSUFFICIENT_GOLD", "The gold balance is insufficient");
    case "ACCOUNT_NOT_FOUND":
    case "RESIDENT_NOT_FOUND":
      return new GachaError("GACHA_ECONOMY_ACCOUNT_UNAVAILABLE", "The economy account is unavailable");
    default:
      return error;
  }
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(isObject);
  if (isObject(value)) return Object.values(value).filter(isObject);
  return [];
}

function catalogLists(catalog = {}) {
  const cooking = isObject(catalog.cooking) ? catalog.cooking : {};
  return {
    materials: normalizeArray(catalog.materials ?? catalog.materialById),
    crops: normalizeArray(catalog.crops ?? catalog.cropById),
    decorations: normalizeArray(catalog.decorations ?? catalog.ranchItems),
    ingredients: normalizeArray(catalog.cookingIngredients ?? cooking.ingredients),
    recipes: normalizeArray(catalog.cookingRecipes ?? cooking.recipes),
    cooking,
  };
}

function itemId(item) {
  const id = typeof item?.id === "string"
    ? item.id.trim()
    : typeof item?.item_id === "string"
      ? item.item_id.trim()
      : "";
  return id || null;
}

function itemName(item, fallbackId) {
  const name = typeof item?.name === "string" ? item.name.trim() : "";
  return name || fallbackId;
}

function itemRarity(item) {
  return typeof item?.rarity === "string" ? item.rarity.toUpperCase() : "N";
}

function normalLimitedCrop(item) {
  return (
    String(item?.category ?? "").toLowerCase() === "limited" &&
    item?.craftable !== false &&
    item?.unlockType !== "festival" &&
    item?.unlockType !== "codex" &&
    !item?.unlockRule &&
    !isQixi2026CropId(item?.id)
  );
}

function itemPool(lists, category, farm, now) {
  switch (category) {
    case "ingredient":
      return lists.ingredients.filter((item) => itemId(item));
    case "dish":
      return lists.recipes.filter((item) => itemId(item) && ["N", "R"].includes(itemRarity(item)));
    case "material":
      return lists.materials.filter((item) => itemId(item) && ["N", "R"].includes(itemRarity(item)));
    case "sp_material":
      return lists.materials.filter((item) => itemId(item) && itemRarity(item) === "SP");
    case "sr_seed":
    case "sp_seed":
    case "ssr_seed": {
      const rarity = category === "sr_seed" ? "SR" : category === "sp_seed" ? "SP" : "SSR";
      return lists.crops.filter(
        (item) => itemId(item) && itemRarity(item) === rarity &&
          normalLimitedCrop(item),
      );
    }
    case "decor": {
      let state;
      try {
        state = decorationState(farm);
      } catch (error) {
        throw new GachaError("GACHA_STATE_INVALID", "The farm decoration state is invalid", { cause: error });
      }
      const owned = new Set(
        Object.entries(state.owned)
          .filter(([, count]) => Number.isSafeInteger(count) && count > 0)
          .map(([id]) => id),
      );
      return lists.decorations.filter((item) => {
        const id = itemId(item);
        return id !== null && isDecorationGachaEligible(item, now) && !owned.has(id);
      });
    }
    default:
      return [];
  }
}

function hasCategoryPool(category, lists, farm, now) {
  return category === "gold" || category === "silver" || itemPool(lists, category, farm, now).length > 0;
}

function effectiveWeights(lists, farm, now) {
  const weights = { ...GACHA_WEIGHTS };
  for (const category of REWARD_CATEGORIES) {
    if (category !== "gold" && !hasCategoryPool(category, lists, farm, now)) {
      weights.gold += weights[category];
      weights[category] = 0;
    }
  }
  return weights;
}

function probabilitiesFor(lists, farm, pity = { misses: 0 }, now = Date.now()) {
  const weights = effectiveWeights(lists, farm, now);
  if (pity.misses === GACHA_PITY_LIMIT - 1) {
    const totalRareWeight = RARE_REWARD_CATEGORIES.reduce(
      (sum, category) => sum + weights[category],
      0,
    );
    return Object.fromEntries(
      REWARD_CATEGORIES.map((category) => [
        category,
        totalRareWeight > 0 && RARE_REWARD_CATEGORIES.includes(category)
          ? Number(((weights[category] * 100) / totalRareWeight).toFixed(4))
          : 0,
      ]),
    );
  }
  const total = REWARD_CATEGORIES.reduce((sum, category) => sum + weights[category], 0);
  return Object.fromEntries(
    REWARD_CATEGORIES.map((category) => [
      category,
      Number(((weights[category] * 100) / total).toFixed(4)),
    ]),
  );
}

function nextRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new GachaError("GACHA_RANDOM_UNAVAILABLE", "The reward draw source is unavailable");
  }
  return value;
}

function pickCategory(random, lists, farm, pity, now) {
  const weights = effectiveWeights(lists, farm, now);
  const categories = pity.misses === GACHA_PITY_LIMIT - 1
    ? RARE_REWARD_CATEGORIES
    : REWARD_CATEGORIES;
  const total = categories.reduce((sum, category) => sum + weights[category], 0);
  if (total <= 0) {
    if (pity.misses === GACHA_PITY_LIMIT - 1) {
      throw new GachaError(
        "GACHA_PRIZE_POOL_EMPTY",
        "No rare reward is available for the pity draw",
      );
    }
    throw new GachaError("GACHA_CATALOG_UNAVAILABLE", "No reward pool is available");
  }
  let cursor = nextRandom(random) * total;
  for (const category of categories) {
    if (weights[category] === 0) continue;
    cursor -= weights[category];
    if (cursor < 0) return category;
  }
  return categories.at(-1);
}

function pickItem(random, pool) {
  const index = Math.min(pool.length - 1, Math.floor(nextRandom(random) * pool.length));
  return pool[index];
}

function pickGoldAmount(random) {
  let cursor = nextRandom(random) * 100;
  for (const reward of GOLD_REWARD_WEIGHTS) {
    cursor -= reward.weight;
    if (cursor < 0) return reward.amount;
  }
  return GOLD_REWARD_WEIGHTS.at(-1).amount;
}

function dishValue(recipe, lists) {
  const cooking = lists.cooking;
  const ingredientById = new Map(lists.ingredients.map((ingredient) => [itemId(ingredient), ingredient]));
  const multiplier = Number(cooking.ingredientRecycleValueMultiplier ?? 5);
  const processingFeeRate = Number(cooking.processingFeeRate ?? 0.1);
  const premium = Number(cooking.recyclePremium?.[itemRarity(recipe)] ?? 1);
  const baseValue = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.reduce((sum, ingredientId) => {
      const ingredient = ingredientById.get(String(ingredientId));
      return sum + Number(ingredient?.price ?? 0) * multiplier;
    }, 0)
    : 0;
  const value = Math.round(baseValue * (1 + processingFeeRate) * premium);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function ensureKitchen(farm) {
  if (!isObject(farm.ranch)) farm.ranch = {};
  if (!Array.isArray(farm.ranch.animals)) farm.ranch.animals = [];
  if (!Number.isSafeInteger(farm.ranch.coins)) farm.ranch.coins = 0;
  if (!isObject(farm.ranch.kitchen)) farm.ranch.kitchen = {};
  if (!Array.isArray(farm.ranch.kitchen.products)) farm.ranch.kitchen.products = [];
  if (!isObject(farm.ranch.kitchen.ingredients)) farm.ranch.kitchen.ingredients = {};
  if (!Array.isArray(farm.ranch.kitchen.dishes)) farm.ranch.kitchen.dishes = [];
  if (!Array.isArray(farm.ranch.kitchen.knownRecipes)) farm.ranch.kitchen.knownRecipes = [];
  return farm.ranch.kitchen;
}

function makeReward(category, item, now, generateId, random, lists) {
  if (category === "gold") {
    return { category, currency: "gold", amount: pickGoldAmount(random) };
  }
  if (category === "silver") {
    return { category, currency: "silver", amount: 1 + Math.floor(nextRandom(random) * 5) };
  }
  const id = itemId(item);
  if (!id) throw new GachaError("GACHA_CATALOG_UNAVAILABLE", "The selected reward is invalid");
  const name = itemName(item, id);
  if (category === "ingredient") {
    return { category, id, name, quantity: 1 };
  }
  if (category === "dish") {
    return {
      category,
      id: generateId(),
      recipe_id: id,
      name,
      rarity: itemRarity(item),
      quantity: 1,
      value: dishValue(item, lists),
      image: typeof item.image === "string" ? item.image : `${id}.webp`,
      created_at: now,
    };
  }
  if (category === "decor") return { category, id, name, quantity: 1 };
  return { category, id, name, rarity: itemRarity(item), quantity: 1 };
}

function applyInventoryReward(farm, reward, now) {
  if (reward.category === "ingredient") {
    const kitchen = ensureKitchen(farm);
    kitchen.ingredients[reward.id] = (kitchen.ingredients[reward.id] ?? 0) + reward.quantity;
    return;
  }
  if (reward.category === "dish") {
    const kitchen = ensureKitchen(farm);
    kitchen.dishes.push({
      id: reward.id,
      recipeId: reward.recipe_id,
      name: reward.name,
      rarity: reward.rarity,
      value: reward.value,
      image: reward.image,
      createdAt: reward.created_at,
      pricingVersion: 2,
    });
    return;
  }
  if (reward.category === "decor") {
    if (!isDecorationSaleOpen(reward.id, now)) {
      throw new GachaError("GACHA_STATE_INVALID", "The selected reward is invalid");
    }
    let state;
    try {
      state = decorationState(farm);
    } catch (error) {
      throw new GachaError("GACHA_STATE_INVALID", "The farm decoration state is invalid", { cause: error });
    }
    state.owned[reward.id] = (state.owned[reward.id] ?? 0) + reward.quantity;
    farm.farmDecorations = state;
    return;
  }
  if (reward.category.endsWith("_seed")) {
    const seeds = isObject(farm.seeds) ? farm.seeds : (farm.seeds = {});
    seeds[reward.id] = (seeds[reward.id] ?? 0) + reward.quantity;
    return;
  }
  if (reward.category === "material" || reward.category === "sp_material") {
    const materials = isObject(farm.materials) ? farm.materials : (farm.materials = {});
    materials[reward.id] = (materials[reward.id] ?? 0) + reward.quantity;
  }
}

function quotaFor(farm, day) {
  const current = isObject(farm.doorbellGachaDaily) ? farm.doorbellGachaDaily : null;
  const count = current?.day === day && Number.isSafeInteger(current.count) && current.count >= 0
    ? current.count
    : 0;
  return { day, count };
}

function pityFor(farm) {
  const current = isObject(farm.doorbellGachaPity) ? farm.doorbellGachaPity : null;
  if (!current) return { misses: 0 };
  if (
    !Number.isSafeInteger(current.misses) ||
    current.misses < 0 ||
    current.misses >= GACHA_PITY_LIMIT
  ) {
    throw new GachaError("GACHA_STATE_INVALID", "The stored gacha pity state is invalid");
  }
  return { misses: current.misses };
}

function pityView(pity) {
  return {
    limit: GACHA_PITY_LIMIT,
    misses: pity.misses,
    remaining: GACHA_PITY_LIMIT - pity.misses,
  };
}

function nextPity(pity, category) {
  return {
    misses: RARE_REWARD_CATEGORIES.includes(category)
      ? 0
      : Math.min(GACHA_PITY_LIMIT - 1, pity.misses + 1),
  };
}

function accountSnapshot(queries, residentId) {
  let account;
  try {
    account = queries.getAccount(residentId);
  } catch (error) {
    throw mapEconomyError(error);
  }
  return {
    gold: availableBalance(account, "gold"),
    silver: availableBalance(account, "silver"),
  };
}

function writeBalanceProjection(farm, balance) {
  // The economy ledger remains authoritative; these fields are the Farm's
  // existing projection used by its older views and synchronizer.
  farm.coins = balance.gold;
  farm.silver = balance.silver;
}

function buildStatus({ farm, farmId, residentId, queries, lists, now }) {
  const dayNumber = beijingDay(now);
  const quota = quotaFor(farm, dayNumber);
  const pity = pityFor(farm);
  const balance = accountSnapshot(queries, residentId);
  return {
    ok: true,
    farm_doorplate: farmId,
    price_gold: GACHA_PRICE_GOLD,
    balance,
    gold: balance.gold,
    silver: balance.silver,
    day: beijingDate(now),
    count: quota.count,
    limit: GACHA_DAILY_LIMIT,
    remaining_today: Math.max(0, GACHA_DAILY_LIMIT - quota.count),
    pity: pityView(pity),
    probabilities: probabilitiesFor(lists, farm, pity, now),
  };
}

function assertRuntimeDatabase(database) {
  if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function") {
    throw new TypeError("A shared Lingye SQLite database is required");
  }
}

// These are the fields needed to authenticate, calculate probabilities and
// update the balance projection. Prize inventory is read only after selection.
const GACHA_BASE_PATHS = Object.freeze([
  ["id"], ["humanKey"], ["doorbellMcpMigration", "residentId"],
  ["doorbellGachaDaily"], ["doorbellGachaPity"], ["coins"], ["silver"],
  ["farmDecorations"], ["snowTournamentFurniture", "lease"],
]);
const GACHA_KITCHEN_PATHS = Object.freeze([
  ["ranch"], ["ranch", "animals"], ["ranch", "kitchen"],
  ["ranch", "kitchen", "products"], ["ranch", "kitchen", "ingredients"],
  ["ranch", "kitchen", "dishes"], ["ranch", "kitchen", "knownRecipes"],
]);

function pathValue(value, path) {
  for (const key of path) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

function assignPath(target, path, value) {
  let parent = target;
  for (const key of path.slice(0, -1)) {
    if (!isObject(parent[key])) parent[key] = {};
    parent = parent[key];
  }
  if (value === undefined) delete parent[path.at(-1)];
  else parent[path.at(-1)] = structuredClone(value);
}

function projectFarmPaths(farm, paths) {
  const projected = {};
  for (const path of paths) {
    const value = pathValue(farm, path);
    if (value !== undefined) assignPath(projected, path, value);
  }
  return projected;
}

function plotIdentity(plot) {
  if (!isObject(plot)) return structuredClone(plot);
  const identity = {};
  for (const key of ["id", "plot_id"]) {
    if (Object.hasOwn(plot, key)) identity[key] = structuredClone(plot[key]);
  }
  return identity;
}

function projectGachaBase(farm) {
  const projected = projectFarmPaths(farm, GACHA_BASE_PATHS);
  if (farm.plots !== undefined) {
    projected.plots = Array.isArray(farm.plots) ? farm.plots.map(plotIdentity) : structuredClone(farm.plots);
  }
  return projected;
}

// Decoration layout needs plot identity and order, but not the crop subtrees.
function readGachaPlots(database, farmId) {
  const collection = database.prepare(`SELECT record_kind FROM farm_domain_records
    WHERE farm_id=? AND record_path=?`).get(farmId, "/plots");
  if (!collection || collection.record_kind !== "array") {
    return readFarmStatePaths(database, farmId, [["plots"]]).plots;
  }
  const rows = database.prepare(`SELECT member_key,previous_key,record_kind,fields_json FROM farm_domain_records
    WHERE farm_id=? AND parent_path=?`).all(farmId, "/plots");
  if (rows.some(row => !["object", "value"].includes(row.record_kind))) {
    const value = readFarmStatePaths(database, farmId, [["plots"]]).plots;
    return Array.isArray(value) ? value.map(plotIdentity) : value;
  }
  const byPrevious = new Map();
  for (const row of rows) {
    if (byPrevious.has(row.previous_key)) throw new GachaError("GACHA_STATE_INVALID", "The farm plot order is invalid");
    byPrevious.set(row.previous_key, row);
  }
  const plots = [];
  let previous = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = byPrevious.get(previous);
    if (!row) throw new GachaError("GACHA_STATE_INVALID", "The farm plot order is invalid");
    plots.push(plotIdentity(JSON.parse(row.fields_json)));
    previous = row.member_key;
  }
  if (byPrevious.has(previous)) throw new GachaError("GACHA_STATE_INVALID", "The farm plot order is invalid");
  return plots;
}

function checkedFarmPaths(database, farmId, paths, liveFarm) {
  const stored = readFarmStatePaths(database, farmId, paths);
  if (liveFarm && stableJson(stored) !== stableJson(projectFarmPaths(liveFarm, paths))) {
    throw new GachaError("GACHA_STATE_CONFLICT", "The Farm memory state is stale");
  }
  return stored;
}

function recordKinds(database, farmId, paths) {
  const rows = database.prepare(`SELECT record_path,record_kind FROM farm_domain_records
    WHERE farm_id=? AND record_path IN (SELECT value FROM json_each(?))`)
    .all(farmId, JSON.stringify(paths.map(farmRecordPath)));
  return new Map(rows.map(row => [row.record_path, row.record_kind]));
}

function prizePaths(rewards) {
  const paths = new Map();
  const add = path => paths.set(farmRecordPath(path), path);
  for (const reward of rewards) {
    if (reward.category === "ingredient") add(["ranch", "kitchen", "ingredients", reward.id]);
    else if (reward.category.endsWith("_seed")) add(["seeds", reward.id]);
    else if (reward.category === "material" || reward.category === "sp_material") add(["materials", reward.id]);
  }
  return [...paths.values()];
}

function prizeKitchenShape(database, entry) {
  const kinds = recordKinds(database, entry.farmId, GACHA_KITCHEN_PATHS);
  const has = (path, kind) => kinds.get(farmRecordPath(path)) === kind;
  const ranch = has(["ranch"], "object");
  const kitchen = ranch && has(["ranch", "kitchen"], "object");
  const coins = readFarmStatePaths(database, entry.farmId, [["ranch", "coins"]]);
  return {
    ranch, kitchen,
    animals: ranch && has(["ranch", "animals"], "array"),
    coins: ranch && Number.isSafeInteger(coins.ranch?.coins),
    products: kitchen && has(["ranch", "kitchen", "products"], "array"),
    ingredients: kitchen && has(["ranch", "kitchen", "ingredients"], "object"),
    dishes: kitchen && has(["ranch", "kitchen", "dishes"], "array"),
    knownRecipes: kitchen && has(["ranch", "kitchen", "knownRecipes"], "array"),
    coinsValue: coins.ranch?.coins,
  };
}

function assertKitchenMemory(entry, shape, liveFarm = entry.liveFarm) {
  if (!liveFarm) return;
  const ranch = liveFarm.ranch, kitchen = ranch?.kitchen;
  const matches = (present, value, kind) => {
    const valid = kind === "array" ? Array.isArray(value) : isObject(value);
    if (present) return valid;
    return !valid || (kind === "array" ? value.length === 0 : Object.keys(value).length === 0);
  };
  const emptyKitchen = isObject(kitchen) && Object.keys(kitchen).every(key =>
    key === "ingredients" ? isObject(kitchen[key]) && Object.keys(kitchen[key]).length === 0
      : ["products", "dishes", "knownRecipes"].includes(key) && Array.isArray(kitchen[key]) && kitchen[key].length === 0);
  if (!matches(shape.ranch, ranch, "object") ||
      (shape.kitchen ? !isObject(kitchen) : isObject(kitchen) && !emptyKitchen) ||
      !matches(shape.animals, ranch?.animals, "array") ||
      !matches(shape.products, kitchen?.products, "array") ||
      !matches(shape.ingredients, kitchen?.ingredients, "object") ||
      !matches(shape.dishes, kitchen?.dishes, "array") ||
      !matches(shape.knownRecipes, kitchen?.knownRecipes, "array") ||
      (shape.coins && ranch?.coins !== shape.coinsValue) ||
      (!shape.coins && Number.isSafeInteger(ranch?.coins) && ranch.coins !== 0)) {
    throw new GachaError("GACHA_STATE_CONFLICT", "The Farm memory state is stale");
  }
}

function preparePrizeFarm(database, entry, rewards) {
  const paths = prizePaths(rewards);
  const dynamic = checkedFarmPaths(database, entry.farmId, paths, entry.liveFarm);
  entry.prizePaths = paths;
  entry.prizeBefore = dynamic;
  entry.rewards = rewards;
  const inventoryFields = [...new Set(paths.filter(path => path[0] === "seeds" || path[0] === "materials").map(path => path[0]))];
  const inventoryKinds = inventoryFields.length
    ? recordKinds(database, entry.farmId, inventoryFields.map(field => [field])) : new Map();
  entry.inventoryObjects = new Map(inventoryFields.map(field => [field, inventoryKinds.get(farmRecordPath([field])) === "object"]));
  const needsKitchen = rewards.some(reward => reward.category === "ingredient" || reward.category === "dish");
  if (needsKitchen) {
    entry.kitchenShape = prizeKitchenShape(database, entry);
    assertKitchenMemory(entry, entry.kitchenShape);
    entry.farm.ranch = { animals: [], coins: entry.kitchenShape.coins ? entry.kitchenShape.coinsValue : 0,
      kitchen: { products: [], ingredients: {}, dishes: [], knownRecipes: [] } };
  }
  for (const path of paths) {
    const value = pathValue(dynamic, path);
    if (value !== undefined) assignPath(entry.farm, path, value);
  }
}

function prizeUpdates(entry) {
  const farm = entry.farm;
  const updates = [["coins"], ["silver"], ["doorbellGachaDaily"], ["doorbellGachaPity"]];
  if (entry.rewards.some(reward => reward.category === "decor")) {
    updates.push(...changedPaths(entry.baseBefore.farmDecorations, farm.farmDecorations, ["farmDecorations"]));
  }
  const shape = entry.kitchenShape;
  if (shape) {
    if (!shape.ranch) updates.push(["ranch"]);
    else {
      if (!shape.animals) updates.push(["ranch", "animals"]);
      if (!shape.coins) updates.push(["ranch", "coins"]);
      if (!shape.kitchen) updates.push(["ranch", "kitchen"]);
      else {
        for (const field of ["products", "ingredients", "dishes", "knownRecipes"]) {
          if (!shape[field]) updates.push(["ranch", "kitchen", field]);
        }
      }
    }
  }
  for (const [field, exists] of entry.inventoryObjects) {
    if (!exists) updates.push([field]);
  }
  for (const path of entry.prizePaths) {
    if ((path[0] === "seeds" || path[0] === "materials") && !entry.inventoryObjects.get(path[0])) continue;
    if (path[0] !== "ranch" || (shape?.ranch && shape?.kitchen && shape.ingredients)) updates.push(path);
  }
  const appended = shape?.ranch && shape?.kitchen && shape.dishes
    ? farm.ranch.kitchen.dishes : [];
  return { updates: updates.map(path => ({ path, value: pathValue(farm, path) })), appended };
}

function changedPaths(before, after, path) {
  if (before === after) return [];
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .flatMap(key => changedPaths(before[key], after[key], [...path, key]));
  }
  return stableJson(before) === stableJson(after) ? [] : [path];
}

function stateConflict(error) {
  if (error?.code === "farm_state_conflict" || error?.message === "farm_state_conflict")
    return new GachaError("GACHA_STATE_CONFLICT", "The farm state changed while drawing", { cause: error });
  return error;
}

function assertPublicationMemory(entry, liveFarm) {
  if (!liveFarm) throw new GachaError("GACHA_FARM_NOT_FOUND", "The farm was removed while drawing");
  if (stableJson(projectGachaBase(liveFarm)) !== stableJson(entry.baseBefore) ||
      stableJson(projectFarmPaths(liveFarm, entry.prizePaths)) !== stableJson(entry.prizeBefore)) {
    throw new GachaError("GACHA_STATE_CONFLICT", "The Farm memory state changed while drawing");
  }
  if (entry.kitchenShape) assertKitchenMemory(entry, entry.kitchenShape, liveFarm);
  for (const [key, receipt] of Object.entries(entry.farm.doorbellGachaReceipts ?? {})) {
    const current = liveFarm.doorbellGachaReceipts?.[key];
    if (current && stableJson(current) !== stableJson(receipt))
      throw new GachaError("GACHA_IDEMPOTENCY_CONFLICT", "This idempotency key was used for a different request");
  }
}

function createRecordFarmStateStore(database, runtime) {
  assertRuntimeDatabase(database);
  return Object.freeze({
    findByHumanKey(humanKey) {
      const farmId = findFarmIdByHumanKey(database, humanKey);
      if (!farmId || (runtime && farmId === NPC_ID)) return null;
      const liveFarm = runtime ? getFarm(farmId) : null;
      if (runtime && !liveFarm) return null;
      const expectedRevision = readFarmStateRevision(database, farmId);
      if (!Number.isSafeInteger(expectedRevision))
        throw new GachaError("GACHA_STATE_CONFLICT", "The farm durable state is unavailable");
      const farm = readFarmStatePaths(database, farmId, GACHA_BASE_PATHS);
      const plots = readGachaPlots(database, farmId);
      if (plots !== undefined) farm.plots = plots;
      if (liveFarm && stableJson(projectGachaBase(liveFarm)) !== stableJson(farm))
        throw new GachaError("GACHA_STATE_CONFLICT", "The Farm memory state is stale");
      return { farmId, farm, liveFarm, expectedRevision, baseBefore: structuredClone(farm) };
    },
    prepareRewards({ entry, rewards }) { preparePrizeFarm(database, entry, rewards); },
    save({ entry }) {
      if (!entry || !Number.isSafeInteger(entry.expectedRevision))
        throw new GachaError("GACHA_STATE_CONFLICT", "The farm state compare point is missing");
      if (entry.liveFarm) assertPublicationMemory(entry, getFarm(entry.farmId));
      const changes = prizeUpdates(entry);
      try {
        entry.committedRecords = writeFarmStatePaths(database, entry.farmId, changes.updates, {
          expectedRevision: entry.expectedRevision,
          ...(changes.appended.length ? { appendItems: [{ path: ["ranch", "kitchen", "dishes"],
            values: changes.appended }] } : {}),
        }).recordChanges;
      } catch (error) { throw stateConflict(error); }
      entry.publication = changes;
    },
    publish({ entry }) {
      const liveFarm = getFarm(entry.farmId);
      assertPublicationMemory(entry, liveFarm);
      for (const { path, value } of entry.publication.updates) assignPath(liveFarm, path, value);
      if (entry.publication.appended.length) {
        liveFarm.ranch.kitchen.dishes.push(...structuredClone(entry.publication.appended));
      }
      for (const [key, receipt] of Object.entries(entry.farm.doorbellGachaReceipts ?? {})) {
        (liveFarm.doorbellGachaReceipts ??= {})[key] = structuredClone(receipt);
      }
      acceptCommittedFarmRecords(liveFarm,entry.committedRecords,Object.keys(entry.farm.doorbellGachaReceipts??{})
        .map(receiptKey=>({scope:"/doorbellGachaReceipts",receiptKey})));
      return liveFarm;
    },
  });
}

export function createRuntimeFarmStateStore(database) {
  return createRecordFarmStateStore(database, true);
}

function farmGachaReceipts(farm, create = false) {
  if (!isObject(farm.doorbellGachaReceipts)) {
    if (!create) return null;
    farm.doorbellGachaReceipts = {};
  }
  return farm.doorbellGachaReceipts;
}

function receiptEntry(value) {
  const payloadHash = typeof value?.payloadHash === "string"
    ? value.payloadHash
    : typeof value?.fingerprint === "string"
      ? value.fingerprint
      : "";
  if (!isObject(value) || payloadHash.length === 0 || !Object.hasOwn(value, "result")) {
    throw new GachaError("GACHA_STATE_INVALID", "The stored gacha receipt is invalid");
  }
  return { payloadHash, result: value.result };
}

/**
 * Gacha receipts use the existing farm_action_receipts table.  The overlay's
 * migration copy registers the field as a human receipt scope, so normal Farm
 * saves continue to preserve and rehydrate it without a new table or schema.
 */
export function createFarmActionReceiptStore(database) {
  assertRuntimeDatabase(database);
  return Object.freeze({
    get(farmId, receiptKey) {
      const row = database
        .prepare(
          "SELECT payload_hash, result_json FROM farm_action_receipts WHERE farm_id = ? AND scope = ? AND receipt_key = ?",
        )
        .get(farmId, GACHA_RECEIPT_SCOPE, receiptKey);
      if (!row) return null;
      try {
        return receiptEntry({ payloadHash: row.payload_hash, result: JSON.parse(row.result_json) });
      } catch (error) {
        if (error instanceof GachaError) throw error;
        throw new GachaError("GACHA_STATE_INVALID", "The stored gacha receipt is invalid", { cause: error });
      }
    },
    put({ farmId, receiptKey, payloadHash, result }) {
      const existing = database
        .prepare(
          "SELECT payload_hash, result_json FROM farm_action_receipts WHERE farm_id = ? AND scope = ? AND receipt_key = ?",
        )
        .get(farmId, GACHA_RECEIPT_SCOPE, receiptKey);
      if (existing) {
        const parsed = this.get(farmId, receiptKey);
        if (parsed.payloadHash !== payloadHash || stableJson(parsed.result) !== stableJson(result)) {
          throw new GachaError("GACHA_IDEMPOTENCY_CONFLICT", "This idempotency key was used for a different request");
        }
        return parsed;
      }
      const farm = database.prepare("SELECT 1 FROM farm_states WHERE farm_id = ?").get(farmId);
      if (!farm) {
        throw new GachaError("GACHA_STATE_CONFLICT", "The farm state changed while recording the receipt");
      }
      try {
        database
          .prepare(
            "INSERT INTO farm_action_receipts (farm_id, scope, receipt_key, payload_hash, result_json) VALUES (?, ?, ?, ?, ?)",
          )
          .run(farmId, GACHA_RECEIPT_SCOPE, receiptKey, payloadHash, JSON.stringify(result));
      } catch (error) {
        const concurrent = this.get(farmId, receiptKey);
        if (!concurrent || concurrent.payloadHash !== payloadHash || stableJson(concurrent.result) !== stableJson(result)) {
          throw new GachaError("GACHA_STATE_CONFLICT", "The gacha receipt was not durably recorded", { cause: error });
        }
        return concurrent;
      }
      return { payloadHash, result };
    },
  });
}

function recordFarmGachaReceipt(farm, receiptKey, payloadHash, result) {
  const ledger = farmGachaReceipts(farm, true);
  if (Object.hasOwn(ledger, receiptKey)) {
    const existing = receiptEntry(ledger[receiptKey]);
    if (existing.payloadHash !== payloadHash || stableJson(existing.result) !== stableJson(result)) {
      throw new GachaError("GACHA_IDEMPOTENCY_CONFLICT", "This idempotency key was used for a different request");
    }
    return;
  }
  ledger[receiptKey] = { fingerprint: payloadHash, result };
}

export function createSqliteTransactionRunner(database) {
  if (!database || typeof database.exec !== "function") {
    throw new TypeError("A SQLite database is required");
  }
  let sequence = 0;
  return (operation) => {
    const nested = database.isTransaction === true || database.inTransaction === true;
    const savepoint = `doorbell_gacha_tx_${++sequence}`;
    database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
      const result = operation();
      database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      try {
        if (nested) {
          database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else if (database.isTransaction === true || database.inTransaction === true) {
          database.exec("ROLLBACK");
        }
      } catch {
        // Preserve the business error as the authoritative failure.
      }
      throw error;
    }
  };
}

export function createSqliteFarmStateStore(database) {
  return createRecordFarmStateStore(database, false);
}

export function createSqliteReceiptStore(database) {
  if (!database || typeof database.prepare !== "function") {
    throw new TypeError("A SQLite database is required");
  }
  return {
    get(farmId, receiptKey) {
      const row = database
        .prepare(
          "SELECT payload_hash, result_json FROM farm_action_receipts WHERE farm_id = ? AND scope = ? AND receipt_key = ?",
        )
        .get(farmId, GACHA_RECEIPT_SCOPE, receiptKey);
      if (!row) return null;
      try {
        return { payloadHash: row.payload_hash, result: JSON.parse(row.result_json) };
      } catch {
        throw new GachaError("GACHA_STATE_INVALID", "The stored gacha receipt is invalid");
      }
    },
    put({ farmId, receiptKey, payloadHash, result }) {
      database
        .prepare(
          "INSERT INTO farm_action_receipts (farm_id, scope, receipt_key, payload_hash, result_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(farmId, GACHA_RECEIPT_SCOPE, receiptKey, payloadHash, JSON.stringify(result));
    },
  };
}

export function createGachaService(options = {}) {
  const farmStore = options.farmStore ?? createSqliteFarmStateStore(options.database);
  const receiptStore = options.receiptStore ?? createSqliteReceiptStore(options.database);
  const runAtomic = options.runAtomic ?? createSqliteTransactionRunner(options.database);
  const onFarmCommit = typeof options.onFarmCommit === "function" ? options.onFarmCommit : null;
  const backend = options.backend;
  const { commands, queries } = economyParts(backend);
  const lists = catalogLists(options.catalog);
  const nowSource = options.now ?? Date.now;
  const readNow = () => {
    const now = Number(nowSource());
    if (!Number.isFinite(now)) throw new GachaError("GACHA_TIME_UNAVAILABLE", "The Farm clock is invalid");
    return now;
  };
  const random = options.random ?? Math.random;
  const generateId = options.generateId ?? randomUUID;

  const resolve = (input, action) => {
    const normalized = assertInput(input, { action });
    const entry = farmStore.findByHumanKey(normalized.humanKey);
    return {
      ...normalized,
      ...bindingFromEntry(entry, normalized.humanKey, normalized.doorplate),
    };
  };

  const read = (input) => {
    const now = readNow();
    const resolved = resolve(input, "read");
    return buildStatus({ ...resolved, queries, lists, now });
  };

  const readReceipt = (input) => {
    const resolved = resolve(input, "draw");
    const previous = receiptStore.get(resolved.farmId, resolved.idempotencyKey);
    return {
      ok: true,
      farm_doorplate: resolved.farmId,
      request_id: resolved.idempotencyKey,
      found: previous !== null,
      ...(previous ? { result: previous.result } : {}),
    };
  };

  const drawTen = (input) => {
    const resolvedInput = assertInput(input, { action: "draw" });
    let committedFarm = null;
    let committedFarmMeta = null;
    const result = runAtomic(() => {
      const entry = farmStore.findByHumanKey(resolvedInput.humanKey);
      const resolved = {
        ...resolvedInput,
        ...bindingFromEntry(entry, resolvedInput.humanKey, resolvedInput.doorplate),
      };
      const payload = {
        farmId: resolved.farmId,
        residentId: resolved.residentId,
        farmHumanKey: resolved.humanKey,
        expectedFarmDoorplate: resolved.doorplate,
        action: "ten_draw",
      };
      const payloadHash = hashPayload(payload);
      const previous = receiptStore.get(resolved.farmId, resolved.idempotencyKey);
      if (previous) {
        if (previous.payloadHash !== payloadHash) {
          throw new GachaError(
            "GACHA_IDEMPOTENCY_CONFLICT",
            "This idempotency key was used for a different request",
          );
        }
        return previous.result;
      }

      const now = readNow();
      const day = beijingDay(now);
      const quota = quotaFor(resolved.farm, day);
      if (quota.count + GACHA_TEN_DRAW_SIZE > GACHA_DAILY_LIMIT) {
        throw new GachaError("GACHA_QUOTA_EXCEEDED", "The daily gacha quota is exhausted", {
          day: beijingDate(now),
          count: quota.count,
          limit: GACHA_DAILY_LIMIT,
        });
      }

      let charged = null;
      try {
        charged = commands.chargeToSystem({
          residentId: resolved.residentId,
          currency: "gold",
          amount: GACHA_TEN_DRAW_PRICE_GOLD,
          actor: "human",
          businessType: "lounge_gacha",
          businessRef: `lounge-gacha:${resolved.farmId}:${resolved.idempotencyKey}:ten-cost`,
          idempotencyKey: `lounge-gacha:${resolved.farmId}:${resolved.idempotencyKey}:ten-cost`,
        });
      } catch (error) {
        throw mapEconomyError(error);
      }

      const rewards = [];
      let pity = pityFor(resolved.farm);
      const pendingUnlockDecorationIds = new Set();
      for (let index = 0; index < GACHA_TEN_DRAW_SIZE; index += 1) {
        const selectionNow = readNow();
        const selectionLists = pendingUnlockDecorationIds.size
          ? {
            ...lists,
            decorations: lists.decorations.filter((item) => !pendingUnlockDecorationIds.has(itemId(item))),
          }
          : lists;
        const category = pickCategory(random, selectionLists, resolved.farm, pity, selectionNow);
        const item = category === "gold" || category === "silver"
          ? null
          : pickItem(random, itemPool(selectionLists, category, resolved.farm, selectionNow));
        if (category === "decor" && item?.purchase_mode === "unlock") {
          pendingUnlockDecorationIds.add(itemId(item));
        }
        const reward = makeReward(category, item, selectionNow, generateId, random, lists);
        rewards.push(reward);
        pity = nextPity(pity, category);
      }

      let awarded = charged;
      const currencyTotals = new Map();
      for (const reward of rewards) {
        if (reward.currency) {
          currencyTotals.set(reward.currency, (currencyTotals.get(reward.currency) ?? 0) + reward.amount);
        }
      }
      for (const [currency, amount] of currencyTotals) {
        try {
          awarded = commands.creditFromSystem({
            residentId: resolved.residentId,
            currency,
            amount,
            actor: "system",
            businessType: "lounge_gacha_reward",
            businessRef: `lounge-gacha:${resolved.farmId}:${resolved.idempotencyKey}:ten-award:${currency}`,
            idempotencyKey: `lounge-gacha:${resolved.farmId}:${resolved.idempotencyKey}:ten-award:${currency}`,
          });
        } catch (error) {
          throw mapEconomyError(error);
        }
      }
      farmStore.prepareRewards?.({ entry, rewards });
      for (const reward of rewards) {
        if (!reward.currency) {
          const grantNow = reward.category === "decor" ? readNow() : now;
          applyInventoryReward(resolved.farm, reward, grantNow);
        }
      }

      const balance = {
        gold: availableBalance(awarded ?? accountSnapshot(queries, resolved.residentId), "gold"),
        silver: availableBalance(awarded ?? accountSnapshot(queries, resolved.residentId), "silver"),
      };
      resolved.farm.doorbellGachaDaily = { day, count: quota.count + GACHA_TEN_DRAW_SIZE };
      resolved.farm.doorbellGachaPity = pity;
      writeBalanceProjection(resolved.farm, balance);
      const result = {
        ok: true,
        request_id: resolved.idempotencyKey,
        receipt_id: resolved.idempotencyKey,
        farm_doorplate: resolved.farmId,
        price_gold: GACHA_TEN_DRAW_PRICE_GOLD,
        draw_count: GACHA_TEN_DRAW_SIZE,
        rewards,
        balance,
        gold: balance.gold,
        silver: balance.silver,
        day: beijingDate(now),
        count: quota.count + GACHA_TEN_DRAW_SIZE,
        limit: GACHA_DAILY_LIMIT,
        remaining_today: GACHA_DAILY_LIMIT - quota.count - GACHA_TEN_DRAW_SIZE,
        pity: pityView(pity),
        probabilities: probabilitiesFor(lists, resolved.farm, pity, readNow()),
      };
      recordFarmGachaReceipt(resolved.farm, resolved.idempotencyKey, payloadHash, result);
      farmStore.save({
        farmId: resolved.farmId,
        farm: resolved.farm,
        expectedStateJson: entry.expectedStateJson,
        entry,
      });
      try {
        receiptStore.put({
          farmId: resolved.farmId,
          receiptKey: resolved.idempotencyKey,
          payloadHash,
          result,
        });
      } catch (error) {
        const concurrent = receiptStore.get(resolved.farmId, resolved.idempotencyKey);
        if (!concurrent || concurrent.payloadHash !== payloadHash) {
          throw error;
        }
        return concurrent.result;
      }
      committedFarm = resolved.farm;
      committedFarmMeta = {
        expectedMemoryStateJson: entry.expectedMemoryStateJson,
        entry,
      };
      return result;
    });
    if (committedFarm && onFarmCommit) {
      onFarmCommit({
        farmId: committedFarm.id,
        farm: committedFarm,
        ...committedFarmMeta,
      });
    }
    return result;
  };

  const draw = (input) => {
    const resolvedInput = assertInput(input, { action: "draw" });
    let committedFarm = null;
    let committedFarmMeta = null;
    const result = runAtomic(() => {
      const entry = farmStore.findByHumanKey(resolvedInput.humanKey);
      const resolved = {
        ...resolvedInput,
        ...bindingFromEntry(entry, resolvedInput.humanKey, resolvedInput.doorplate),
      };
      const payload = {
        farmId: resolved.farmId,
        residentId: resolved.residentId,
        farmHumanKey: resolved.humanKey,
        expectedFarmDoorplate: resolved.doorplate,
      };
      const payloadHash = hashPayload(payload);
      const previous = receiptStore.get(resolved.farmId, resolved.idempotencyKey);
      if (previous) {
        if (previous.payloadHash !== payloadHash) {
          throw new GachaError(
            "GACHA_IDEMPOTENCY_CONFLICT",
            "This idempotency key was used for a different request",
          );
        }
        return previous.result;
      }

      const now = readNow();
      const quota = quotaFor(resolved.farm, beijingDay(now));
      if (quota.count >= GACHA_DAILY_LIMIT) {
        throw new GachaError("GACHA_QUOTA_EXCEEDED", "The daily gacha quota is exhausted", {
          day: beijingDate(now),
          count: quota.count,
          limit: GACHA_DAILY_LIMIT,
        });
      }

      const pityBefore = pityFor(resolved.farm);
      const poolNow = readNow();
      if (pityBefore.misses === GACHA_PITY_LIMIT - 1) {
        const availableRare = RARE_REWARD_CATEGORIES.some(
          (category) => itemPool(lists, category, resolved.farm, poolNow).length > 0,
        );
        if (!availableRare) {
          throw new GachaError(
            "GACHA_PRIZE_POOL_EMPTY",
            "No rare reward is available for the pity draw",
          );
        }
      }

      const businessRef = `lounge-gacha:${resolved.farmId}:${resolved.idempotencyKey}`;
      let charged;
      try {
        charged = commands.chargeToSystem({
          residentId: resolved.residentId,
          currency: "gold",
          amount: GACHA_PRICE_GOLD,
          actor: "human",
          businessType: "lounge_gacha",
          businessRef: `${businessRef}:cost`,
          idempotencyKey: `${businessRef}:cost`,
        });
      } catch (error) {
        throw mapEconomyError(error);
      }

      const selectionNow = readNow();
      const category = pickCategory(random, lists, resolved.farm, pityBefore, selectionNow);
      const item = category === "gold" || category === "silver"
        ? null
        : pickItem(random, itemPool(lists, category, resolved.farm, selectionNow));
      const reward = makeReward(category, item, selectionNow, generateId, random, lists);
      farmStore.prepareRewards?.({ entry, rewards: [reward] });
      let awarded = charged;
      if (reward.currency) {
        try {
          awarded = commands.creditFromSystem({
            residentId: resolved.residentId,
            currency: reward.currency,
            amount: reward.amount,
            actor: "system",
            businessType: "lounge_gacha_reward",
            businessRef: `${businessRef}:award`,
            idempotencyKey: `${businessRef}:award`,
          });
        } catch (error) {
          throw mapEconomyError(error);
        }
      } else {
        const grantNow = reward.category === "decor" ? readNow() : now;
        applyInventoryReward(resolved.farm, reward, grantNow);
      }

      const balance = {
        gold: availableBalance(awarded ?? accountSnapshot(queries, resolved.residentId), "gold"),
        silver: availableBalance(awarded ?? accountSnapshot(queries, resolved.residentId), "silver"),
      };
      resolved.farm.doorbellGachaDaily = {
        day: beijingDay(now),
        count: quota.count + 1,
      };
      const pityAfter = nextPity(pityBefore, category);
      resolved.farm.doorbellGachaPity = pityAfter;
      writeBalanceProjection(resolved.farm, balance);
      const result = {
        ok: true,
        request_id: resolved.idempotencyKey,
        receipt_id: resolved.idempotencyKey,
        farm_doorplate: resolved.farmId,
        price_gold: GACHA_PRICE_GOLD,
        reward,
        balance,
        gold: balance.gold,
        silver: balance.silver,
        day: beijingDate(now),
        count: quota.count + 1,
        limit: GACHA_DAILY_LIMIT,
        remaining_today: GACHA_DAILY_LIMIT - quota.count - 1,
        pity: pityView(pityAfter),
        probabilities: probabilitiesFor(lists, resolved.farm, pityAfter, readNow()),
      };
      recordFarmGachaReceipt(resolved.farm, resolved.idempotencyKey, payloadHash, result);
      farmStore.save({
        farmId: resolved.farmId,
        farm: resolved.farm,
        expectedStateJson: entry.expectedStateJson,
        entry,
      });
      try {
        receiptStore.put({
          farmId: resolved.farmId,
          receiptKey: resolved.idempotencyKey,
          payloadHash,
          result,
        });
      } catch (error) {
        const concurrent = receiptStore.get(resolved.farmId, resolved.idempotencyKey);
        if (!concurrent || concurrent.payloadHash !== payloadHash) {
          throw error;
        }
        return concurrent.result;
      }
      committedFarm = resolved.farm;
      committedFarmMeta = {
        expectedMemoryStateJson: entry.expectedMemoryStateJson,
        entry,
      };
      return result;
    });
    if (committedFarm && onFarmCommit) {
      onFarmCommit({
        farmId: committedFarm.id,
        farm: committedFarm,
        ...committedFarmMeta,
      });
    }
    return result;
  };

  return Object.freeze({ read, readReceipt, draw, drawTen });
}

export function createDoorbellGachaService(options = {}) {
  assertRuntimeDatabase(options.database);
  const farmStore = createRuntimeFarmStateStore(options.database);
  const receiptStore = createFarmActionReceiptStore(options.database);
  return createGachaService({
    ...options,
    farmStore,
    receiptStore,
    runAtomic: (operation) => runLingyeWorldTransaction(options.database, operation),
    onFarmCommit: (input) => farmStore.publish(input),
  });
}

export function serviceTokenMatches(authorization, expectedToken) {
  const prefix = "Bearer ";
  if (
    typeof expectedToken !== "string" ||
    expectedToken.length === 0 ||
    typeof authorization !== "string" ||
    !authorization.startsWith(prefix)
  ) {
    return false;
  }
  const received = Buffer.from(authorization.slice(prefix.length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

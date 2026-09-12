import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { decorationState } from "../../domain/farm-decoration/state.js";
import { decomposeFarmForPersistence } from "../../farm-world-sqlite-migration.js";
import { runLingyeWorldTransaction } from "../../lingye-world-database.js";
import { isQixi2026CropId } from "../../qixi-2026.js";
import { normalizeFarm, playerFarms } from "../../store.js";

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

function itemPool(lists, category, farm) {
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
        return id !== null && item.layer === "furniture" && !owned.has(id);
      });
    }
    default:
      return [];
  }
}

function hasCategoryPool(category, lists, farm) {
  return category === "gold" || category === "silver" || itemPool(lists, category, farm).length > 0;
}

function effectiveWeights(lists, farm) {
  const weights = { ...GACHA_WEIGHTS };
  for (const category of REWARD_CATEGORIES) {
    if (category !== "gold" && !hasCategoryPool(category, lists, farm)) {
      weights.gold += weights[category];
      weights[category] = 0;
    }
  }
  return weights;
}

function probabilitiesFor(lists, farm, pity = { misses: 0 }) {
  const weights = effectiveWeights(lists, farm);
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

function pickCategory(random, lists, farm, pity) {
  const weights = effectiveWeights(lists, farm);
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

function applyInventoryReward(farm, reward) {
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
    probabilities: probabilitiesFor(lists, farm, pity),
  };
}

function parseStoredFarm(row) {
  let farm;
  try {
    farm = JSON.parse(row.state_json);
  } catch {
    throw new GachaError("GACHA_STATE_INVALID", "The stored farm state is invalid");
  }
  if (!isObject(farm) || farm.id !== row.farm_id) {
    throw new GachaError("GACHA_STATE_INVALID", "The stored farm identity is invalid");
  }
  return farm;
}

function persistedFarmState(farm) {
  try {
    return decomposeFarmForPersistence(farm).state;
  } catch (error) {
    throw new GachaError("GACHA_STATE_INVALID", "The farm state cannot be persisted", { cause: error });
  }
}

function persistedFarmJson(farm) {
  return stableJson(persistedFarmState(farm));
}

function assertRuntimeDatabase(database) {
  if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function") {
    throw new TypeError("A shared Lingye SQLite database is required");
  }
}

/**
 * The normal Farm runtime owns an in-memory farm map.  Gacha works on an
 * isolated copy, compares that map with the durable row, and publishes the
 * copy only after the shared SQLite transaction commits.  This prevents a
 * later legacy save from writing an older in-memory farm over a draw.
 */
export function createRuntimeFarmStateStore(database) {
  assertRuntimeDatabase(database);
  return Object.freeze({
    findByHumanKey(humanKey) {
      const liveFarm = playerFarms().find((farm) => farm?.humanKey === humanKey);
      if (!liveFarm) return null;
      const row = database
        .prepare("SELECT farm_id, position, state_json FROM farm_states WHERE farm_id = ?")
        .get(liveFarm.id);
      if (!row) {
        throw new GachaError("GACHA_STATE_CONFLICT", "The farm durable state is unavailable");
      }
      const storedFarm = parseStoredFarm(row);
      const normalizedStored = normalizeFarm(structuredClone(storedFarm));
      const normalizedLive = normalizeFarm(structuredClone(liveFarm));
      if (persistedFarmJson(normalizedLive) !== persistedFarmJson(normalizedStored)) {
        throw new GachaError("GACHA_STATE_CONFLICT", "The Farm memory state is stale");
      }
      return {
        farmId: row.farm_id,
        position: row.position,
        farm: normalizedLive,
        expectedStateJson: row.state_json,
        expectedMemoryStateJson: persistedFarmJson(normalizedLive),
      };
    },
    save({ farmId, farm, expectedStateJson }) {
      if (typeof expectedStateJson !== "string") {
        throw new GachaError("GACHA_STATE_CONFLICT", "The farm state compare point is missing");
      }
      const stateJson = JSON.stringify(persistedFarmState(farm));
      const result = database
        .prepare(
          "UPDATE farm_states SET state_json = ? WHERE farm_id = ? AND state_json = ?",
        )
        .run(stateJson, farmId, expectedStateJson);
      if (Number(result?.changes) !== 1) {
        throw new GachaError("GACHA_STATE_CONFLICT", "The farm state changed while drawing");
      }
    },
    publish({ farmId, farm, expectedMemoryStateJson }) {
      const liveFarm = playerFarms().find((candidate) => candidate?.id === farmId);
      if (!liveFarm) {
        throw new GachaError("GACHA_FARM_NOT_FOUND", "The farm was removed while drawing");
      }
      const normalizedLive = normalizeFarm(structuredClone(liveFarm));
      if (
        typeof expectedMemoryStateJson === "string" &&
        persistedFarmJson(normalizedLive) !== expectedMemoryStateJson
      ) {
        throw new GachaError("GACHA_STATE_CONFLICT", "The Farm memory state changed while drawing");
      }
      const published = structuredClone(farm);
      for (const key of Object.keys(liveFarm)) delete liveFarm[key];
      Object.assign(liveFarm, published);
      return liveFarm;
    },
  });
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
  if (!database || typeof database.prepare !== "function") {
    throw new TypeError("A SQLite database is required");
  }
  return {
    findByHumanKey(humanKey) {
      const rows = database.prepare("SELECT farm_id, position, state_json FROM farm_states ORDER BY position").all();
      for (const row of rows) {
        let farm;
        try {
          farm = JSON.parse(row.state_json);
        } catch {
          throw new GachaError("GACHA_STATE_INVALID", "The farm state is invalid");
        }
        if (farm?.humanKey === humanKey) {
          return { farmId: row.farm_id, position: row.position, farm };
        }
      }
      return null;
    },
    save({ farmId, farm }) {
      const result = database
        .prepare("UPDATE farm_states SET state_json = ? WHERE farm_id = ?")
        .run(JSON.stringify(farm), farmId);
      if (Number(result?.changes) !== 1) {
        throw new GachaError("GACHA_STATE_CONFLICT", "The farm state changed while drawing");
      }
    },
  };
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
    const now = Number(nowSource());
    if (!Number.isFinite(now)) throw new GachaError("GACHA_TIME_UNAVAILABLE", "The Farm clock is invalid");
    const resolved = resolve(input, "read");
    return buildStatus({ ...resolved, queries, lists, now });
  };

  const draw = (input) => {
    const now = Number(nowSource());
    if (!Number.isFinite(now)) throw new GachaError("GACHA_TIME_UNAVAILABLE", "The Farm clock is invalid");
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

      const quota = quotaFor(resolved.farm, beijingDay(now));
      if (quota.count >= GACHA_DAILY_LIMIT) {
        throw new GachaError("GACHA_QUOTA_EXCEEDED", "The daily gacha quota is exhausted", {
          day: beijingDate(now),
          count: quota.count,
          limit: GACHA_DAILY_LIMIT,
        });
      }

      const pityBefore = pityFor(resolved.farm);
      if (pityBefore.misses === GACHA_PITY_LIMIT - 1) {
        const availableRare = RARE_REWARD_CATEGORIES.some(
          (category) => itemPool(lists, category, resolved.farm).length > 0,
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

      const category = pickCategory(random, lists, resolved.farm, pityBefore);
      const item = category === "gold" || category === "silver"
        ? null
        : pickItem(random, itemPool(lists, category, resolved.farm));
      const reward = makeReward(category, item, now, generateId, random, lists);
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
        applyInventoryReward(resolved.farm, reward);
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
        probabilities: probabilitiesFor(lists, resolved.farm, pityAfter),
      };
      recordFarmGachaReceipt(resolved.farm, resolved.idempotencyKey, payloadHash, result);
      farmStore.save({
        farmId: resolved.farmId,
        farm: resolved.farm,
        expectedStateJson: entry.expectedStateJson,
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

  return Object.freeze({ read, draw });
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

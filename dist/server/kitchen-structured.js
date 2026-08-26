import { createHash } from "node:crypto";
import {
  cooking,
  cookingIngredientById,
  cookingProductById,
  cookingRecipeById,
  fishingFishById,
  fishingItemById,
} from "../content.js";
import { currentDayIndex } from "../time.js";
import { kitchenInventoryRevisionFromData } from "./kitchen-inventory-revision.js";

const ODD_DISH = {
  id: "odd_dish",
  name: "微妙的料理",
  rarity: "N",
  category: null,
  ingredients: [],
};

// These are the paid cooking tools exposed by the Human kitchen shop.  The
// free cooking methods remain implicit and do not need an ownership field in
// a farm save.
export const PAID_KITCHEN_TOOLS = [
  { tool_id: "roast", name: "烤炉", price_silver: 800 },
  { tool_id: "steam", name: "蒸笼", price_silver: 1_200 },
  { tool_id: "deep-fry", name: "炸锅", price_silver: 1_600 },
];

// Recipe methods are authoritative content IDs.  The purchase catalog above
// keeps its existing action IDs for compatibility; recipe tool IDs use the
// stable physical-tool IDs below and are accepted together with those legacy
// purchase IDs when checking one farm's persisted ownership.
export const KITCHEN_METHODS = Object.freeze({
  "stir-fry": Object.freeze({ method_id: "stir-fry", name: "炒", tool_id: null }),
  "pan-fry": Object.freeze({ method_id: "pan-fry", name: "煎", tool_id: null }),
  stew: Object.freeze({ method_id: "stew", name: "炖煮", tool_id: null }),
  steam: Object.freeze({ method_id: "steam", name: "蒸", tool_id: "steamer" }),
  roast: Object.freeze({ method_id: "roast", name: "烤", tool_id: "oven" }),
  "deep-fry": Object.freeze({ method_id: "deep-fry", name: "油炸", tool_id: "fryer" }),
  dessert: Object.freeze({ method_id: "dessert", name: "甜品", tool_id: null }),
  drink: Object.freeze({ method_id: "drink", name: "饮品", tool_id: null }),
});

const KITCHEN_TOOLS = Object.freeze({
  oven: Object.freeze({ tool_id: "oven", name: "烤炉" }),
  steamer: Object.freeze({ tool_id: "steamer", name: "蒸笼" }),
  fryer: Object.freeze({ tool_id: "fryer", name: "炸锅" }),
});

const PURCHASE_TOOL_TO_RECIPE_TOOL = Object.freeze({
  roast: "oven",
  steam: "steamer",
  "deep-fry": "fryer",
});
const KITCHEN_METHOD_BY_ID = new Map(Object.values(KITCHEN_METHODS).map((item) => [item.method_id, item]));
const KITCHEN_TOOL_BY_ID = new Map(
  Object.entries(KITCHEN_TOOLS).flatMap(([id, item]) => [
    [id, item],
    ...Object.entries(PURCHASE_TOOL_TO_RECIPE_TOOL)
      .filter(([, canonicalId]) => canonicalId === id)
      .map(([legacyId]) => [legacyId, item]),
  ]),
);

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const idOf = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const finiteInt = (value, min = 0) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min ? value : null;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

/**
 * Opaque optimistic-concurrency token for Human kitchen purchases.  It covers
 * every persisted value that can change purchase acceptance or its visible
 * result, while excluding server_time and the idempotency receipt ledger.
 */
export function kitchenShopRevisionFromData(data) {
  const state = {
    balance: data?.balance ?? null,
    tools: data?.tools ?? null,
    stacked_ingredients: data?.stacked_ingredients ?? null,
    known_recipes: data?.known_recipes ?? null,
    daily_shop: data?.daily_shop ?? null,
  };
  return `kitchen-v1:${createHash("sha256")
    .update(JSON.stringify(canonicalize(state)), "utf8")
    .digest("hex")}`;
}

function unavailableSection(reason) {
  return { status: "unavailable", items: [], reason };
}

function availableSection(items) {
  return { status: "available", items, reason: null };
}

function availableRequirement(id = null, name = null) {
  return { status: "available", id, name, reason: null };
}

export function kitchenMethodDefinition(methodId) {
  return KITCHEN_METHOD_BY_ID.get(idOf(methodId)) ?? null;
}

export function kitchenRecipeMethodId(recipe) {
  return idOf(recipe?.method_id ?? recipe?.method?.id);
}

export function kitchenRecipeToolId(recipe) {
  if (Object.hasOwn(recipe ?? {}, "tool_id")) {
    const raw = recipe.tool_id;
    if (raw === null) return null;
    return KITCHEN_TOOL_BY_ID.has(idOf(raw)) ? KITCHEN_TOOL_BY_ID.get(idOf(raw)).tool_id : idOf(raw);
  }
  if (Object.hasOwn(recipe ?? {}, "tool")) {
    const raw = recipe.tool;
    if (raw === null) return null;
    const rawId = idOf(isRecord(raw) ? raw.id : raw);
    return KITCHEN_TOOL_BY_ID.has(rawId) ? KITCHEN_TOOL_BY_ID.get(rawId).tool_id : rawId;
  }
  return kitchenMethodDefinition(kitchenRecipeMethodId(recipe))?.tool_id ?? null;
}

export function kitchenToolDefinition(toolId) {
  return KITCHEN_TOOL_BY_ID.get(idOf(toolId)) ?? null;
}

export function kitchenToolIsOwned(kitchen, toolId) {
  const required = kitchenToolDefinition(toolId);
  if (!required) return false;
  const owned = Array.isArray(kitchen?.ownedTools)
    ? new Set(kitchen.ownedTools.filter((value) => typeof value === "string"))
    : new Set();
  return owned.has(required.tool_id) || Object.entries(PURCHASE_TOOL_TO_RECIPE_TOOL)
    .some(([legacyId, canonicalId]) => canonicalId === required.tool_id && owned.has(legacyId));
}

function projectKitchenTools(kitchen) {
  return availableSection(
    PAID_KITCHEN_TOOLS.map((tool) => ({
      status: "available",
      ...tool,
      owned: kitchenToolIsOwned(kitchen, tool.tool_id),
      reason: null,
    })),
  );
}

function scalar(value) {
  if (value === undefined)
    return { status: "unavailable", value: null, reason: "not_initialized" };
  const amount = finiteInt(value);
  return amount === null
    ? { status: "unavailable", value: null, reason: "invalid_value" }
    : { status: "available", value: amount, reason: null };
}

function asIso(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function nextShanghaiMidnight(dayIndex) {
  return new Date((dayIndex + 1) * 86_400_000 - 8 * 3_600_000).toISOString();
}

function ingredientShopRefreshRules() {
  const rules = cooking.ingredientShopRefresh;
  const dailyLimit = rules?.dailyLimit;
  const costStepCoins = rules?.costStepCoins;
  if (
    !Number.isSafeInteger(dailyLimit) ||
    dailyLimit < 1 ||
    !Number.isSafeInteger(costStepCoins) ||
    costStepCoins < 1
  ) {
    return null;
  }
  return { dailyLimit, costStepCoins };
}

function projectIngredientShopRefresh(shop, currentDay, available) {
  const rules = ingredientShopRefreshRules();
  const fields = {
    refresh_window_id: currentDay,
    refresh_used_count: null,
    refresh_remaining_count: null,
    refresh_limit: rules?.dailyLimit ?? null,
    next_cost_coins: null,
    can_refresh: false,
    refresh_reset_at: nextShanghaiMidnight(currentDay),
  };
  if (!rules || !available || !isRecord(shop)) return fields;
  const hasWindow = shop.refreshWindowId !== undefined;
  const hasCount = shop.refreshCount !== undefined;
  if (hasWindow !== hasCount) return fields;
  if (!hasWindow) {
    fields.refresh_used_count = 0;
  } else if (
    !Number.isSafeInteger(shop.refreshWindowId) ||
    shop.refreshWindowId < 0 ||
    !Number.isSafeInteger(shop.refreshCount) ||
    shop.refreshCount < 0 ||
    shop.refreshCount > rules.dailyLimit
  ) {
    return fields;
  } else {
    fields.refresh_used_count = shop.refreshWindowId === currentDay ? shop.refreshCount : 0;
  }
  fields.refresh_remaining_count = rules.dailyLimit - fields.refresh_used_count;
  fields.next_cost_coins = Math.min(
    (fields.refresh_used_count + 1) * rules.costStepCoins,
    rules.dailyLimit * rules.costStepCoins,
  );
  fields.can_refresh = fields.refresh_used_count < rules.dailyLimit;
  return fields;
}

function unavailableRequirement(reason, id = null) {
  return { status: "unavailable", id, name: null, reason };
}

function projectMethodRequirement(recipe) {
  const raw = recipe?.method ?? recipe?.method_id;
  if (isRecord(raw)) {
    const id = idOf(raw.id);
    const definition = kitchenMethodDefinition(id);
    if (definition) return availableRequirement(definition.method_id, definition.name);
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
    return id && name ? availableRequirement(id, name) : unavailableRequirement("unknown_id", id);
  }
  const id = idOf(raw);
  if (!id) return unavailableRequirement("not_persisted");
  const definition = kitchenMethodDefinition(id);
  return definition
    ? availableRequirement(definition.method_id, definition.name)
    : unavailableRequirement("unknown_id", id);
}

function projectToolRequirement(recipe) {
  const hasTool = Object.hasOwn(recipe ?? {}, "tool") || Object.hasOwn(recipe ?? {}, "tool_id");
  const raw = Object.hasOwn(recipe ?? {}, "tool") ? recipe.tool : recipe?.tool_id;
  if (hasTool && raw === null) return availableRequirement();
  const rawId = hasTool
    ? idOf(isRecord(raw) ? raw.id : raw)
    : kitchenRecipeToolId(recipe);
  if (!rawId) {
    return hasTool || kitchenMethodDefinition(kitchenRecipeMethodId(recipe))
      ? availableRequirement()
      : unavailableRequirement("not_persisted");
  }
  const definition = kitchenToolDefinition(rawId);
  if (definition) return availableRequirement(definition.tool_id, definition.name);
  if (isRecord(raw)) {
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
    if (name) return availableRequirement(rawId, name);
  }
  return unavailableRequirement("unknown_id", rawId);
}

function ingredientCounts(ids) {
  if (!Array.isArray(ids)) return null;
  const counts = new Map();
  for (const raw of ids) {
    const id = idOf(raw);
    if (!id) return null;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, quantity]) => {
    const item = cookingIngredientById.get(id) ?? cookingProductById.get(id);
    return item
      ? { status: "available", ingredient_id: id, name: item.name, quantity, reason: null }
      : { status: "unavailable", ingredient_id: id, name: null, quantity: null, reason: "unknown_id" };
  });
}

function unavailableRecipe(recipeId, reason = "unknown_id", extra = {}) {
  return {
    status: "unavailable",
    recipe_id: recipeId,
    name: null,
    rarity: null,
    category: null,
    ingredients: [],
    method: unavailableRequirement(reason),
    tool: unavailableRequirement(reason),
    reason,
    ...extra,
  };
}

function projectRecipe(recipeId) {
  const id = idOf(recipeId);
  if (!id) return null;
  const recipe = id === ODD_DISH.id ? ODD_DISH : cookingRecipeById.get(id);
  if (!recipe) return unavailableRecipe(id);
  const ingredients = ingredientCounts(recipe.ingredients);
  if (!ingredients) return unavailableRecipe(id, "invalid_shape");
  return {
    status: "available",
    recipe_id: id,
    name: recipe.name,
    rarity: recipe.rarity,
    category: recipe.category ?? null,
    ingredients,
    method: projectMethodRequirement(recipe),
    tool: projectToolRequirement(recipe),
    reason: null,
  };
}

function projectProductInstance(raw) {
  if (!isRecord(raw)) return null;
  const instanceId = idOf(raw.id);
  const productId = idOf(raw.itemId);
  if (!instanceId || !productId) return null;
  const definition = cookingProductById.get(productId);
  if (!definition) {
    return {
      status: "unavailable",
      product_instance_id: instanceId,
      product_id: productId,
      name: null,
      value_gold: null,
      created_at: null,
      reason: "unknown_id",
    };
  }
  const value = finiteInt(raw.value);
  if (value === null) {
    return {
      status: "unavailable",
      product_instance_id: instanceId,
      product_id: productId,
      name: null,
      value_gold: null,
      created_at: null,
      reason: "invalid_value",
    };
  }
  return {
    status: "available",
    product_instance_id: instanceId,
    product_id: productId,
    name: definition.name,
    value_gold: value,
    created_at: asIso(raw.createdAt),
    reason: null,
  };
}

function projectFishInstance(raw) {
  if (!isRecord(raw)) return null;
  const instanceId = idOf(raw.id);
  const fishId = idOf(raw.fishId);
  if (!instanceId || !fishId) return null;
  const definition = fishingFishById.get(fishId);
  if (!definition) {
    return {
      status: "unavailable",
      catch_instance_id: instanceId,
      fish_id: fishId,
      name: null,
      size: null,
      raw_value: null,
      sell_silver: null,
      reason: "unknown_id",
    };
  }
  const size = finiteInt(raw.size, 1);
  const rawValue = finiteInt(raw.rawValue);
  const sellSilver = finiteInt(raw.sellSilver);
  if (size === null || rawValue === null || sellSilver === null) {
    return {
      status: "unavailable",
      catch_instance_id: instanceId,
      fish_id: fishId,
      name: null,
      size: null,
      raw_value: null,
      sell_silver: null,
      reason: "invalid_value",
    };
  }
  return {
    status: "available",
    catch_instance_id: instanceId,
    fish_id: fishId,
    name: definition.name,
    size,
    raw_value: rawValue,
    sell_silver: sellSilver,
    reason: null,
  };
}

function projectDishInstance(raw) {
  if (!isRecord(raw)) return null;
  const instanceId = idOf(raw.id);
  const recipeId = idOf(raw.recipeId);
  if (!instanceId || !recipeId) return null;
  const recipe = projectRecipe(recipeId);
  const value = finiteInt(raw.value);
  if (!recipe || recipe.status !== "available" || value === null) {
    return {
      ...(recipe ?? unavailableRecipe(recipeId, "invalid_shape")),
      status: "unavailable",
      dish_instance_id: instanceId,
      value_gold: null,
      recycle_silver: null,
      created_at: null,
      reason: recipe?.status === "unavailable" ? recipe.reason : "invalid_value",
    };
  }
  const rarityFloor = finiteInt(cooking.systemRecycleSilver?.[recipe.rarity]) ?? 0;
  const recycleSilver = recipeId === ODD_DISH.id
    ? 0
    : Math.max(rarityFloor, Math.round(value / 50));
  return {
    ...recipe,
    dish_instance_id: instanceId,
    value_gold: value,
    recycle_silver: recycleSilver,
    created_at: asIso(raw.createdAt),
  };
}

function projectRawArraySection(value, projector) {
  if (!Array.isArray(value)) return unavailableSection("not_initialized");
  const items = [];
  for (const raw of value) {
    const item = projector(raw);
    if (!item) return unavailableSection("invalid_shape");
    items.push(item);
  }
  return availableSection(items);
}

function projectIngredients(kitchen) {
  if (!isRecord(kitchen)) return unavailableSection("not_initialized");
  if (!Object.hasOwn(kitchen, "ingredients")) return unavailableSection("not_initialized");
  if (!isRecord(kitchen.ingredients)) return unavailableSection("invalid_shape");
  const items = [];
  for (const [id, rawQuantity] of Object.entries(kitchen.ingredients)) {
    const quantity = finiteInt(rawQuantity);
    if (quantity === null) {
      items.push({
        status: "unavailable",
        ingredient_id: id,
        name: null,
        quantity: null,
        reason: "invalid_value",
      });
      continue;
    }
    if (quantity <= 0) continue;
    const definition = cookingIngredientById.get(id);
    items.push(definition
      ? { status: "available", ingredient_id: id, name: definition.name, quantity, reason: null }
      : { status: "unavailable", ingredient_id: id, name: null, quantity: null, reason: "unknown_id" });
  }
  return availableSection(items);
}

function projectTreasureItems(fishing) {
  if (!isRecord(fishing)) return unavailableSection("not_initialized");
  if (!Object.hasOwn(fishing, "items")) return unavailableSection("not_initialized");
  if (!isRecord(fishing.items)) return unavailableSection("invalid_shape");
  const items = [];
  for (const [id, rawQuantity] of Object.entries(fishing.items)) {
    const quantity = finiteInt(rawQuantity);
    if (quantity === null) {
      items.push({
        status: "unavailable",
        item_id: id,
        name: null,
        quantity: null,
        sellable: null,
        sell_silver: null,
        reason: "invalid_value",
      });
      continue;
    }
    if (quantity <= 0) continue;
    const definition = fishingItemById.get(id);
    items.push(definition
      ? {
          status: "available",
          item_id: id,
          name: definition.name,
          quantity,
          sellable: definition.sellable === true,
          sell_silver: finiteInt(definition.sellSilver) ?? 0,
          reason: null,
        }
      : {
          status: "unavailable",
          item_id: id,
          name: null,
          quantity: null,
          sellable: null,
          sell_silver: null,
          reason: "unknown_id",
        });
  }
  return availableSection(items);
}

function projectShopIngredient(id, bought) {
  const definition = cookingIngredientById.get(id);
  if (!definition) {
    return {
      status: "unavailable",
      ingredient_id: id,
      name: null,
      price_silver: null,
      daily_buy_limit: null,
      bought_quantity: null,
      reason: "unknown_id",
    };
  }
  const boughtQuantity = bought[`ingredient:${id}`] === undefined ? 0 : finiteInt(bought[`ingredient:${id}`]);
  if (boughtQuantity === null) {
    return {
      status: "unavailable",
      ingredient_id: id,
      name: null,
      price_silver: null,
      daily_buy_limit: null,
      bought_quantity: null,
      reason: "invalid_value",
    };
  }
  return {
    status: "available",
    ingredient_id: id,
    name: definition.name,
    price_silver: finiteInt(definition.price) ?? 0,
    daily_buy_limit: Math.max(1, finiteInt(definition.dailyBuyLimit) ?? cooking.dailyBuyLimit),
    bought_quantity: boughtQuantity,
    reason: null,
  };
}

function projectShopRecipe(id, knownIds) {
  const recipe = projectRecipe(id);
  if (!recipe) return null;
  if (recipe.status === "unavailable") {
    return {
      ...recipe,
      price_silver: null,
      known: null,
    };
  }
  return {
    ...recipe,
    price_silver: finiteInt(cooking.recipePrices?.[recipe.rarity]) ?? 0,
    known: knownIds ? knownIds.has(recipe.recipe_id) : null,
  };
}

function projectDailyShop(kitchen, now) {
  const currentDay = currentDayIndex(now);
  const refreshAt = nextShanghaiMidnight(currentDay);
  let refreshState = projectIngredientShopRefresh(null, currentDay, false);
  if (!isRecord(kitchen)) {
    return {
      status: "unavailable",
      stored_day_index: null,
      current_day_index: currentDay,
      is_current_day: false,
      refresh_at: refreshAt,
      ingredients: [],
      recipes: [],
      reason: "not_initialized",
      ...refreshState,
    };
  }
  const shop = kitchen.shop;
  refreshState = projectIngredientShopRefresh(shop, currentDay, false);
  if (!isRecord(shop)) {
    return {
      status: "unavailable",
      stored_day_index: null,
      current_day_index: currentDay,
      is_current_day: false,
      refresh_at: refreshAt,
      ingredients: [],
      recipes: [],
      reason: "not_initialized",
      ...refreshState,
    };
  }
  const storedDay = finiteInt(shop.day);
  const ingredientIds = shop.ingredientIds;
  const recipeIds = shop.recipeIds;
  const bought = shop.bought;
  if (storedDay === null || !Array.isArray(ingredientIds) || !Array.isArray(recipeIds) || !isRecord(bought)) {
    return {
      status: "unavailable",
      stored_day_index: storedDay,
      current_day_index: currentDay,
      is_current_day: false,
      refresh_at: refreshAt,
      ingredients: [],
      recipes: [],
      reason: "invalid_shape",
      ...refreshState,
    };
  }
  if (storedDay !== currentDay) {
    return {
      status: "unavailable",
      stored_day_index: storedDay,
      current_day_index: currentDay,
      is_current_day: false,
      refresh_at: refreshAt,
      ingredients: [],
      recipes: [],
      reason: "stale_shop",
      ...refreshState,
    };
  }
  refreshState = projectIngredientShopRefresh(shop, currentDay, true);
  const ids = [];
  for (const item of cooking.ingredients) {
    if (item.staple) ids.push(item.id);
  }
  for (const raw of ingredientIds) {
    const id = idOf(raw);
    if (!id) {
      return {
        status: "unavailable",
        stored_day_index: storedDay,
        current_day_index: currentDay,
        is_current_day: true,
        refresh_at: refreshAt,
        ingredients: [],
        recipes: [],
        reason: "invalid_shape",
        ...refreshState,
      };
    }
    if (!ids.includes(id)) ids.push(id);
  }
  const recipes = [];
  const seenRecipes = Array.isArray(kitchen.knownRecipes)
    ? new Set(kitchen.knownRecipes.map(idOf).filter(Boolean))
    : null;
  for (const raw of recipeIds) {
    const id = idOf(raw);
    if (!id) {
      return {
        status: "unavailable",
        stored_day_index: storedDay,
        current_day_index: currentDay,
        is_current_day: true,
        refresh_at: refreshAt,
        ingredients: [],
        recipes: [],
        reason: "invalid_shape",
        ...refreshState,
      };
    }
    const recipe = projectShopRecipe(id, seenRecipes);
    if (!recipe) return { status: "unavailable", stored_day_index: storedDay, current_day_index: currentDay, is_current_day: true, refresh_at: refreshAt, ingredients: [], recipes: [], reason: "invalid_shape", ...refreshState };
    recipes.push(recipe);
  }
  return {
    status: "available",
    stored_day_index: storedDay,
    current_day_index: currentDay,
    is_current_day: true,
    refresh_at: refreshAt,
    ingredients: ids.map((id) => projectShopIngredient(id, bought)),
    recipes,
    reason: null,
    ...refreshState,
  };
}

/**
 * Read only the fields that already exist in the farm save.  No lazy normalizer
 * or gameplay action is called here: a missing kitchen/shop/fishing field stays
 * explicitly unavailable until the authoritative runtime initializes it.
 */
export function projectHumanKitchen(farm, now = Date.now()) {
  const at = Number.isFinite(now) ? now : Date.now();
  const source = isRecord(farm) ? farm : {};
  const ranch = isRecord(source.ranch) ? source.ranch : null;
  const kitchen = ranch && isRecord(ranch.kitchen) ? ranch.kitchen : null;
  const fishing = isRecord(source.fishing) ? source.fishing : null;
  const knownRecipeIds = Array.isArray(kitchen?.knownRecipes) ? kitchen.knownRecipes : null;

  const data = {
      farm: {
        farm_doorplate: typeof source.id === "string" ? source.id : "",
        farm_name: typeof source.name === "string" ? source.name : null,
      },
      balance: {
        silver: scalar(source.silver),
        ranch_coins: scalar(ranch?.coins),
      },
      tools: projectKitchenTools(kitchen),
      stacked_ingredients: projectIngredients(kitchen),
      product_instances: projectRawArraySection(kitchen?.products, projectProductInstance),
      fish_instances: projectRawArraySection(fishing?.catchInventory, projectFishInstance),
      treasure_items: projectTreasureItems(fishing),
      dish_instances: projectRawArraySection(kitchen?.dishes, projectDishInstance),
      known_recipes: projectRawArraySection(knownRecipeIds, projectRecipe),
      daily_shop: projectDailyShop(kitchen, at),
    };

  return {
    data,
    shop_revision: kitchenShopRevisionFromData(data),
    kitchen_inventory_revision: kitchenInventoryRevisionFromData(data),
    server_time: new Date(at).toISOString(),
  };
}

export const readHumanKitchen = projectHumanKitchen;

export const kitchenStructuredCatalog = {
  products: cooking.products.length,
  ingredients: cooking.ingredients.length,
  recipes: cooking.recipes.length,
};

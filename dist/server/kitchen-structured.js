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

const ODD_DISH = {
  id: "odd_dish",
  name: "微妙的料理",
  rarity: "N",
  category: null,
  ingredients: [],
};

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

function unavailableRequirement(reason, id = null) {
  return { status: "unavailable", id, name: null, reason };
}

function projectRequirement(recipe, field) {
  const raw = recipe?.[field] ?? recipe?.[`${field}_id`];
  if (isRecord(raw)) {
    const id = idOf(raw.id);
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
    if (id && name)
      return { status: "available", id, name, reason: null };
    return unavailableRequirement("unknown_id", id);
  }
  const id = idOf(raw);
  return id ? unavailableRequirement("unknown_id", id) : unavailableRequirement("not_persisted");
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
    method: projectRequirement(recipe, "method"),
    tool: projectRequirement(recipe, "tool"),
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
    };
  }
  const shop = kitchen.shop;
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
    };
  }
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
      };
    }
    const recipe = projectShopRecipe(id, seenRecipes);
    if (!recipe) return { status: "unavailable", stored_day_index: storedDay, current_day_index: currentDay, is_current_day: true, refresh_at: refreshAt, ingredients: [], recipes: [], reason: "invalid_shape" };
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
      // The current farm runtime does not persist kitchen tool ownership or
      // recipe method/tool metadata, so neither is inferred from visuals or categories.
      tools: unavailableSection("not_persisted"),
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
    server_time: new Date(at).toISOString(),
  };
}

export const readHumanKitchen = projectHumanKitchen;

export const kitchenStructuredCatalog = {
  products: cooking.products.length,
  ingredients: cooking.ingredients.length,
  recipes: cooking.recipes.length,
};

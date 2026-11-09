import { cookingRecipeById } from "../../content.js";
import { fishingKitchenProducts } from "../../fishing.js";
import { findOriginalRecipe } from "./original.js";
import { selectCookingItems } from "./selection.js";

// Reserve only existing inventory in memory. Refunds remain an outcome of the
// ordinary cook; they are never assumed when accepting a batch.
export function planKitchenCookBatch(farm, body, quantity, options = {}) {
  let refs = body.items;
  if (body.recipe_id) {
    const recipe = cookingRecipeById.get(body.recipe_id) ?? findOriginalRecipe(options.originalRecipes, body.recipe_id);
    if (!recipe) return { ok: false, error: "找不到这份食谱。" };
    refs = recipe.ingredients.flatMap(entry => typeof entry === "string"
      ? [entry] : Array.from({ length: entry.quantity ?? 1 }, () => entry.id));
  }
  const picked = selectCookingItems(farm, refs);
  if (!picked.ok) return picked;
  const kitchen = farm.ranch.kitchen;
  const fish = fishingKitchenProducts(farm);
  const keys = picked.selected.map(item => item.source === "fish"
    ? `fish:${body.recipe_id ? "any" : fish.find(catchItem => catchItem.id === item.instanceId)?.fishId}`
    : `${item.source}:${item.id}`);
  const pools = new Map();
  const requirements = new Map();
  keys.forEach((key, index) => {
    requirements.set(key, (requirements.get(key) ?? 0) + 1);
    if (pools.has(key)) return;
    const item = picked.selected[index];
    const instances = item.source === "product"
      ? kitchen.products.filter(product => product.itemId === item.id).map(product => product.id)
      : item.source === "fish"
        ? fish.filter(catchItem => body.recipe_id || `fish:${catchItem.fishId}` === key).map(catchItem => catchItem.id)
        : null;
    const selected = picked.selected.filter((_, at) => keys[at] === key).map(entry => entry.instanceId);
    pools.set(key, instances ? [...selected, ...instances.filter(id => !selected.includes(id))] : kitchen.ingredients[item.id] ?? 0);
  });
  for (const [key, perRound] of requirements) {
    const pool = pools.get(key);
    const available = Array.isArray(pool) ? pool.length : pool;
    if (quantity > Math.floor(available / perRound)) return { ok: false, error: "这批料理的食材数量不够。" };
  }
  const offsets = new Map();
  const rounds = [];
  for (let round = 0; round < quantity; round++) {
    rounds.push(keys.map((key, index) => {
      const pool = pools.get(key);
      if (!Array.isArray(pool)) return picked.selected[index].id;
      const offset = offsets.get(key) ?? 0;
      offsets.set(key, offset + 1);
      return pool[offset];
    }));
  }
  const productsById = new Map(kitchen.products.map(item => [item.id, item]));
  const fishById = new Map(fish.map(item => [item.id, item]));
  const usedProducts = new Set();
  const usedFish = new Set();
  const ingredientCounts = {};
  const selections = rounds.map(round => round.map((ref, index) => {
    const selected = picked.selected[index];
    if (selected.source === "ingredient") {
      ingredientCounts[selected.id] = (ingredientCounts[selected.id] ?? 0) + 1;
      return { ...selected };
    }
    const item = selected.source === "product" ? productsById.get(ref) : fishById.get(ref);
    (selected.source === "product" ? usedProducts : usedFish).add(ref);
    return { ...selected, instanceId: ref, value: item.value, ...(selected.source === "fish" ? { name: item.name } : {}) };
  }));
  return { ok: true, rounds, selections, usedProducts, usedFish, ingredientCounts };

}

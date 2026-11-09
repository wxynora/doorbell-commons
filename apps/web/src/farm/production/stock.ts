import type { BoundKitchenRead } from "../../auth/kitchen-client";
import type { CookingIngredientPickerOption } from "../page/cooking/model";

export function maximumFromCounts(required: ReadonlyMap<string, number>, available: ReadonlyMap<string, number>): number {
  if (!required.size) return 0;
  let maximum = Infinity;
  for (const [id, count] of required) maximum = Math.min(maximum, Math.floor((available.get(id) ?? 0) / count));
  return Number.isSafeInteger(maximum) && maximum >= 0 ? maximum : 0;
}
export function selectedCookingRequirements(options: readonly CookingIngredientPickerOption[], selected: readonly string[]) {
  const required = new Map<string, { name: string; count: number; available: number }>();
  for (const id of selected) {
    const option = options.find(item => item.selectionIds.includes(id));
    if (!option) return [];
    const key = `${option.categoryId}:${option.entityId}`;
    const previous = required.get(key);
    required.set(key, { name: option.name, count: (previous?.count ?? 0) + 1, available: option.quantity ?? 0 });
  }
  return [...required.values()];
}
export function maximumCookingRecipeQuantity(kitchen: BoundKitchenRead, recipe: BoundKitchenRead["data"]["known_recipes"]["items"][number]): number {
  const available = new Map<string, number>();
  const { stacked_ingredients, product_instances, fish_instances } = kitchen.data;
  if (stacked_ingredients.status === "available") for (const item of stacked_ingredients.items)
    if (item.status === "available") available.set(item.ingredient_id, item.quantity ?? 0);
  if (product_instances.status === "available") for (const item of product_instances.items)
    if (item.status === "available") available.set(item.product_id, (available.get(item.product_id) ?? 0) + 1);
  available.set("fish:any", fish_instances.status === "available" ? fish_instances.items.filter(item => item.status === "available").length : 0);
  const required = new Map<string, number>();
  for (const item of recipe.ingredients) required.set(item.ingredient_id, (required.get(item.ingredient_id) ?? 0) + (item.quantity ?? 1));
  return maximumFromCounts(required, available);
}

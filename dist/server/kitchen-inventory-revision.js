import { createHash } from "node:crypto";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

export function kitchenInventoryRevisionFromData(data) {
  const state = {
    farm: data?.farm ?? null,
    balance: data?.balance ?? null,
    tools: data?.tools ?? null,
    stacked_ingredients: data?.stacked_ingredients ?? null,
    product_instances: data?.product_instances ?? null,
    fish_instances: data?.fish_instances ?? null,
    treasure_items: data?.treasure_items ?? null,
    dish_instances: data?.dish_instances ?? null,
    known_recipes: data?.known_recipes ?? null,
    daily_shop: data?.daily_shop ?? null,
  };
  return `kitchen-inventory-v1:${createHash("sha256")
    .update(JSON.stringify(canonicalize(state)), "utf8")
    .digest("hex")}`;
}

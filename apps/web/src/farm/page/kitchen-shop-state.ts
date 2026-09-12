import type { BoundKitchenRead } from "../../auth/kitchen-client";

export function hasCurrentKitchenShelf(kitchen: BoundKitchenRead | null, now = Date.now()): boolean {
  const shop = kitchen?.data.daily_shop;
  return shop?.status === "available" && shop.is_current_day && now < Date.parse(shop.refresh_at);
}

// Retain unchanged JSON records, while accepting every actual server-side change.
function shareUnchanged(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object" ||
      Array.isArray(previous) !== Array.isArray(next)) return next;
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let unchanged = Object.keys(before).length === keys.length;
  const entries = keys.map(key => {
    const value = shareUnchanged(before[key], after[key]);
    if (!Object.hasOwn(before, key) || value !== before[key]) unchanged = false;
    return [key, value] as const;
  });
  if (unchanged) return previous;
  return Array.isArray(next) ? entries.map(([, value]) => value) : Object.fromEntries(entries);
}

export function mergeKitchenPurchaseResource(
  previous: BoundKitchenRead["data"],
  next: BoundKitchenRead["data"],
): BoundKitchenRead["data"] {
  return shareUnchanged(previous, next) as BoundKitchenRead["data"];
}

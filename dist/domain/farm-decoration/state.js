import { createHash } from "node:crypto";
import { FARM_DECORATION_CATALOG, decorationById } from "./catalog.js";
import { decorationGrid } from "./layout.js";
import { bumpDaily } from "../../daily.js";
import { houseState, housePurchaseError } from "./house.js";
import { relocateWaterwheels } from "./waterwheel-relocation.js";
import { DEFAULT_HOUSE_POSITION } from "./house-geometry.js";

export function decorationState(farm) {
  if (farm.farmDecorations === undefined) return { version: 2, owned: {}, layout: { house: {...DEFAULT_HOUSE_POSITION}, roof: "mint", canopy: "plain", stall: { x: -3.76, z: 2.32, rotation: 0 }, decorations: [] } };
  const state = farm.farmDecorations;
  if (!state || ![1, 2].includes(state.version) || !state.owned || typeof state.owned !== "object" || Array.isArray(state.owned) || !state.layout || !Array.isArray(state.layout.decorations)) throw new Error("Invalid farm decoration state");
  for (const [id, count] of Object.entries(state.owned)) {
    const item = decorationById.get(id);
    if (!item || !Number.isSafeInteger(count) || count < 0 || (item.purchase_mode === "unlock" && count > 1)) throw new Error("Invalid farm decoration holdings");
  }
  const result = structuredClone(state);
  result.layout.canopy ??= "plain";
  result.layout.house ??= {...DEFAULT_HOUSE_POSITION};
  // Project the old yard once; only existing save/buy paths persist the upgrade.
  if (result.version === 1) {
    relocateWaterwheels(result.layout, farm.plots ?? []);
    result.version = 2;
  }
  return result;
}
export function decorationRevision(farm) {
  const state = decorationState(farm);
  return `farm-decoration-v1:${createHash("sha256").update(JSON.stringify({ coins: farm.coins, state, plots: (farm.plots ?? []).map(plot => plot.id), catalog: FARM_DECORATION_CATALOG })).digest("hex")}`;
}
export function decorationResource(farm) {
  const state = decorationState(farm);
  if (!Number.isSafeInteger(farm.coins) || farm.coins < 0) throw new Error("Invalid farm coin balance");
  return {
    catalog: FARM_DECORATION_CATALOG,
    house: houseState(state.owned, state.layout.house),
    inventory: FARM_DECORATION_CATALOG.filter(item => item.layer !== "house").map(item => {
      const owned_quantity = state.owned[item.item_id] ?? 0;
      const placed_quantity = state.layout.decorations.filter(instance => instance.item_id === item.item_id).length;
      return { item_id: item.item_id, owned_quantity, placed_quantity, available_quantity: item.purchase_mode === "unlock" ? null : owned_quantity - placed_quantity, unlocked: owned_quantity > 0 };
    }),
    layout: state.layout, coins: farm.coins, grid: decorationGrid(farm, state.layout.house),
  };
}

// Runs only inside the existing authorized farm.buy / buy-item execution.
// Human layout routes never call this coin writer.
export function buyFarmDecoration(farm, itemId, quantity, now = Date.now()) {
  if (!itemId.startsWith("farm_decor:")) return { handled: false };
  const reject = error => ({ handled: true, ok: false, error });
  const item = decorationById.get(itemId);
  if (!item) return reject("农场装饰不存在。");
  if (!Number.isSafeInteger(quantity) || quantity < 1 || (item.purchase_mode === "unlock" && quantity !== 1)) return reject("装饰购买数量无效；永久解锁物品每款购买一次。");
  let state;
  try { state = decorationState(farm); } catch { return reject("农场装饰持有状态无效。"); }
  const owned = state.owned[itemId] ?? 0;
  if (item.purchase_mode === "unlock" && owned) return reject("这款装饰已经永久解锁。");
  const houseError = housePurchaseError(state, itemId, farm.plots ?? []);
  if (houseError) return reject(houseError);
  const cost = item.price_farm_coins * quantity, left = owned + quantity;
  if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(left)) return reject("装饰购买数量无效。");
  if (!Number.isSafeInteger(farm.coins) || farm.coins < cost) return reject(`金币不足，需要 ${cost} 金。`);
  state.owned[itemId] = left;
  // No mutation has happened before every rejection boundary above.
  farm.farmDecorations = state;
  farm.coins -= cost;
  bumpDaily(farm, now, "coinSpend", cost);
  return { handled: true, ok: true, qty: quantity, name: item.name, cost, left };
}

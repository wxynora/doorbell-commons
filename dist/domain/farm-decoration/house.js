import { decorationById } from "./catalog.js";
import { rectangle, boundsRectangle, intersects } from "./placement-geometry.js";

import { houseExtensionRect, canPlaceHouse } from "./house-geometry.js";
import { createPlacementTerrain } from "./placement-terrain.js";
const TWO = "farm_decor:house_level_two", THREE = "farm_decor:house_level_three", CANOPY = "farm_decor:floral_canopy";
export function houseState(owned, position) {
  const level = owned[THREE] > 0 ? 3 : owned[TWO] > 0 ? 2 : 1;
  return { level, canopy_unlocked: owned[CANOPY] > 0, blocked_rects: level >= 2 ? [houseExtensionRect(position)] : [] };
}
export const isGroundDecoration = item => item.layer === "ground" || item.model_id === "flowerbed" || item.model_id.startsWith("flowerbed_");
export function overlapsHouseExtension(pose, cells, position) {
  return intersects(rectangle(pose, cells), boundsRectangle(houseExtensionRect(position)));
}
export function housePurchaseError(state, itemId, plots = []) {
  if ((itemId === THREE || itemId === CANOPY) && houseState(state.owned).level < 2) return "请先升级二级房屋。";
  if (itemId !== TWO && itemId !== THREE) return null;
  if (!canPlaceHouse(state.layout.house, 2, createPlacementTerrain(plots, null))) return "升级区域超出院子或碰到田地，请先移动房屋。";
  if (overlapsHouseExtension(state.layout.stall, [2, 2], state.layout.house) || state.layout.decorations.some(instance => {
    const item = decorationById.get(instance.item_id);
    return item && !isGroundDecoration(item) && overlapsHouseExtension(instance, item.cells, state.layout.house);
  })) return "升级区域有已摆放的装饰，请先移开后再购买升级。";
  return null;
}

import { decorationById } from "./catalog.js";
import { rectangle, boundsRectangle, intersects } from "./placement-geometry.js";

import { houseExtensionRect, houseExtensionRects, canPlaceHouse } from "./house-geometry.js";
import { createPlacementTerrain } from "./placement-terrain.js";
const TWO = "farm_decor:house_level_two", THREE = "farm_decor:house_level_three", CANOPY = "farm_decor:floral_canopy";
export const HOUSE_STYLES = Object.freeze(['classic','pumpkin','stump','mushroom']);
export const houseStyleItem = style => style==='classic'?null:`farm_decor:house_${style}`;
export const houseStyleName = style => ({classic:'普通房屋',pumpkin:'南瓜屋',stump:'树桩屋',mushroom:'蘑菇屋'}[style]);
export function houseState(owned, position) {
  const classic_level=owned[THREE]>0?3:owned[TWO]>0?2:1;
  const style=position?.style??'classic';
  const unlocked_styles=HOUSE_STYLES.filter(s=>s==='classic'||owned[houseStyleItem(s)]>0);
  const level=style==='classic'?classic_level:4;
  return {level,classic_level,style,unlocked_styles,canopy_unlocked:owned[CANOPY]>0,blocked_rects:houseExtensionRects(position,level)};
}
export const isGroundDecoration = item => item.layer === "ground" || item.model_id === "flowerbed" || item.model_id.startsWith("flowerbed_");
export function overlapsHouseExtension(pose, cells, position) {
  return houseExtensionRects(position,2).some(r=>intersects(rectangle(pose,cells),boundsRectangle(r)));
}
export function housePurchaseError(state, itemId, plots = []) {
  if(HOUSE_STYLES.slice(1).some(s=>houseStyleItem(s)===itemId))return state.owned[THREE]>0?null:'请先升级到三级房屋，再购买童话屋。';
  if ((itemId === THREE || itemId === CANOPY) && houseState(state.owned).level < 2) return "请先升级二级房屋。";
  if (itemId !== TWO && itemId !== THREE) return null;
  if (!canPlaceHouse(state.layout.house, 2, createPlacementTerrain(plots, null, state.layout.field))) return "升级区域超出院子或碰到田地，请先移动房屋。";
  if ((state.layout.stall_hidden !== true && overlapsHouseExtension(state.layout.stall, [2, 2], state.layout.house)) || state.layout.decorations.some(instance => {
    const item = decorationById.get(instance.item_id);
    return item && !isGroundDecoration(item) && overlapsHouseExtension(instance, item.cells, state.layout.house);
  })) return "升级区域有已摆放的装饰，请先移开后再购买升级。";
  return null;
}

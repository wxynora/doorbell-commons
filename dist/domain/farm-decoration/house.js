import { decorationById } from "./catalog.js";

const EXTENSION = Object.freeze([2.325, -6.61, 3.885, -2.51]);
const TWO = "farm_decor:house_level_two", THREE = "farm_decor:house_level_three", CANOPY = "farm_decor:floral_canopy";
export function houseState(owned) {
  const level = owned[THREE] > 0 ? 3 : owned[TWO] > 0 ? 2 : 1;
  return { level, canopy_unlocked: owned[CANOPY] > 0, blocked_rects: level >= 2 ? [[...EXTENSION]] : [] };
}
export const isGroundDecoration = item => item.layer === "ground" || item.model_id === "flowerbed" || item.model_id.startsWith("flowerbed_");
export function overlapsHouseExtension(pose, cells) {
  const quarterTurns = Math.round(pose.rotation / (Math.PI / 2));
  const [w, d] = (Math.abs(quarterTurns) % 2 ? [cells[1], cells[0]] : cells).map(n => n * .94);
  return pose.x - w / 2 < EXTENSION[2] - 1e-7 && pose.x + w / 2 > EXTENSION[0] + 1e-7
    && pose.z - d / 2 < EXTENSION[3] - 1e-7 && pose.z + d / 2 > EXTENSION[1] + 1e-7;
}
export function housePurchaseError(state, itemId) {
  if ((itemId === THREE || itemId === CANOPY) && houseState(state.owned).level < 2) return "请先升级二级房屋。";
  if (itemId !== TWO && itemId !== THREE) return null;
  if (overlapsHouseExtension(state.layout.stall, [2, 2]) || state.layout.decorations.some(instance => {
    const item = decorationById.get(instance.item_id);
    return item && !isGroundDecoration(item) && overlapsHouseExtension(instance, item.cells);
  })) return "升级区域有已摆放的装饰，请先移开后再购买升级。";
  return null;
}

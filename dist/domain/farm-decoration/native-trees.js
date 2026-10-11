import { CELL_SIZE, boundsRectangle, intersects } from "./placement-geometry.js";
import { DEFAULT_HOUSE_POSITION, houseExtensionRect } from "./house-geometry.js";
import { createPlacementTerrain } from "./placement-terrain.js";

export const NATIVE_TREE_POSITIONS = Object.freeze([
  Object.freeze({x:4.45,z:-6.35}), Object.freeze({x:-4.4,z:-5.34}),
]);
export const NATIVE_TREE_CELLS = [1,1];
export function snapNativeTree(index,x,z) {
  const base=NATIVE_TREE_POSITIONS[index];
  return {x:base.x+Math.round((x-base.x)/CELL_SIZE)*CELL_SIZE,z:base.z+Math.round((z-base.z)/CELL_SIZE)*CELL_SIZE};
}
export function validNativeTrees(trees) {
  return Array.isArray(trees)&&trees.length===2&&trees.every((p,index)=>{
    if(!p||typeof p!=="object"||Array.isArray(p)||Object.keys(p).length!==2||!Object.hasOwn(p,"x")||!Object.hasOwn(p,"z")||![p.x,p.z].every(Number.isFinite))return false;
    const snap=snapNativeTree(index,p.x,p.z);
    return Math.abs(snap.x-p.x)<1e-7&&Math.abs(snap.z-p.z)<1e-7;
  });
}
export function nativeTreeFootprint(p) {
  return boundsRectangle([p.x-CELL_SIZE/2,p.z-CELL_SIZE/2,p.x+CELL_SIZE/2,p.z+CELL_SIZE/2]);
}
export function canPlaceNativeTree(point,terrain,housePosition=DEFAULT_HOUSE_POSITION,houseLevel=1) {
  const polygon=nativeTreeFootprint(point);
  return terrain.canPlace(polygon)&&!(houseLevel>=2&&intersects(polygon,boundsRectangle(houseExtensionRect(housePosition))));
}
export function canPlaceNativeTrees(trees,plots,housePosition,field,houseLevel=1) {
  if(!validNativeTrees(trees))return false;
  const terrain=createPlacementTerrain(plots,housePosition,field);
  return trees.every(point=>canPlaceNativeTree(point,terrain,housePosition,houseLevel));
}

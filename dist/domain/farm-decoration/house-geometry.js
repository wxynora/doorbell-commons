// Mirrored by Farm and the scene. House coordinates share the decoration world.
import { CELL_SIZE, boundsRectangle, intersects } from "./placement-geometry.js";
export const DEFAULT_HOUSE_POSITION = Object.freeze({x:.35,z:-4.92});
const BASE = [[-1.8,-6.57,2.5,-3.27],[-1.86,-3.39,2.56,-2.39],[.35,-2.48,1.65,-1.8]];
const EXTENSION = [2.325,-6.61,3.885,-2.51];
const translate = (r,p) => r.map((v,i)=>v+(i%2?p.z-DEFAULT_HOUSE_POSITION.z:p.x-DEFAULT_HOUSE_POSITION.x));
export const houseBaseRects = (p=DEFAULT_HOUSE_POSITION) => BASE.map(r=>translate(r,p));
export const houseExtensionRect = (p=DEFAULT_HOUSE_POSITION) => translate(EXTENSION,p);
export function snapHousePosition(x,z){
  return {x:DEFAULT_HOUSE_POSITION.x+Math.round((x-DEFAULT_HOUSE_POSITION.x)/CELL_SIZE)*CELL_SIZE,
    z:DEFAULT_HOUSE_POSITION.z+Math.round((z-DEFAULT_HOUSE_POSITION.z)/CELL_SIZE)*CELL_SIZE};
}
export function validHousePosition(p){
  if(!p||![p.x,p.z].every(Number.isFinite))return false;
  const snapped=snapHousePosition(p.x,p.z);
  return Math.abs(p.x-snapped.x)<1e-7&&Math.abs(p.z-snapped.z)<1e-7;
}
export function canPlaceHouse(position=DEFAULT_HOUSE_POSITION,level,terrain,fixtures=[]){
  if(!validHousePosition(position))return false;
  const base=houseBaseRects(position).map(boundsRectangle);
  const extension=level>=2?boundsRectangle(houseExtensionRect(position)):null;
  if(!base.every(p=>terrain.canPlace(p))||(extension&&!terrain.canPlace(extension)))return false;
  return fixtures.every(({polygon,groundFinish})=>
    !base.some(p=>intersects(p,polygon))&&(!extension||groundFinish||!intersects(extension,polygon)));
}

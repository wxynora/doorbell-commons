// Mirrored by Farm and the scene. House coordinates share the decoration world.
import { CELL_SIZE, boundsRectangle, intersects } from "./placement-geometry.js";
export const DEFAULT_HOUSE_POSITION = Object.freeze({x:.35,z:-4.92});
const BASE = [[-1.8,-6.57,2.5,-3.27],[-1.86,-3.39,2.56,-2.39],[.35,-2.48,1.65,-1.8]];
const EXTENSION = [2.325,-6.61,3.885,-2.51];
const translate = (r,p) => r.map((v,i)=>v+(i%2?p.z-DEFAULT_HOUSE_POSITION.z:p.x-DEFAULT_HOUSE_POSITION.x));
// Rectangles enclose the physical walls, entry steps and attached room; foliage/roof overhang is not invented ground occupancy.
const FAIRY_BASES = {
  rose_cottage:[[-2.5,-1.55,2.5,1.95],[-2.55,1.9,-1.7,3.6],[-1.7,3.15,.45,3.65]],
  pumpkin:[[-2.25,-1.935,2.25,1.935],[.7775,-1.56775,3.7025,.94775],[-.88,1.85,.88,3.08]],
  stump:[[-2.23,-1.985,2.23,1.985],[.73,-1.17,2.93,.81],[-1.02,1.43,1.37,2.78]],
  mushroom:[[-1.58,-1.58,1.58,1.58],[1.0828,-1.2172,2.9572,.6572],[-.81,1.56,.81,2.8]],
};
const FAIRY_TRANSFORMS={rose_cottage:[1,0],pumpkin:[1.2,-.65],stump:[1.22,-.5],mushroom:[1.22,-.6]};
export const houseBaseRects = (p=DEFAULT_HOUSE_POSITION) => {
  const shape=FAIRY_BASES[p.style];
  if(!shape)return BASE.map(r=>translate(r,p));
  const [scale,offset]=FAIRY_TRANSFORMS[p.style];
  return shape.map(r=>r.map((v,i)=>v*scale+(i%2?p.z:p.x+offset)));
};
export const houseExtensionRects=(p=DEFAULT_HOUSE_POSITION,level=1)=>FAIRY_BASES[p.style]||level<2?[]:[houseExtensionRect(p)];
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
  const extension=houseExtensionRects(position,level).map(boundsRectangle);
  if(!base.every(p=>terrain.canPlace(p))||!extension.every(p=>terrain.canPlace(p)))return false;
  return fixtures.every(({polygon,groundFinish})=>
    !base.some(p=>intersects(p,polygon))&&(groundFinish||!extension.some(p=>intersects(p,polygon))));
}

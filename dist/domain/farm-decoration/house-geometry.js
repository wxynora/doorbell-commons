// Mirrored by Farm and the scene. House coordinates share the decoration world.
import { CELL_SIZE, boundsRectangle, intersects } from "./placement-geometry.js";
export const DEFAULT_HOUSE_POSITION = Object.freeze({x:.35,z:-4.92});
const BASE = [[-1.8,-6.57,2.5,-3.27],[-1.86,-3.39,2.56,-2.39],[.35,-2.48,1.65,-1.8]];
const EXTENSION = [2.325,-6.61,3.885,-2.51];
const translate = (r,p) => r.map((v,i)=>v+(i%2?p.z-DEFAULT_HOUSE_POSITION.z:p.x-DEFAULT_HOUSE_POSITION.x));
// Rectangles enclose the physical walls, entry steps and attached room; foliage/roof overhang is not invented ground occupancy.
const witchRand=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const floorMillimeter=value=>Math.floor(value*1000)/1000;
const ceilMillimeter=value=>Math.ceil(value*1000)/1000;
const witchGroundRadiusX=2.9,witchGroundRadiusZ=2.9*.91,witchGroundCenterZ=.25;
const witchGroundMinZ=witchGroundCenterZ-witchGroundRadiusZ,witchGroundMaxZ=witchGroundCenterZ+witchGroundRadiusZ;
// The actual ground cylinder is elliptical in XZ. Twenty-four conservative
// strips keep its corners close to the rendered island instead of claiming a
// full bounding rectangle as walkable collision.
const witchGroundRects=Array.from({length:24},(_,index)=>{
  const minZ=floorMillimeter(witchGroundMinZ+(witchGroundMaxZ-witchGroundMinZ)*index/24);
  const maxZ=ceilMillimeter(witchGroundMinZ+(witchGroundMaxZ-witchGroundMinZ)*(index+1)/24);
  const nearestDistance=minZ<=witchGroundCenterZ&&maxZ>=witchGroundCenterZ?0:
    Math.min(Math.abs(minZ-witchGroundCenterZ),Math.abs(maxZ-witchGroundCenterZ));
  const x=witchGroundRadiusX*Math.sqrt(Math.max(0,1-(nearestDistance/witchGroundRadiusZ)**2));
  return [floorMillimeter(-x),minZ,ceilMillimeter(x),maxZ];
});
// Tight per-stone rectangles include the actual raised rock ring. The unit
// dodecahedron fits its unit bounding sphere; its XZ support radii are derived
// from the candidate's exact seeded XYZ rotation and (.35,.27,.31) scale.
const witchStoneRects=Array.from({length:33},(_,index)=>{
  const angle=index/33*Math.PI*2,x=2.78*Math.cos(angle),z=.25+2.55*Math.sin(angle);
  const rx=witchRand(index)*.14,ry=witchRand(index+1)*.5,rz=witchRand(index+2)*.12;
  const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
  const r00=cy*cz,r01=-cy*sz,r02=sy;
  const r20=sx*sz-cx*sy*cz,r21=sx*cz+cx*sy*sz,r22=cx*cy;
  const halfX=Math.sqrt((.35*r00)**2+(.27*r01)**2+(.31*r02)**2);
  const halfZ=Math.sqrt((.35*r20)**2+(.27*r21)**2+(.31*r22)**2);
  return [floorMillimeter(x-halfX),floorMillimeter(z-halfZ),ceilMillimeter(x+halfX),ceilMillimeter(z+halfZ)];
});
const WITCH_PUMPKIN_BASES=[
  ...witchGroundRects,
  ...witchStoneRects,
  // These two fixed pumpkins extend just beyond the ground ellipse.
  [1.194,1.613,2.166,2.487],
  [.601,2.014,1.259,2.606],
];
const FAIRY_BASES = {
  pumpkin:[[-2.25,-1.935,2.25,1.935],[.7775,-1.56775,3.7025,.94775],[-.88,1.85,.88,3.08]],
  stump:[[-2.23,-1.985,2.23,1.985],[.73,-1.17,2.93,.81],[-1.02,1.43,1.37,2.78]],
  mushroom:[[-1.58,-1.58,1.58,1.58],[1.0828,-1.2172,2.9572,.6572],[-.81,1.56,.81,2.8]],
  rose_cottage:[[-2.5,-1.55,2.5,1.95],[-2.55,1.9,-1.7,3.6],[-1.7,3.15,.45,3.65]],
  witch_pumpkin:WITCH_PUMPKIN_BASES,
};
const FAIRY_TRANSFORMS={pumpkin:[1.2,-.65],stump:[1.22,-.5],mushroom:[1.22,-.6],rose_cottage:[1,0],witch_pumpkin:[1,0]};
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

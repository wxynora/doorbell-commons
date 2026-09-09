import * as T from "three";
import { CELL_SIZE, Z_ORIGIN, rectangle } from "./placement-geometry.js";
import { LAND, createPlacementTerrain } from "./placement-terrain.js";
import { houseBaseRects, houseExtensionRect, snapHousePosition, canPlaceHouse } from "./house-geometry.js";
import { disposeDecoration } from "./decorations.js";

// Only exists during house editing; no extra frame loop or per-drag terrain rebuild.
export function createHousePlacement(world,level){
  const terrain=createPlacementTerrain(world.plots.map(o=>o.userData.plot),null);
  const target=world.house,stall=world.root.getObjectByName("market-stall");
  const fixtures=[stall,...world.decorations].map(o=>{
    const model=o.userData.decorationId??"";
    return {polygon:rectangle({x:o.position.x,z:o.position.z,rotation:o.rotation.y},o.userData.cells||[2,2]),
      groundFinish:!!o.userData.groundCover||model==="flowerbed"||model.startsWith("flowerbed_")};
  });
  const grid=new T.Group();grid.name="house-placement-grid";grid.visible=false;world.root.add(grid);
  const points=[];
  for(let x=-Math.ceil(LAND.x/CELL_SIZE)*CELL_SIZE;x<=LAND.x;x+=CELL_SIZE)
    for(const [a,b] of terrain.clip([x,-LAND.z],[x,LAND.z]))points.push(new T.Vector3(a[0],.285,a[1]),new T.Vector3(b[0],.285,b[1]));
  for(let z=Z_ORIGIN+Math.floor((-LAND.z-Z_ORIGIN)/CELL_SIZE)*CELL_SIZE;z<=LAND.z*1.045;z+=CELL_SIZE)
    for(const [a,b] of terrain.clip([-LAND.x*1.045,z],[LAND.x*1.045,z]))points.push(new T.Vector3(a[0],.285,a[1]),new T.Vector3(b[0],.285,b[1]));
  grid.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:"#eef0ce",transparent:true,opacity:.7})));
  const footprints=[...houseBaseRects(),...(level>=2?[houseExtensionRect()]:[])].map(rect=>{
    const mesh=new T.Mesh(new T.PlaneGeometry(rect[2]-rect[0],rect[3]-rect[1]),new T.MeshBasicMaterial({color:"#b5e78c",transparent:true,opacity:.5,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;grid.add(mesh);return mesh;
  });
  grid.traverse(o=>{o.raycast=()=>{};});
  let active=false,valid=true,saved=target.position.clone();
  function move(x,z){
    const p=snapHousePosition(x,z);valid=canPlaceHouse(p,level,terrain,fixtures);
    target.position.set(p.x,saved.y,p.z);
    const rects=[...houseBaseRects(p),...(level>=2?[houseExtensionRect(p)]:[])];
    footprints.forEach((mesh,i)=>{
      const r=rects[i];mesh.position.set((r[0]+r[2])/2,.3,(r[1]+r[3])/2);
      mesh.material.color.set(valid?"#b5e78c":"#ec867c");
    });
    return valid;
  }
  return {
    get object(){return target;},get active(){return active;},get valid(){return valid;},grid,
    begin(){saved=target.position.clone();active=true;grid.visible=true;move(saved.x,saved.z);},
    move(x,z){return active&&move(x,z);},
    confirm(){if(!active||!valid)return false;active=false;grid.visible=false;return true;},
    cancel(){if(active)target.position.copy(saved);active=false;grid.visible=false;},
    dispose(){disposeDecoration(grid);}
  };
}

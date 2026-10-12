import * as T from "three";
import { boundsRectangle, rectangle } from "./placement-geometry.js";
import { createPlacementTerrain } from "./placement-terrain.js";
import { houseExtensionRects } from "./house-geometry.js";
import { defaultFieldLayout, fieldRects, snapFieldPosition, validFieldLayout, canPlaceField } from "./field-layout.js";
import { disposeDecoration } from "./decorations.js";

export function createFieldPlacement(world, level, onChange) {
  const plots = world.plots.map(object => object.userData.plot);
  const saved = { ...(world.fieldLayout ?? defaultFieldLayout(plots)) };
  let layout = { ...saved }, active = false, valid = false;
  const target = new T.Group();target.position.set(layout.x, .255, layout.z);
  const terrain = createPlacementTerrain([], world.house.position);
  const fixtures = [world.root.getObjectByName("market-stall"), ...world.decorations].map(object =>
    rectangle({x:object.position.x,z:object.position.z,rotation:object.rotation.y},object.userData.cells??[2,2],object.userData.decorationId));
  fixtures.push(...houseExtensionRects(world.house.position,level).map(boundsRectangle));
  const grid = new T.Group();grid.name = "field-placement-grid";grid.visible = false;world.root.add(grid);
  const geometry = new T.PlaneGeometry(.87,.912);
  const material = new T.MeshBasicMaterial({color:"#b5e78c",transparent:true,opacity:.5,depthWrite:false});
  const footprints = plots.map(() => {const plane=new T.Mesh(geometry,material);plane.rotation.x=-Math.PI/2;plane.raycast=()=>{};grid.add(plane);return plane;});
  function update() {
    target.position.set(layout.x,.255,layout.z);
    valid=canPlaceField(layout,plots,terrain,fixtures);
    fieldRects(plots,layout).forEach((rect,i)=>footprints[i].position.set((rect[0]+rect[2])/2,.37,(rect[1]+rect[3])/2));
    material.color.set(valid?"#b5e78c":"#ec867c");
    onChange({...layout});return valid;
  }
  return {
    get object(){return target;},get active(){return active;},get valid(){return valid;},get layout(){return {...layout};},
    begin(){active=true;grid.visible=true;update();},
    move(x,z){if(!active)return false;layout={...layout,...snapFieldPosition(x,z,plots)};return update();},
    setColumns(columns){const {rows,...rest}=layout,next={...rest,columns};if(!active||!validFieldLayout(next,plots))return false;layout=next;update();return true;},
    setRows(rows){const count=Math.max(0,...plots.map(plot=>plot.id)),next={...layout,rows,columns:Math.ceil(count/rows)};if(!active||!validFieldLayout(next,plots))return false;layout=next;update();return true;},
    confirm(){if(!active||!valid)return false;active=false;grid.visible=false;return true;},
    cancel(){if(active){layout={...saved};onChange({...saved});}active=false;grid.visible=false;},
    dispose(){disposeDecoration(grid);}
  };
}

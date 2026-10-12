import * as T from "three";
import { CELL_SIZE, boundsRectangle, rectangle, intersects } from "./placement-geometry.js";
import { createPlacementTerrain } from "./placement-terrain.js";
import { houseExtensionRects } from "./house-geometry.js";
import { defaultFieldLayout, fieldRects, fieldGroups, normalizeFieldLayout, snapFieldPosition, validFieldLayout, canPlaceField } from "./field-layout.js";
import { disposeDecoration } from "./decorations.js";
import { captureWateringCan } from "./watering-can.js";

export function createFieldPlacement(world, level, onChange) {
  const plots = world.plots.map(object => object.userData.plot);
  const saved = normalizeFieldLayout(world.fieldLayout ?? defaultFieldLayout(plots),plots);
  let layout = structuredClone(saved), active = false, valid = false, selected = 0;
  const groups=()=>fieldGroups(plots,layout);
  const members=()=>groups()[selected].plot_ids;
  const ensureGroups=()=>{layout.groups??=[{x:0,z:0,columns:layout.columns,...layout.rows?{rows:layout.rows}:{},plot_ids:plots.map(p=>p.id)}];};
  const target = new T.Group();target.position.set(layout.x, .255, layout.z);
  const terrain = createPlacementTerrain([], world.house.position);
  const fixtures = [world.root.getObjectByName("market-stall"), ...(captureWateringCan(world.wateringCan)?[world.wateringCan]:[]), ...world.decorations].map(object =>
    rectangle({x:object.position.x,z:object.position.z,rotation:object.rotation.y},object.userData.cells??[2,2],object.userData.decorationId));
  fixtures.push(...houseExtensionRects(world.house.position,level).map(boundsRectangle));
  const grid = new T.Group();grid.name = "field-placement-grid";grid.visible = false;world.root.add(grid);
  const geometry = new T.PlaneGeometry(.87,.912);
  const footprints = plots.map(() => {const material=new T.MeshBasicMaterial({color:"#b5e78c",transparent:true,opacity:.5,depthWrite:false});const plane=new T.Mesh(geometry,material);plane.rotation.x=-Math.PI/2;plane.raycast=()=>{};grid.add(plane);return plane;});
  function update() {
    const group=groups()[selected];target.position.set(group.x,.255,group.z);
    valid=canPlaceField(layout,plots,terrain,fixtures);
    const rects=fieldRects(plots,layout),polygons=rects.map(boundsRectangle),ids=new Set(group.plot_ids);
    rects.forEach((rect,i)=>{
      const plane=footprints[i],polygon=polygons[i];plane.position.set((rect[0]+rect[2])/2,.37,(rect[1]+rect[3])/2);
      const clear=terrain.canPlace(polygon)&&!fixtures.some(other=>intersects(polygon,other))&&!polygons.some((other,j)=>i!==j&&intersects(polygon,other));
      plane.material.color.set(clear?"#b5e78c":"#ec867c");plane.material.opacity=ids.has(plots[i].id)?.65:.2;
    });
    onChange(structuredClone(layout));return valid;
  }
  return {
    get object(){return target;},get active(){return active;},get valid(){return valid;},get layout(){return structuredClone(layout);},
    get selected(){return selected;},get groups(){return groups().map(g=>({count:g.plot_ids.length,columns:g.columns,rows:g.rows??Math.ceil(g.plot_ids.length/g.columns)}));},
    begin(){active=true;grid.visible=true;update();},
    move(x,z){
      if(!active||![x,z].every(Number.isFinite))return false;
      if(layout.groups){const group=groups()[selected],local=layout.groups[selected];local.x+=Math.round((x-group.x)/CELL_SIZE)*CELL_SIZE;local.z+=Math.round((z-group.z)/CELL_SIZE)*CELL_SIZE;}
      else layout={...layout,...snapFieldPosition(x,z,plots)};
      return update();
    },
    select(index){if(!active||!Number.isSafeInteger(index)||!groups()[index])return false;selected=index;update();return true;},
    setColumns(columns){
      if(!active)return false;const next=structuredClone(layout),group=next.groups?next.groups[selected]:next;
      delete group.rows;group.columns=columns;if(!validFieldLayout(next,plots))return false;layout=next;update();return true;
    },
    setRows(rows){
      if(!active)return false;const next=structuredClone(layout),group=next.groups?next.groups[selected]:next;
      const count=next.groups?group.plot_ids.length:Math.max(0,...plots.map(p=>p.id));group.rows=rows;group.columns=Math.ceil(count/rows);
      if(!validFieldLayout(next,plots))return false;layout=next;update();return true;
    },
    split(count){
      if(!active||!Number.isSafeInteger(count)||count<1||count>=members().length)return false;
      ensureGroups();const group=layout.groups[selected],plot_ids=group.plot_ids.splice(-count),columns=Math.min(group.columns,count);
      delete group.rows;group.columns=Math.min(group.columns,group.plot_ids.length);
      layout.groups.push({x:group.x+(group.columns+columns)*CELL_SIZE/2,z:group.z,columns,plot_ids});selected=layout.groups.length-1;
      update();return true;
    },
    merge(index){
      if(!active||!Number.isSafeInteger(index)||index===selected||!layout.groups?.[index])return false;
      const target=layout.groups[index];target.plot_ids.push(...members());target.plot_ids.sort((a,b)=>a-b);
      if(target.rows)target.columns=Math.ceil(target.plot_ids.length/target.rows);
      layout.groups.splice(selected,1);selected=index-(selected<index?1:0);update();return true;
    },
    confirm(){if(!active||!valid)return false;active=false;grid.visible=false;return true;},
    cancel(){if(active){layout=structuredClone(saved);onChange(structuredClone(saved));}active=false;grid.visible=false;},
    dispose(){disposeDecoration(grid);}
  };
}

import {rectangle,boundsRectangle,touchedCells,intersects} from './placement-geometry.js';
import {houseBaseRects,houseExtensionRects,DEFAULT_HOUSE_POSITION} from './house-geometry.js';
import {isGroundDecoration} from './house.js';
import {createPlacementTerrain,intersectPolygon} from './terrain-diagnostics.js';
import {cellName} from './decorate-plan.js';
import {fieldPlots} from './field-layout.js';
import {NATIVE_TREE_POSITIONS,nativeTreeFootprint} from './native-trees.js';

const named=causes=>causes.map(c=>({...c,cells:c.cells.map(([col,row])=>cellName(col,row)??{col,row})}));
export function diagnoseFieldPosition(farm,resource,layout){
  const terrain=createPlacementTerrain([],layout.house??DEFAULT_HOUSE_POSITION);
  const definitions=new Map(resource.catalog.map(d=>[d.item_id,d]));
  const fixtures=[...houseExtensionRects(layout.house??DEFAULT_HOUSE_POSITION,resource.house.level).map(r=>({polygon:boundsRectangle(r),blocker:{kind:'house_extension'}})),
    ...layout.stall_hidden?[]:[{polygon:rectangle(layout.stall,[2,2]),blocker:{kind:'stall'}}],...layout.decorations.map(o=>({
    polygon:rectangle(o,definitions.get(o.item_id).cells),blocker:{kind:'decoration',instance:o.instance_id,name:definitions.get(o.item_id).name}}))];
  return fieldPlots(farm.plots??[],layout.field).flatMap((plot,i)=>{
    const poly=boundsRectangle([plot.x-.435,plot.z-.456,plot.x+.435,plot.z+.456]),causes=terrain.explain(poly);
    for(const fixture of fixtures)if(intersects(poly,fixture.polygon))causes.push({reason:'blocked',blocker:fixture.blocker,cells:touchedCells(intersectPolygon(poly,fixture.polygon))});
    return named(causes).map(c=>({...c,plot_id:plot.id??plot.plot_id??i+1}));
  });
}
export function fixtureCells(resource,layout,fixture){
  if(fixture==='watering_can')return touchedCells(rectangle(layout.watering_can,[1,1])).map(([col,row])=>cellName(col,row)??{col,row});
  const position=layout.house??DEFAULT_HOUSE_POSITION;
  if(['tree_1','tree_2'].includes(fixture))return touchedCells(nativeTreeFootprint((layout.trees??NATIVE_TREE_POSITIONS)[fixture==='tree_1'?0:1])).map(([col,row])=>cellName(col,row)??{col,row});
  const polygons=fixture==='house'?[...houseBaseRects(position),...houseExtensionRects(position,resource.house.level)].map(boundsRectangle):[rectangle(layout.stall,[2,2])];
  return [...new Map(polygons.flatMap(touchedCells).map(([col,row])=>{
    const cell=cellName(col,row)??{col,row};return [JSON.stringify(cell),cell];
  })).values()];
}
export function diagnoseDecorationPosition(farm,resource,layout,pose,cells,{house=false,stall=false,definition}={}){
  const position=layout.house??DEFAULT_HOUSE_POSITION;
  const terrain=createPlacementTerrain(farm.plots??[],house?null:position,layout.field);
  const polygons=house?[...houseBaseRects(position),...houseExtensionRects(position,resource.house.level)].map(boundsRectangle):[rectangle(pose,cells)];
  const causes=polygons.flatMap(poly=>terrain.explain(poly,definition?.model_id==='waterwheel'));
  if(house){
    const fixtures=[...layout.stall_hidden?[]:[{polygon:rectangle(layout.stall,[2,2]),blocker:{kind:'stall'}}],...layout.decorations.map(o=>{const d=resource.catalog.find(d=>d.item_id===o.item_id);return {polygon:rectangle(o,d.cells),groundFinish:isGroundDecoration(d),blocker:{kind:'decoration',instance:o.instance_id,name:d.name}}})];
    for(const [index,poly] of polygons.entries())for(const f of fixtures)if(!(index>=houseBaseRects(position).length&&f.groundFinish)&&intersects(poly,f.polygon))causes.push({reason:'blocked',blocker:f.blocker,cells:touchedCells(intersectPolygon(poly,f.polygon))});
  }
  // Native tree fixtures have no catalog definition but still block the extension.
  if(!house&&resource.house.level>=2&&(stall||definition===undefined||!isGroundDecoration(definition))){
    const poly=polygons[0];
    for(const rect of houseExtensionRects(position,resource.house.level)){const extension=boundsRectangle(rect);
    if(intersects(poly,extension))causes.push({reason:'blocked',blocker:{kind:'house_extension'},cells:touchedCells(intersectPolygon(poly,extension))});}
  }
  // Merge repeated house-part geometry reports while retaining every blocker identity.
  const merged=new Map();
  for(const cause of named(causes)){
    const key=JSON.stringify([cause.reason,cause.blocker??null]),prior=merged.get(key);
    if(!prior)merged.set(key,cause);
    else prior.cells=[...new Map([...prior.cells,...cause.cells].map(c=>[JSON.stringify(c),c])).values()];
  }
  return [...merged.values()];
}

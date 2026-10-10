import {rectangle,boundsRectangle,touchedCells,intersects} from './placement-geometry.js';
import {houseBaseRects,houseExtensionRect,DEFAULT_HOUSE_POSITION} from './house-geometry.js';
import {isGroundDecoration} from './house.js';
import {createPlacementTerrain,intersectPolygon} from './terrain-diagnostics.js';
import {cellName} from './decorate-plan.js';

const named=causes=>causes.map(c=>({...c,cells:c.cells.map(([col,row])=>cellName(col,row)??{col,row})}));
export function fixtureCells(resource,layout,fixture){
  const position=layout.house??DEFAULT_HOUSE_POSITION;
  const polygons=fixture==='house'?[...houseBaseRects(position),...(resource.house.level>=2?[houseExtensionRect(position)]:[])].map(boundsRectangle):[rectangle(layout.stall,[2,2])];
  return [...new Map(polygons.flatMap(touchedCells).map(([col,row])=>{
    const cell=cellName(col,row)??{col,row};return [JSON.stringify(cell),cell];
  })).values()];
}
export function diagnoseDecorationPosition(farm,resource,layout,pose,cells,{house=false,stall=false,definition}={}){
  const position=layout.house??DEFAULT_HOUSE_POSITION;
  const terrain=createPlacementTerrain(farm.plots??[],house?null:position,layout.field);
  const polygons=house?[...houseBaseRects(position),...(resource.house.level>=2?[houseExtensionRect(position)]:[])].map(boundsRectangle):[rectangle(pose,cells)];
  const causes=polygons.flatMap(poly=>terrain.explain(poly,definition?.model_id==='waterwheel'));
  if(!house&&resource.house.level>=2&&(stall||!isGroundDecoration(definition))){
    const extension=boundsRectangle(houseExtensionRect(position)),poly=polygons[0];
    if(intersects(poly,extension))causes.push({reason:'blocked',blocker:{kind:'house_extension'},cells:touchedCells(intersectPolygon(poly,extension))});
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

import { randomUUID } from 'node:crypto';
import { validateDecorationLayout, footprint, CELL_SIZE, Z_ORIGIN } from './layout.js';
import { snapCells, rectangle, touchedCells, boundsRectangle } from './placement-geometry.js';
import { houseBaseRects, houseExtensionRect, DEFAULT_HOUSE_POSITION } from './house-geometry.js';
import {fieldPlots} from './field-layout.js';

export const GRID = Object.freeze({ columns:24, rows:27, minCol:-12, minRow:-12 });
// Model local +Z is its front. Positive Three.js Y rotation turns it towards +X.
export const FACING = Object.freeze({ S:0, SE:Math.PI/4, E:Math.PI/2, NE:3*Math.PI/4,
  N:Math.PI, NW:5*Math.PI/4, W:3*Math.PI/2, SW:7*Math.PI/4 });
const isObject = v => !!v && typeof v==='object' && !Array.isArray(v);
const keys = (v,required,optional=[]) => isObject(v) && required.every(k=>Object.hasOwn(v,k))
  && Object.keys(v).every(k=>[...required,...optional].includes(k));
const reject = (code,extra={}) => ({ ok:false,code,...extra });
const HOUSE_GRID_ANCHOR=[Math.floor(DEFAULT_HOUSE_POSITION.x/CELL_SIZE),Math.floor((DEFAULT_HOUSE_POSITION.z-Z_ORIGIN)/CELL_SIZE)];
export const houseAnchor = position => cellName(
  HOUSE_GRID_ANCHOR[0]+Math.round((position.x-DEFAULT_HOUSE_POSITION.x)/CELL_SIZE),
  HOUSE_GRID_ANCHOR[1]+Math.round((position.z-DEFAULT_HOUSE_POSITION.z)/CELL_SIZE));

export function parseCell(cell) {
  if(typeof cell!=='string'||!/^([A-X])(0[1-9]|1[0-9]|2[0-7])$/.test(cell)) return null;
  return [cell.charCodeAt(0)-65+GRID.minCol,Number(cell.slice(1))-1+GRID.minRow];
}
export function cellName(col,row) {
  if(col<GRID.minCol||col>=GRID.minCol+GRID.columns||row<GRID.minRow||row>=GRID.minRow+GRID.rows)return null;
  return String.fromCharCode(65+col-GRID.minCol)+String(row-GRID.minRow+1).padStart(2,'0');
}
export function facingOf(rotation) {
  const n=((Math.round(rotation/(Math.PI/4))%8)+8)%8;
  return ['S','SE','E','NE','N','NW','W','SW'][n];
}
export function poseAt(cell,cells,facing='S') {
  const at=parseCell(cell),rotation=FACING[facing];
  if(!at||!Object.hasOwn(FACING,facing))return null;
  const [w,d]=snapCells(cells,rotation);
  return {x:(at[0]+w/2)*CELL_SIZE,z:Z_ORIGIN+(at[1]+d/2)*CELL_SIZE,rotation};
}

// Pure planning: this never modifies farm, inventory, coins or the supplied resource.
// The action adapter must save the returned layout using the existing revision/receipt path.
export function planDecoration(farm,resource,changes,{uuid=randomUUID,validate=true,checkQuantity=true}={}) {
  if(!Array.isArray(changes)||!changes.length)return reject('invalid_changes');
  const layout=structuredClone(resource.layout),catalog=new Map(resource.catalog.map(d=>[d.model_id,d]));
  const definitions=new Map(resource.catalog.map(d=>[d.item_id,d]));
  const owned=Object.fromEntries(resource.inventory.filter(i=>i.unlocked).map(i=>[i.item_id,i.owned_quantity]));
  // House upgrades are not decoration inventory entries, but are part of authoritative holdings.
  if(resource.house.level>=2)owned['farm_decor:house_level_two']=1;
  if(resource.house.level>=3)owned['farm_decor:house_level_three']=1;
  if(resource.house.canopy_unlocked)owned['farm_decor:floral_canopy']=1;
  const applied=[];
  for(let index=0;index<changes.length;index++) {
    const change=changes[index],fail=(code,extra={})=>reject(code,{change:index+1,...extra});
    if(keys(change,['fixture','at'],change?.fixture==='stall'?['facing']:[])) {
      if(change.fixture==='house') {
        const at=parseCell(change.at);if(!at)return fail('invalid_cell_or_facing');
        layout.house={x:DEFAULT_HOUSE_POSITION.x+(at[0]-HOUSE_GRID_ANCHOR[0])*CELL_SIZE,
          z:DEFAULT_HOUSE_POSITION.z+(at[1]-HOUSE_GRID_ANCHOR[1])*CELL_SIZE};
      } else if(change.fixture==='stall') {
        const pose=poseAt(change.at,[2,2],change.facing??facingOf(layout.stall.rotation));
        if(!pose)return fail('invalid_cell_or_facing');layout.stall=pose;
      } else return fail('invalid_change');
      applied.push({kind:'move',fixture:change.fixture,at:change.at});continue;
    }
    if(keys(change,['remove'])) {
      const at=layout.decorations.findIndex(o=>o.instance_id===change.remove);
      if(at<0)return fail('instance_not_found');
      const [item]=layout.decorations.splice(at,1);applied.push({kind:'remove',instance:item.instance_id});continue;
    }
    if(keys(change,['instance','at'],['facing'])) {
      const instance=layout.decorations.find(o=>o.instance_id===change.instance);
      if(!instance)return fail('instance_not_found');
      const definition=definitions.get(instance.item_id);
      if(!definition)return fail('unknown_item');
      const pose=poseAt(change.at,definition.cells,change.facing??facingOf(instance.rotation));
      if(!pose)return fail('invalid_cell_or_facing');
      Object.assign(instance,pose);applied.push({kind:'move',instance:instance.instance_id,at:change.at,facing:facingOf(pose.rotation)});continue;
    }
    const single=keys(change,['item','at'],['facing']);
    const area=keys(change,['item','from','to'],['facing','shape']);
    if(!single&&!area)return fail('invalid_change');
    if(area&&change.shape!==undefined&&!['fill','border'].includes(change.shape))return fail('invalid_shape');
    const definition=catalog.get(change.item);
    if(!definition||definition.layer==='house')return fail('unknown_item');
    if(!(owned[definition.item_id]>0))return fail('decoration_not_owned');
    const facing=change.facing??'S',at=parseCell(single?change.at:change.from),to=area?parseCell(change.to):at;
    if(!at||!to||!Object.hasOwn(FACING,facing))return fail('invalid_cell_or_facing');
    if(to[0]<at[0]||to[1]<at[1])return fail('invalid_range');
    // A coverage rectangle is tiled by actual footprints, never silently expanded or clipped.
    const [w,d]=snapCells(definition.cells,FACING[facing]);
    if(area&&FACING[facing]%(Math.PI/2)!==0)return fail('diagonal_range');
    const width=area?to[0]-at[0]+1:w,depth=area?to[1]-at[1]+1:d;
    const border=area&&change.shape==='border',remaining=new Set(),positions=[];
    for(let row=at[1];row<at[1]+depth;row++)for(let col=at[0];col<at[0]+width;col++)
      if(!border||col===at[0]||col===to[0]||row===at[1]||row===to[1])remaining.add(`${col},${row}`);
    for(let row=at[1];row<at[1]+depth;row++)for(let col=at[0];col<at[0]+width;col++) {
      if(!remaining.has(`${col},${row}`))continue;
      const occupied=[];
      for(let y=row;y<row+d;y++)for(let x=col;x<col+w;x++)occupied.push(`${x},${y}`);
      if(!occupied.every(key=>remaining.has(key)))continue;
      positions.push([col,row]);for(const key of occupied)remaining.delete(key);
    }
    if(remaining.size)return fail('range_not_tiled',{uncovered_cells:[...remaining].map(key=>cellName(...key.split(',').map(Number)))});
    const quantity=positions.length,placed=layout.decorations.filter(o=>o.item_id===definition.item_id).length;
    if(checkQuantity&&definition.purchase_mode==='unit'&&placed+quantity>owned[definition.item_id])
      return reject('decoration_quantity_exceeded',{change:index+1,needed:quantity,available:owned[definition.item_id]-placed});
    for(const [col,row]of positions) {
      const cell=cellName(col,row),pose=poseAt(cell,definition.cells,facing);
      if(!pose)return fail('invalid_cell_or_facing');
      layout.decorations.push({instance_id:uuid(),item_id:definition.item_id,...pose});
    }
    applied.push({kind:area?(border?'border':'fill'):'place',item:definition.model_id,count:quantity,
      ...(area?{from:change.from,to:change.to}:{at:change.at}),facing});
  }
  const invalid=validate?validateDecorationLayout(farm,layout,owned):null;
  if(invalid) {
    const instances=invalid==='invalid_decoration_position'?layout.decorations.filter(o=>
      validateDecorationLayout(farm,{...layout,decorations:[o]},owned)==='invalid_decoration_position')
      .map(o=>({instance:o.instance_id,item:o.item_id,cells:(footprint(o,definitions.get(o.item_id)?.cells??[1,1])??[]).map(p=>cellName(...p))})):[];
    return reject(invalid,instances.length?{instances}:{});
  }
  return {ok:true,layout,applied};
}

// Render the same real geometry as placement; no guessed rectangular house or tree-canopy collision.
export function projectDecorationGrid(farm,resource) {
  const cells=Array.from({length:GRID.rows},()=>Array(GRID.columns).fill('  '));
  const layers=new Map(),instances=[],offGrid=[];
  const put=(col,row,code,id)=>{
    const name=cellName(col,row);if(!name){offGrid.push({col,row,id});return;}
    const records=layers.get(name)??[];
    if(!records.some(r=>r.id===id))records.push({id,code});layers.set(name,records);
    cells[row-GRID.minRow][col-GRID.minCol]=records.length===1?code:'**';
  };
  for(const [col,row]of resource.grid.river_cells){const n=cellName(col,row);if(n)cells[row-GRID.minRow][col-GRID.minCol]='~~';}
  for(const [col,row]of resource.grid.land_cells){const n=cellName(col,row);if(n)cells[row-GRID.minRow][col-GRID.minCol]='..';}
  for(const [i,plot]of fieldPlots(farm.plots??[],resource.layout.field).entries()) {
    const {x,z}=plot;
    for(const [col,row]of touchedCells(boundsRectangle([x-.435,z-.456,x+.435,z+.456])))put(col,row,'TT',`plot:${plot.id??i+1}`);
  }
  const house=resource.layout.house??DEFAULT_HOUSE_POSITION;
  const houseRects=[...houseBaseRects(house),...(resource.house.level>=2?[houseExtensionRect(house)]:[])];
  for(const rect of houseRects)for(const [col,row]of touchedCells(boundsRectangle(rect)))put(col,row,'HH','house');
  for(const [col,row]of footprint(resource.layout.stall,[2,2])??[])put(col,row,'SS','stall');
  const byId=new Map(resource.catalog.map(d=>[d.item_id,d]));
  const available=resource.inventory.filter(i=>i.unlocked).map(i=>{
    const definition=byId.get(i.item_id),placed_quantity=resource.layout.decorations.filter(o=>o.item_id===i.item_id).length;
    return {...i,placed_quantity,available_quantity:definition.purchase_mode==='unlock'?null:i.owned_quantity-placed_quantity,definition};
  });
  const codeWidth=Math.max(2,(resource.catalog.length+1).toString(36).length);
  const codes=new Map(resource.catalog.map((d,i)=>[d.item_id,(i+1).toString(36).toUpperCase().padStart(codeWidth,'0')]));
  for(const o of resource.layout.decorations) {
    const definition=byId.get(o.item_id);if(!definition)throw Error('Unknown authoritative decoration');
    const occupied=footprint(o,definition.cells);if(!occupied)throw Error('Invalid authoritative footprint');
    const names=occupied.map(([col,row])=>cellName(col,row));
    const code=codes.get(o.item_id),facing=facingOf(o.rotation);
    const [w,d]=snapCells(definition.cells,o.rotation);
    const anchor=cellName(Math.round(o.x/CELL_SIZE-w/2),Math.round((o.z-Z_ORIGIN)/CELL_SIZE-d/2));
    for(const [col,row]of occupied)put(col,row,code,o.instance_id);
    instances.push({instance:o.instance_id,code,item:definition.model_id,name:definition.name,facing,anchor,cells:names});
  }
  const arrows={N:'^ ',NE:'NE',E:'> ',SE:'SE',S:'v ',SW:'SW',W:'< ',NW:'NW'};
  for(const o of instances) {
    if(!o.anchor||layers.get(o.anchor)?.length!==1)continue;
    const [col,row]=parseCell(o.anchor);cells[row-GRID.minRow][col-GRID.minCol]=arrows[o.facing];
  }
  const border='   +'+Array(GRID.columns).fill('-'.repeat(codeWidth)).join('+')+'+';
  const header=('    '+Array.from({length:GRID.columns},(_,i)=>String.fromCharCode(65+i).padEnd(codeWidth)).join(' ')).padEnd(border.length);
  const lines=[header,border];
  for(let row=0;row<GRID.rows;row++)lines.push(String(row+1).padStart(2,'0')+' |'+cells[row].map(v=>v.padEnd(codeWidth)).join('|')+'|',border);
  const overlaps=[...layers].filter(([,items])=>items.length>1).map(([cell,items])=>({cell,instances:items.map(i=>i.id)}));
  return {columns:GRID.columns,rows:GRID.rows,grid:lines.join('\n'),instances,inventory:available,overlaps,offGrid,
    stall:{facing:facingOf(resource.layout.stall.rotation),anchor:cellName(
      Math.round(resource.layout.stall.x/CELL_SIZE-snapCells([2,2],resource.layout.stall.rotation)[0]/2),
      Math.round((resource.layout.stall.z-Z_ORIGIN)/CELL_SIZE-snapCells([2,2],resource.layout.stall.rotation)[1]/2))},
    house:{facing:'S',anchor:houseAnchor(house)}};
}

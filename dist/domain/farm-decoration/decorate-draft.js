import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {planDecoration,cellName,parseCell,FACING} from './decorate-plan.js';
import {validateDecorationLayout,footprint} from './layout.js';
import {diagnoseDecorationPosition,fixtureCells,diagnoseFieldPosition} from './decoration-diagnostics.js';
import {snapCells} from './placement-geometry.js';

function layoutDifferences(before,after){
  const changes=[];
  for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
    if(field!=='decorations'&&!isDeepStrictEqual(before[field],after[field]))
      changes.push({field,before:before[field]??null,after:after[field]??null});
  }
  const a=new Map(before.decorations.map(i=>[i.instance_id,i])),b=new Map(after.decorations.map(i=>[i.instance_id,i]));
  for(const instance of new Set([...a.keys(),...b.keys()]))if(!isDeepStrictEqual(a.get(instance),b.get(instance)))
    changes.push({instance,before:a.get(instance)??null,after:b.get(instance)??null});
  return changes;
}

function inputDetails(change,code,resource){
  if(code==='invalid_field_dimensions')return {};
  if(code==='invalid_shape')return {field:'shape',value:change.shape,allowed:['fill','border']};
  if(code==='invalid_cell_or_facing')return {fields:[
    ...['at','from','to'].filter(key=>Object.hasOwn(change,key)&&!parseCell(change[key])).map(field=>({field,value:change[field],expected:'A01..X27'})),
    ...(Object.hasOwn(change,'facing')&&!Object.hasOwn(FACING,change.facing)?[{field:'facing',value:change.facing,allowed:Object.keys(FACING)}]:[])]};
  if(code==='instance_not_found')return {instance:change.instance??change.remove};
  const definition=resource.catalog.find(d=>d.model_id===change.item);
  if(code==='decoration_not_owned')return {item:change.item,owned:0};
  if(code==='range_not_tiled')return {item:change.item,from:change.from,to:change.to,
    cells:snapCells(definition.cells,FACING[change.facing??'S']),facing:change.facing??'S',
    shape:change.shape??'fill',range_cells:parseCell(change.to).map((v,i)=>v-parseCell(change.from)[i]+1)};
  if(code==='diagonal_range')return {field:'facing',value:change.facing,allowed:['N','E','S','W']};
  if(code==='invalid_range')return {from:change.from,to:change.to,
    reversed_axes:parseCell(change.to).flatMap((v,i)=>v<parseCell(change.from)[i]?[i===0?'column':'row']:[])};
  if(code==='unknown_item')return {item:change.item};
  if(change&&typeof change==='object'&&!Array.isArray(change)){
    let required,optional=['facing'];
    if(Object.hasOwn(change,'fixture')){required=change.fixture==='field'?['fixture']:['fixture','at'];optional=change.fixture==='field'?['at','columns','rows']:change.fixture==='stall'?['facing']:[];}
    else if(Object.hasOwn(change,'remove')){required=['remove'];optional=[];}
    else if(Object.hasOwn(change,'instance'))required=['instance','at'];
    else if(Object.hasOwn(change,'item')){required=Object.hasOwn(change,'from')||Object.hasOwn(change,'to')?['item','from','to']:['item','at'];if(required.includes('from'))optional=['facing','shape'];}
    if(required)return {fields:Object.keys(change),missing_fields:required.filter(k=>!Object.hasOwn(change,k)),
      unexpected_fields:Object.keys(change).filter(k=>![...required,...optional].includes(k)),
      ...(Object.hasOwn(change,'fixture')&&!['house','stall','field','tree_1','tree_2'].includes(change.fixture)?{field:'fixture',value:change.fixture,allowed:['house','stall','field','tree_1','tree_2']}:{}),
      required_fields:required,optional_fields:optional};
  }
  return {value:change,required_one_of:['item','instance','remove','fixture']};
}

// Serializable domain draft only. The adapter owns persistence and revision checks.
// Keep intended changes, including invalid ones; never save a valid subset as the full plan.
export function createDecorationDraft(resource,changes) {
  if(!Array.isArray(changes)||!changes.length)throw Error('invalid_changes');
  return {base_layout:structuredClone(resource.layout),entries:changes.map((change,index)=>
    ({id:index+1,change:structuredClone(change),instances:[]}))};
}

export function reviseDecorationDraft(previous,{fixes=[],changes=[]}={}) {
  const draft=structuredClone(previous);
  if(!Array.isArray(fixes)||!Array.isArray(changes))throw Error('invalid_changes');
  const seen=new Set();
  for(const fix of fixes) {
    if(!fix||!Number.isInteger(fix.id)||!Object.hasOwn(fix,'change')||seen.has(fix.id))throw Error('invalid_fix');
    seen.add(fix.id);
    const entry=draft.entries.find(e=>e.id===fix.id);
    if(!entry)throw Error('draft_entry_not_found');
    entry.change=structuredClone(fix.change);
  }
  let next=Math.max(0,...draft.entries.map(e=>e.id))+1;
  for(const change of changes)draft.entries.push({id:next++,change:structuredClone(change),instances:[]});
  return draft;
}

export function evaluateDecorationDraft(farm,resource,previous,{uuid=randomUUID}={}) {
  const draft=structuredClone(previous),issues=[],owners=new Map();
  // A different human/AI save must not be overwritten by the old draft.
  const changed=layoutDifferences(draft.base_layout,resource.layout);
  if(changed.length)return {ok:false,draft,issues:[{code:'layout_changed',changes:changed}],layout:null};
  let layout=structuredClone(draft.base_layout);
  for(const entry of draft.entries) {
    let index=0;
    const result=planDecoration(farm,{...resource,layout},[entry.change],{
      validate:false,checkQuantity:false,uuid:()=>entry.instances[index++]??(entry.instances[index-1]=uuid())});
    if(!result.ok) {
      const {ok,change,...reason}=result;
      issues.push({id:entry.id,input:structuredClone(entry.change),...reason,...inputDetails(entry.change,result.code,resource)});
      continue;
    }
    layout=result.layout;
    if(entry.change.fixture==='field')entry.field=result.applied[0];
    const target=entry.change.instance??entry.change.remove;
    if(target)owners.set(target,entry.id);
    if(entry.change.fixture)owners.set(entry.change.fixture,entry.id);
    for(const id of entry.instances.slice(0,index))owners.set(id,entry.id);
  }
  const definitions=new Map(resource.catalog.map(d=>[d.item_id,d]));
  const owned=Object.fromEntries(resource.inventory.filter(i=>i.unlocked).map(i=>[i.item_id,i.owned_quantity]));
  if(resource.house.level>=2)owned['farm_decor:house_level_two']=1;
  if(resource.house.level>=3)owned['farm_decor:house_level_three']=1;
  if(resource.house.canopy_unlocked)owned['farm_decor:floral_canopy']=1;
  const counts=new Map();
  const totals=new Map(),retained=new Map(),baseIds=new Set(draft.base_layout.decorations.map(i=>i.instance_id));
  for(const instance of layout.decorations){
    totals.set(instance.item_id,(totals.get(instance.item_id)??0)+1);
    if(baseIds.has(instance.instance_id))retained.set(instance.item_id,(retained.get(instance.item_id)??0)+1);
  }
  const fixtureInvalid=validateDecorationLayout(farm,{...layout,decorations:[]},owned);
  const fieldCauses=owners.has('field')?diagnoseFieldPosition(farm,resource,layout):[];
  if(fieldCauses.length)issues.push({id:owners.get('field'),fixture:'field',code:'invalid_field_position',causes:fieldCauses});
  if(fixtureInvalid) {
    for(const fixture of ['house','stall']){
      if(fieldCauses.length&&!owners.has(fixture))continue;
      const causes=diagnoseDecorationPosition(farm,resource,layout,layout.stall,[2,2],{house:fixture==='house',stall:fixture==='stall'});
      if(causes.length)issues.push({id:owners.get(fixture)??null,fixture,code:fixtureInvalid,
        cells:fixtureCells(resource,layout,fixture),causes});
    }
  }
  for(const fixture of ['tree_1','tree_2']){
    const index=fixture==='tree_1'?0:1;
    if(!layout.trees)continue;
    const causes=diagnoseDecorationPosition(farm,resource,layout,{...layout.trees[index],rotation:0},[1,1]);
    if(causes.length)issues.push({id:owners.get(fixture)??null,fixture,code:'invalid_decoration_position',cells:fixtureCells(resource,layout,fixture),causes});
  }
  for(const instance of layout.decorations) {
    const definition=definitions.get(instance.item_id);
    const cells=(footprint(instance,definition?.cells??[1,1])??[]).map(p=>cellName(...p));
    const common={id:owners.get(instance.instance_id)??null,instance:instance.instance_id,item:instance.item_id,cells};
    const count=(counts.get(instance.item_id)??0)+1;counts.set(instance.item_id,count);
    if(definition?.purchase_mode==='unit'&&count>(owned[instance.item_id]??0))
      issues.push({...common,code:'decoration_quantity_exceeded',owned:owned[instance.item_id]??0,
        placed:retained.get(instance.item_id)??0,requested:(totals.get(instance.item_id)??0)-(retained.get(instance.item_id)??0),
        available:Math.max(0,(owned[instance.item_id]??0)-(retained.get(instance.item_id)??0)),
        final_placed:totals.get(instance.item_id),missing:totals.get(instance.item_id)-(owned[instance.item_id]??0)});
    const causes=diagnoseDecorationPosition(farm,resource,layout,instance,definition.cells,{definition});
    if(causes.length)issues.push({...common,code:'invalid_decoration_position',causes});
    else if(!fixtureInvalid){
      const invalid=validateDecorationLayout(farm,{...layout,decorations:[instance]},owned);
      if(invalid)issues.push({...common,code:invalid});
    }
  }
  // This covers non-decoration layout failures without dropping the retained draft.
  const invalid=validateDecorationLayout(farm,layout,owned);
  if(invalid&&!issues.length)issues.push({code:invalid,id:null});
  return {ok:issues.length===0,draft,layout,issues};
}

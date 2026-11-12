import type Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";
import { applyRowPlans, packRow, unpackRow, type DomainObject, type FieldMapping, type RowPlan } from "./relational-rows.js";
import { readReceiptValues, writeReceiptValue } from "./relational-values.js";

const battleFields:FieldMapping=[["battleId","battle_id"],["roundId","round_id"],["rulesVersion","rules_version"],["attackSideId","attack_side_id"],["defendSideId","defend_side_id"],
  ["status","status"],["endReason","end_reason"],["tick","tick"],["coreHp","core_hp"],["cost","_cost"],["costAccum","cost_accum"],
  ["randomState","random_state"],["defenderDecayTicks","defender_decay_ticks"],["tankTargetWeight","tank_target_weight"],["systemWaves","_waves"],
  ["participants","_participants"],["assignments","_assignments"],["units","_units"],["nextUnitId","next_unit_id"],["effects","_effects"],
  ["nextEffectId","next_effect_id"],["cooldowns","_cooldowns"],["commandLog","_command_log"],["processedCommands","_processed"],
  ["lastVisualFrame","_visual"],["runtime","_runtime"]];
const costFields:FieldMapping=[["attack","attack_cost"],["defend","defend_cost"]];
const runtimeFields:FieldMapping=[["started","started"]];
const unitFields:FieldMapping=[["id","unit_id"],["side","side"],["typeKey","type_key"],["lane","lane"],["pos","position"],["ground","ground"],
  ["hp","hp"],["maxHp","max_hp"],["armor","armor"],["spellResist","spell_resist"],["attackInterval","attack_interval"],
  ["attack","attack"],["damageType","damage_type"],["heal","heal"],["healRadius","heal_radius"],["range","range"],["splash","splash"],
  ["blockCapacity","block_capacity"],["blocking","_blocking"],["attackTimer","attack_timer"],["alive","alive"],["moveProgress","move_progress"],
  ["moveSeconds","move_seconds"],["breakthrough","breakthrough"],["stealth","stealth"],["sprintUntilTick","sprint_until_tick"],
  ["sprintMult","sprint_mult"],["unitSkill","_unit_skill"],["unitSkillReadyTick","unit_skill_ready_tick"],["blockedBy","blocked_by"],
  ["decayStartTick","decay_start_tick"],["fireFocusUntilTick","fire_focus_until_tick"],["silencedUntilTick","silenced_until_tick"],
  ["systemWave","system_wave"],["shield","_shield"]];
const shieldFields:FieldMapping=[["amount","shield_amount"],["untilTick","shield_until_tick"]];
const skillFields:FieldMapping=[["kind","skill_kind"],["name","skill_name"],["speedMult","skill_speed_mult"],
  ["durationTicks","skill_duration_ticks"],["cooldownTicks","skill_cooldown_ticks"],["silenceTicks","skill_silence_ticks"]];
const effectFields:FieldMapping=[["id","effect_id"],["kind","kind"],["side","side"],["lane","lane"],["value","value"],["untilTick","until_tick"]];
const waveFields:FieldMapping=[["ticks","_ticks"],["count","unit_count"],["unit","_unit"],["next","next_wave"],["releases","_releases"]];
const waveUnitFields:FieldMapping=[["hp","hp"],["blockedAttack","blocked_attack"],["blockedAttackInterval","blocked_attack_interval"],["moveSeconds","move_seconds"],["breakthrough","breakthrough"]];
const waveReleaseFields:FieldMapping=[["tick","tick"],["lane","lane"],["unitIds","_unit_ids"]];
const frameFields:FieldMapping=[["tick","tick"],["events","_events"]];
const eventFields:FieldMapping=[["id","event_id"],["tick","tick"],["kind","kind"],["source","_source"],["targets","_targets"]];
const sourceFields:FieldMapping=[["id","source_id"],["type","source_type"],["role","source_role"],["lane","source_lane"],["position","source_position"]];
const targetFields:FieldMapping=[["id","unit_id"],["type","unit_type"],["role","role"],["lane","lane"],["position","unit_position"]];
const receiptFields:FieldMapping=[["requestId","request_id"],["ok","ok"],["error","error"],["message","message"],["member","member"],["skill","skill"],
  ["lane","lane"],["untilTick","until_tick"],["healed","healed"],["unitId","unit_id"],["blockerId","blocker_id"],["cost","cost"],
  ["remainingCost","remaining_cost"],["refund","refund"],["silencedUntilTick","silenced_until_tick"],["effect","_effect"],["facts","_facts"],
  ["targetUnitIds","_targets"],["shields","_shields"],["dispelledShields","_dispelled"]];
const key=(...parts:string[])=>parts.map(part=>part.length+":"+part).join("");
const receiptKind=(matchId:string)=>"battle-receipt:"+matchId;
const extraKind=(matchId:string)=>"battle-extra:"+matchId;
const battleStateTables=["snow_tournament_battle_state","snow_tournament_battle_participant_sides","snow_tournament_battle_participants",
  "snow_tournament_battle_assignment_sides","snow_tournament_battle_assignment_members","snow_tournament_battle_assignments",
  "snow_tournament_battle_units","snow_tournament_battle_unit_blocking","snow_tournament_battle_effects","snow_tournament_battle_cooldowns",
  "snow_tournament_battle_waves","snow_tournament_battle_wave_ticks","snow_tournament_battle_wave_releases","snow_tournament_battle_wave_units",
  "snow_tournament_visual_frames","snow_tournament_visual_events","snow_tournament_visual_targets"];
const battleTables=[...battleStateTables,"snow_tournament_battle_receipts","snow_tournament_battle_receipt_history","snow_tournament_battle_receipt_index"];
const getRows=(db:Database.Database,table:string,editionId:string,matchId:string,order:string)=>
  db.prepare(`SELECT * FROM "${table}" WHERE edition_id=? AND match_id=? ORDER BY ${order}`).all(editionId,matchId) as DomainObject[];
type BattleReadOptions={stateRow?:DomainObject;commandHistory?:boolean;collect?:BattleBaseline};
export type BattleBaseline={rows:Record<string,DomainObject[]>;extras:Map<string,unknown>};
const historyTables=["snow_tournament_battle_receipts","snow_tournament_battle_receipt_history","snow_tournament_battle_receipt_index"];
const extras=(value:DomainObject,fields:FieldMapping)=>{
  const known=new Set(fields.map(([name])=>name));
  return Object.fromEntries(Object.entries(value).filter(([name])=>!known.has(name)));
};
function putExtras(target:DomainObject,extra:unknown) {
  if(extra && typeof extra==="object")for(const [name,value] of Object.entries(extra))
    Object.defineProperty(target,name,{value,enumerable:true,writable:true,configurable:true});
}

/** A tick persists only changed entity rows inside the caller's transaction. With a
 *  `baseline` captured by this transaction's own read, the diff runs in memory and
 *  new command receipts are appended without rereading the stored history. */
export function saveBattleRows(db:Database.Database,editionId:string,matchId:string,battle:DomainObject,saveCommandHistory=true,
  baseline?:BattleBaseline):Map<string,string> {
  const scope={edition_id:editionId,match_id:matchId};
  const append=!!baseline&&saveCommandHistory;
  const tableNames=saveCommandHistory?battleTables:battleStateTables;
  const rows:Record<string,DomainObject[]>=Object.fromEntries(tableNames.map(name=>[name,[]]));
  const put=(name:string,value:DomainObject)=>rows[name]!.push({...scope,...value});
  const desiredExtras=new Map<string,unknown>();
  const rememberExtra=(id:string,value:DomainObject|undefined,fields:FieldMapping)=>{
    if(!value)return;const remaining=extras(value,fields);if(Object.keys(remaining).length)desiredExtras.set(id,remaining);
  };
  const state=packRow(battle,battleFields);
  const cost=packRow(battle.cost??{},costFields),runtime=packRow(battle.runtime??{},runtimeFields);
  state.field_presence += "|"+cost.field_presence+"|"+runtime.field_presence;
  delete cost.field_presence;delete runtime.field_presence;
  put("snow_tournament_battle_state",{...state,...cost,...runtime});
  rememberExtra("battle",battle,battleFields);rememberExtra("cost",battle.cost,costFields);rememberExtra("runtime",battle.runtime,runtimeFields);
  Object.entries(battle.participants??{}).forEach(([side,members],sidePosition)=>{
    put("snow_tournament_battle_participant_sides",{side,position:sidePosition});
    (members as string[]).forEach((id,position)=>put("snow_tournament_battle_participants",{side,position,resident_id:id}));
  });
  Object.entries(battle.assignments??{}).forEach(([side,members],sidePosition)=>{
    put("snow_tournament_battle_assignment_sides",{side,position:sidePosition});
    Object.entries(members as DomainObject).forEach(([member,skills],memberPosition)=>{
      put("snow_tournament_battle_assignment_members",{side,resident_id:member,position:memberPosition});
      (skills as string[]).forEach((skill,position)=>put("snow_tournament_battle_assignments",{side,resident_id:member,position,skill}));
    });
  });
  for(const [unitId,unit] of Object.entries(battle.units??{}) as [string,DomainObject][]) {
    const row=packRow(unit,unitFields),shield=packRow(unit.shield??{},shieldFields),skill=packRow(unit.unitSkill??{},skillFields);
    row.field_presence+="|"+shield.field_presence+"|"+skill.field_presence;
    delete shield.field_presence;delete skill.field_presence;
    put("snow_tournament_battle_units",{...row,...shield,...skill,unit_id:unitId});
    rememberExtra(key("unit",unitId),unit,unitFields);rememberExtra(key("unit-shield",unitId),unit.shield,shieldFields);rememberExtra(key("unit-skill",unitId),unit.unitSkill,skillFields);
    (unit.blocking??[]).forEach((id:string,position:number)=>put("snow_tournament_battle_unit_blocking",{unit_id:unitId,position,blocked_unit_id:id}));
  }
  (battle.effects??[]).forEach((effect:DomainObject,position:number)=>{put("snow_tournament_battle_effects",{position,...packRow(effect,effectFields)});rememberExtra(key("effect",String(position)),effect,effectFields);});
  Object.entries(battle.cooldowns??{}).forEach(([name,value])=>put("snow_tournament_battle_cooldowns",{cooldown_key:name,ready_tick:value}));
  if(battle.systemWaves && typeof battle.systemWaves==="object") {
    const wave=packRow(battle.systemWaves,waveFields),unit=packRow(battle.systemWaves.unit??{},waveUnitFields);
    wave.field_presence+="|"+unit.field_presence;delete unit.field_presence;
    put("snow_tournament_battle_waves",{...wave,...unit});
    rememberExtra("waves",battle.systemWaves,waveFields);rememberExtra("wave-unit",battle.systemWaves.unit,waveUnitFields);
    (battle.systemWaves.ticks??[]).forEach((tick:number,position:number)=>put("snow_tournament_battle_wave_ticks",{position,tick}));
    (battle.systemWaves.releases??[]).forEach((release:DomainObject,position:number)=>{
      put("snow_tournament_battle_wave_releases",{position,...packRow(release,waveReleaseFields)});rememberExtra(key("release",String(position)),release,waveReleaseFields);
      (release.unitIds??[]).forEach((id:string,index:number)=>put("snow_tournament_battle_wave_units",{release_position:position,position:index,unit_id:id}));
    });
  }
  if(battle.lastVisualFrame && typeof battle.lastVisualFrame==="object") {
    put("snow_tournament_visual_frames",packRow(battle.lastVisualFrame,frameFields));rememberExtra("frame",battle.lastVisualFrame,frameFields);
    (battle.lastVisualFrame.events??[]).forEach((event:DomainObject,position:number)=>{
      const row=packRow(event,eventFields),source=packRow(event.source??{},sourceFields);row.field_presence+="|"+source.field_presence;delete source.field_presence;
      put("snow_tournament_visual_events",{position,...row,...source});rememberExtra(key("event",String(position)),event,eventFields);rememberExtra(key("source",String(position)),event.source,sourceFields);
      (event.targets??[]).forEach((target:DomainObject,index:number)=>{put("snow_tournament_visual_targets",{event_position:position,position:index,...packRow(target,targetFields)});rememberExtra(key("target",String(position),String(index)),target,targetFields);});
    });
  }
  const processedIds=new Map<string,string>();
  const obsoleteReceiptIds:string[]=[];
  // Clock-only ticks do not create or remove any command receipts.
  if(saveCommandHistory&&!append) {
    const receiptValues=new Map<string,DomainObject>(),byRequest=new Map<string,string[]>();
    (battle.commandLog??[]).forEach((receipt:DomainObject,position:number)=>{
      const id=key("log",String(battle.battleId),String(position));receiptValues.set(id,receipt);
      const request=String(receipt.requestId??"");const list=byRequest.get(request)??[];list.push(id);byRequest.set(request,list);
      put("snow_tournament_battle_receipt_history",{position,receipt_id:id});
    });
    for(const [request,receipt] of Object.entries(battle.processedCommands??{}) as [string,DomainObject][]) {
      const prior=(byRequest.get(request)??[]).find(id=>isDeepStrictEqual(receiptValues.get(id),receipt));
      const id=prior??key("processed",String(battle.battleId),request);
      if(!prior)receiptValues.set(id,receipt);processedIds.set(request,id);
      put("snow_tournament_battle_receipt_index",{request_id:request,receipt_id:id});
    }
    const current=db.prepare("SELECT receipt_id FROM snow_tournament_battle_receipts WHERE edition_id=? AND match_id=?").all(editionId,matchId) as {receipt_id:string}[];
    const existing=new Set(current.map(row=>row.receipt_id));
    for(const [id,receipt] of receiptValues) {
      put("snow_tournament_battle_receipts",{receipt_id:id,...packRow(receipt,receiptFields)});
      if(!existing.has(id))writeReceiptValue(db,editionId,receiptKind(matchId),id,receipt);
    }
    for(const {receipt_id:id} of current)if(!receiptValues.has(id))obsoleteReceiptIds.push(id);
  }
  const keys:Record<string,string[]>={
    snow_tournament_battle_state:["edition_id","match_id"],
    snow_tournament_battle_participant_sides:["edition_id","match_id","side"],snow_tournament_battle_participants:["edition_id","match_id","side","position"],
    snow_tournament_battle_assignment_sides:["edition_id","match_id","side"],snow_tournament_battle_assignment_members:["edition_id","match_id","side","resident_id"],
    snow_tournament_battle_assignments:["edition_id","match_id","side","resident_id","position"],
    snow_tournament_battle_units:["edition_id","match_id","unit_id"],snow_tournament_battle_unit_blocking:["edition_id","match_id","unit_id","position"],
    snow_tournament_battle_effects:["edition_id","match_id","position"],snow_tournament_battle_cooldowns:["edition_id","match_id","cooldown_key"],
    snow_tournament_battle_waves:["edition_id","match_id"],snow_tournament_battle_wave_ticks:["edition_id","match_id","position"],
    snow_tournament_battle_wave_releases:["edition_id","match_id","position"],snow_tournament_battle_wave_units:["edition_id","match_id","release_position","position"],
    snow_tournament_visual_frames:["edition_id","match_id"],snow_tournament_visual_events:["edition_id","match_id","position"],
    snow_tournament_visual_targets:["edition_id","match_id","event_position","position"],snow_tournament_battle_receipts:["edition_id","match_id","receipt_id"],
    snow_tournament_battle_receipt_history:["edition_id","match_id","position"],snow_tournament_battle_receipt_index:["edition_id","match_id","request_id"],
  };
  // Appended receipts join the stored history without rewriting it; a tick-scoped
  // restore carries only the receipts created in this tick.
  if(append) {
    const battleId=String(battle.battleId);
    const basePosition=(db.prepare("SELECT MAX(position)+1 AS n FROM snow_tournament_battle_receipt_history WHERE edition_id=? AND match_id=?")
      .get(editionId,matchId) as {n:number|null}|undefined)?.n??0;
    const receiptKeys=["edition_id","match_id","receipt_id"];
    const receiptColumns=[...receiptKeys,...Object.keys(packRow({},receiptFields))];
    const upsertReceipt=db.prepare(`INSERT INTO snow_tournament_battle_receipts (${receiptColumns.join(",")}) VALUES (${receiptColumns.map(()=>"?").join(",")})
      ON CONFLICT(edition_id,match_id,receipt_id) DO UPDATE SET ${receiptColumns.filter(column=>!receiptKeys.includes(column)).map(column=>column+"=excluded."+column).join(",")}`);
    const addReceipt=(id:string,receipt:DomainObject)=>{
      const row:DomainObject={edition_id:editionId,match_id:matchId,receipt_id:id,...packRow(receipt,receiptFields)};
      upsertReceipt.run(...receiptColumns.map(column=>row[column]??null));
      writeReceiptValue(db,editionId,receiptKind(matchId),id,receipt);
    };
    const addHistory=db.prepare("INSERT INTO snow_tournament_battle_receipt_history (edition_id,match_id,position,receipt_id) VALUES (?,?,?,?)");
    const addIndex=db.prepare(`INSERT INTO snow_tournament_battle_receipt_index (edition_id,match_id,request_id,receipt_id) VALUES (?,?,?,?)
      ON CONFLICT(edition_id,match_id,request_id) DO UPDATE SET receipt_id=excluded.receipt_id`);
    let position=basePosition;
    for(const receipt of battle.commandLog??[] as DomainObject[]) {
      const id=key("log",battleId,String(position));
      addReceipt(id,receipt);addHistory.run(editionId,matchId,position,id);position++;
    }
    for(const [request,receipt] of Object.entries(battle.processedCommands??{}) as [string,DomainObject][]) {
      const id=key("processed",battleId,request);
      addReceipt(id,receipt);addIndex.run(editionId,matchId,request,id);processedIds.set(request,id);
    }
  }
  applyRowPlans(db,scope,(append?battleStateTables:tableNames).map(table=>({table,keys:keys[table],rows:rows[table]} as RowPlan)),baseline?.rows);
  const remove=db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?");
  if(baseline) {
    for(const [id,value] of desiredExtras)if(!isDeepStrictEqual(baseline.extras.get(id),value))writeReceiptValue(db,editionId,extraKind(matchId),id,value);
    for(const id of baseline.extras.keys())if(!desiredExtras.has(id))remove.run(editionId,extraKind(matchId),id);
  } else {
    const previousExtras=readReceiptValues(db,editionId,extraKind(matchId));
    for(const [id,value] of desiredExtras)if(!isDeepStrictEqual(previousExtras.get(id),value))writeReceiptValue(db,editionId,extraKind(matchId),id,value);
    for(const id of previousExtras.keys())if(!desiredExtras.has(id))remove.run(editionId,extraKind(matchId),id);
  }
  for(const id of obsoleteReceiptIds)remove.run(editionId,receiptKind(matchId),id);
  return processedIds;
}

/** Reattaches the stored command receipts to a tick-scoped battle before a full
 *  save, keeping the original order and idempotent replay index intact. */
export function hydrateBattleCommandHistory(db:Database.Database,editionId:string,matchId:string,battle:DomainObject):void {
  if(!Array.isArray(battle.commandLog))battle.commandLog=[];
  if(!battle.processedCommands || typeof battle.processedCommands!=="object")battle.processedCommands=Object.create(null);
  const receipts=readReceiptValues(db,editionId,receiptKind(matchId));
  const stored=grabHistoryRows(db,editionId,matchId).map(row=>receipts.get(row.receipt_id));
  const processed:DomainObject=Object.create(null);
  for(const row of grabIndexRows(db,editionId,matchId))processed[row.request_id]=receipts.get(row.receipt_id);
  Object.assign(processed,battle.processedCommands);
  battle.commandLog=[...stored,...battle.commandLog];
  battle.processedCommands=processed;
}
const grabHistoryRows=(db:Database.Database,editionId:string,matchId:string)=>
  getRows(db,"snow_tournament_battle_receipt_history",editionId,matchId,"position");
const grabIndexRows=(db:Database.Database,editionId:string,matchId:string)=>
  getRows(db,"snow_tournament_battle_receipt_index",editionId,matchId,"request_id");

/** Remove the old battle when the existing host state has no active round. */
export function removeBattleRows(db:Database.Database,editionId:string,matchId:string):void {
  for(const table of [...battleTables].reverse())
    db.prepare(`DELETE FROM "${table}" WHERE edition_id=? AND match_id=?`).run(editionId,matchId);
  db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind IN (?,?)")
    .run(editionId,receiptKind(matchId),extraKind(matchId));
}

/** Restores the real engine's state and original receipt ordering. When `collect`
 *  is given, the raw rows and receipt extras read here are returned as the save
 *  baseline for the same transaction, and command history can be left unread. */
function readBattleState(db:Database.Database,editionId:string,matchId:string,options:BattleReadOptions={}):DomainObject|null {
  const collect=options.collect,rows=collect?.rows;
  const grab=(table:string,order:string,existing?:DomainObject[])=>{
    const result=existing??getRows(db,table,editionId,matchId,order);
    if(rows)rows[table]=result;
    return result;
  };
  const [state]=grab("snow_tournament_battle_state","battle_id",options.stateRow?[options.stateRow]:undefined);
  if(!state)return null;
  const [baseMask,costMask,runtimeMask]=String(state.field_presence).split("|");
  const battle=unpackRow({...state,field_presence:baseMask},battleFields),extra=readReceiptValues(db,editionId,extraKind(matchId));
  if(collect)collect.extras=extra;
  putExtras(battle,extra.get("battle"));
  if(battle.cost && typeof battle.cost==="object"){battle.cost=unpackRow({...state,field_presence:costMask},costFields);putExtras(battle.cost,extra.get("cost"));}
  if(battle.runtime && typeof battle.runtime==="object"){battle.runtime=unpackRow({...state,field_presence:runtimeMask},runtimeFields);putExtras(battle.runtime,extra.get("runtime"));}
  if(battle.participants && typeof battle.participants==="object") {
    battle.participants={};
    for(const row of grab("snow_tournament_battle_participant_sides","position"))battle.participants[row.side]=[];
    for(const row of grab("snow_tournament_battle_participants","side,position"))battle.participants[row.side].push(row.resident_id);
  }
  if(battle.assignments && typeof battle.assignments==="object") {
    battle.assignments={};
    for(const row of grab("snow_tournament_battle_assignment_sides","position"))battle.assignments[row.side]={};
    for(const row of grab("snow_tournament_battle_assignment_members","side,position"))battle.assignments[row.side][row.resident_id]=[];
    for(const row of grab("snow_tournament_battle_assignments","side,resident_id,position"))battle.assignments[row.side][row.resident_id].push(row.skill);
  }
  if(battle.units && typeof battle.units==="object") {
    battle.units={};
    for(const row of grab("snow_tournament_battle_units","unit_id")) {
      const [unitMask,shieldMask,skillMask]=String(row.field_presence).split("|");
      const unit=unpackRow({...row,field_presence:unitMask},unitFields);putExtras(unit,extra.get(key("unit",row.unit_id)));
      if(unit.shield && typeof unit.shield==="object"){unit.shield=unpackRow({...row,field_presence:shieldMask},shieldFields);putExtras(unit.shield,extra.get(key("unit-shield",row.unit_id)));}
      if(unit.unitSkill && typeof unit.unitSkill==="object"){unit.unitSkill=unpackRow({...row,field_presence:skillMask},skillFields);putExtras(unit.unitSkill,extra.get(key("unit-skill",row.unit_id)));}
      if(Array.isArray(unit.blocking))unit.blocking=[];Object.defineProperty(battle.units,row.unit_id,{value:unit,enumerable:true,writable:true,configurable:true});
    }
    for(const row of grab("snow_tournament_battle_unit_blocking","unit_id,position"))battle.units[row.unit_id].blocking.push(row.blocked_unit_id);
  }
  if(Array.isArray(battle.effects))battle.effects=grab("snow_tournament_battle_effects","position").map(row=>{const effect=unpackRow(row,effectFields);putExtras(effect,extra.get(key("effect",String(row.position))));return effect;});
  if(battle.cooldowns && typeof battle.cooldowns==="object") {
    battle.cooldowns={};
    for(const row of grab("snow_tournament_battle_cooldowns","cooldown_key"))
      Object.defineProperty(battle.cooldowns,row.cooldown_key,{value:row.ready_tick,enumerable:true,writable:true,configurable:true});
  }
  if(battle.systemWaves && typeof battle.systemWaves==="object") {
    const [row]=grab("snow_tournament_battle_waves","next_wave");
    const [waveMask,unitMask]=String(row!.field_presence).split("|"),waves=unpackRow({...row,field_presence:waveMask},waveFields);putExtras(waves,extra.get("waves"));
    if(waves.unit && typeof waves.unit==="object"){waves.unit=unpackRow({...row,field_presence:unitMask},waveUnitFields);putExtras(waves.unit,extra.get("wave-unit"));}
    if(Array.isArray(waves.ticks))waves.ticks=grab("snow_tournament_battle_wave_ticks","position").map(row=>row.tick);
    if(Array.isArray(waves.releases)) {
      waves.releases=grab("snow_tournament_battle_wave_releases","position").map(row=>{const v=unpackRow(row,waveReleaseFields);putExtras(v,extra.get(key("release",String(row.position))));return v;});
      for(const row of grab("snow_tournament_battle_wave_units","release_position,position"))waves.releases[row.release_position].unitIds.push(row.unit_id);
    }
    battle.systemWaves=waves;
  }
  if(battle.lastVisualFrame && typeof battle.lastVisualFrame==="object") {
    const [row]=grab("snow_tournament_visual_frames","tick"),frame=unpackRow(row!,frameFields);putExtras(frame,extra.get("frame"));
    if(Array.isArray(frame.events)) {
      frame.events=grab("snow_tournament_visual_events","position").map(event=>{
        const [eventMask,sourceMask]=String(event.field_presence).split("|"),v=unpackRow({...event,field_presence:eventMask},eventFields);putExtras(v,extra.get(key("event",String(event.position))));
        if(v.source && typeof v.source==="object"){v.source=unpackRow({...event,field_presence:sourceMask},sourceFields);putExtras(v.source,extra.get(key("source",String(event.position))));}
        return v;
      });
      for(const target of grab("snow_tournament_visual_targets","event_position,position")) {
        const v=unpackRow(target,targetFields);putExtras(v,extra.get(key("target",String(target.event_position),String(target.position))));frame.events[target.event_position].targets.push(v);
      }
    }
    battle.lastVisualFrame=frame;
  }
  // Command history is only read by paths that replay or rewrite it; a plain tick
  // keeps the log untouched in its own tables.
  if(options.commandHistory===false)return battle;
  const receipts=readReceiptValues(db,editionId,receiptKind(matchId));
  if(Array.isArray(battle.commandLog))battle.commandLog=grab("snow_tournament_battle_receipt_history","position").map(row=>receipts.get(row.receipt_id));
  if(battle.processedCommands && typeof battle.processedCommands==="object") {
    battle.processedCommands={};
    for(const row of grab("snow_tournament_battle_receipt_index","request_id"))
      Object.defineProperty(battle.processedCommands,row.request_id,{value:receipts.get(row.receipt_id),enumerable:true,writable:true,configurable:true});
  }
  return battle;
}

export function readBattleRows(db:Database.Database,editionId:string,matchId:string):DomainObject|null {
  return readBattleState(db,editionId,matchId,{commandHistory:true});
}

/** The battle-state row alone carries every field the tick decision needs. */
export function readBattleHeaderRow(stateRow:DomainObject):DomainObject|null {
  const [baseMask,costMask,runtimeMask]=String(stateRow.field_presence).split("|");
  const battle=unpackRow({...stateRow,field_presence:baseMask},battleFields);
  if(battle.cost && typeof battle.cost==="object")battle.cost=unpackRow({...stateRow,field_presence:costMask},costFields);
  if(battle.runtime && typeof battle.runtime==="object")battle.runtime=unpackRow({...stateRow,field_presence:runtimeMask},runtimeFields);
  return battle;
}

/** The per-second tick needs the live battle but not its command receipt history;
 *  the read rows double as the save baseline so the tick writes without re-reading. */
export function readBattleTickRows(db:Database.Database,editionId:string,matchId:string,stateRow:DomainObject):{battle:DomainObject;baseline:BattleBaseline}|null {
  const baseline:BattleBaseline={rows:{},extras:new Map()};
  const battle=readBattleState(db,editionId,matchId,{stateRow,commandHistory:false,collect:baseline});
  if(!battle)return null;
  // The engine records every accepted command; a tick-scoped restore starts from
  // an empty log and new receipts are appended by the saving path.
  if(!battle.commandLog)battle.commandLog=[];
  if(!battle.processedCommands || typeof battle.processedCommands!=="object")battle.processedCommands=Object.create(null);
  return {battle,baseline};
}

import type Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";
import { applyRowPlans, packRow, unpackRow, type DomainObject, type FieldMapping, type RowPlan } from "./relational-rows.js";
import { readReceiptValue, readReceiptValues, writeReceiptValue } from "./relational-values.js";
import { readBattleRows, saveBattleRows, removeBattleRows } from "./relational-battle.js";

const runtimeFields:FieldMapping=[["teamIds","_teams"],["owner","owner"],["lastSeenAt","last_seen_at"],["matchAt","match_at"],
  ["choiceTeamId","choice_team_id"],["attackers","_attackers"],["lineups","_lineups"],["chat","_chat"],
  ["suspendedUntil","suspended_until"],["rounds","_rounds"],["active","_active"]];
const lineupFields:FieldMapping=[["entries","_entries"],["confirmed","confirmed"],["revision","revision"]];
const entryFields:FieldMapping=[["member","resident_id"],["skills","_skills"]];
const chatFields:FieldMapping=[["order","_order"],["turn","turn"],["until","until_at"],["messages","_messages"],
  ["receipts","_receipts"],["readThrough","_read_through"]];
const messageFields:FieldMapping=[["residentId","resident_id"],["text","text"],["at","at"]];
const terminalFields:FieldMapping=[["battleId","battle_id"],["rulesVersion","rules_version"],["attackSideId","attack_side_id"],
  ["defendSideId","defend_side_id"],["status","status"],["endReason","end_reason"],["tick","tick"],["coreHp","core_hp"],
  ["surrenderedBy","surrendered_by"],["finishedAt","finished_at"],["participants","_participants"]];
const participantFields:FieldMapping=[["attack","_attack"],["defend","_defend"]];
const attackFields:FieldMapping=[["residentId","attack_resident_id"],["human","attack_human"]];
const defendFields:FieldMapping=[["residentId","defend_resident_id"],["human","defend_human"]];
const activeFields:FieldMapping=[["index","game_index"],["battle","_battle"],["members","_members"],["ready","_ready"],["npc","_npc"],
  ["prepareUntil","prepare_until"],["nextTickAt","next_tick_at"],["lastReadyAt","last_ready_at"],["batches","_batches"],
  ["waitAt","_wait_at"],["waitIds","_wait_ids"],["commanded","_commanded"],["commandRevision","_command_revision"]];
const memberFields:FieldMapping=[["attack","attack_resident_id"],["defend","defend_resident_id"]];
const sideFields:FieldMapping=[["waitAt","wait_at"],["waitIds","wait_id"],["commanded","commanded"],["commandRevision","command_revision"]];
const batchFields:FieldMapping=[["payload","_payload"],["receipts","_receipts"]];
const actionFields:FieldMapping=[["type","action_type"],["unitType","unit_type"],["lane","lane"],["cell","cell"],["unitId","unit_id"],["skill","skill"]];
const key=(...parts:string[])=>parts.map(part=>part.length+":"+part).join("");
const extraKind=(matchId:string)=>"runtime-extra:"+matchId;
const receiptKind=(matchId:string)=>"batch-receipt:"+matchId;
const encodeOrder=(keys:string[])=>keys.map(name=>name.length+":"+name).join("");
function decodeOrder(encoded:string):string[] {
  const result:string[]=[];let offset=0;
  while(offset<encoded.length){const split=encoded.indexOf(":",offset),size=Number(encoded.slice(offset,split));
    const start=split+1;result.push(encoded.slice(start,start+size));offset=start+size;}
  return result;
}
const extra=(value:DomainObject,fields:FieldMapping)=>{
  const known=new Set(fields.map(([name])=>name));return Object.fromEntries(Object.entries(value).filter(([name])=>!known.has(name)));
};
function applyExtra(target:DomainObject,value:unknown) {
  if(value && typeof value==="object")for(const [name,item] of Object.entries(value))
    Object.defineProperty(target,name,{value:item,enumerable:true,writable:true,configurable:true});
}
const own=(obj:unknown,key:string)=>!!obj && typeof obj==="object" && Object.hasOwn(obj,key);
const getRows=(db:Database.Database,table:string,editionId:string,matchId:string,order:string)=>
  db.prepare(`SELECT * FROM "${table}" WHERE edition_id=? AND match_id=? ORDER BY ${order}`).all(editionId,matchId) as DomainObject[];
const tables=[
  "snow_tournament_runtime_details","snow_tournament_runtime_teams","snow_tournament_runtime_attackers",
  "snow_tournament_lineups","snow_tournament_lineup_entries","snow_tournament_lineup_skills",
  "snow_tournament_team_chats","snow_tournament_chat_order","snow_tournament_chat_messages","snow_tournament_chat_receipts",
  "snow_tournament_chat_read_positions","snow_tournament_runtime_rounds","snow_tournament_active_rounds",
  "snow_tournament_active_participants","snow_tournament_active_side_state","snow_tournament_command_batches",
  "snow_tournament_batch_actions","snow_tournament_batch_receipts"];
const scopeKeys=["edition_id","match_id"];
const keys:Record<string,string[]>={
  snow_tournament_runtime_details:scopeKeys,snow_tournament_runtime_teams:[...scopeKeys,"position"],snow_tournament_runtime_attackers:[...scopeKeys,"position"],
  snow_tournament_lineups:[...scopeKeys,"team_slot"],snow_tournament_lineup_entries:[...scopeKeys,"team_slot","position"],
  snow_tournament_lineup_skills:[...scopeKeys,"team_slot","entry_position","position"],
  snow_tournament_team_chats:[...scopeKeys,"team_slot"],snow_tournament_chat_order:[...scopeKeys,"team_slot","position"],
  snow_tournament_chat_messages:[...scopeKeys,"team_slot","position"],snow_tournament_chat_receipts:[...scopeKeys,"team_slot","receipt_key"],
  snow_tournament_chat_read_positions:[...scopeKeys,"team_slot","resident_id"],snow_tournament_runtime_rounds:[...scopeKeys,"position"],
  snow_tournament_active_rounds:scopeKeys,snow_tournament_active_participants:[...scopeKeys,"kind","position"],
  snow_tournament_active_side_state:[...scopeKeys,"side"],snow_tournament_command_batches:[...scopeKeys,"batch_key"],
  snow_tournament_batch_actions:[...scopeKeys,"batch_key","position"],snow_tournament_batch_receipts:[...scopeKeys,"batch_key","position"]
};

/** Persists the host's existing runtime as individual domain rows. */
export function saveRuntimeRows(db:Database.Database,editionId:string,matchId:string,value:DomainObject,existingBase=false):void {
  if(!existingBase)db.prepare("INSERT INTO snow_tournament_match_runtime(edition_id,match_id) VALUES(?,?) ON CONFLICT(edition_id,match_id) DO NOTHING").run(editionId,matchId);
  const scope={edition_id:editionId,match_id:matchId};
  const rows:Record<string,DomainObject[]>=Object.fromEntries(tables.map(name=>[name,[]]));
  const put=(table:string,row:DomainObject)=>rows[table]!.push({...scope,...row});
  const extras=new Map<string,unknown>(),receipts=new Map<string,unknown>();
  const remember=(id:string,item:DomainObject|undefined,fields:FieldMapping)=>{
    if(!item || typeof item!=="object")return;const remaining=extra(item,fields);if(Object.keys(remaining).length)extras.set(id,remaining);
  };
  put("snow_tournament_runtime_details",packRow(value,runtimeFields));remember("root",value,runtimeFields);
  (value.teamIds??[]).forEach((team:string,position:number)=>put("snow_tournament_runtime_teams",{position,team_id:team}));
  (value.attackers??[]).forEach((team:string,position:number)=>put("snow_tournament_runtime_attackers",{position,team_id:team}));
  for(const [slot,lineup] of Object.entries(value.lineups??{}) as [string,DomainObject][]) {
    put("snow_tournament_lineups",{team_slot:slot,...packRow(lineup,lineupFields)});remember(key("lineup",slot),lineup,lineupFields);
    (lineup.entries??[]).forEach((entry:DomainObject,position:number)=>{
      put("snow_tournament_lineup_entries",{team_slot:slot,position,...packRow(entry,entryFields)});remember(key("entry",slot,String(position)),entry,entryFields);
      (entry.skills??[]).forEach((skill:string,index:number)=>put("snow_tournament_lineup_skills",{team_slot:slot,entry_position:position,position:index,skill}));
    });
  }
  for(const [slot,chat] of Object.entries(value.chat??{}) as [string,DomainObject][]) {
    put("snow_tournament_team_chats",{team_slot:slot,...packRow(chat,chatFields)});remember(key("chat",slot),chat,chatFields);
    (chat.order??[]).forEach((id:string,position:number)=>put("snow_tournament_chat_order",{team_slot:slot,position,resident_id:id}));
    (chat.messages??[]).forEach((message:DomainObject,position:number)=>{
      put("snow_tournament_chat_messages",{team_slot:slot,position,...packRow(message,messageFields)});remember(key("message",slot,String(position)),message,messageFields);
    });
    for(const [id,encoded] of Object.entries(chat.receipts??{}) as [string,string][]) {
      const content=JSON.parse(encoded);put("snow_tournament_chat_receipts",{team_slot:slot,receipt_key:id,text:content,text_is_null:Number(content===null)});
    }
    for(const [id,count] of Object.entries(chat.readThrough??{}))put("snow_tournament_chat_read_positions",{team_slot:slot,resident_id:id,read_through:count});
  }
  (value.rounds??[]).forEach((round:DomainObject|null,position:number)=>{
    if(round===null){put("snow_tournament_runtime_rounds",{position,is_null:1,field_presence:""});return;}
    const row=packRow(round,terminalFields),participants=packRow(round.participants??{},participantFields);
    const attack=packRow(round.participants?.attack??{},attackFields),defend=packRow(round.participants?.defend??{},defendFields);
    row.field_presence+="|"+participants.field_presence+"|"+attack.field_presence+"|"+defend.field_presence;
    delete participants.field_presence;delete attack.field_presence;delete defend.field_presence;
    put("snow_tournament_runtime_rounds",{position,is_null:0,...row,...participants,...attack,...defend});
    remember(key("round",String(position)),round,terminalFields);remember(key("participants",String(position)),round.participants,participantFields);
    remember(key("participant",String(position),"attack"),round.participants?.attack,attackFields);
    remember(key("participant",String(position),"defend"),round.participants?.defend,defendFields);
  });
  const active=value.active;
  if(active && typeof active==="object") {
    const row=packRow(active,activeFields),members=packRow(active.members??{},memberFields);
    row.field_presence+="|"+members.field_presence;delete members.field_presence;
    put("snow_tournament_active_rounds",{...row,...members});remember("active",active,activeFields);remember("members",active.members,memberFields);
    for(const kind of ["ready","npc"]) (active[kind]??[]).forEach((id:string,position:number)=>
      put("snow_tournament_active_participants",{kind,position,resident_id:id}));
    const sides=new Set<string>();for(const name of ["waitAt","waitIds","commanded","commandRevision"])
      for(const side of Object.keys(active[name]??{}))sides.add(side);
    for(const side of sides){const sideValue:DomainObject={};for(const name of ["waitAt","waitIds","commanded","commandRevision"])
      if(own(active[name],side))sideValue[name]=active[name][side];
      put("snow_tournament_active_side_state",{side,...packRow(sideValue,sideFields)});
    }
    Object.entries(active.batches??{}).forEach(([id,batchValue],position)=>{
      const batch=batchValue as DomainObject,[actions,waitTicks]=JSON.parse(batch.payload);
      put("snow_tournament_command_batches",{batch_key:id,position,wait_ticks:waitTicks,...packRow(batch,batchFields)});
      remember(key("batch",id),batch,batchFields);
      actions.forEach((action:DomainObject,index:number)=>{
        put("snow_tournament_batch_actions",{batch_key:id,position:index,...packRow(action,actionFields),field_order:encodeOrder(Object.keys(action))});
        remember(key("action",id,String(index)),action,actionFields);
      });
      (batch.receipts??[]).forEach((receipt:unknown,index:number)=>{
        const receiptId=key("batch",id,String(index));receipts.set(receiptId,receipt);
        put("snow_tournament_batch_receipts",{batch_key:id,position:index,receipt_id:receiptId});
      });
    });
  }
  applyRowPlans(db,scope,tables.map(table=>({table,keys:keys[table],rows:rows[table]} as RowPlan)));
  const updateValues=(kind:string,wanted:Map<string,unknown>)=>{
    const previous=readReceiptValues(db,editionId,kind);
    for(const [id,item] of wanted)if(!isDeepStrictEqual(previous.get(id),item))writeReceiptValue(db,editionId,kind,id,item);
    const remove=db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?");
    for(const id of previous.keys())if(!wanted.has(id))remove.run(editionId,kind,id);
  };
  updateValues(extraKind(matchId),extras);updateValues(receiptKind(matchId),receipts);
  if(active?.battle)saveBattleRows(db,editionId,matchId,active.battle);else removeBattleRows(db,editionId,matchId);
}

/** Existing snapshot expiry removes the parent and all of its domain rows. */
export function deleteRuntimeRows(db:Database.Database,editionId:string,matchId:string):boolean {
  return db.prepare("DELETE FROM snow_tournament_match_runtime WHERE edition_id=? AND match_id=?").run(editionId,matchId).changes>0;
}

function decodeRuntimeRound(row:DomainObject,readExtra:(id:string)=>unknown):DomainObject|null {
  if(row.is_null)return null;const [mask,participantsMask,attackMask,defendMask]=String(row.field_presence).split("|");
  const round=unpackRow({...row,field_presence:mask},terminalFields);applyExtra(round,readExtra(key("round",String(row.position))));
  if(round.participants && typeof round.participants==="object"){
    const participants=unpackRow({...row,field_presence:participantsMask},participantFields);applyExtra(participants,readExtra(key("participants",String(row.position))));
    if(participants.attack && typeof participants.attack==="object"){participants.attack=unpackRow({...row,field_presence:attackMask},attackFields);applyExtra(participants.attack,readExtra(key("participant",String(row.position),"attack")));}
    if(participants.defend && typeof participants.defend==="object"){participants.defend=unpackRow({...row,field_presence:defendMask},defendFields);applyExtra(participants.defend,readExtra(key("participant",String(row.position),"defend")));}
    round.participants=participants;
  }return round;
}

/** A terminal check reads only this round, never its battle, chat or command history. */
export function readRuntimeRound(db:Database.Database,editionId:string,matchId:string,index:number):DomainObject|null {
  const row=db.prepare(`SELECT r.* FROM snow_tournament_runtime_rounds r
    JOIN snow_tournament_runtime_details d ON d.edition_id=r.edition_id AND d.match_id=r.match_id
    WHERE r.edition_id=? AND r.match_id=? AND r.position=? AND substr(d.field_presence,?,1)='a'`)
    .get(editionId,matchId,index,runtimeFields.findIndex(([name])=>name==="rounds")+1) as DomainObject|undefined;
  return row?decodeRuntimeRound(row,id=>readReceiptValue(db,editionId,extraKind(matchId),id)):null;
}

/** Restores the host state without storing any edition- or match-sized JSON document. */
export function readRuntimeRows(db:Database.Database,editionId:string,matchId:string):DomainObject|null {
  const [root]=getRows(db,"snow_tournament_runtime_details",editionId,matchId,"edition_id");if(!root)return null;
  const value=unpackRow(root,runtimeFields),extras=readReceiptValues(db,editionId,extraKind(matchId));applyExtra(value,extras.get("root"));
  if(Array.isArray(value.teamIds))value.teamIds=getRows(db,"snow_tournament_runtime_teams",editionId,matchId,"position").map(row=>row.team_id);
  if(Array.isArray(value.attackers))value.attackers=getRows(db,"snow_tournament_runtime_attackers",editionId,matchId,"position").map(row=>row.team_id);
  if(value.lineups && typeof value.lineups==="object") {
    value.lineups={};
    const lineupRows=getRows(db,"snow_tournament_lineups",editionId,matchId,"team_slot");
    for(const row of lineupRows){
      const lineup=unpackRow(row,lineupFields);applyExtra(lineup,extras.get(key("lineup",row.team_slot)));value.lineups[row.team_slot]=lineup;
    }
    if(lineupRows.length)for(const row of getRows(db,"snow_tournament_lineup_entries",editionId,matchId,"team_slot,position")){
      const entry=unpackRow(row,entryFields);applyExtra(entry,extras.get(key("entry",row.team_slot,String(row.position))));value.lineups[row.team_slot].entries.push(entry);
    }
    if(lineupRows.length)for(const row of getRows(db,"snow_tournament_lineup_skills",editionId,matchId,"team_slot,entry_position,position"))
      value.lineups[row.team_slot].entries[row.entry_position].skills.push(row.skill);
  }
  if(value.chat && typeof value.chat==="object") {
    value.chat={};for(const row of getRows(db,"snow_tournament_team_chats",editionId,matchId,"team_slot")){
      const chat=unpackRow(row,chatFields);applyExtra(chat,extras.get(key("chat",row.team_slot)));value.chat[row.team_slot]=chat;
    }
    for(const row of getRows(db,"snow_tournament_chat_order",editionId,matchId,"team_slot,position"))value.chat[row.team_slot].order.push(row.resident_id);
    for(const row of getRows(db,"snow_tournament_chat_messages",editionId,matchId,"team_slot,position")){
      const message=unpackRow(row,messageFields);applyExtra(message,extras.get(key("message",row.team_slot,String(row.position))));value.chat[row.team_slot].messages.push(message);
    }
    for(const row of getRows(db,"snow_tournament_chat_receipts",editionId,matchId,"team_slot,receipt_key"))
      Object.defineProperty(value.chat[row.team_slot].receipts,row.receipt_key,{value:JSON.stringify(row.text_is_null?null:row.text),enumerable:true,writable:true,configurable:true});
    for(const row of getRows(db,"snow_tournament_chat_read_positions",editionId,matchId,"team_slot,resident_id"))
      Object.defineProperty(value.chat[row.team_slot].readThrough,row.resident_id,{value:row.read_through,enumerable:true,writable:true,configurable:true});
  }
  if(Array.isArray(value.rounds))value.rounds=getRows(db,"snow_tournament_runtime_rounds",editionId,matchId,"position")
    .map(row=>decodeRuntimeRound(row,id=>extras.get(id)));
  if(value.active && typeof value.active==="object") {
    const [row]=getRows(db,"snow_tournament_active_rounds",editionId,matchId,"edition_id");
    const [mask,membersMask]=String(row!.field_presence).split("|");const active=unpackRow({...row,field_presence:mask},activeFields);
    applyExtra(active,extras.get("active"));
    if(active.members && typeof active.members==="object"){active.members=unpackRow({...row,field_presence:membersMask},memberFields);applyExtra(active.members,extras.get("members"));}
    for(const item of getRows(db,"snow_tournament_active_participants",editionId,matchId,"kind,position"))active[item.kind].push(item.resident_id);
    for(const item of getRows(db,"snow_tournament_active_side_state",editionId,matchId,"side")){
      const side=unpackRow(item,sideFields);for(const [name,entry] of Object.entries(side))
        Object.defineProperty(active[name],item.side,{value:entry,enumerable:true,writable:true,configurable:true});
    }
    const batchRows=getRows(db,"snow_tournament_command_batches",editionId,matchId,"position");
    const batchActions=batchRows.length?getRows(db,"snow_tournament_batch_actions",editionId,matchId,"batch_key,position"):[];
    const batchReceipts=batchRows.length?getRows(db,"snow_tournament_batch_receipts",editionId,matchId,"batch_key,position"):[];
    const storedReceipts=batchRows.length?readReceiptValues(db,editionId,receiptKind(matchId)):new Map<string,unknown>();
    for(const batchRow of batchRows){
      const batch=unpackRow(batchRow,batchFields);applyExtra(batch,extras.get(key("batch",batchRow.batch_key)));
      const actions=batchActions.filter(item=>item.batch_key===batchRow.batch_key).map(item=>{
        const raw=unpackRow(item,actionFields);applyExtra(raw,extras.get(key("action",item.batch_key,String(item.position))));
        const ordered:DomainObject={};for(const name of decodeOrder(item.field_order))
          Object.defineProperty(ordered,name,{value:raw[name],enumerable:true,writable:true,configurable:true});
        return ordered;
      });
      batch.payload=JSON.stringify([actions,batchRow.wait_ticks]);
      if(Array.isArray(batch.receipts))batch.receipts=batchReceipts.filter(item=>item.batch_key===batchRow.batch_key).map(item=>storedReceipts.get(item.receipt_id));
      Object.defineProperty(active.batches,batchRow.batch_key,{value:batch,enumerable:true,writable:true,configurable:true});
    }
    if(active.battle && typeof active.battle==="object")active.battle=readBattleRows(db,editionId,matchId);
    value.active=active;
  }
  return value;
}

/** Data needed by the public lobby; battle units, commands and private chat stay in their own tables. */
export type PublicRuntime = {
  matchAt:number;lastSeenAt:number;teamIds:string[];attackers:string[]|null;
  lineups:Record<string,{entries:{member:string}[]}>;
  active:{index:number;members:Record<"attack"|"defend",string>;npc:string[];started:boolean}|null;
};
export function publicRuntimeFromState(value:DomainObject):PublicRuntime {
  const lineups:PublicRuntime["lineups"]={};
  for(const [slot,lineup] of Object.entries(value.lineups??{}) as [string,DomainObject][])
    if(lineup.entries?.length)lineups[slot]={entries:lineup.entries.map((entry:DomainObject)=>({member:entry.member}))};
  const active=value.active;
  return {matchAt:value.matchAt,lastSeenAt:value.lastSeenAt,teamIds:[...value.teamIds],
    attackers:value.attackers===null?null:[...value.attackers],lineups,
    active:active?{index:active.index,members:{attack:active.members.attack,defend:active.members.defend},
      npc:[...active.npc],started:active.battle.runtime?.started===true}:null};
}
export function readPublicRuntimes(db:Database.Database,editionId:string,matchId?:string):Map<string,PublicRuntime> {
  const where=matchId===undefined?"edition_id=?":"edition_id=? AND match_id=?";
  const parameters=matchId===undefined?[editionId]:[editionId,matchId];
  const invalid=db.prepare(`SELECT match_id,raw_text FROM snow_tournament_invalid_runtime WHERE ${where}`).all(...parameters) as {match_id:string;raw_text:string}[];
  const invalidValues=invalid.map(row=>({id:row.match_id,value:JSON.parse(row.raw_text)}));
  const base=db.prepare(`SELECT r.match_id,r.match_at,r.last_seen_at,r.field_presence,a.game_index,a.attack_resident_id,a.defend_resident_id,b.started
    FROM snow_tournament_runtime_details r
    LEFT JOIN snow_tournament_active_rounds a ON a.edition_id=r.edition_id AND a.match_id=r.match_id
    LEFT JOIN snow_tournament_battle_state b ON b.edition_id=r.edition_id AND b.match_id=r.match_id
    WHERE ${where.replaceAll("edition_id","r.edition_id").replaceAll("match_id","r.match_id")}`).all(...parameters) as DomainObject[];
  const result=new Map<string,PublicRuntime>();
  for(const row of base)result.set(row.match_id,{matchAt:row.match_at,lastSeenAt:row.last_seen_at,teamIds:[],
    attackers:row.field_presence[5]==="a"?[]:null,lineups:{},
    active:row.field_presence[10]==="o"?{index:row.game_index,members:{attack:row.attack_resident_id,defend:row.defend_resident_id},npc:[],started:row.started===1}:null});
  for(const row of db.prepare(`SELECT match_id,team_id FROM snow_tournament_runtime_teams WHERE ${where} ORDER BY match_id,position`).all(...parameters) as DomainObject[])
    result.get(row.match_id)!.teamIds.push(row.team_id);
  for(const row of db.prepare(`SELECT match_id,team_id FROM snow_tournament_runtime_attackers WHERE ${where} ORDER BY match_id,position`).all(...parameters) as DomainObject[])
    result.get(row.match_id)!.attackers!.push(row.team_id);
  for(const row of db.prepare(`SELECT match_id,team_slot,resident_id FROM snow_tournament_lineup_entries WHERE ${where} ORDER BY match_id,team_slot,position`).all(...parameters) as DomainObject[]) {
    const state=result.get(row.match_id)!;(state.lineups[row.team_slot]??={entries:[]}).entries.push({member:row.resident_id});
  }
  for(const row of db.prepare(`SELECT match_id,resident_id FROM snow_tournament_active_participants WHERE ${where} AND kind='npc' ORDER BY match_id,position`).all(...parameters) as DomainObject[])
    result.get(row.match_id)!.active!.npc.push(row.resident_id);
  for(const row of invalidValues)if(row.value!==null) {
    const value=row.value,active=value.active;
    result.set(row.id,{matchAt:value.matchAt,lastSeenAt:value.lastSeenAt,teamIds:value.teamIds,attackers:value.attackers,lineups:value.lineups,
      active:active?{index:active.index,members:active.members,npc:active.npc,started:active.battle.runtime?.started===true}:null});
  }
  return result;
}

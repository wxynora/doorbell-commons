import type Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";
import { readReceiptValue, writeReceiptValue } from "./relational-values.js";

type RecordValue = Record<string, any>;
type Mapping = ReadonlyArray<readonly [string,string]>;
type Plan = {table:string;keys:string[];rows:RecordValue[]};

/* The row order is the original array order; the mask preserves absent/null fields. */
const editionFields:Mapping=[["id","edition_id"],["title","title"],["rulesVersion","rules_version"],["phase","phase"],
  ["registrationOpenAt","registration_open_at"],["registrationCloseAt","registration_close_at"],
  ["teamFormationCloseAt","team_formation_close_at"],["revision","revision"],["battleStarted","battle_started"],
  ["deadlineConfirmationAt","deadline_confirmation_at"],["calendar","_calendar"],["bracket","_bracket"],
  ["enrollments","_enrollments"],["teams","_teams"],["offers","_offers"],["registrationRounds","_registration_rounds"],
  ["matches","_matches"],["standings","_standings"],["receipts","_receipts"],["roundRecovery","_round_recovery"],
  ["settledGrants","_settled_grants"],["settledFurniture","_settled_furniture"],["settledHarvest","_settled_harvest"],
  ["technical","_technical"],["rewards","_rewards"]];
const teamFields:Mapping=[["id","team_id"],["name","name"],["captainId","captain_id"],["status","status"],["drawOrder","draw_order"],["members","_members"],["ineligibleMemberIds","_ineligible"]];
const memberFields:Mapping=[["id","resident_id"],["name","name"],["npc","npc"]];
const enrollmentFields:Mapping=[["id","resident_id"],["name","name"],["registeredAt","registered_at"]];
const offerFields:Mapping=[["id","offer_id"],["teamId","team_id"],["residentId","resident_id"],["kind","kind"],["fromCaptainId","from_captain_id"]];
const registrationFields:Mapping=[["id","round_id"],["teamId","team_id"],["status","status"],["deadlineConfirmedAt","deadline_confirmed_at"],["members","_members"],["confirmed","_confirmed"],["payments","_payments"]];
const paymentFields:Mapping=[["paymentId","payment_id"],["residentId","resident_id"],["charge","charge"],["refund","refund"],["attemptRevision","attempt_revision"]];
const matchFields:Mapping=[["id","match_id"],["stage","stage"],["round","round_number"],["teamAId","team_a_id"],["teamBId","team_b_id"],
  ["attackerTeamId","attacker_team_id"],["defenderTeamId","defender_team_id"],["status","status"],["scheduledAt","scheduled_at"],
  ["originalScheduledAt","original_scheduled_at"],["winnerTeamId","winner_team_id"],["score","_score"],["games","_games"],
  ["plannedAttackers","_planned_attackers"],["replays","_replays"]];
const gameFields:Mapping=[["battleId","battle_id"],["attackerTeamId","attacker_team_id"],["defenderTeamId","defender_team_id"],
  ["winnerTeamId","winner_team_id"],["coreDamage","core_damage"],["breakTimeRemaining","break_time_remaining"],
  ["endTick","end_tick"],["endReason","end_reason"],["finishedAt","finished_at"],["participants","_participants"]];
const standingFields:Mapping=[["teamId","team_id"],["rank","rank"],["points","points"],["wins","wins"],["losses","losses"],
  ["gameDifference","game_difference"],["averageCoreDamage","average_core_damage"],["averageBreakTimeRemaining","average_break_time_remaining"]];
const replayFields:Mapping=[["gameIndex","game_index"],["voidedBattleId","voided_battle_id"],["replayBattleId","replay_battle_id"],
  ["randomSeed","random_seed"],["reason","reason"],["at","at"]];
const calendarFields:Mapping=[["roundRobinAt","_rounds"],["semifinalAt","semifinal_at"],["finalAt","final_at"]];
const bracketFields:Mapping=[["semifinalMatchIds","_semifinals"],["finalMatchId","final_match_id"],["championTeamId","champion_team_id"]];

const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
function mask(value:RecordValue,fields:Mapping):string {
  return fields.map(([key])=>{
    if(!Object.hasOwn(value,key) || value[key]===undefined)return "0";
    if(value[key]===null)return "n";
    if(Array.isArray(value[key]))return "a";
    if(typeof value[key]==="object")return "o";
    if(typeof value[key]==="boolean")return value[key]?"t":"f";
    return typeof value[key]==="number"?"d":"s";
  }).join("");
}
function pack(value:RecordValue,fields:Mapping):RecordValue {
  const row:RecordValue={field_presence:mask(value,fields)};
  for(const [key,column] of fields)if(!column.startsWith("_")) {
    const v=value[key];row[column]=typeof v==="boolean"?(v?1:0):v??null;
  }
  return row;
}
function unpack(row:RecordValue,fields:Mapping):RecordValue {
  const value:RecordValue={};
  fields.forEach(([key,column],index)=>{
    const type=row.field_presence[index];
    if(type==="n")value[key]=null;
    else if(type==="t")value[key]=true;
    else if(type==="f")value[key]=false;
    else if(type==="d"||type==="s")value[key]=row[column];
    else if(type==="a")value[key]=[];
    else if(type==="o")value[key]={};
  });
  return value;
}
function positionRows(db:Database.Database,table:string,editionId:string):RecordValue[] {
  return db.prepare(`SELECT * FROM ${quote(table)} WHERE edition_id=? ORDER BY position`).all(editionId) as RecordValue[];
}
function syncPlans(db:Database.Database,editionId:string,plans:Plan[]):void {
  const obsolete:{plan:Plan;keys:RecordValue[]}[]=[];
  for(const plan of plans) {
    const prior=db.prepare(`SELECT ${plan.keys.map(quote).join(",")} FROM ${quote(plan.table)} WHERE edition_id=?`).all(editionId) as RecordValue[];
    const same=(a:RecordValue,b:RecordValue)=>plan.keys.every(key=>a[key]===b[key]);
    obsolete.push({plan,keys:prior.filter(row=>!plan.rows.some(wanted=>same(row,wanted)))});
    for(const row of plan.rows) {
      const cols=Object.keys(row),changed=cols.filter(column=>!plan.keys.includes(column));
      const sql=`INSERT INTO ${quote(plan.table)} (${cols.map(quote).join(",")}) VALUES (${cols.map(()=>"?").join(",")})
        ON CONFLICT (${plan.keys.map(quote).join(",")}) DO UPDATE SET ${changed.map(column=>`${quote(column)}=excluded.${quote(column)}`).join(",")}
        WHERE ${changed.map(column=>`${quote(column)} IS NOT excluded.${quote(column)}`).join(" OR ")}`;
      db.prepare(sql).run(...cols.map(column=>row[column]??null));
    }
  }
  for(const {plan,keys} of obsolete.reverse())for(const row of keys) {
    db.prepare(`DELETE FROM ${quote(plan.table)} WHERE ${plan.keys.map(key=>quote(key)+"=?").join(" AND ")}`).run(...plan.keys.map(key=>row[key]));
  }
}

function saveVariant(db:Database.Database,editionId:string,kind:string,id:string,value:unknown):void {
  const found=db.prepare("SELECT 1 FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=? AND path='$'").get(editionId,kind,id);
  if(found && isDeepStrictEqual(readReceiptValue(db,editionId,kind,id),value))return;
  writeReceiptValue(db,editionId,kind,id,value);
}
function readVariant(db:Database.Database,editionId:string,kind:string,id:string):unknown {
  return readReceiptValue(db,editionId,kind,id);
}
const mapSections=["receipts","roundRecovery","settledGrants","settledFurniture","settledHarvest"] as const;
function saveMap(db:Database.Database,editionId:string,section:string,value:RecordValue):void {
  const prior=db.prepare("SELECT entry_key FROM snow_tournament_edition_map_entries WHERE edition_id=? AND section=?").all(editionId,section) as {entry_key:string}[];
  const keys=new Set(Object.keys(value));
  const index=db.prepare(`INSERT INTO snow_tournament_edition_map_entries(edition_id,section,entry_key,position,encoding)
    VALUES (?,?,?,?,?) ON CONFLICT(edition_id,section,entry_key) DO UPDATE SET position=excluded.position,encoding=excluded.encoding
    WHERE position IS NOT excluded.position OR encoding IS NOT excluded.encoding`);
  Object.entries(value).forEach(([key,raw],position)=>{
    let entry=raw,encoding:string|null=null;
    if(section==="receipts" && raw && typeof raw==="object" && typeof (raw as RecordValue).input==="string") {
      entry={...(raw as RecordValue),input:JSON.parse((raw as RecordValue).input)};
      encoding="input";
    }
    if(section==="roundRecovery" && raw && typeof raw==="object") {
      const copy=structuredClone(raw as RecordValue);
      db.prepare("DELETE FROM snow_tournament_recovery_runtime_encoding WHERE edition_id=? AND recovery_key=?").run(editionId,key);
      const record=db.prepare("INSERT INTO snow_tournament_recovery_runtime_encoding(edition_id,recovery_key,position,raw_text) VALUES (?,?,?,?)");
      (copy.voided??[]).forEach((item:RecordValue,index:number)=>{
        if(typeof item.runtime!=="string")return;
        record.run(editionId,key,index,item.runtime);item.runtime=null;
      });
      entry=copy;
    }
    index.run(editionId,section,key,position,encoding);
    saveVariant(db,editionId,"edition-map:"+section,key,entry);
  });
  for(const old of prior)if(!keys.has(old.entry_key)) {
    db.prepare("DELETE FROM snow_tournament_edition_map_entries WHERE edition_id=? AND section=? AND entry_key=?").run(editionId,section,old.entry_key);
    db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?").run(editionId,"edition-map:"+section,old.entry_key);
    if(section==="roundRecovery")db.prepare("DELETE FROM snow_tournament_recovery_runtime_encoding WHERE edition_id=? AND recovery_key=?").run(editionId,old.entry_key);
  }
}
function readMap(db:Database.Database,editionId:string,section:string):RecordValue {
  const entries=db.prepare("SELECT entry_key,encoding FROM snow_tournament_edition_map_entries WHERE edition_id=? AND section=? ORDER BY position").all(editionId,section) as {entry_key:string;encoding:string|null}[];
  const result:RecordValue={};
  for(const {entry_key:key,encoding} of entries) {
    const value=readVariant(db,editionId,"edition-map:"+section,key) as RecordValue;
    if(encoding==="input")value.input=JSON.stringify(value.input);
    if(section==="roundRecovery") {
      const records=db.prepare("SELECT position,raw_text FROM snow_tournament_recovery_runtime_encoding WHERE edition_id=? AND recovery_key=?").all(editionId,key) as {position:number;raw_text:string}[];
      for(const record of records)value.voided[record.position].runtime=record.raw_text;
    }
    Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});
  }
  return result;
}
function saveExtras(db:Database.Database,editionId:string,kind:string,id:string,value:RecordValue,fields:Mapping):void {
  const keys=new Set(fields.map(([key])=>key));
  const extra=Object.fromEntries(Object.entries(value).filter(([key])=>!keys.has(key)));
  if(Object.keys(extra).length)saveVariant(db,editionId,"extra:"+kind,id,extra);
  else db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?").run(editionId,"extra:"+kind,id);
}
function addExtras(db:Database.Database,editionId:string,kind:string,id:string,value:RecordValue):void {
  const extra=readVariant(db,editionId,"extra:"+kind,id);
  if(extra && typeof extra==="object")for(const [key,entry] of Object.entries(extra))
    Object.defineProperty(value,key,{value:entry,enumerable:true,writable:true,configurable:true});
}
function cleanExtras(db:Database.Database,editionId:string,value:RecordValue):void {
  const kept:Record<string,Set<string>>={
    "extra:edition":new Set(["root",...(value.calendar&&typeof value.calendar==="object"?["calendar"]:[]),...(value.bracket&&typeof value.bracket==="object"?["bracket"]:[])]),
    "extra:enrollment":new Set((value.enrollments??[]).map((_:unknown,i:number)=>String(i))),
    "extra:team":new Set((value.teams??[]).map((v:RecordValue)=>v.id)),
    "extra:team-member":new Set((value.teams??[]).flatMap((v:RecordValue)=>(v.members??[]).map((_:unknown,i:number)=>v.id+":"+i))),
    "extra:offer":new Set((value.offers??[]).map((_:unknown,i:number)=>String(i))),
    "extra:registration":new Set((value.registrationRounds??[]).map((v:RecordValue)=>v.id)),
    "extra:payment":new Set((value.registrationRounds??[]).flatMap((v:RecordValue)=>(v.payments??[]).map((_:unknown,i:number)=>v.id+":"+i))),
    "extra:match":new Set((value.matches??[]).map((v:RecordValue)=>v.id)),
    "extra:game":new Set((value.matches??[]).flatMap((v:RecordValue)=>(v.games??[]).map((_:unknown,i:number)=>v.id+":"+i))),
    "game-participants":new Set((value.matches??[]).flatMap((v:RecordValue)=>(v.games??[]).flatMap((g:RecordValue,i:number)=>g.participants!==undefined?[v.id+":"+i]:[]))),
    "extra:replay":new Set((value.matches??[]).flatMap((v:RecordValue)=>(v.replays??[]).map((_:unknown,i:number)=>v.id+":"+i))),
    "extra:standing":new Set((value.standings??[]).map((_:unknown,i:number)=>String(i))),
  };
  const find=db.prepare("SELECT DISTINCT receipt_id FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=?");
  const remove=db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?");
  for(const [kind,ids] of Object.entries(kept))for(const row of find.all(editionId,kind) as {receipt_id:string}[])
    if(!ids.has(row.receipt_id))remove.run(editionId,kind,row.receipt_id);
}

/** All calls must use the same database transaction as the business operation. */
export function saveEditionRows(db:Database.Database,editionId:string,registrationOpenAt:string,value:RecordValue,existingBase=false):void {
  if(existingBase)db.prepare("UPDATE snow_tournament_editions SET registration_open_at=? WHERE edition_id=?").run(registrationOpenAt,editionId);
  else db.prepare(`INSERT INTO snow_tournament_editions(edition_id,registration_open_at) VALUES (?,?)
    ON CONFLICT(edition_id) DO UPDATE SET registration_open_at=excluded.registration_open_at
    WHERE registration_open_at IS NOT excluded.registration_open_at`).run(editionId,registrationOpenAt);
  const details=pack(value,editionFields);delete details.registration_open_at;
  details.edition_id=editionId;details.semifinal_at=value.calendar?.semifinalAt??null;details.final_at=value.calendar?.finalAt??null;
  details.final_match_id=value.bracket?.finalMatchId??null;details.champion_team_id=value.bracket?.championTeamId??null;
  const rows:Record<string,RecordValue[]>={
    snow_tournament_edition_details:[details],snow_tournament_calendar_rounds:[],snow_tournament_enrollments:[],
    snow_tournament_teams:[],snow_tournament_team_members:[],snow_tournament_team_ineligible_members:[],
    snow_tournament_team_offers:[],snow_tournament_registration_rounds:[],snow_tournament_registration_members:[],
    snow_tournament_payments:[],snow_tournament_match_records:[],snow_tournament_match_game_results:[],
    snow_tournament_match_planned_attackers:[],snow_tournament_match_replays:[],snow_tournament_standings:[],snow_tournament_semifinals:[],
  };
  const put=(table:string,row:RecordValue)=>rows[table]!.push({edition_id:editionId,...row});
  (value.calendar?.roundRobinAt??[]).forEach((roundAt:string,position:number)=>put("snow_tournament_calendar_rounds",{position,round_at:roundAt}));
  (value.enrollments??[]).forEach((entry:RecordValue,position:number)=>{put("snow_tournament_enrollments",{position,...pack(entry,enrollmentFields)});saveExtras(db,editionId,"enrollment",String(position),entry,enrollmentFields);});
  (value.teams??[]).forEach((team:RecordValue,position:number)=>{
    put("snow_tournament_teams",{position,...pack(team,teamFields)});saveExtras(db,editionId,"team",team.id,team,teamFields);
    (team.members??[]).forEach((member:RecordValue,index:number)=>{put("snow_tournament_team_members",{team_id:team.id,position:index,...pack(member,memberFields)});saveExtras(db,editionId,"team-member",team.id+":"+index,member,memberFields);});
    (team.ineligibleMemberIds??[]).forEach((id:string,index:number)=>put("snow_tournament_team_ineligible_members",{team_id:team.id,position:index,resident_id:id}));
  });
  (value.offers??[]).forEach((offer:RecordValue,position:number)=>{put("snow_tournament_team_offers",{position,...pack(offer,offerFields)});saveExtras(db,editionId,"offer",String(position),offer,offerFields);});
  (value.registrationRounds??[]).forEach((round:RecordValue,position:number)=>{
    put("snow_tournament_registration_rounds",{position,...pack(round,registrationFields)});saveExtras(db,editionId,"registration",round.id,round,registrationFields);
    for(const kind of ["members","confirmed"])(round[kind]??[]).forEach((id:string,index:number)=>put("snow_tournament_registration_members",{round_id:round.id,kind,position:index,resident_id:id}));
    (round.payments??[]).forEach((payment:RecordValue,index:number)=>{put("snow_tournament_payments",{round_id:round.id,position:index,...pack(payment,paymentFields)});saveExtras(db,editionId,"payment",round.id+":"+index,payment,paymentFields);});
  });
  (value.matches??[]).forEach((match:RecordValue,position:number)=>{
    const row={position,...pack(match,matchFields),score_a:match.score?.[0]??null,score_b:match.score?.[1]??null};
    put("snow_tournament_match_records",row);saveExtras(db,editionId,"match",match.id,match,matchFields);
    (match.games??[]).forEach((game:RecordValue,index:number)=>{
      const result={match_id:match.id,position:index,...pack(game,gameFields),
        attack_resident_id:game.participants?.attack?.residentId??null,attack_human:game.participants?.attack?.human===undefined?null:Number(game.participants.attack.human),
        defend_resident_id:game.participants?.defend?.residentId??null,defend_human:game.participants?.defend?.human===undefined?null:Number(game.participants.defend.human)};
      put("snow_tournament_match_game_results",result);saveExtras(db,editionId,"game",match.id+":"+index,game,gameFields);
      if(game.participants!==undefined)saveVariant(db,editionId,"game-participants",match.id+":"+index,game.participants);
    });
    (match.plannedAttackers??[]).forEach((teamId:string,index:number)=>put("snow_tournament_match_planned_attackers",{match_id:match.id,position:index,team_id:teamId}));
    (match.replays??[]).forEach((replay:RecordValue,index:number)=>{put("snow_tournament_match_replays",{match_id:match.id,position:index,...pack(replay,replayFields)});saveExtras(db,editionId,"replay",match.id+":"+index,replay,replayFields);});
  });
  (value.standings??[]).forEach((standing:RecordValue,position:number)=>{put("snow_tournament_standings",{position,...pack(standing,standingFields)});saveExtras(db,editionId,"standing",String(position),standing,standingFields);});
  (value.bracket?.semifinalMatchIds??[]).forEach((id:string,position:number)=>put("snow_tournament_semifinals",{position,match_id:id}));
  const keys:Record<string,string[]>={
    snow_tournament_edition_details:["edition_id"],snow_tournament_calendar_rounds:["edition_id","position"],snow_tournament_enrollments:["edition_id","position"],
    snow_tournament_teams:["edition_id","team_id"],snow_tournament_team_members:["edition_id","team_id","position"],
    snow_tournament_team_ineligible_members:["edition_id","team_id","position"],snow_tournament_team_offers:["edition_id","position"],
    snow_tournament_registration_rounds:["edition_id","round_id"],snow_tournament_registration_members:["edition_id","round_id","kind","position"],
    snow_tournament_payments:["edition_id","round_id","position"],snow_tournament_match_records:["edition_id","match_id"],
    snow_tournament_match_game_results:["edition_id","match_id","position"],snow_tournament_match_planned_attackers:["edition_id","match_id","position"],
    snow_tournament_match_replays:["edition_id","match_id","position"],snow_tournament_standings:["edition_id","position"],snow_tournament_semifinals:["edition_id","position"],
  };
  syncPlans(db,editionId,Object.entries(rows).map(([table,values])=>({table,keys:keys[table]!,rows:values})));
  for(const key of mapSections)saveMap(db,editionId,key,value[key] && typeof value[key]==="object" && !Array.isArray(value[key])?value[key]:{});
  for(const key of ["technical","rewards"]) {
    if(Object.hasOwn(value,key))saveVariant(db,editionId,"edition-section",key,value[key]);
    else db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind='edition-section' AND receipt_id=?").run(editionId,key);
  }
  saveExtras(db,editionId,"edition","root",value,editionFields);
  const saveChildMask=db.prepare(`INSERT INTO snow_tournament_edition_child_masks(edition_id,child,field_presence) VALUES (?,?,?)
    ON CONFLICT(edition_id,child) DO UPDATE SET field_presence=excluded.field_presence WHERE field_presence IS NOT excluded.field_presence`);
  for(const [child,fields] of [["calendar",calendarFields],["bracket",bracketFields]] as const) {
    if(value[child] && typeof value[child]==="object") {
      saveChildMask.run(editionId,child,mask(value[child],fields));saveExtras(db,editionId,"edition",child,value[child],fields);
    } else db.prepare("DELETE FROM snow_tournament_edition_child_masks WHERE edition_id=? AND child=?").run(editionId,child);
  }
  cleanExtras(db,editionId,value);
}

/** Only used after the migration has stored the old edition in relational rows. */
export function readEditionRows(db:Database.Database,editionId:string):RecordValue|null {
  const base=db.prepare("SELECT registration_open_at FROM snow_tournament_editions WHERE edition_id=?").get(editionId) as RecordValue|undefined;
  const row=db.prepare("SELECT * FROM snow_tournament_edition_details WHERE edition_id=?").get(editionId) as RecordValue|undefined;
  if(!base || !row)return null;
  const value=unpack({...row,registration_open_at:base.registration_open_at},editionFields);addExtras(db,editionId,"edition","root",value);
  if(value.calendar && typeof value.calendar==="object") {
    const m=db.prepare("SELECT field_presence FROM snow_tournament_edition_child_masks WHERE edition_id=? AND child='calendar'").get(editionId) as RecordValue;
    value.calendar=unpack({...row,field_presence:m.field_presence},calendarFields);
    if(Array.isArray(value.calendar.roundRobinAt))value.calendar.roundRobinAt=positionRows(db,"snow_tournament_calendar_rounds",editionId).map(r=>r.round_at);
    addExtras(db,editionId,"edition","calendar",value.calendar);
  }
  if(value.bracket && typeof value.bracket==="object") {
    const m=db.prepare("SELECT field_presence FROM snow_tournament_edition_child_masks WHERE edition_id=? AND child='bracket'").get(editionId) as RecordValue;
    value.bracket=unpack({...row,field_presence:m.field_presence},bracketFields);
    if(Array.isArray(value.bracket.semifinalMatchIds))value.bracket.semifinalMatchIds=positionRows(db,"snow_tournament_semifinals",editionId).map(r=>r.match_id);
    addExtras(db,editionId,"edition","bracket",value.bracket);
  }
  if(Array.isArray(value.enrollments))value.enrollments=positionRows(db,"snow_tournament_enrollments",editionId).map((r,index)=>{const v=unpack(r,enrollmentFields);addExtras(db,editionId,"enrollment",String(index),v);return v;});
  if(Array.isArray(value.teams))value.teams=positionRows(db,"snow_tournament_teams",editionId).map(r=>{
    const team=unpack(r,teamFields);addExtras(db,editionId,"team",team.id,team);
    if(Array.isArray(team.members))team.members=(db.prepare("SELECT * FROM snow_tournament_team_members WHERE edition_id=? AND team_id=? ORDER BY position").all(editionId,team.id) as RecordValue[]).map((m,index)=>{const v=unpack(m,memberFields);addExtras(db,editionId,"team-member",team.id+":"+index,v);return v;});
    if(Array.isArray(team.ineligibleMemberIds))team.ineligibleMemberIds=(db.prepare("SELECT resident_id FROM snow_tournament_team_ineligible_members WHERE edition_id=? AND team_id=? ORDER BY position").all(editionId,team.id) as RecordValue[]).map(m=>m.resident_id);
    return team;
  });
  if(Array.isArray(value.offers))value.offers=positionRows(db,"snow_tournament_team_offers",editionId).map((r,index)=>{const v=unpack(r,offerFields);addExtras(db,editionId,"offer",String(index),v);return v;});
  if(Array.isArray(value.registrationRounds))value.registrationRounds=positionRows(db,"snow_tournament_registration_rounds",editionId).map(r=>{
    const round=unpack(r,registrationFields);addExtras(db,editionId,"registration",round.id,round);
    for(const kind of ["members","confirmed"])if(Array.isArray(round[kind]))round[kind]=(db.prepare("SELECT resident_id FROM snow_tournament_registration_members WHERE edition_id=? AND round_id=? AND kind=? ORDER BY position").all(editionId,round.id,kind) as RecordValue[]).map(p=>p.resident_id);
    if(Array.isArray(round.payments))round.payments=(db.prepare("SELECT * FROM snow_tournament_payments WHERE edition_id=? AND round_id=? ORDER BY position").all(editionId,round.id) as RecordValue[]).map((p,index)=>{const v=unpack(p,paymentFields);addExtras(db,editionId,"payment",round.id+":"+index,v);return v;});
    return round;
  });
  if(Array.isArray(value.matches))value.matches=positionRows(db,"snow_tournament_match_records",editionId).map(r=>{
    const match=unpack(r,matchFields);addExtras(db,editionId,"match",match.id,match);
    if(Array.isArray(match.score))match.score=[r.score_a,r.score_b];
    if(Array.isArray(match.games))match.games=(db.prepare("SELECT * FROM snow_tournament_match_game_results WHERE edition_id=? AND match_id=? ORDER BY position").all(editionId,match.id) as RecordValue[]).map((g,index)=>{
      const v=unpack(g,gameFields);addExtras(db,editionId,"game",match.id+":"+index,v);
      if(v.participants!==undefined)v.participants=readVariant(db,editionId,"game-participants",match.id+":"+index);return v;
    });
    if(Array.isArray(match.plannedAttackers))match.plannedAttackers=(db.prepare("SELECT team_id FROM snow_tournament_match_planned_attackers WHERE edition_id=? AND match_id=? ORDER BY position").all(editionId,match.id) as RecordValue[]).map(p=>p.team_id);
    if(Array.isArray(match.replays))match.replays=(db.prepare("SELECT * FROM snow_tournament_match_replays WHERE edition_id=? AND match_id=? ORDER BY position").all(editionId,match.id) as RecordValue[]).map((p,index)=>{const v=unpack(p,replayFields);addExtras(db,editionId,"replay",match.id+":"+index,v);return v;});
    return match;
  });
  if(Array.isArray(value.standings))value.standings=positionRows(db,"snow_tournament_standings",editionId).map((r,index)=>{const v=unpack(r,standingFields);addExtras(db,editionId,"standing",String(index),v);return v;});
  for(const key of mapSections)if(value[key] && typeof value[key]==="object" && !Array.isArray(value[key]))value[key]=readMap(db,editionId,key);
  for(const key of ["technical","rewards"])if(Object.hasOwn(value,key))value[key]=readVariant(db,editionId,"edition-section",key);
  return value;
}

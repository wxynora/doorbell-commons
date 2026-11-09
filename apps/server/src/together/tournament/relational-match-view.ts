import type Database from "better-sqlite3";
import { readReceiptValue } from "./relational-values.js";

/** Read only the fields the match host needs; the returned view is never saved as an edition. */
export function readMatchEditionView(db:Database.Database,editionId:string,matchId:string) {
  const head=db.prepare(`SELECT e.edition_id,e.registration_open_at,d.title,d.rules_version,d.phase
    FROM snow_tournament_editions e JOIN snow_tournament_edition_details d ON d.edition_id=e.edition_id
    WHERE e.edition_id=?`).get(editionId) as Record<string,any>|undefined;
  if(!head)return null;
  const matchRows=db.prepare("SELECT * FROM snow_tournament_match_records WHERE edition_id=? ORDER BY position").all(editionId) as Record<string,any>[];
  const matches=matchRows.map(row=>({id:row.match_id,stage:row.stage,teamAId:row.team_a_id,teamBId:row.team_b_id,
    attackerTeamId:row.attacker_team_id,status:row.status,scheduledAt:row.scheduled_at}));
  const match=matches.find(row=>row.id===matchId);
  const teamIds=[match?.teamAId,match?.teamBId];
  const teamRows=db.prepare("SELECT * FROM snow_tournament_teams WHERE edition_id=? AND team_id IN (?,?) ORDER BY position").all(editionId,...teamIds) as Record<string,any>[];
  const teams=teamRows.map(row=>({id:row.team_id,name:row.name,captainId:row.captain_id,status:row.status,drawOrder:row.draw_order,
    members:[] as {id:string;name:string;npc?:boolean}[],ineligibleMemberIds:[] as string[]}));
  const byId=new Map(teams.map(team=>[team.id,team]));
  const memberRows=db.prepare(`SELECT * FROM snow_tournament_team_members WHERE edition_id=? AND team_id IN (?,?) ORDER BY team_id,position`)
    .all(editionId,...teamIds) as Record<string,any>[];
  for(const row of memberRows){const member:{id:string;name:string;npc?:boolean}={id:row.resident_id,name:row.name};
    if(row.field_presence[2]==="t")member.npc=true;else if(row.field_presence[2]==="f")member.npc=false;
    byId.get(row.team_id)!.members.push(member);
  }
  const ineligible=db.prepare(`SELECT team_id,resident_id FROM snow_tournament_team_ineligible_members WHERE edition_id=? AND team_id IN (?,?) ORDER BY team_id,position`)
    .all(editionId,...teamIds) as Record<string,any>[];
  for(const row of ineligible)byId.get(row.team_id)!.ineligibleMemberIds.push(row.resident_id);
  const standings=(db.prepare("SELECT team_id,rank FROM snow_tournament_standings WHERE edition_id=? ORDER BY position").all(editionId) as Record<string,any>[])
    .map(row=>({teamId:row.team_id,rank:row.rank}));
  return {id:head.edition_id,registrationOpenAt:head.registration_open_at,title:head.title,
    rulesVersion:head.rules_version,phase:head.phase,teams,matches,standings};
}

export function readTechnicalView(db:Database.Database,editionId:string):{phase:string;technical:any}|null {
  const row=db.prepare("SELECT phase FROM snow_tournament_edition_details WHERE edition_id=?").get(editionId) as {phase:string}|undefined;
  return row?{phase:row.phase,technical:readReceiptValue(db,editionId,"edition-section","technical")}:null;
}

export function readRoundRecovery(db:Database.Database,editionId:string,matchId:string,index:number):unknown {
  const key=JSON.stringify([matchId,index]);
  const entry=readReceiptValue(db,editionId,"edition-map:roundRecovery",key) as Record<string,any>|undefined;
  if(!entry)return undefined;
  const records=db.prepare("SELECT position,raw_text FROM snow_tournament_recovery_runtime_encoding WHERE edition_id=? AND recovery_key=?")
    .all(editionId,key) as {position:number;raw_text:string}[];
  for(const record of records)entry.voided[record.position].runtime=record.raw_text;
  return entry;
}

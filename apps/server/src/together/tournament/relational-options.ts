import type Database from "better-sqlite3";
import { packRow, unpackRow, type DomainObject, type FieldMapping } from "./relational-rows.js";
import { readReceiptValue, writeReceiptValue } from "./relational-values.js";

export const SNOW_OPTION_SCHEMA = `
  CREATE TABLE snow_tournament_option_details (
    option_id TEXT PRIMARY KEY REFERENCES snow_tournament_options(option_id) ON DELETE CASCADE,
    kind TEXT, revision INTEGER, team_id TEXT, resident_id TEXT, offer_id TEXT, match_id TEXT,
    battle_id TEXT, serial INTEGER, side TEXT, field_presence TEXT NOT NULL,
    has_input INTEGER NOT NULL, has_result INTEGER NOT NULL
  );
  CREATE TABLE snow_tournament_option_requirements (
    option_id TEXT NOT NULL REFERENCES snow_tournament_options(option_id) ON DELETE CASCADE,
    position INTEGER NOT NULL, requirement TEXT NOT NULL, PRIMARY KEY(option_id,position)
  );
  CREATE TRIGGER snow_tournament_option_delete_values AFTER DELETE ON snow_tournament_options
  BEGIN
    DELETE FROM snow_tournament_receipt_values WHERE edition_id=OLD.edition_id AND receipt_id=OLD.option_id
      AND receipt_kind IN ('option-context','option-extra','option-input','option-result');
  END;
`;
const fields:FieldMapping=[["editionId","edition_id"],["kind","kind"],["revision","revision"],["context","_context"],
  ["teamId","team_id"],["residentId","resident_id"],["offerId","offer_id"],["matchId","match_id"],
  ["battleId","battle_id"],["serial","serial"],["side","side"],["requires","_requires"]];
const extras=(binding:DomainObject)=>{const known=new Set(fields.map(([name])=>name));
  return Object.fromEntries(Object.entries(binding).filter(([name])=>!known.has(name)));};
const kinds={context:"option-context",extra:"option-extra",input:"option-input",result:"option-result"};
type OptionRow={option_id:string;edition_id:string;resident_id:string;binding:DomainObject;hasInput:boolean;input:unknown;hasResult:boolean;result:unknown};

/** Persist one capability binding; the parent identity already exists. */
export function saveOptionBinding(db:Database.Database,id:string,editionId:string,binding:DomainObject):void {
  const row=packRow(binding,fields);delete row.edition_id;
  db.prepare(`INSERT INTO snow_tournament_option_details
    (option_id,kind,revision,team_id,resident_id,offer_id,match_id,battle_id,serial,side,field_presence,has_input,has_result)
    VALUES (@option_id,@kind,@revision,@team_id,@resident_id,@offer_id,@match_id,@battle_id,@serial,@side,@field_presence,0,0)
    ON CONFLICT(option_id) DO NOTHING`).run({option_id:id,...row});
  const put=db.prepare("INSERT INTO snow_tournament_option_requirements(option_id,position,requirement) VALUES(?,?,?)");
  (binding.requires??[]).forEach((requirement:string,position:number)=>put.run(id,position,requirement));
  if(typeof binding.context==="string")writeReceiptValue(db,editionId,kinds.context,id,JSON.parse(binding.context));
  const extra=extras(binding);if(Object.keys(extra).length)writeReceiptValue(db,editionId,kinds.extra,id,extra);
}

export function issueOption(db:Database.Database,id:string,editionId:string,residentId:string,binding:DomainObject):void {
  db.transaction(()=>{
    const inserted=db.prepare("INSERT INTO snow_tournament_options(option_id,edition_id,resident_id) VALUES(?,?,?) ON CONFLICT(option_id) DO NOTHING")
      .run(id,editionId,residentId);
    if(inserted.changes)saveOptionBinding(db,id,editionId,binding);
  })();
}

export function readOption(db:Database.Database,id:string):OptionRow|null {
  const row=db.prepare(`SELECT o.option_id,o.edition_id,o.resident_id AS owner_id,d.* FROM snow_tournament_options o
    JOIN snow_tournament_option_details d ON d.option_id=o.option_id WHERE o.option_id=?`).get(id) as DomainObject|undefined;
  if(!row)return null;
  const binding=unpackRow(row,fields);
  if(Array.isArray(binding.requires))binding.requires=(db.prepare("SELECT requirement FROM snow_tournament_option_requirements WHERE option_id=? ORDER BY position").all(id) as {requirement:string}[]).map(r=>r.requirement);
  if(row.field_presence[3]==="s")binding.context=JSON.stringify(readReceiptValue(db,row.edition_id,kinds.context,id));
  const extra=readReceiptValue(db,row.edition_id,kinds.extra,id);
  if(extra && typeof extra==="object")for(const [name,value] of Object.entries(extra))
    Object.defineProperty(binding,name,{value,enumerable:true,writable:true,configurable:true});
  return {option_id:id,edition_id:row.edition_id,resident_id:row.owner_id,binding,
    hasInput:!!row.has_input,input:row.has_input?readReceiptValue(db,row.edition_id,kinds.input,id):null,
    hasResult:!!row.has_result,result:row.has_result?readReceiptValue(db,row.edition_id,kinds.result,id):null};
}

export function writeOptionInput(db:Database.Database,id:string,input:unknown):void {
  db.transaction(()=>{
    const row=db.prepare("SELECT edition_id FROM snow_tournament_options WHERE option_id=?").get(id) as {edition_id:string};
    writeReceiptValue(db,row.edition_id,kinds.input,id,input);
    db.prepare("UPDATE snow_tournament_option_details SET has_input=1 WHERE option_id=?").run(id);
  })();
}
export function clearOptionInput(db:Database.Database,id:string):void {
  db.transaction(()=>{
    const row=db.prepare("SELECT edition_id FROM snow_tournament_options WHERE option_id=?").get(id) as {edition_id:string};
    db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?").run(row.edition_id,kinds.input,id);
    db.prepare("UPDATE snow_tournament_option_details SET has_input=0 WHERE option_id=?").run(id);
  })();
}
export function writeOptionResult(db:Database.Database,id:string,result:unknown):void {
  db.transaction(()=>{
    const row=db.prepare("SELECT edition_id FROM snow_tournament_options WHERE option_id=?").get(id) as {edition_id:string};
    writeReceiptValue(db,row.edition_id,kinds.result,id,result);
    db.prepare("UPDATE snow_tournament_option_details SET has_result=1 WHERE option_id=?").run(id);
  })();
}

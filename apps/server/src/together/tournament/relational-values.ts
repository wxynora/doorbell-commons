import type Database from "better-sqlite3";

/*
 * Variable-shaped tool inputs and results are kept as typed value rows scoped
 * to their own receipt. Tournament editions and battle state use domain
 * tables, not this representation.
 */
export const SNOW_RECEIPT_VALUE_SCHEMA = `
  CREATE TABLE snow_tournament_receipt_values (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE, receipt_kind TEXT NOT NULL, receipt_id TEXT NOT NULL,
    path TEXT NOT NULL, parent_path TEXT, key_name TEXT, position INTEGER NOT NULL,
    value_kind TEXT NOT NULL, text_value TEXT, number_value REAL,
    PRIMARY KEY(edition_id,receipt_kind,receipt_id,path)
  )
`;

type ValueRow = {
  path:string;parent_path:string|null;key_name:string|null;position:number;
  value_kind:string;text_value:string|null;number_value:number|null;
};
const childPath=(parent:string,key:string)=>parent+"/"+key.length+":"+key;

export function writeReceiptValue(db:Database.Database,editionId:string,kind:string,id:string,value:unknown):void {
  const rows:ValueRow[]=[];
  const visit=(item:unknown,path:string,parent:string|null,key:string|null,position:number)=>{
    let value_kind:string,text_value:string|null=null,number_value:number|null=null;
    if(item===null)value_kind="null";
    else if(item===undefined)value_kind="undefined";
    else if(Array.isArray(item))value_kind="array";
    else if(typeof item==="object")value_kind="object";
    else if(typeof item==="boolean")value_kind=item?"true":"false";
    else if(typeof item==="number"){value_kind="number";number_value=item;}
    else if(typeof item==="string"){value_kind="text";text_value=item;}
    else throw new TypeError("unsupported_snow_receipt_value");
    rows.push({path,parent_path:parent,key_name:key,position,value_kind,text_value,number_value});
    if(Array.isArray(item))item.forEach((child,index)=>visit(child,childPath(path,String(index)),path,String(index),index));
    else if(item && typeof item==="object")Object.entries(item).forEach(([key,child],index)=>visit(child,childPath(path,key),path,key,index));
  };
  visit(value,"$",null,null,0);
  db.prepare("DELETE FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?").run(editionId,kind,id);
  const insert=db.prepare(`INSERT INTO snow_tournament_receipt_values
    (edition_id,receipt_kind,receipt_id,path,parent_path,key_name,position,value_kind,text_value,number_value)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for(const row of rows)insert.run(editionId,kind,id,row.path,row.parent_path,row.key_name,row.position,row.value_kind,row.text_value,row.number_value);
}

function decodeReceiptValue(rows:ValueRow[]):unknown {
  const values=new Map<string,unknown>();
  for(const row of rows) {
    let value:unknown;
    switch(row.value_kind) {
      case "null":value=null;break;case "undefined":value=undefined;break;
      case "array":value=[];break;case "object":value={};break;
      case "true":value=true;break;case "false":value=false;break;
      case "number":value=row.number_value;break;case "text":value=row.text_value;break;
      default:throw new Error("invalid_snow_receipt_value");
    }
    values.set(row.path,value);
  }
  for(const row of rows.filter(row=>row.parent_path!==null).sort((a,b)=>a.position-b.position)) {
    const parent=values.get(row.parent_path!);
    if(parent===null || typeof parent!=="object")throw new Error("invalid_snow_receipt_parent");
    const value=values.get(row.path);
    if(Array.isArray(parent))parent[Number(row.key_name)]=value;
    else Object.defineProperty(parent,row.key_name!,{value,enumerable:true,writable:true,configurable:true});
  }
  return values.get("$");
}

export function readReceiptValue(db:Database.Database,editionId:string,kind:string,id:string):unknown {
  const rows=db.prepare(`SELECT path,parent_path,key_name,position,value_kind,text_value,number_value
    FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? AND receipt_id=?`).all(editionId,kind,id) as ValueRow[];
  return decodeReceiptValue(rows);
}

export function readReceiptValues(db:Database.Database,editionId:string,kind:string):Map<string,unknown> {
  const rows=db.prepare(`SELECT receipt_id,path,parent_path,key_name,position,value_kind,text_value,number_value
    FROM snow_tournament_receipt_values WHERE edition_id=? AND receipt_kind=? ORDER BY receipt_id`).all(editionId,kind) as (ValueRow & {receipt_id:string})[];
  const grouped=new Map<string,ValueRow[]>();
  for(const row of rows) {
    let entries=grouped.get(row.receipt_id);
    if(!entries){entries=[];grouped.set(row.receipt_id,entries);}
    entries.push(row);
  }
  return new Map([...grouped].map(([id,entries])=>[id,decodeReceiptValue(entries)]));
}

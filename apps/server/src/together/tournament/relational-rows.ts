import type Database from "better-sqlite3";

export type DomainObject = Record<string, any>;
export type FieldMapping = ReadonlyArray<readonly [string,string]>;
export type RowPlan = {table:string;keys:string[];rows:DomainObject[]};
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';

export function packRow(value:DomainObject,fields:FieldMapping):DomainObject {
  const row:DomainObject={};let presence="";
  for(const [key,column] of fields) {
    if(!Object.hasOwn(value,key) || value[key]===undefined){presence+="0";if(!column.startsWith("_"))row[column]=null;continue;}
    const entry=value[key];
    const kind=entry===null?"n":Array.isArray(entry)?"a":typeof entry==="object"?"o":
      typeof entry==="boolean"?(entry?"t":"f"):typeof entry==="number"?"d":"s";
    presence+=kind;
    if(!column.startsWith("_"))row[column]=typeof entry==="boolean"?Number(entry):entry??null;
  }
  row.field_presence=presence;return row;
}
export function unpackRow(row:DomainObject,fields:FieldMapping):DomainObject {
  const result:DomainObject={};
  fields.forEach(([key,column],index)=>{
    const kind=row.field_presence[index];
    if(kind==="n")result[key]=null;else if(kind==="t")result[key]=true;else if(kind==="f")result[key]=false;
    else if(kind==="d"||kind==="s")result[key]=row[column];else if(kind==="a")result[key]=[];else if(kind==="o")result[key]={};
  });
  return result;
}

/** Upsert changed entity rows first; delete removed children before removed parents. */
export function applyRowPlans(db:Database.Database,scope:Record<string,string>,plans:RowPlan[]):void {
  const scopeKeys=Object.keys(scope);
  const scopeWhere=scopeKeys.map(key=>quote(key)+"=?").join(" AND ");
  const removals:{plan:RowPlan;rows:DomainObject[]}[]=[];
  for(const plan of plans) {
    const existing=db.prepare(`SELECT * FROM ${quote(plan.table)} WHERE ${scopeWhere}`).all(...scopeKeys.map(key=>scope[key])) as DomainObject[];
    const identity=(row:DomainObject)=>plan.keys.map(key=>{const value=String(row[key]);return value.length+":"+value;}).join("");
    const oldByKey=new Map(existing.map(row=>[identity(row),row]));
    const wanted=new Set(plan.rows.map(identity));
    removals.push({plan,rows:existing.filter(row=>!wanted.has(identity(row)))});
    const statements=new Map<string,Database.Statement<unknown[]>>();
    for(const row of plan.rows) {
      const old=oldByKey.get(identity(row));
      const columns=Object.keys(row),updates=columns.filter(column=>!plan.keys.includes(column));
      if(old && updates.every(column=>old[column]===(row[column]??null)))continue;
      const signature=columns.map(column=>column.length+":"+column).join("");
      let statement=statements.get(signature);
      if(!statement) {
        const sql=`INSERT INTO ${quote(plan.table)} (${columns.map(quote).join(",")}) VALUES (${columns.map(()=>"?").join(",")})
          ON CONFLICT(${plan.keys.map(quote).join(",")}) DO UPDATE SET ${updates.map(column=>quote(column)+"=excluded."+quote(column)).join(",")}`;
        statement=db.prepare(sql);statements.set(signature,statement);
      }
      statement.run(...columns.map(column=>row[column]??null));
    }
  }
  for(const {plan,rows} of removals.reverse())for(const row of rows)
    db.prepare(`DELETE FROM ${quote(plan.table)} WHERE ${plan.keys.map(key=>quote(key)+"=?").join(" AND ")}`).run(...plan.keys.map(key=>row[key]));
}

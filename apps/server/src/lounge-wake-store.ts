import type Database from "better-sqlite3";
import type { BellWakeRecord } from "./community-database.js";

export type LoungeWakeReason = "lounge_chat" | "game_invitation" | "game_turn" | "game_reaction";
interface Row { wake_id:string; resident_id:string; source_key:string; record_json:string; expires_at:number|null; }
export class LoungeWakeStore {
  constructor(private readonly db:Database.Database) {}
  enqueue(input:{wakeId:string;residentId:string;reason:LoungeWakeReason;sourceKey:string;text:string;now:number;expiresAt?:number;sessionEnteredAt?:number}):BellWakeRecord {
    return this.db.transaction(()=>{
      const old=this.db.prepare("SELECT * FROM lounge_wakes WHERE resident_id=? AND source_key=?").get(input.residentId,input.sourceKey) as Row|undefined;
      if(old)return JSON.parse(old.record_json) as BellWakeRecord;
      if(!input.text.trim())throw new Error("An approved wake message is required");
      const record:BellWakeRecord={wakeId:input.wakeId,residentId:input.residentId,reason:input.reason,status:"pending",createdAt:input.now,endedAt:null,blockReason:null,errorCode:null,purchaseRequestId:null,letterId:null,payload:{text:input.text,...(input.sessionEnteredAt===undefined?{}:{sessionEnteredAt:input.sessionEnteredAt})}};
      this.db.prepare("INSERT INTO lounge_wakes(wake_id,resident_id,source_key,record_json,expires_at) VALUES (?,?,?,?,?)").run(input.wakeId,input.residentId,input.sourceKey,JSON.stringify(record),input.expiresAt??null);
      return record;
    }).immediate();
  }
  get(residentId:string,wakeId:string):BellWakeRecord|undefined {
    const row=this.db.prepare("SELECT record_json FROM lounge_wakes WHERE resident_id=? AND wake_id=?").get(residentId,wakeId) as Pick<Row,"record_json">|undefined;
    return row?JSON.parse(row.record_json) as BellWakeRecord:undefined;
  }
  pending(residentId:string):BellWakeRecord[] {
    return (this.db.prepare("SELECT record_json FROM lounge_wakes WHERE resident_id=? ORDER BY rowid").all(residentId) as Pick<Row,"record_json">[]).map(row=>JSON.parse(row.record_json) as BellWakeRecord).filter(wake=>wake.status==="pending");
  }
  finish(residentId:string,wakeId:string,status:"acked"|"blocked"|"cancelled",now:number,blockReason:string|null=null,errorCode:string|null=null):"changed"|"duplicate"|"conflict"|"missing" {
    return this.db.transaction(()=>{
      const wake=this.get(residentId,wakeId);if(!wake)return "missing";
      if(wake.status===status)return "duplicate";
      if(wake.status!=="pending")return "conflict";
      wake.status=status;wake.endedAt=now;wake.blockReason=blockReason;wake.errorCode=errorCode;
      this.db.prepare("UPDATE lounge_wakes SET record_json=? WHERE resident_id=? AND wake_id=?").run(JSON.stringify(wake),residentId,wakeId);
      return "changed";
    }).immediate();
  }
  cancel(residentId:string,now:number,reason?:LoungeWakeReason):string[] {
    const ids:string[]=[];
    for(const wake of this.pending(residentId))if(reason===undefined||wake.reason===reason){if(this.finish(residentId,wake.wakeId,"cancelled",now)==="changed")ids.push(wake.wakeId);}
    return ids;
  }
  cancelInvalidChat(residentId:string,enteredAt:number|null,now:number):string[] {
    return this.pending(residentId).filter(wake=>wake.reason==="lounge_chat" && (enteredAt===null || wake.payload?.sessionEnteredAt!==enteredAt)).filter(wake=>this.finish(residentId,wake.wakeId,"cancelled",now)==="changed").map(wake=>wake.wakeId);
  }
  expire(residentId:string,now:number):string[] {
    const rows=this.db.prepare("SELECT wake_id FROM lounge_wakes WHERE resident_id=? AND expires_at IS NOT NULL AND expires_at<=?").all(residentId,now) as Pick<Row,"wake_id">[];
    return rows.filter(row=>this.finish(residentId,row.wake_id,"cancelled",now)==="changed").map(row=>row.wake_id);
  }
}

import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { BellWakeSource, BellWakeSourceRecord, BellWakeSourceTransition } from "../../bell-service.js";

type Row = {wake_id:string;resident_id:string;created_at:number;expires_at:number;
  text:string;status:BellWakeSourceRecord["status"];ended_at:number|null;block_reason:string|null;error_code:string|null};
const prefix="snow-reg:";
export const SNOW_TOURNAMENT_REGISTRATION_COPY =
  "❄️ 雪堡锦标赛开报名啦！叫上两位队友，一起打雪仗。报名开放 48 小时，赛程在雪堡赛事大厅。";

export class SnowTournamentRegistrationBell {
  constructor(private readonly db:Database.Database,private readonly eligible:(residentId:string)=>boolean,
    private readonly notify:(residentId:string)=>void,private readonly clock:()=>number=Date.now) {}

  /** Run in the same transaction as edition creation; notification comes after commit. */
  queue(editionId:string,createdAt:number,expiresAt:number): string[] {
    if (createdAt>=expiresAt) return [];
    const residents=this.db.prepare("SELECT resident_id FROM residents ORDER BY resident_id").all() as {resident_id:string}[];
    const ids=residents.map(row=>row.resident_id).filter(this.eligible);
    const insert=this.db.prepare(`INSERT INTO snow_tournament_registration_wakes
      (wake_id,edition_id,resident_id,created_at,expires_at,text) VALUES (?,?,?,?,?,?)
      ON CONFLICT(edition_id,resident_id) DO NOTHING`);
    return ids.filter(residentId=>{
      const key=prefix+createHash("sha256").update(JSON.stringify([editionId,residentId])).digest("hex").slice(0,32);
      return insert.run(key,editionId,residentId,createdAt,expiresAt,SNOW_TOURNAMENT_REGISTRATION_COPY).changes===1;
    });
  }
  publish(ids:readonly string[]) { for (const id of ids) this.notify(id); }
  private find(residentId:string,id:string):Row|undefined {
    if (!id.startsWith(prefix)) return;
    return this.db.prepare("SELECT * FROM snow_tournament_registration_wakes WHERE wake_id=? AND resident_id=?").get(id,residentId) as Row|undefined;
  }
  private project(row:Row): BellWakeSourceRecord {
    const expired=row.status==="pending" && row.expires_at<=this.clock();
    return {wakeId:row.wake_id,residentId:row.resident_id,reason:"together",status:expired?"cancelled":row.status,
      createdAt:row.created_at,endedAt:expired?row.expires_at:row.ended_at,blockReason:row.block_reason,
      errorCode:row.error_code,purchaseRequestId:null,letterId:null,payload:{text:row.text}};
  }
  private finish(residentId:string,id:string,at:number,status:"acked"|"blocked"|"cancelled",reason:string|null=null,error:string|null=null):
    BellWakeSourceTransition | "cancelled" {
    return this.db.transaction(()=>{
      const row=this.find(residentId,id);
      if (!row) return "missing";
      if (row.status===status) return "duplicate";
      if (row.status!=="pending" || (status!=="cancelled" && row.expires_at<=at)) return "conflict";
      this.db.prepare(`UPDATE snow_tournament_registration_wakes SET status=?,ended_at=?,block_reason=?,error_code=? WHERE wake_id=?`)
        .run(status,at,reason,error,id);
      return status;
    })();
  }
  readonly source:BellWakeSource = {
    listPending: residentId => {
      if (!this.eligible(residentId)) return [];
      const rows=this.db.prepare(`SELECT * FROM snow_tournament_registration_wakes WHERE resident_id=? AND status='pending' AND expires_at>?
        ORDER BY created_at,wake_id`).all(residentId,this.clock()) as Row[];
      return rows.map(row=>this.project(row));
    },
    get: (residentId,id) => {
      const row=this.find(residentId,id);
      return row && this.eligible(residentId) ? this.project(row) : undefined;
    },
    acknowledge: (residentId,id,at) => this.finish(residentId,id,at,"acked") as BellWakeSourceTransition,
    block: (residentId,id,at,reason,error) => this.finish(residentId,id,at,"blocked",reason,error) as BellWakeSourceTransition,
    cancel: (residentId,id,at) => {
      const changed=this.finish(residentId,id,at,"cancelled")==="cancelled";
      return {residentId:changed?residentId:null,cancelledWakeId:changed?id:null,cancelledWakeIds:changed?[id]:[]};
    },
  };
}

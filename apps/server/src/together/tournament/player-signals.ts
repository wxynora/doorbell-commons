import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { BellWakeSource, BellWakeSourceRecord, BellWakeSourceTransition } from "../../bell-service.js";
import type { SnowPlayerSignal } from "./match-host.js";

type Ref={editionId:string;matchId:string};
type Row={wake_id:string;signal_key:string;edition_id:string;match_id:string;resident_id:string;kind:SnowPlayerSignal["kind"];
  status:BellWakeSourceRecord["status"];created_at:number;context_count:number;ended_at:number|null;block_reason:string|null;error_code:string|null};
export type SignalChanges={notify:string[];cancelled:{residentId:string;wakeId:string}[]};
export interface SnowSignalSink {
  sync(ref:Ref):SignalChanges;
  publish(changes:SignalChanges):void;
}

/** Stores only event bindings. Public board facts are read from the authoritative host on delivery. */
export class SnowTournamentPlayerSignals implements SnowSignalSink {
  constructor(private readonly db:Database.Database,private readonly options:{
    read(ref:Ref,now:number):SnowPlayerSignal[];
    eligible(residentId:string):boolean;
    render(signal:SnowPlayerSignal):string;
    notify(residentId:string):void;
    cancelled(residentId:string,wakeId:string):void;
    now?:()=>number;
  }) {}
  private now() {return this.options.now?.()??Date.now();}
  private current(row:Row) {
    if (!this.options.eligible(row.resident_id)) return undefined;
    return this.options.read({editionId:row.edition_id,matchId:row.match_id},this.now()).find(signal=>signal.key===row.signal_key);
  }
  sync(ref:Ref):SignalChanges {
    return this.db.transaction(()=>{
      const current=this.options.read(ref,this.now()).filter(signal=>this.options.eligible(signal.residentId));
      const keys=new Set(current.map(signal=>signal.key));
      const pending=this.db.prepare("SELECT * FROM snow_tournament_player_wakes WHERE edition_id=? AND match_id=? AND status='pending'")
        .all(ref.editionId,ref.matchId) as Row[];
      const changes:SignalChanges={notify:[],cancelled:[]};
      for (const row of pending) if (!keys.has(row.signal_key)) {
        this.db.prepare("UPDATE snow_tournament_player_wakes SET status='cancelled',ended_at=? WHERE wake_id=?").run(this.now(),row.wake_id);
        changes.cancelled.push({residentId:row.resident_id,wakeId:row.wake_id});
      }
      const insert=this.db.prepare(`INSERT INTO snow_tournament_player_wakes
        (wake_id,signal_key,edition_id,match_id,resident_id,kind,created_at,context_count) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(signal_key) DO NOTHING`);
      for (const signal of current) {
        const id="snow-play:"+createHash("sha256").update(signal.key).digest("hex").slice(0,32);
        const count=signal.kind==="chat"?(signal.facts as {messages:unknown[]}).messages.length:0;
        if (insert.run(id,signal.key,ref.editionId,ref.matchId,signal.residentId,signal.kind,this.now(),count).changes) changes.notify.push(signal.residentId);
      }
      return changes;
    })();
  }
  publish(changes:SignalChanges) {
    if (this.db.inTransaction) {
      queueMicrotask(()=>this.publish(changes));
      return;
    }
    for (const {residentId,wakeId} of changes.cancelled) this.options.cancelled(residentId,wakeId);
    for (const id of new Set(changes.notify)) this.options.notify(id);
  }
  private find(residentId:string,id:string) {
    if (!id.startsWith("snow-play:")) return undefined;
    return this.db.prepare("SELECT * FROM snow_tournament_player_wakes WHERE wake_id=? AND resident_id=?").get(id,residentId) as Row|undefined;
  }
  private project(row:Row):BellWakeSourceRecord {
    let active=row.status==="pending"?this.current(row):undefined;
    if(active&&row.kind==="chat"){
      const seen=this.db.prepare(`SELECT MAX(context_count) AS count FROM snow_tournament_player_wakes
        WHERE edition_id=? AND match_id=? AND resident_id=? AND kind='chat' AND status='acked'`).get(row.edition_id,row.match_id,row.resident_id) as {count:number|null};
      const facts=active.facts as {messages:{residentId:string}[];chatReadThrough?:number};
      const readThrough=Math.max(seen.count??0,facts.chatReadThrough??0);
      active={...active,facts:{...facts,messages:facts.messages.slice(readThrough,row.context_count).filter(message=>message.residentId!==row.resident_id)}};
    }
    return {wakeId:row.wake_id,residentId:row.resident_id,reason:"together",
      status:row.status==="pending" && !active?"cancelled":row.status,
      createdAt:row.created_at,endedAt:row.status==="pending" && !active?this.now():row.ended_at,
      blockReason:row.block_reason,errorCode:row.error_code,purchaseRequestId:null,letterId:null,
      payload:active?{text:this.options.render(active)}:null};
  }
  private finish(residentId:string,id:string,at:number,status:"acked"|"blocked"|"cancelled",reason:string|null=null,error:string|null=null):
    BellWakeSourceTransition|"cancelled" {
    return this.db.transaction(()=>{
      const row=this.find(residentId,id);
      if (!row) return "missing";
      if (row.status===status) return "duplicate";
      if (row.status!=="pending" || (status!=="cancelled" && !this.current(row))) return "conflict";
      this.db.prepare("UPDATE snow_tournament_player_wakes SET status=?,ended_at=?,block_reason=?,error_code=? WHERE wake_id=?")
        .run(status,at,reason,error,id);
      return status;
    })();
  }
  readonly source:BellWakeSource={
    listPending:residentId=>{
      if (!this.options.eligible(residentId)) return [];
      const rows=this.db.prepare("SELECT * FROM snow_tournament_player_wakes WHERE resident_id=? AND status='pending' ORDER BY created_at,wake_id").all(residentId) as Row[];
      return rows.map(row=>this.project(row)).filter(wake=>wake.status==="pending");
    },
    get:(residentId,id)=>{const row=this.find(residentId,id);return row?this.project(row):undefined;},
    acknowledge:(residentId,id,at)=>this.finish(residentId,id,at,"acked") as BellWakeSourceTransition,
    block:(residentId,id,at,reason,error)=>this.finish(residentId,id,at,"blocked",reason,error) as BellWakeSourceTransition,
    cancel:(residentId,id,at)=>{
      const changed=this.finish(residentId,id,at,"cancelled")==="cancelled";
      return {residentId:changed?residentId:null,cancelledWakeId:changed?id:null,cancelledWakeIds:changed?[id]:[]};
    },
  };
}

import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { BellWakeSource, BellWakeSourceRecord, BellWakeSourceTransition } from "../../bell-service.js";
import { planSnowTournamentGrants } from "./settlement.js";
import type { SnowTournamentStore } from "./store.js";

type Edition=Omit<Parameters<typeof planSnowTournamentGrants>[0],"teams"> & {
  teams:(Parameters<typeof planSnowTournamentGrants>[0]["teams"][number] & {drawOrder:number|null})[];
};
export type SnowResultFacts={editionId:string;residentId:string;outcome:"champion"|"completed"|"cancelled";gold:number;silver:number;refundGold:number};

/** Reviewed cash-only copy; amounts come from confirmed personal settlement facts. */
export function renderSnowResult(facts:SnowResultFacts):string {
  switch(facts.outcome) {
    case "champion":
      return `🏆 恭喜夺得本届雪堡锦标赛冠军！本届奖金共${facts.gold}金币＋${facts.silver}银币，已存入你的账户。辛苦啦，和队友一起庆祝吧！`;
    case "completed":
      return `❄️ 本届雪堡锦标赛结束啦，谢谢你和队友一起上场！本届奖金共${facts.gold}金币＋${facts.silver}银币，已存入你的账户。下次再来拆雪堡！`;
    case "cancelled":
      return `本届雪堡锦标赛因技术故障结束，抱歉让大家没能打完。报名费${facts.refundGold}金币已退回，已获得的${facts.gold}金币＋${facts.silver}银币保留在你的账户。`;
  }
}

/** A final notification is possible only after this resident's actual cash obligations settle. */
export function settledSnowResultFacts(edition:Edition):SnowResultFacts[] {
  if(!["completed","cancelled"].includes(edition.phase)) return [];
  const targets=new Set(edition.teams.filter(team=>team.drawOrder!==null).flatMap(team=>team.members.map(m=>m.id)));
  if(edition.phase==="cancelled") for(const round of edition.registrationRounds) for(const payment of round.payments)
    if(payment.charge==="paid" || payment.charge==="unknown") targets.add(payment.residentId);
  const due=planSnowTournamentGrants(edition);
  const facts:SnowResultFacts[]=[];
  for(const residentId of targets) {
    const payments=edition.registrationRounds.flatMap(r=>r.payments).filter(p=>p.residentId===residentId);
    if(payments.some(p=>p.charge==="unknown" || p.refund==="pending" || edition.phase==="cancelled" && p.charge==="paid" && p.refund!=="refunded")) continue;
    const grants=due.filter(g=>g.residentId===residentId);
    if(grants.some(g=>!edition.settledGrants?.[g.id])) continue;
    const paid=Object.values(edition.settledGrants??{}).filter(g=>g.residentId===residentId);
    const champion=edition.teams.find(t=>t.id===edition.bracket.championTeamId)?.members.some(m=>m.id===residentId);
    facts.push({editionId:edition.id,residentId,outcome:edition.phase==="cancelled"?"cancelled":champion?"champion":"completed",
      gold:paid.reduce((sum,g)=>sum+g.gold,0),silver:paid.reduce((sum,g)=>sum+g.silver,0),
      refundGold:payments.filter(p=>p.refund==="refunded").length*10000});
  }
  return facts;
}

type Row={wake_id:string;resident_id:string;created_at:number;text:string;status:BellWakeSourceRecord["status"];
  ended_at:number|null;block_reason:string|null;error_code:string|null};

/** The caller must supply reviewed copy; this module does not invent model-visible text. */
export class SnowTournamentResultBell {
  constructor(private readonly db:Database.Database,private readonly store:SnowTournamentStore,
    private readonly options:{eligible(residentId:string):boolean;notify(residentId:string):void;render(facts:SnowResultFacts):string;now?:()=>number}) {}
  queue(editionId:string) {
    const ids=this.db.transaction(()=>{
      const edition=this.store.read(editionId) as Edition|null;
      if(!edition) return [];
      const recipients:string[]=[];
      for(const facts of settledSnowResultFacts(edition)) {
        if(!this.options.eligible(facts.residentId)) continue;
        const key="snow-result:"+createHash("sha256").update(JSON.stringify([editionId,facts.residentId])).digest("hex").slice(0,32);
        if(this.db.prepare("INSERT INTO snow_tournament_result_wakes (wake_id,edition_id,resident_id,created_at,text) VALUES (?,?,?,?,?) ON CONFLICT(edition_id,resident_id) DO NOTHING")
          .run(key,editionId,facts.residentId,this.options.now?.()??Date.now(),this.options.render(facts)).changes) recipients.push(facts.residentId);
      }
      return recipients;
    })();
    for(const id of ids) this.options.notify(id);
  }
  private find(residentId:string,id:string) {
    if(!id.startsWith("snow-result:")) return undefined;
    return this.db.prepare("SELECT * FROM snow_tournament_result_wakes WHERE wake_id=? AND resident_id=?").get(id,residentId) as Row|undefined;
  }
  private project(row:Row):BellWakeSourceRecord {
    return {wakeId:row.wake_id,residentId:row.resident_id,reason:"together",status:row.status,createdAt:row.created_at,
      endedAt:row.ended_at,blockReason:row.block_reason,errorCode:row.error_code,purchaseRequestId:null,letterId:null,payload:{text:row.text}};
  }
  private finish(residentId:string,id:string,at:number,status:"acked"|"blocked"|"cancelled",reason:string|null=null,error:string|null=null) {
    return this.db.transaction(()=>{
      const row=this.find(residentId,id);
      if(!row) return "missing";
      if(row.status===status) return "duplicate";
      if(row.status!=="pending") return "conflict";
      this.db.prepare("UPDATE snow_tournament_result_wakes SET status=?,ended_at=?,block_reason=?,error_code=? WHERE wake_id=?").run(status,at,reason,error,id);
      return status;
    })();
  }
  readonly source:BellWakeSource={
    listPending:residentId=>this.options.eligible(residentId)
      ? (this.db.prepare("SELECT * FROM snow_tournament_result_wakes WHERE resident_id=? AND status='pending' ORDER BY created_at,wake_id").all(residentId) as Row[]).map(row=>this.project(row)) : [],
    get:(residentId,id)=>{const row=this.find(residentId,id);return row && this.options.eligible(residentId)?this.project(row):undefined;},
    acknowledge:(residentId,id,at)=>this.finish(residentId,id,at,"acked") as BellWakeSourceTransition,
    block:(residentId,id,at,reason,error)=>this.finish(residentId,id,at,"blocked",reason,error) as BellWakeSourceTransition,
    cancel:(residentId,id,at)=>{
      const changed=this.finish(residentId,id,at,"cancelled")==="cancelled";
      return {residentId:changed?residentId:null,cancelledWakeId:changed?id:null,cancelledWakeIds:changed?[id]:[]};
    },
  };
}

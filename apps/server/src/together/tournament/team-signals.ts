import {createHash} from "node:crypto";
import type Database from "better-sqlite3";
import type {BellWakeSource,BellWakeSourceRecord,BellWakeSourceTransition} from "../../bell-service.js";
import type {SnowTournamentStore} from "./store.js";
import {snowTeamHasOpenSeat} from "./roster.js";

type Kind="formation"|"invite"|"request";
type Row={wake_id:string;edition_id:string;resident_id:string;kind:Kind;reference:string;created_at:number;expires_at:number;
  status:BellWakeSourceRecord["status"];ended_at:number|null;block_reason:string|null;error_code:string|null};
type Edition={id:string;phase:string;registrationCloseAt:string;teamFormationCloseAt:string;enrollments:{id:string}[];
  teams:{id:string;name:string;captainId:string|null;status:string;members:{id:string}[]}[];
  offers:{id:string;kind:string;teamId:string;residentId:string;fromCaptainId?:string}[]};
type Choice={label:string;call:{op:string;args:{option:string}}};
type FormationChoice={label:string;op:string;option:string;requires?:string[];call?:Choice["call"]};
const view='使用 doorbell：{"op":"game.snow.view","args":{}}';
const reminderReference=(editionId:string)=>editionId+":unassigned-hour";

/** Team-window events and directed offers, not a broadcast on every mutation. */
export class SnowTournamentTeamSignals {
  constructor(private readonly db:Database.Database,private readonly store:SnowTournamentStore,private readonly options:{
    eligible(id:string):boolean;name(id:string):string;notify(id:string):void;cancelled?(id:string,wake:string):void;
    choices(id:string,editionId:string,offerId:string):Choice[];
    formationChoices(id:string,editionId:string):FormationChoice[];now?:()=>number;
  }){}
  private now(){return this.options.now?.()??Date.now();}
  private events(state:Edition):{residentId:string;kind:Kind;reference:string}[]{
    const now=this.now();
    if(state.phase!=="team_formation"||now<Date.parse(state.registrationCloseAt)||now>=Date.parse(state.teamFormationCloseAt))return [];
    const events=state.enrollments.filter(member=>this.options.eligible(member.id)).map(member=>({residentId:member.id,kind:"formation" as Kind,reference:state.id}));
    if(now>=Date.parse(state.teamFormationCloseAt)-3_600_000){
      for(const member of state.enrollments){
        if(this.options.eligible(member.id)&&!state.teams.some(team=>team.status!=="withdrawn"&&team.members.some(other=>other.id===member.id)))
          events.push({residentId:member.id,kind:"formation",reference:reminderReference(state.id)});
      }
    }
    for(const offer of state.offers){
      const team=state.teams.find(team=>team.id===offer.teamId&&snowTeamHasOpenSeat(team));
      if(!team||!state.enrollments.some(member=>member.id===offer.residentId)||state.teams.some(team=>team.status!=="withdrawn"&&team.members.some(member=>member.id===offer.residentId)))continue;
      const recipient=offer.kind==="invite"?offer.residentId:offer.kind==="request"?team.captainId:null;
      if(recipient&&this.options.eligible(recipient))events.push({residentId:recipient,kind:offer.kind as Kind,reference:offer.id});
    }
    return events;
  }
  sync(editionId:string){
    const notify:string[]=[],cancelled:{id:string;wake:string}[]=[];
    this.store.transaction(()=>{
      const state=this.store.read(editionId) as Edition|null;if(!state)return;
      const events=this.events(state),identity=(e:{residentId:string;kind:Kind;reference:string})=>JSON.stringify([editionId,e.residentId,e.kind,e.reference]);
      const wanted=new Set(events.map(identity));
      const pending=this.db.prepare("SELECT * FROM snow_tournament_team_wakes WHERE edition_id=? AND status='pending'").all(editionId) as Row[];
      for(const row of pending)if(!wanted.has(identity({residentId:row.resident_id,kind:row.kind,reference:row.reference}))){
        this.db.prepare("UPDATE snow_tournament_team_wakes SET status='cancelled',ended_at=? WHERE wake_id=?").run(this.now(),row.wake_id);
        cancelled.push({id:row.resident_id,wake:row.wake_id});
      }
      const insert=this.db.prepare(`INSERT INTO snow_tournament_team_wakes(wake_id,edition_id,resident_id,kind,reference,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(edition_id,resident_id,kind,reference) DO NOTHING`);
      for(const event of events){
        const wake="snow-team:"+createHash("sha256").update(identity(event)).digest("hex").slice(0,32);
        if(insert.run(wake,editionId,event.residentId,event.kind,event.reference,this.now(),Date.parse(state.teamFormationCloseAt)).changes)notify.push(event.residentId);
      }
    });
    for(const event of cancelled)this.options.cancelled?.(event.id,event.wake);
    for(const id of new Set(notify))this.options.notify(id);
  }
  private find(id:string,wake:string){
    if(!wake.startsWith("snow-team:"))return;
    return this.db.prepare("SELECT * FROM snow_tournament_team_wakes WHERE resident_id=? AND wake_id=?").get(id,wake) as Row|undefined;
  }
  private project(row:Row):BellWakeSourceRecord {
    const state=this.store.read(row.edition_id) as Edition|null;
    const current=state&&this.events(state).some(event=>event.residentId===row.resident_id&&event.kind===row.kind&&event.reference===row.reference);
    let text:string|null=null;
    if(current&&row.status==="pending"){
      if(row.kind==="formation"&&row.reference===reminderReference(row.edition_id)){
        text="❄️ 雪堡组队还有1小时就截止啦！你还没入队，可以加入现有队伍，也可以自己建队。单人也能确认参赛，空位在截止时由 NPC 补齐。";
        const choices=this.options.formationChoices(row.resident_id,row.edition_id);
        for(const choice of choices)text+="\n"+(choice.call?choice.label+"\n"+JSON.stringify(choice.call):
          `${choice.label}：${choice.option}；填写 ${(choice.requires??[]).join("、")}（${choice.op}）`);
      }
      else if(row.kind==="formation")text=`❄️ 雪堡报名结束，24小时自由组队开始啦！找两位队友，建一支自己的雪堡战队吧。${view} 查看队伍、邀请或申请加入。组队截止：${new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(row.expires_at))}。`;
      else {
        const offer=state!.offers.find(offer=>offer.id===row.reference)!;
        const team=state!.teams.find(team=>team.id===offer.teamId)!;
        const name=this.options.name(row.kind==="invite"?offer.fromCaptainId!:offer.residentId);
        const choices=this.options.choices(row.resident_id,row.edition_id,row.reference);
        text=row.kind==="invite"?`${name}邀请你加入雪堡战队『${team.name}』。`:`${name}申请加入你的雪堡战队『${team.name}』。`;
        text+="\n"+choices.map(choice=>choice.label+"\n"+JSON.stringify(choice.call)).join("\n");
      }
    }
    return {wakeId:row.wake_id,residentId:row.resident_id,reason:"together",status:row.status==="pending"&&!current?"cancelled":row.status,
      createdAt:row.created_at,endedAt:!current?row.ended_at??Math.min(this.now(),row.expires_at):row.ended_at,
      blockReason:row.block_reason,errorCode:row.error_code,purchaseRequestId:null,letterId:null,payload:text?{text}:null};
  }
  private finish(id:string,wake:string,at:number,status:"acked"|"blocked"|"cancelled",reason:string|null=null,error:string|null=null){
    return this.db.transaction(()=>{
      const row=this.find(id,wake);if(!row)return "missing";
      if(row.status===status)return "duplicate";
      if(row.status!=="pending"||(status!=="cancelled"&&this.project(row).status!=="pending"))return "conflict";
      this.db.prepare("UPDATE snow_tournament_team_wakes SET status=?,ended_at=?,block_reason=?,error_code=? WHERE wake_id=?").run(status,at,reason,error,wake);
      return status;
    })();
  }
  readonly source:BellWakeSource={
    listPending:id=>{
      if(!this.options.eligible(id))return [];
      return (this.db.prepare("SELECT * FROM snow_tournament_team_wakes WHERE resident_id=? AND status='pending' ORDER BY created_at,wake_id").all(id) as Row[])
        .map(row=>this.project(row)).filter(row=>row.status==="pending");
    },
    get:(id,wake)=>{const row=this.find(id,wake);return row&&this.options.eligible(id)?this.project(row):undefined;},
    acknowledge:(id,wake,at)=>this.finish(id,wake,at,"acked") as BellWakeSourceTransition,
    block:(id,wake,at,reason,error)=>this.finish(id,wake,at,"blocked",reason,error) as BellWakeSourceTransition,
    cancel:(id,wake,at)=>{const changed=this.finish(id,wake,at,"cancelled")==="cancelled";return {residentId:changed?id:null,cancelledWakeId:changed?wake:null,cancelledWakeIds:changed?[wake]:[]};},
  };
}

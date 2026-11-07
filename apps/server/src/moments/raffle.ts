import { randomInt, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { loungeDisplayName } from "../lounge-display-name.js";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord, type HomeRecordKind, type SqlValue } from "./home-records.js";
import { findMomentSticker } from "./sticker-catalog.js";
import { MomentsError, type FarmGiftIdentity, type MomentActor, type MomentView, type MomentVisibility, type PublishMoment, type MomentPublishMeta } from "./types.js";

export type RafflePrize = { kind: "dish" | "bait"; id: string; quantity: number };
export type RaffleCondition = "like" | "comment" | "both";
export interface RaffleInput { requestId: string; text: string; visibility: MomentVisibility; location?: string | null; stickers?: string[]; at: number; condition: RaffleCondition; prizes: RafflePrize[] }
export interface RaffleFarmIdentity { raffle_id: string; owner_resident_id: string; owner_farm_doorplate: string }
export interface RaffleLockReceipt extends RaffleFarmIdentity { prizes: (RafflePrize & {name:string})[]; locked_at: number }
export type RaffleSettlementRequest = RaffleFarmIdentity & { position: number } &
  ({action:"return"} | {action:"award";recipient_resident_id:string;recipient_farm_doorplate:string});
export type RaffleSettlementReceipt = RaffleSettlementRequest & {item:RafflePrize & {name:string};settled_at:number};
export interface RaffleFarmPort {
  lock(input:RaffleFarmIdentity & {prizes:RafflePrize[]}):Promise<RaffleLockReceipt>;
  settle(input:RaffleSettlementRequest):Promise<RaffleSettlementReceipt>;
}
export interface RaffleMomentsPort {
  notificationIdentity(actor:MomentActor,save?:boolean):{homeId:string;actorKey:string};
  notificationMoment(actor:MomentActor,momentId:string):{id:string;text:string};
  giftInventoryIdentity(actor:MomentActor):FarmGiftIdentity;
  quota(actor:MomentActor,now:number):{used:number;limit:number};
  publish(actor:MomentActor,input:PublishMoment,now:number,stickers?:readonly string[],pubmeta?:MomentPublishMeta):MomentView;
  get(actor:MomentActor,momentId:string):MomentView;
}
type ExtraKind=HomeRecordKind|"raffle"|"raffle_prize"|"raffle_audience";
type ExtraRecords={
  all<T>(kind:ExtraKind,where?:string,parameters?:SqlValue[],homeId?:string):T[];
  insert(homeId:string,kind:ExtraKind,fields:Record<string,SqlValue>,id?:string):string;
  update(homeId:string,id:string,fields:Record<string,SqlValue>):void;
};
type RaffleRow=HomeRecord & {actor_key:string;resident_id:string;request_id:string;text:string;visibility:MomentVisibility["mode"];
  location:string|null;location_supplied:number;raffle_at:number;raffle_condition:RaffleCondition;raffle_state:"preparing"|"open"|"drawn"|"refunding"|"failed";
  raffle_failure:string|null;moment_id:string|null;sender_doorplate:string;created_at:number};
type PrizeRow=HomeRecord & {raffle_id:string;position:number;item_kind:RafflePrize["kind"];item_id:string;item_quantity:number;item_name:string|null;
  raffle_winner_resident_id:string|null;raffle_winner_doorplate:string|null;source:"award"|"return"|null;delivered_at:number|null};
type AudienceRow=HomeRecord & {subject_kind:"resident";subject_id:string};
type StickerRow=HomeRecord & {item_id:string;position:number};
type Interaction=HomeRecord & {created_at:number};
type Post=HomeRecord & {moment_id:string};
export interface RaffleView { id:string;momentId:string;at:number;condition:RaffleCondition;state:"open"|"drawn";
  prizes:{item:RafflePrize & {name:string};winnerResidentId:string|null;winnerName:string|null;action:"award"|"return"|null;settledAt:number|null}[] }
export class MomentsRaffleError extends Error {
  constructor(readonly code:"invalid_request"|"request_conflict"|"raffle_not_found"|"raffle_unavailable"|"farm_binding_mismatch") {
    super(code);this.name="MomentsRaffleError";
  }
}

/** Authenticated internal Farm transport; reuses the existing service timeout. */
export class MomentsRaffleFarmClient implements RaffleFarmPort {
  private readonly base:URL;
  constructor(private readonly options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
    const base=new URL(options.apiBaseUrl);if(!base.pathname.endsWith("/"))base.pathname+="/";
    this.base=new URL("internal/doorbell/moments/raffle/",base);
  }
  private async request(action:"lock"|"settle",input:object):Promise<unknown> {
    try {
      const response=await (this.options.fetchImplementation??fetch)(new URL(action,this.base),{
        method:"POST",headers:{authorization:`Bearer ${this.options.serviceToken}`,"content-type":"application/json"},
        body:JSON.stringify(input),signal:AbortSignal.timeout(this.options.requestTimeoutMs),
      });
      const value:unknown=await response.json();
      if(!response.ok){
        const parsed=z.object({error:z.object({code:z.string()})}).safeParse(value),code=parsed.success?parsed.data.error.code:"";
        if([400,409].includes(response.status)&&["invalid_request","farm_binding_mismatch","same_farm","request_conflict","insufficient_stock","item_conflict","item_unavailable"].includes(code))
          throw new MomentsError(code as ConstructorParameters<typeof MomentsError>[0]);
        throw new MomentsRaffleError("raffle_unavailable");
      }
      return value;
    } catch(error) {if(error instanceof MomentsError||error instanceof MomentsRaffleError)throw error;throw new MomentsRaffleError("raffle_unavailable");}
  }
  async lock(input:RaffleFarmIdentity & {prizes:RafflePrize[]}):Promise<RaffleLockReceipt> {
    const prize=z.object({kind:z.enum(["dish","bait"]),id:z.string().min(1),quantity:z.number().int().positive().safe(),name:z.string().min(1)}).strict();
    const schema=z.object({ok:z.literal(true),data:z.object({raffle_id:z.literal(input.raffle_id),
      owner_resident_id:z.literal(input.owner_resident_id),owner_farm_doorplate:z.literal(input.owner_farm_doorplate),
      prizes:z.array(prize),locked_at:z.number().int().nonnegative().safe()}).strict()}).strict();
    const value=schema.safeParse(await this.request("lock",input));
    if(!value.success)throw new MomentsRaffleError("raffle_unavailable");return value.data.data;
  }
  async settle(input:RaffleSettlementRequest):Promise<RaffleSettlementReceipt> {
    const common={raffle_id:z.literal(input.raffle_id),owner_resident_id:z.literal(input.owner_resident_id),
      owner_farm_doorplate:z.literal(input.owner_farm_doorplate),position:z.literal(input.position),
      item:z.object({kind:z.enum(["dish","bait"]),id:z.string().min(1),quantity:z.number().int().positive().safe(),name:z.string().min(1)}).strict(),
      settled_at:z.number().int().nonnegative().safe()};
    const data=input.action==="return"?z.object({...common,action:z.literal("return")}).strict():
      z.object({...common,action:z.literal("award"),recipient_resident_id:z.literal(input.recipient_resident_id),
        recipient_farm_doorplate:z.literal(input.recipient_farm_doorplate)}).strict();
    const value=z.object({ok:z.literal(true),data}).strict().safeParse(await this.request("settle",input));
    if(!value.success)throw new MomentsRaffleError("raffle_unavailable");return value.data.data;
  }
}
const nonempty=(s:unknown):s is string=>typeof s==="string"&&!!s.trim();
const time=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0;
const rejectedLockCodes=new Set(["invalid_request","request_conflict","farm_binding_mismatch","same_farm","insufficient_stock","item_conflict","item_unavailable"]);
const terminalFailureCodes=new Set([...rejectedLockCodes,"daily_limit_reached","audience_not_found"]);
const lockRejection=(error:unknown):string|undefined=>{
  const code=error&&typeof error==="object"&&"code" in error?(error as {code:unknown}).code:undefined;
  return typeof code==="string"&&rejectedLockCodes.has(code)?code:undefined;
};
const item=(row:PrizeRow):RafflePrize=>({kind:row.item_kind,id:row.item_id,quantity:row.item_quantity});
const identity=(row:RaffleRow):RaffleFarmIdentity=>({raffle_id:row.record_id,owner_resident_id:row.resident_id,owner_farm_doorplate:row.sender_doorplate});
const subjectOrder=(a:{kind:string;id:string},b:{kind:string;id:string})=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`);

/** Main-only domain; all durable state is stored in the owner's existing SQL table. */
export class MomentsRaffles {
  private readonly records:ExtraRecords;
  constructor(private readonly database:Database.Database,ensureHomeTable:EnsureMomentsHomeTable,
    private readonly moments:RaffleMomentsPort,private readonly farm:RaffleFarmPort,
    private readonly now=Date.now,private readonly pick=(max:number)=>randomInt(max)) {
    this.records=new HomeMomentRecords(database,ensureHomeTable) as unknown as ExtraRecords;
  }
  private prizes(row:RaffleRow):PrizeRow[] {
    return this.records.all<PrizeRow>("raffle_prize","raffle_id=?",[row.record_id],row.home_id).sort((a,b)=>a.position-b.position);
  }
  private audience(row:RaffleRow):MomentVisibility["subjects"] {
    return this.records.all<AudienceRow>("raffle_audience","raffle_id=?",[row.record_id],row.home_id)
      .map(subject=>({kind:subject.subject_kind,id:subject.subject_id})).sort(subjectOrder);
  }
  private stickers(row:RaffleRow):string[] {
    return this.records.all<StickerRow>("raffle_sticker","raffle_id=?",[row.record_id],row.home_id)
      .sort((a,b)=>a.position-b.position).map(sticker=>sticker.item_id);
  }
  private row(id:string):RaffleRow|undefined {return this.records.all<RaffleRow>("raffle","record_id=?",[id])[0];}
  private draft(row:RaffleRow):PublishMoment {
    return {requestId:row.request_id,text:row.text,visibility:{mode:row.visibility,subjects:this.audience(row)},
      ...(row.location_supplied?{location:row.location}:{})};
  }
  private canonical(input:RaffleInput):RaffleInput {
    const stickers=input.stickers??[];
    if(!nonempty(input.requestId)||typeof input.text!=="string"||!Array.isArray(stickers)||
      stickers.some(id=>typeof id!=="string"||!findMomentSticker(id))||(!input.text.trim()&&!stickers.length)||!time(input.at)||
      !["like","comment","both"].includes(input.condition)||!Array.isArray(input.prizes)||!input.prizes.length||
      !input.visibility||!["public","only","except"].includes(input.visibility.mode)||!Array.isArray(input.visibility.subjects)||
      (input.location!==undefined&&input.location!==null&&typeof input.location!=="string"))throw new MomentsRaffleError("invalid_request");
    const prizes=input.prizes.map(prize=>{
      if(!prize||!["dish","bait"].includes(prize.kind)||!nonempty(prize.id)||!Number.isSafeInteger(prize.quantity)||
        prize.quantity<1||(prize.kind==="dish"&&prize.quantity!==1))throw new MomentsRaffleError("invalid_request");
      return {kind:prize.kind,id:prize.id,quantity:prize.quantity};
    });
    const dishIds=prizes.filter(prize=>prize.kind==="dish").map(prize=>prize.id);
    if(new Set(dishIds).size!==dishIds.length)throw new MomentsRaffleError("invalid_request");
    const subjects=input.visibility.subjects.map(subject=>{
      if(!subject||subject.kind!=="resident"||!nonempty(subject.id))throw new MomentsRaffleError("invalid_request");
      return {kind:"resident" as const,id:subject.id};
    });
    const canonical=[...new Map(subjects.map(subject=>[subject.id,subject])).values()].sort(subjectOrder);
    if(input.visibility.mode==="public"&&canonical.length)throw new MomentsRaffleError("invalid_request");
    return {requestId:input.requestId,text:input.text,visibility:{mode:input.visibility.mode,subjects:canonical},
      ...(input.location===undefined?{}:{location:input.location}),stickers:[...stickers],at:input.at,condition:input.condition,prizes};
  }
  private same(row:RaffleRow,input:RaffleInput):boolean {
    return row.text===input.text&&row.visibility===input.visibility.mode&&
      row.location_supplied===(input.location===undefined?0:1)&&(input.location===undefined||row.location===input.location)&&
      row.raffle_at===input.at&&row.raffle_condition===input.condition&&
      JSON.stringify(this.audience(row))===JSON.stringify(input.visibility.subjects)&&
      JSON.stringify(this.stickers(row))===JSON.stringify(input.stickers??[])&&
      JSON.stringify(this.prizes(row).map(item))===JSON.stringify(input.prizes);
  }
  private prepare(actor:MomentActor,input:RaffleInput,pubmeta:MomentPublishMeta):RaffleRow {
    if(actor.kind!=="resident")throw new MomentsError("resident_only");
    return this.database.transaction(()=>{
      const who=this.moments.notificationIdentity(actor,true),farm=this.moments.giftInventoryIdentity(actor);
      const previous=this.records.all<RaffleRow>("raffle","actor_key=? AND request_id=?",[who.actorKey,input.requestId])[0];
      if(previous){if(previous.home_id!==who.homeId||!this.same(previous,input))throw new MomentsRaffleError("request_conflict");return previous;}
      const now=this.now();if(!time(now)||input.at<=now)throw new MomentsRaffleError("invalid_request");
      if(this.moments.quota(actor,now).used>=3)throw new MomentsError("daily_limit_reached");
      if(this.records.all<Post>("post","actor_key=? AND request_id=?",[who.actorKey,input.requestId],who.homeId).length)
        throw new MomentsRaffleError("request_conflict");
      for(const subject of input.visibility.subjects)
        if(!this.database.prepare("SELECT 1 FROM residents WHERE resident_id=?").get(subject.id))throw new MomentsError("audience_not_found");
      const id=randomUUID();
      this.records.insert(who.homeId,"raffle",{actor_key:who.actorKey,resident_id:actor.residentId,request_id:input.requestId,
        text:input.text,visibility:input.visibility.mode,location:input.location===undefined?(pubmeta.defaultLocation??null):input.location,location_supplied:input.location===undefined?0:1,
        raffle_at:input.at,raffle_condition:input.condition,raffle_state:"preparing",sender_doorplate:farm.sender_farm_doorplate,created_at:now},id);
      input.prizes.forEach((prize,position)=>this.records.insert(who.homeId,"raffle_prize",{raffle_id:id,position,
        item_kind:prize.kind,item_id:prize.id,item_quantity:prize.quantity}));
      input.visibility.subjects.forEach(subject=>this.records.insert(who.homeId,"raffle_audience",{raffle_id:id,subject_kind:subject.kind,subject_id:subject.id}));
      (input.stickers??[]).forEach((sticker,position)=>this.records.insert(who.homeId,"raffle_sticker",{raffle_id:id,item_id:sticker,position}));
      return this.row(id)!;
    }).immediate();
  }
  private validateLock(row:RaffleRow,receipt:RaffleLockReceipt):void {
    const expected=this.prizes(row);
    if(!receipt||typeof receipt!=="object"||receipt.raffle_id!==row.record_id||receipt.owner_resident_id!==row.resident_id||receipt.owner_farm_doorplate!==row.sender_doorplate||
      !time(receipt.locked_at)||!Array.isArray(receipt.prizes)||receipt.prizes.length!==expected.length||receipt.prizes.some((value,index)=>{
        const expectedItem=expected[index]!;return !value||typeof value!=="object"||value.kind!==expectedItem.item_kind||value.id!==expectedItem.item_id||
          value.quantity!==expectedItem.item_quantity||!nonempty(value.name);
      }))throw new MomentsRaffleError("raffle_unavailable");
  }
  private result(row:RaffleRow):RaffleView {
    if(!row.moment_id||(row.raffle_state!=="open"&&row.raffle_state!=="drawn"))throw new MomentsRaffleError("raffle_unavailable");
    return {id:row.record_id,momentId:row.moment_id,at:row.raffle_at,condition:row.raffle_condition,state:row.raffle_state,
      prizes:this.prizes(row).map(prize=>{
        const resident=prize.raffle_winner_resident_id?this.database.prepare("SELECT resident_name FROM residents WHERE resident_id=?")
          .get(prize.raffle_winner_resident_id) as {resident_name:string}|undefined:undefined;
        return {item:{...item(prize),name:prize.item_name!},winnerResidentId:prize.raffle_winner_resident_id,
          winnerName:resident?loungeDisplayName(resident.resident_name):null,action:prize.source,settledAt:prize.delivered_at};
      })};
  }
  async publish(actor:MomentActor,raw:RaffleInput,pubmeta:MomentPublishMeta={}):Promise<RaffleView> {
    if(pubmeta.defaultLocation!==undefined&&pubmeta.defaultLocation!==null&&typeof pubmeta.defaultLocation!=="string")throw new MomentsRaffleError("invalid_request");
    const input=this.canonical(raw),row=this.prepare(actor,input,pubmeta);
    if(row.raffle_state==="open"||row.raffle_state==="drawn")return this.result(row);
    if(row.raffle_state==="refunding"||row.raffle_state==="failed") {
      await this.settle(row.record_id);
      const current=this.row(row.record_id)!;
      if(current.raffle_state==="failed"&&current.raffle_failure&&terminalFailureCodes.has(current.raffle_failure))
        throw new MomentsError(current.raffle_failure as ConstructorParameters<typeof MomentsError>[0]);
      throw new MomentsRaffleError("raffle_unavailable");
    }
    const binding=this.moments.giftInventoryIdentity(actor);
    if(binding.sender_resident_id!==row.resident_id||binding.sender_farm_doorplate!==row.sender_doorplate)
      throw new MomentsRaffleError("farm_binding_mismatch");
    let receipt:RaffleLockReceipt;
    try { receipt=await this.farm.lock({...identity(row),prizes:this.prizes(row).map(item)}); }
    catch(error) {
      const code=lockRejection(error);
      if(code)this.database.transaction(()=>{
        const current=this.row(row.record_id);
        if(current?.raffle_state==="preparing")this.records.update(current.home_id,current.record_id,{raffle_state:"failed",raffle_failure:code});
      }).immediate();
      throw error;
    }
    this.validateLock(row,receipt);
    try {
      const result=this.database.transaction(()=>{
        const current=this.row(row.record_id)!;
        if(current.raffle_state==="open"||current.raffle_state==="drawn")return this.result(current);
        if(current.raffle_state!=="preparing")throw new MomentsRaffleError("raffle_unavailable");
        if(this.records.all<Post>("post","actor_key=? AND request_id=?",[current.actor_key,current.request_id],current.home_id).length)
          throw new MomentsRaffleError("request_conflict");
        const post=this.moments.publish(actor,this.draft(current),this.now(),this.stickers(current),{defaultLocation:current.location});
        const slots=this.prizes(current);
        slots.forEach((slot,index)=>this.records.update(current.home_id,slot.record_id,{item_name:receipt.prizes[index]!.name}));
        this.records.update(current.home_id,current.record_id,{moment_id:post.id,raffle_state:"open"});
        return this.result(this.row(current.record_id)!);
      }).immediate();
      return result;
    } catch(error) {
      if((error instanceof MomentsError&&["daily_limit_reached","audience_not_found","invalid_request"].includes(error.code))||
        (error instanceof MomentsRaffleError&&error.code==="request_conflict")) {
        this.database.transaction(()=>{
          const current=this.row(row.record_id);
          if(!current||current.raffle_state!=="preparing")return;
          this.records.update(current.home_id,current.record_id,{raffle_state:"refunding",raffle_failure:error.code});
          this.prizes(current).forEach((slot,index)=>this.records.update(current.home_id,slot.record_id,{source:"return",item_name:receipt.prizes[index]!.name}));
        }).immediate();
        await this.settle(row.record_id);
        if(this.row(row.record_id)?.raffle_state==="refunding")throw new MomentsRaffleError("raffle_unavailable");
      }
      throw error;
    }
  }
  /** Must execute before any like/unlike/comment on the target post within the same SQLite transaction. */
  freezeDue(now:number,momentId?:string):string[] {
    if(!time(now))throw new MomentsRaffleError("invalid_request");
    return this.database.transaction(()=>{
      const where=momentId===undefined?"raffle_state='open' AND raffle_at<=?":"raffle_state='open' AND raffle_at<=? AND moment_id=?";
      const args=momentId===undefined?[now]:[now,momentId];
      const rows=this.records.all<RaffleRow>("raffle",where,args),frozen:string[]=[];
      for(const row of rows){
        const id=row.moment_id!;
        const likes=new Set(this.records.all<Interaction>("like","moment_id=? AND created_at<=?",[id,row.raffle_at]).map(value=>value.home_id));
        const comments=new Set(this.records.all<Interaction>("comment","moment_id=? AND created_at<=?",[id,row.raffle_at]).map(value=>value.home_id));
        const homes=this.database.prepare(`SELECT h.home_id,r.resident_id FROM homes h JOIN residents r ON r.resident_id=h.resident_id
          JOIN human_accounts a ON a.account_id=r.account_id WHERE a.membership_status='active'`).all() as {home_id:string;resident_id:string}[];
        const eligible=homes.filter(home=>home.home_id!==row.home_id&&
          (row.raffle_condition==="like"?likes.has(home.home_id):row.raffle_condition==="comment"?comments.has(home.home_id):likes.has(home.home_id)&&comments.has(home.home_id)))
          .filter(home=>{try{this.moments.notificationMoment({kind:"resident",residentId:home.resident_id},id);return true;}
            catch(error){if(error instanceof MomentsError&&["moment_not_found","actor_unavailable"].includes(error.code))return false;throw error;}});
        for(const prize of this.prizes(row)){
          const winner=eligible.length?eligible.splice(this.pick(eligible.length),1)[0]:undefined;
          this.records.update(row.home_id,prize.record_id,{source:winner?"award":"return",raffle_winner_resident_id:winner?.resident_id??null});
        }
        this.records.update(row.home_id,row.record_id,{raffle_state:"drawn"});frozen.push(row.record_id);
      }
      return frozen;
    }).immediate();
  }
  nextDue():number|null {
    const times=this.records.all<RaffleRow>("raffle","raffle_state='open'").map(row=>row.raffle_at);
    return times.length?times.reduce((earliest,value)=>Math.min(earliest,value),Infinity):null;
  }
  /** Retry the same per-prize request; a failed response never proves delivery. */
  async settle(id:string):Promise<void> {
    const initial=this.row(id);if(!initial||!["drawn","refunding"].includes(initial.raffle_state))return;
    for(const prize of this.prizes(initial)){
      if(prize.delivered_at!==null||!prize.source)continue;
      let request:RaffleSettlementRequest;
      if(prize.source==="return")request={...identity(initial),position:prize.position,action:"return"};
      else {
        if(!prize.raffle_winner_resident_id)continue;
        let binding:FarmGiftIdentity;
        try{binding=this.moments.giftInventoryIdentity({kind:"resident",residentId:prize.raffle_winner_resident_id});}
        catch(error){if(error instanceof MomentsError&&["actor_unavailable","farm_binding_mismatch"].includes(error.code))continue;throw error;}
        if(prize.raffle_winner_doorplate&&prize.raffle_winner_doorplate!==binding.sender_farm_doorplate)continue;
        if(!prize.raffle_winner_doorplate)this.database.transaction(()=>{
          const latest=this.prizes(initial).find(slot=>slot.record_id===prize.record_id);
          if(latest&&!latest.raffle_winner_doorplate)this.records.update(initial.home_id,prize.record_id,{raffle_winner_doorplate:binding.sender_farm_doorplate});
        }).immediate();
        const latest=this.prizes(initial).find(slot=>slot.record_id===prize.record_id);
        if(latest?.raffle_winner_doorplate!==binding.sender_farm_doorplate)continue;
        request={...identity(initial),position:prize.position,action:"award",recipient_resident_id:prize.raffle_winner_resident_id,
          recipient_farm_doorplate:binding.sender_farm_doorplate};
      }
      let receipt:RaffleSettlementReceipt;
      try{receipt=await this.farm.settle(request);}catch{continue;}
      if(!receipt||typeof receipt!=="object"||!receipt.item||typeof receipt.item!=="object"||
        receipt.raffle_id!==request.raffle_id||receipt.owner_resident_id!==request.owner_resident_id||
        receipt.owner_farm_doorplate!==request.owner_farm_doorplate||receipt.position!==request.position||receipt.action!==request.action||
        (request.action==="award"&&(receipt.action!=="award"||receipt.recipient_resident_id!==request.recipient_resident_id||
          receipt.recipient_farm_doorplate!==request.recipient_farm_doorplate))||
        receipt.item.kind!==prize.item_kind||receipt.item.id!==prize.item_id||receipt.item.quantity!==prize.item_quantity||
        receipt.item.name!==prize.item_name||!time(receipt.settled_at))continue;
      this.database.transaction(()=>{
        const latest=this.prizes(initial).find(slot=>slot.record_id===prize.record_id);
        if(latest&&latest.delivered_at===null)this.records.update(initial.home_id,prize.record_id,{delivered_at:receipt.settled_at});
      }).immediate();
    }
    const current=this.row(id);
    if(current?.raffle_state==="refunding"&&this.prizes(current).every(prize=>prize.delivered_at!==null))
      this.database.transaction(()=>this.records.update(current.home_id,current.record_id,{raffle_state:"failed"})).immediate();
  }
  async resume(now=this.now()):Promise<void> {
    for(const row of this.records.all<RaffleRow>("raffle","raffle_state='preparing'")) {
      const draft=this.draft(row);
      try {
        await this.publish({kind:"resident",residentId:row.resident_id},{requestId:draft.requestId,text:draft.text,
          visibility:draft.visibility,...(draft.location===undefined?{}:{location:draft.location}),at:row.raffle_at,
          stickers:this.stickers(row),condition:row.raffle_condition,prizes:this.prizes(row).map(item)},{defaultLocation:row.location});
      } catch { /* Keep uncertain or unavailable work durable for a later explicit recovery. */ }
    }
    this.freezeDue(now);
    for(const row of this.records.all<RaffleRow>("raffle","raffle_state IN ('drawn','refunding')"))await this.settle(row.record_id);
  }
  /** The caller has already checked current readability; this is a pure SQL snapshot. */
  snapshotForReadablePost(momentId:string):RaffleView|undefined {
    const row=this.records.all<RaffleRow>("raffle","moment_id=?",[momentId])[0];
    return row&&(row.raffle_state==="open"||row.raffle_state==="drawn")?this.result(row):undefined;
  }
  async view(actor:MomentActor,momentId:string):Promise<RaffleView> {
    this.moments.get(actor,momentId);
    const row=this.records.all<RaffleRow>("raffle","moment_id=?",[momentId])[0];
    if(!row)throw new MomentsRaffleError("raffle_not_found");
    if(row.raffle_state==="open"&&row.raffle_at<=this.now())this.freezeDue(this.now(),momentId);
    const current=this.row(row.record_id)!;
    if(current.raffle_state==="drawn")await this.settle(current.record_id);
    return this.result(this.row(row.record_id)!);
  }
}

/** One timer for the next real deadline; startup recovery does not poll. */
export class MomentsRaffleScheduler {
  private timer:ReturnType<typeof setTimeout>|undefined;
  private running:Promise<void>|undefined;
  private rerun=false;
  private stopped=true;
  constructor(private readonly raffles:Pick<MomentsRaffles,"resume"|"nextDue">,private readonly onError:(error:unknown)=>void,
    private readonly now=Date.now) {}
  async start():Promise<void> {this.stopped=false;await this.reconcile();}
  wake():void {
    if(this.stopped)return;
    if(this.timer){clearTimeout(this.timer);this.timer=undefined;}
    void this.reconcile().catch(this.onError);
  }
  stop():void {this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=undefined;}
  private async reconcile():Promise<void> {
    if(this.running){this.rerun=true;return this.running;}
    const work=(async()=>{
      do {this.rerun=false;await this.raffles.resume(this.now());} while(this.rerun&&!this.stopped);
      if(this.stopped)return;
      const due=this.raffles.nextDue();
      if(due===null)return;
      const delay=Math.max(0,Math.min(due-this.now(),2_147_483_647));
      this.timer=setTimeout(()=>{this.timer=undefined;this.wake();},delay);
      this.timer.unref();
    })();
    this.running=work;
    try{await work;}finally{if(this.running===work)this.running=undefined;}
  }
}

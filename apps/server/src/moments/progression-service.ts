import type { MomentsStore } from "./store.js";
import type { ProgressionFarmPort } from "./progression-client.js";

/** Per-home order preserves the accepted-task boundary across overlapping HTTP requests. */
export class MomentsProgressionService {
  private readonly running=new Map<string,Promise<void>>();
  constructor(private readonly store:MomentsStore,private readonly farm:ProgressionFarmPort,
    private readonly now:()=>number=Date.now,private readonly report:(error:unknown)=>void=()=>{}) {}
  async sync(residentId:string):Promise<void> {
    const previous=this.running.get(residentId)??Promise.resolve();
    const next=previous.then(async()=>{
      const actor={kind:"resident",residentId} as const, now=this.now();
      const homeId=this.store.progressionHome(residentId);
      const pending=this.store.progression.pending(homeId,now);
      if(!pending.events.length)return;
      const identity=this.store.giftInventoryIdentity(actor),quota=this.store.quota(actor,now);
      const reply=await this.farm.sync({residentId,farmDoorplate:identity.sender_farm_doorplate,
        day:Math.floor((now+8*3_600_000)/86_400_000),postsToday:quota.used,...pending});
      if(reply.through!==pending.sequence||reply.residentId!==residentId||reply.farmDoorplate!==identity.sender_farm_doorplate)
        throw new Error("Invalid progression receipt identity");
      this.store.progression.acknowledge(homeId,reply.through,reply.grants,this.now(),reply.taskNotices);
    }).catch(error=>{try{this.report(error);}catch{/* Preserve the completed social action. */}});
    this.running.set(residentId,next);
    await next;
    if(this.running.get(residentId)===next)this.running.delete(residentId);
  }
  takeNotices(residentId:string):string[] {
    try{return this.store.takeProgressionNotices(residentId,this.now());}
    catch(error){try{this.report(error);}catch{}return [];}
  }
}

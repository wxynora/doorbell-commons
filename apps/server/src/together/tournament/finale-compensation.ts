import type Database from 'better-sqlite3';
import { togetherIdentity } from '../community.js';
import { readReceiptValues, writeReceiptValue } from './relational-values.js';
import type { SnowTournamentStore } from './store.js';

const editionId='snow-tournament:2026-11',receiptKind='finale-compensation';
export const finaleStatueMs=15*24*60*60*1000;
export type FinaleGrant={id:string;editionId:string;residentId:string;farmId:string;statue:boolean};
export type FinaleReceipt={id:string;editionId:string;farmId:string;seedIds:string[];grantedAt:number;statueExpiresAt:number|null};
export type FinaleEdition={id:string;phase:string;
  teams:{id:string;drawOrder:number|null;members:{id:string;npc?:true}[]}[];
  matches:{stage:string;teamAId:string|null;teamBId:string|null;winnerTeamId:string|null}[];
};

export function planFinaleCompensation(edition:FinaleEdition,farmFor:(residentId:string)=>string|undefined) {
  const plans=new Map<string,FinaleGrant>();
  if(edition.id!==editionId||!['completed','cancelled'].includes(edition.phase))return plans;
  const final=edition.matches.find(match=>match.stage==='final');
  const eliminated=new Set<string>();
  for(const match of edition.matches){
    if((match.stage!=='semifinal'&&match.stage!=='final')||!match.winnerTeamId)continue;
    const {teamAId,teamBId,winnerTeamId}=match;
    if(teamAId&&teamBId&&(winnerTeamId===teamAId||winnerTeamId===teamBId))eliminated.add(winnerTeamId===teamAId?teamBId:teamAId);
  }
  const winners=new Set(edition.teams.find(team=>team.id===final?.winnerTeamId)?.members.filter(member=>!member.npc).map(member=>farmFor(member.id))??[]);
  for(const team of edition.teams)if(team.drawOrder!==null)for(const member of team.members){
    if(member.npc)continue;
    const farmId=farmFor(member.id);if(!farmId)continue;
    const statue=eliminated.has(team.id)&&!winners.has(farmId),prior=plans.get(farmId);
    if(prior){prior.statue ||= statue;continue;}
    plans.set(farmId,{id:JSON.stringify(['snow-tournament',editionId,receiptKind,farmId]),editionId,residentId:member.id,farmId,statue});
  }
  return plans;
}

/** One campaign, with Farm owning both delivery and idempotency. */
export class SnowFinaleCompensation {
  private inflight:Promise<{id:string;error:unknown}[]>|undefined;
  constructor(private readonly db:Database.Database,private readonly store:SnowTournamentStore,
    private readonly grant:(request:FinaleGrant)=>Promise<FinaleReceipt|null>) {}
  private farmFor=(residentId:string)=>togetherIdentity(this.db,residentId)?.farmDoorplate;
  reconcile(id:string) {
    if(id!==editionId)return Promise.resolve([]);
    return this.inflight??=this.settle(id).finally(()=>{this.inflight=undefined;});
  }
  private async settle(id:string) {
    const failures:{id:string;error:unknown}[]=[];
    const edition=this.store.read(id) as FinaleEdition|null;
    if(!edition)return failures;
    const plans=planFinaleCompensation(edition,this.farmFor);
    const existing=readReceiptValues(this.db,id,receiptKind);
    for(const plan of plans.values()){
      if(existing.has(plan.id))continue;
      try{
        const receipt=await this.grant(plan);
        if(!receipt||receipt.id!==plan.id||receipt.editionId!==id||receipt.farmId!==plan.farmId||receipt.seedIds.length!==3||
          (plan.statue?receipt.statueExpiresAt===null||receipt.statueExpiresAt<receipt.grantedAt+finaleStatueMs:receipt.statueExpiresAt!==null))
          throw Error('snow_finale_compensation_unconfirmed');
        this.store.transaction(()=>writeReceiptValue(this.db,id,receiptKind,plan.id,receipt));
      }catch(error){failures.push({id:plan.id,error});}
    }
    return failures;
  }
  notificationFacts(edition:FinaleEdition) {
    const plans=planFinaleCompensation(edition,this.farmFor);
    const receipts=plans.size?readReceiptValues(this.db,edition.id,receiptKind):new Map<string,unknown>();
    return (residentId:string)=>{
      const plan=plans.get(this.farmFor(residentId)??'');
      return plan?{ready:receipts.has(plan.id),seeds:true,statue:plan.statue}:{ready:true,seeds:false,statue:false};
    };
  }
}

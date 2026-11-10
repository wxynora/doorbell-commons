import { refundId, type RegistrationRound, type TournamentPayment } from "./registration.js";
import type { SnowTournamentTerminal } from "./results.js";
import type { SnowTournamentStore } from "./store.js";
import type { SnowTournamentTeamService } from "./team-service.js";

type SettlementEdition = {
  id: string; phase: string; registrationOpenAt:string; registrationCloseAt: string; teamFormationCloseAt:string; registrationRounds: RegistrationRound[];
  teams: {id:string; status:string; members:{id:string;npc?:true}[]}[];
  matches: { games?: {
    battleId:string; attackerTeamId:string; defenderTeamId:string; winnerTeamId:string;
    endReason?:SnowTournamentTerminal["endReason"]; participants?:SnowTournamentTerminal["participants"];
  }[] }[];
  bracket: { championTeamId:string|null };
  settledGrants?: Record<string,GrantResult>;
  settledFurniture?:Record<string,FurnitureReceipt>;
  settledHarvest?:Record<string,HarvestReceipt>;
};
type Charge = {paymentId:string;residentId:string;gold:number};
type ChargeResult = Charge & { outcome:"paid"|"failed"; journalId?:string };
type Refund = Charge & { refundId:string };
type Grant = { id:string; residentId:string; kind:"match"|"attendance"|"champion"; gold:number; silver:number };
type GrantResult = Grant & { journalIds:string[] };
export type FurnitureGrant={id:string;editionId:string;residentId:string;itemId:"farm_decor:snow_king"};
export type FurnitureReceipt=FurnitureGrant & {quantity:1;grantedAt:number;expiresAt:number};
export type HarvestGrant={id:string;editionId:string;residentId:string};
export type HarvestReceipt=HarvestGrant & {bonusPercent:15;grantedAt:number;expiresAt:number};
export const CHAMPION_HARVEST_MS=7*24*60*60*1000;
export interface SnowTournamentEconomy {
  charge(input:Charge):Promise<ChargeResult|null>;
  /** Read-only: a cancelled or expired signup must never issue a new charge. */
  findCharge(input:Charge):Promise<ChargeResult|null>;
  refund(input:Refund):Promise<(Refund & {journalId:string})|null>;
  grant(input:Grant):Promise<GrantResult|null>;
  grantFurniture?(input:FurnitureGrant):Promise<FurnitureReceipt|null>;
  grantHarvest?(input:HarvestGrant):Promise<HarvestReceipt|null>;
}
const gold = 10_000;
const roles = ["attack","defend"] as const;
const grantKey = (...parts:string[]) => JSON.stringify(["snow-tournament",...parts]);

const canCharge=(edition:SettlementEdition,round:RegistrationRound,now:number)=>edition.phase==="team_formation" &&
  round.status==="paying" && (now<Date.parse(edition.teamFormationCloseAt)||round.deadlineConfirmedAt!==undefined);
const paymentPending=(edition:SettlementEdition,round:RegistrationRound,item:TournamentPayment,now:number)=>
  item.charge==="unknown" || item.refund==="pending" || item.charge==="not_started" && canCharge(edition,round,now);

export function planSnowTournamentGrants(edition: SettlementEdition): Grant[] {
  const grants:Grant[] = [];
  const members = new Map<string,{valid:number;expected:number;team:string}>();
  const naturalTeams = new Set<string>();
  for (const match of edition.matches) for (const game of match.games ?? []) {
    if (!game.participants || !game.endReason) continue;
    for (const role of roles) {
      const person = game.participants[role];
      const team = role==="attack"?game.attackerTeamId:game.defenderTeamId;
      const attendance = members.get(person.residentId) ?? {valid:0,expected:0,team};
      attendance.expected++;
      members.set(person.residentId,attendance);
      if (!person.human || (game.endReason==="surrender" && game.winnerTeamId!==team)) continue;
      attendance.valid++;
      if (game.endReason!=="surrender") naturalTeams.add(team);
      grants.push({id:grantKey(edition.id,game.battleId,person.residentId),residentId:person.residentId,kind:"match",gold:30_000,silver:30});
    }
  }
  if (edition.phase!=="completed") return grants;
  for (const [residentId,attendance] of members) {
    if (attendance.valid && attendance.valid===attendance.expected && edition.teams.find(t=>t.id===attendance.team)?.status!=="withdrawn") {
      grants.push({id:grantKey(edition.id,"attendance",residentId),residentId,kind:"attendance",gold:50_000,silver:50});
    }
  }
  const champion=edition.bracket.championTeamId;
  if (champion && naturalTeams.has(champion)) for (const member of edition.teams.find(t=>t.id===champion)?.members ?? []) {
    if (member.npc) continue;
    const residentId=member.id;
    grants.push({id:grantKey(edition.id,"champion",residentId),residentId,kind:"champion",gold:100_000,silver:100});
  }
  return grants;
}

export function planSnowTournamentFurniture(edition:SettlementEdition):FurnitureGrant[] {
  return planSnowTournamentGrants(edition).filter(grant=>grant.kind==="champion").map(grant=>({
    id:grantKey(edition.id,"furniture",grant.residentId),editionId:edition.id,residentId:grant.residentId,itemId:"farm_decor:snow_king",
  }));
}

export function planSnowTournamentHarvest(edition:SettlementEdition):HarvestGrant[] {
  return planSnowTournamentGrants(edition).filter(grant=>grant.kind==="champion").map(grant=>({
    id:grantKey(edition.id,"harvest",grant.residentId),editionId:edition.id,residentId:grant.residentId,
  }));
}

/** Each reward is confirmed by its own authoritative Farm receipt. */
export class SnowTournamentSettlement {
  private readonly inflight = new Map<string,Promise<{id:string;error:unknown}[]>>();
  private readonly requested=new Set<string>();
  constructor(private readonly store:SnowTournamentStore,private readonly teams:SnowTournamentTeamService,
    private readonly economy:SnowTournamentEconomy,private readonly now:()=>number=Date.now) {}

  /** A deadline roster may have been stored after an older reconciliation took its snapshot. */
  async settleRegistration(editionId:string) {
    const pending=this.inflight.get(editionId);
    if(pending)await pending;
    return this.reconcile(editionId);
  }

  reconcile(editionId:string) {
    const active=this.inflight.get(editionId);
    if (active) {this.requested.add(editionId);return active;}
    const operation=(async()=>{
      let failures:{id:string;error:unknown}[];
      do {this.requested.delete(editionId);failures=await this.advance(editionId);} while(this.requested.has(editionId));
      return failures;
    })().finally(()=>this.inflight.delete(editionId));
    this.inflight.set(editionId,operation);
    return operation;
  }

  private edition(id:string) { return this.store.read(id) as SettlementEdition | null; }
  hasPending(value:unknown):boolean {
    const edition=value as SettlementEdition;
    const now=this.now();
    return edition.registrationRounds.some(round=>round.payments.some(item=>paymentPending(edition,round,item,now))) ||
      planSnowTournamentGrants(edition).some(grant=>!edition.settledGrants?.[grant.id]) ||
      planSnowTournamentFurniture(edition).some(grant=>!edition.settledFurniture?.[grant.id]) ||
      !!this.economy.grantHarvest && planSnowTournamentHarvest(edition).some(grant=>!edition.settledHarvest?.[grant.id]);
  }
  private async advance(editionId:string) {
    const failures:{id:string;error:unknown}[]=[];
    const edition=this.edition(editionId);
    if (!edition) return failures;
    const now=this.now();
    const harvest=this.settleHarvest(edition);
    for (const row of edition.registrationRounds) for (const item of row.payments) {
      if (!paymentPending(edition,row,item,now)) continue;
      try { await this.payment(editionId,row.id,item.paymentId); }
      catch (error) { failures.push({id:item.paymentId,error}); }
    }
    for (const grant of planSnowTournamentGrants(edition)) {
      if (edition.settledGrants?.[grant.id]) continue;
      try {
        const receipt=await this.economy.grant(grant);
        if (!receipt) throw new Error("snow_grant_unconfirmed");
        if (receipt.id!==grant.id || receipt.residentId!==grant.residentId || receipt.gold!==grant.gold ||
            receipt.silver!==grant.silver || receipt.kind!==grant.kind ||
            receipt.journalIds.length!==Number(grant.gold>0)+Number(grant.silver>0) ||
            new Set(receipt.journalIds).size!==receipt.journalIds.length ||
            receipt.journalIds.some(id=>typeof id!=="string" || !id)) {
          throw new Error("snow_grant_receipt_mismatch");
        }
        this.store.saveSettlementReceipt(editionId,"settledGrants",receipt);
      } catch (error) { failures.push({id:grant.id,error}); }
    }
    for(const grant of planSnowTournamentFurniture(edition)) {
      if(edition.settledFurniture?.[grant.id]) continue;
      try {
        const receipt=await this.economy.grantFurniture?.(grant);
        if(!receipt) throw new Error("snow_furniture_unconfirmed");
        if(receipt.id!==grant.id || receipt.editionId!==grant.editionId || receipt.residentId!==grant.residentId || receipt.itemId!==grant.itemId ||
          receipt.quantity!==1 || !Number.isSafeInteger(receipt.grantedAt) || !Number.isSafeInteger(receipt.expiresAt) ||
          receipt.expiresAt<receipt.grantedAt+30*24*60*60*1000) throw new Error("snow_furniture_receipt_mismatch");
        this.store.saveSettlementReceipt(editionId,"settledFurniture",receipt);
      } catch(error) {failures.push({id:grant.id,error});}
    }
    return failures.concat(await harvest);
  }

  private async settleHarvest(edition:SettlementEdition) {
    if (!this.economy.grantHarvest) return [];
    const pending=planSnowTournamentHarvest(edition).filter(grant=>!edition.settledHarvest?.[grant.id]);
    const results=await Promise.all(pending.map(async grant=>{
      try {
        const receipt=await this.economy.grantHarvest!(grant);
        if (!receipt) throw new Error("snow_harvest_unconfirmed");
        if (receipt.id!==grant.id || receipt.editionId!==grant.editionId || receipt.residentId!==grant.residentId ||
          receipt.bonusPercent!==15 || !Number.isSafeInteger(receipt.grantedAt) || receipt.grantedAt<0 ||
          !Number.isSafeInteger(receipt.expiresAt) || receipt.expiresAt!==receipt.grantedAt+CHAMPION_HARVEST_MS)
          throw new Error("snow_harvest_receipt_mismatch");
        this.store.saveSettlementReceipt(edition.id,"settledHarvest",receipt);
        return null;
      } catch (error) { return {id:grant.id,error}; }
    }));
    return results.filter(result=>result!==null);
  }

  private async payment(editionId:string,roundId:string,paymentId:string) {
    const snapshot=()=>{
      const edition=this.edition(editionId)!;
      const round=edition.registrationRounds.find(r=>r.id===roundId)!;
      return {edition,round,payment:round.payments.find(p=>p.paymentId===paymentId)!};
    };
    const open=(state:ReturnType<typeof snapshot>)=>canCharge(state.edition,state.round,this.now());
    let current=snapshot();
    const input={paymentId,residentId:current.payment.residentId,gold};
    if (current.payment.charge==="not_started" && open(current)) {
      this.teams.paymentTransition(editionId,roundId,{kind:"dispatch",residentId:input.residentId});
      current=snapshot();
    }
    if (current.payment.charge==="unknown") {
      const receipt=open(current)?await this.economy.charge(input):await this.economy.findCharge(input);
      if (!receipt) throw new Error("snow_payment_unconfirmed");
      if (receipt) {
        if (!this.matches(input,receipt) || (receipt.outcome==="paid" && !receipt.journalId)) throw new Error("snow_payment_receipt_mismatch");
        this.teams.paymentTransition(editionId,roundId,{kind:"charge_result",paymentId,outcome:receipt.outcome,receivedAt:this.now()});
        current=snapshot();
      }
    }
    const payment=current.payment;
    if (payment.refund==="pending") {
      const request={...input,refundId:refundId(payment)};
      const receipt=await this.economy.refund(request);
      if (!receipt) throw new Error("snow_refund_unconfirmed");
      if (receipt) {
        if (!this.matches(input,receipt) || receipt.refundId!==request.refundId || !receipt.journalId) throw new Error("snow_refund_receipt_mismatch");
        this.teams.paymentTransition(editionId,roundId,{kind:"refund_confirmed",paymentId});
      }
    }
  }

  private matches(input:Charge,receipt:Charge) {
    return input.paymentId===receipt.paymentId && input.residentId===receipt.residentId && input.gold===receipt.gold;
  }
}

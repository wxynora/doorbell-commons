import type { SnowTournamentStore } from "./store.js";
import type { SnowTournamentTeamService, SnowTournamentIdentityPort } from "./team-service.js";
import type { SnowTournamentMatchHost } from "./match-host.js";
import type { SnowTournamentService } from "./service.js";
import { planSnowTournamentFurniture, type FurnitureReceipt } from "./settlement.js";

type Ref={editionId:string;matchId:string};
type WithoutActor<T>=T extends unknown?Omit<T,"actorId"|"now"|"revision">:never;
type TeamInput=WithoutActor<Parameters<SnowTournamentTeamService["execute"]>[0]>;

/** The transport supplies authenticated identity once. Input schemas never contain an actor field. */
export function snowTournamentForResident(residentId:string,options:{
  store:SnowTournamentStore;
  identity:SnowTournamentIdentityPort;
  teams:SnowTournamentTeamService;
  publicService:SnowTournamentService;
  host:SnowTournamentMatchHost|null;
  now?:()=>number;
}) {
  const now=options.now??Date.now;
  const authorize=async()=>{
    const identity=await options.identity.requireActive(residentId);
    if (identity.id!==residentId) throw new Error("identity_mismatch");
  };
  const host=()=>{if(!options.host)throw new Error("snow_runtime_unavailable");return options.host;};
  return {
    async overview(editionId?:string) {
      await authorize();
      const publicState=options.publicService.readPublic(editionId);
      const id=publicState.edition?.id;
      if (!id) return {publicState,offers:[],registration:[]};
      const state=options.store.read(id) as Omit<Parameters<typeof planSnowTournamentFurniture>[0],"teams"> & {
        teams:{id:string;status:string;captainId:string|null;members:{id:string}[]}[];
        offers:{teamId:string;residentId:string;kind:string}[];
        registrationRounds:{teamId:string;id:string;status:string;payments:{residentId:string;charge:string;refund:string}[]}[];
      };
      const own=state.teams.find(team=>team.members.some(member=>member.id===residentId));
      return {publicState,
        furniture:planSnowTournamentFurniture(state).filter(grant=>grant.residentId===residentId).map(grant=>{
          const receipt: FurnitureReceipt|undefined=state.settledFurniture?.[grant.id];
          return receipt?{itemId:receipt.itemId,status:receipt.expiresAt>now()?"confirmed":"expired",quantity:receipt.quantity,
            grantedAt:receipt.grantedAt,expiresAt:receipt.expiresAt}:{itemId:grant.itemId,status:"pending"};
        }),
        offers:state.offers.filter(offer=>offer.residentId===residentId || (offer.kind==="request" && own?.captainId===residentId && offer.teamId===own.id)),
        registration:state.registrationRounds.filter(round=>round.payments.some(p=>p.residentId===residentId) &&
          (round.status!=="cancelled"||round.payments.some(p=>p.residentId===residentId&&(p.charge==="unknown"||p.refund==="pending")))).map(round=>({
          id:round.id,teamId:round.teamId,status:round.status,payments:round.payments.filter(p=>p.residentId===residentId),
        }))};
    },
    async team(input:TeamInput) {
      await authorize();
      const state=options.store.read(input.editionId) as {revision:number}|null;
      if (!state) throw new Error("edition_not_found");
      return options.teams.execute({...input,actorId:residentId,now:new Date(now()).toISOString(),revision:state.revision});
    },
    async state(ref:Ref) {await authorize();return host().playerState(ref,residentId,now());},
    async ready(ref:Ref,battleId:string) {await authorize();return host().ready(ref,residentId,battleId,now());},
    async lineup(ref:Ref,entries:Parameters<SnowTournamentMatchHost["lineup"]>[2],confirmed:boolean) {
      await authorize();return host().lineup(ref,residentId,entries,confirmed,now());
    },
    async openingSide(ref:Ref,side:"attack"|"defend") {await authorize();return host().chooseOpeningSide(ref,residentId,side,now());},
    async chat(ref:Ref,requestId:string,text:string|null) {await authorize();return host().speak(ref,residentId,requestId,text,now());},
    async surrender(ref:Ref,battleId:string) {await authorize();return host().surrender(ref,residentId,battleId);},
    async command(ref:Ref,input:{battleId:string;requestId:string;actions:Parameters<SnowTournamentMatchHost["submit"]>[4];waitTicks:number}) {
      await authorize();return host().submit(ref,residentId,input.battleId,input.requestId,input.actions,input.waitTicks);
    },
  };
}

import { allFarms, replaceFarm, withWorldCommitContext } from "../../store.js";
import { decorationState } from "../../domain/farm-decoration/state.js";
import { stageChampionFurniture, validateChampionGrant } from "../../domain/farm-decoration/champion-lease.js";

export function createTournamentFurnitureService({farms=allFarms,commit=replaceFarm,checkpoint=withWorldCommitContext,now=Date.now}={}) {
  return {
    grant(input) {
      validateChampionGrant(input);
      const matches=farms().filter(farm=>farm.doorbellMcpMigration?.residentId===input.resident_id);
      if(matches.length!==1) throw new Error("champion_furniture_binding_unavailable");
      const farm=matches[0],at=now();
      const {working,receipt}=stageChampionFurniture(farm,input,at,decorationState(farm,at));
      if(working) checkpoint({balanceAuthority:"ledger",actor:"system"},()=>commit(farm.id,working));
      return receipt;
    },
  };
}
export async function handleTournamentFurniture(req,res,method,_runtime,io) {
  if(!io.authorize(req,res,method)) return;
  try {
    const input=await io.readBody(req);
    return io.jsonOut(res,200,createTournamentFurnitureService().grant(input));
  } catch(error) {
    const code=error?.message;
    if(code==="invalid_champion_furniture_grant" || code==="invalid_json")
      return io.error(res,400,"invalid_request","invalid_request");
    if(code==="champion_furniture_conflict") return io.error(res,409,"reward_conflict","reward_conflict");
    return io.error(res,503,"service_unavailable","service_unavailable");
  }
}

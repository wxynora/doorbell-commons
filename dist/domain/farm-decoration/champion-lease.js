import { cloneFarmForMutation } from "../../farm-mutation-scope.js";
export const CHAMPION_FURNITURE_ID="farm_decor:snow_king";
export const CHAMPION_LEASE_MS=30*24*60*60*1000;
export const FINALIST_LEASE_MS=15*24*60*60*1000;

export function validateChampionGrant(input) {
  if(!input || typeof input!=="object" || Array.isArray(input) ||
      Object.keys(input).sort().join(",")!=="edition_id,grant_id,item_id,resident_id" ||
      typeof input.resident_id!=="string" || !input.resident_id ||
      !/^snow-tournament:\d{4}-(0[1-9]|1[0-2])$/.test(input.edition_id) ||
      input.item_id!==CHAMPION_FURNITURE_ID ||
      input.grant_id!==JSON.stringify(["snow-tournament",input.edition_id,"furniture",input.resident_id]))
    throw new Error("invalid_champion_furniture_grant");
}
export function championLease(farm) {return farm.snowTournamentFurniture?.lease??null;}
export function championLeaseSuffix(resource,itemId) {
  const expiry=itemId===CHAMPION_FURNITURE_ID?resource.inventory.find(item=>item.item_id===itemId)?.expires_at:null;
  if(!expiry)return "";
  const time=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(expiry));
  return `（使用权至${time} 北京时间）`;
}
export function championLeaseActive(farm,now=Date.now()) {
  const lease=championLease(farm);
  return !!lease && Number.isSafeInteger(lease.expires_at) && lease.expires_at>now;
}
export function currentChampionLayout(farm,layout,now=Date.now()) {
  if(championLeaseActive(farm,now)) return layout;
  return {...layout,decorations:layout.decorations.filter(item=>item.item_id!==CHAMPION_FURNITURE_ID)};
}
// A pure authority projection: an expired instance is neither owned nor visible,
// even before the next normal world checkpoint. Historical receipts stay intact.
export function currentChampionState(farm,state,now=Date.now()) {
  if(championLeaseActive(farm,now)) return state;
  const owned={...state.owned};delete owned[CHAMPION_FURNITURE_ID];
  return {...state,owned,layout:currentChampionLayout(farm,state.layout,now)};
}

export function applySnowKingLease(working,farm,state,editionId,now,leaseMs) {
  const current=currentChampionState(farm,state,now);
  const expires_at=Math.max(now+leaseMs,championLease(farm)?.expires_at??0);
  working.farmDecorations={...current,owned:{...current.owned,[CHAMPION_FURNITURE_ID]:1}};
  if(working.farmDecorationLayouts) working.farmDecorationLayouts=working.farmDecorationLayouts.map(slot=>
    ({...slot,layout:currentChampionLayout(farm,slot.layout,now)}));
  working.snowTournamentFurniture={...working.snowTournamentFurniture,lease:{edition_id:editionId,granted_at:now,expires_at}};
  return expires_at;
}

export function stageChampionFurniture(farm,input,now,state) {
  validateChampionGrant(input);
  if(!Number.isSafeInteger(now) || now<0) throw new Error("invalid_champion_grant_time");
  const reference=JSON.stringify([input.edition_id,input.grant_id,input.resident_id,input.item_id]),previous=farm.snowTournamentFurniture?.receipts??{};
  if(Object.hasOwn(previous,input.grant_id)) {
    const saved=previous[input.grant_id];
    if(saved.reference!==reference) throw new Error("champion_furniture_conflict");
    return {working:null,receipt:structuredClone(saved.receipt)};
  }
  const working=cloneFarmForMutation(farm);
  const expires_at=applySnowKingLease(working,farm,state,input.edition_id,now,CHAMPION_LEASE_MS);
  const receipt={ok:true,...input,quantity:1,granted_at:now,expires_at};
  working.snowTournamentFurniture.receipts={...previous,[input.grant_id]:{reference,receipt}};
  return {working,receipt};
}

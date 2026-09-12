type Profile={name:string;avatarUrl?:string};
type Seat={playerId:string;residentId?:string|null;controllerType?:'human'|'resident'};
/** Display only. Input profiles retain registered combination names. */
export function gamePlayerProfiles(seats:readonly Seat[],profiles:Readonly<Record<string,Profile>>):Record<string,Profile>{
 const result={...profiles};
 for(const seat of seats){
  const profile=(seat.residentId?profiles['resident:'+seat.residentId]:undefined)??profiles[seat.playerId];
  if(!profile)continue;
  const split=profile.name.indexOf('&');
  const human=seat.controllerType==='human'||(!seat.controllerType&&seat.playerId.startsWith('human:'));
  const name=split<0?profile.name:(human?profile.name.slice(0,split):profile.name.slice(split+1)).trim();
  result[seat.playerId]={...profile,name:name||profile.name};
 }
 return result;
}

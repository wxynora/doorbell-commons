export const SNOW_TEAM_SIZE = 3;
export const snowTeamLimit = (enrolled:number) => Math.ceil(enrolled/SNOW_TEAM_SIZE);
export const snowTeamHasOpenSeat = (team:{status:string;members:readonly unknown[]}) =>
  team.status!=="withdrawn" && team.members.length<SNOW_TEAM_SIZE;

export type SnowTeamMember = {id:string;name:string;npc?:true};
export function snowNpcName(id:string):string|undefined {
  const seat=/^snow-npc:.+:([123])$/.exec(id)?.[1];
  return seat===undefined?undefined:`NPC ${seat}`;
}
export function fillSnowTeamSeats(team:{id:string;members:SnowTeamMember[]}) {
  while (team.members.length<SNOW_TEAM_SIZE) {
    const seat=team.members.length+1;
    team.members.push({id:`snow-npc:${team.id}:${seat}`,name:`NPC ${seat}`,npc:true});
  }
}

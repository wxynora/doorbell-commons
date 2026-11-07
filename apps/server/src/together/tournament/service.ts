import type { SnowTournamentResponse } from "@doorbell/protocol";
import type { SnowTournamentStore } from "./store.js";
import { snowTeamLimit } from "./roster.js";

export class SnowTournamentService {
  constructor(private readonly store: SnowTournamentStore, private readonly project: (value: unknown) => SnowTournamentResponse,
    private readonly displayName: (name: string) => string,
    private readonly live?: (ref:{editionId:string;matchId:string})=>{scheduledAt:string;started:boolean}|null) {}
  subscribe(listener:()=>void) {return this.store.subscribe(listener);}
  /** Parse into the explicit public schema: unknown fields, including drafts, are discarded. */
  readPublic(editionId?: string): SnowTournamentResponse {
    const edition = editionId ? this.store.read(editionId) : this.store.latest();
    if (edition === null) return this.project({ edition:null });
    const raw = edition as { id:string; enrollments?:unknown[]; teams: { members: { name:string }[] }[]; matches:{id:string; status:string;
      games?:{attackerTeamId:string; defenderTeamId:string; winnerTeamId:string; coreDamage:number; breakTimeRemaining:number; endTick?:number; endReason?:string}[]}[] };
    // Do not publish per-person economic state or even an inferred team settlement status.
    return this.project({ edition:{...raw,enrolledCount:raw.enrollments?.length??0,teamLimit:snowTeamLimit(raw.enrollments?.length??0), matches:raw.matches.map(match => {
      const progress = this.live?.({editionId:raw.id,matchId:match.id});
      return {...match, ...(progress ? {scheduledAt:progress.scheduledAt,
        status:match.status==="scheduled" && progress.started ? "in_progress" : match.status} : {}),roundResults:(match.games??[]).map((game,index)=>({
      index:index+1,attackerTeamId:game.attackerTeamId,defenderTeamId:game.defenderTeamId,winnerTeamId:game.winnerTeamId,
      coreHp:20-game.coreDamage,endTick:game.endTick??600-game.breakTimeRemaining,
      endReason:game.endReason??(game.winnerTeamId===game.attackerTeamId?"core_broken":"time_limit"),
    }))};
    }), teams:raw.teams.map(team => ({...team, members:team.members.map(member => {
      const name=this.displayName(member.name);
      if (!name.trim() || (member.name.includes("&") && name===member.name)) throw new Error("resident_display_name_unavailable");
      return {...member,name};
    })})), rewards:[]} });
  }
}

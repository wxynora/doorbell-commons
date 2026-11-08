import type { SnowTournamentResponse } from "@doorbell/protocol";
import type { SnowTournamentStore } from "./store.js";
import { snowTeamLimit } from "./roster.js";
import type { SnowTournamentSpectators } from "./spectators.js";

export class SnowTournamentService {
  constructor(private readonly store: SnowTournamentStore, private readonly project: (value: unknown) => SnowTournamentResponse,
    private readonly displayName: (name: string) => string,
    private readonly live?: (ref:{editionId:string;matchId:string})=>{scheduledAt:string;started:boolean}|null,
    readonly spectators?: SnowTournamentSpectators, private readonly now = Date.now) {}
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
      return {...match, ...this.publicPairings(raw,match.id), ...(progress ? {scheduledAt:progress.scheduledAt,
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

  private publicPairings(raw: unknown, matchId: string) {
    type Person = { id: string; name: string; npc?: boolean };
    type Participant = { residentId: string; human: boolean };
    const edition = raw as { id:string; teams: { id: string; members: Person[] }[];
      matches: { id: string; teamAId: string; teamBId: string; games?: { participants?: Record<"attack" | "defend", Participant> }[] }[] };
    const match = edition.matches.find(entry => entry.id === matchId)!;
    const state = this.store.readMatchRuntime(edition.id,matchId) as {
      matchAt: number; teamIds: string[]; attackers: string[] | null;
      lineups: Record<string, { entries: { member: string }[] } | undefined>;
      active: { index: number; members: Record<"attack" | "defend",string>; npc: string[] } | null;
    } | null;
    const currentGameIndex = state?.active ? state.active.index + 1 : null;
    const pairings: NonNullable<NonNullable<SnowTournamentResponse["edition"]>["matches"][number]["pairings"]> = [];
    const person = (id: string, automated: boolean) => {
      const member = edition.teams.flatMap(team => team.members).find(entry => entry.id === id);
      return member ? { id, name: this.displayName(member.name), npc: !!member.npc, automated } : null;
    };
    for (let index = 0; index < 3; index++) {
      const recorded = match.games?.[index]?.participants;
      let ids: Record<"attack" | "defend",string> | null = recorded ? { attack: recorded.attack.residentId, defend: recorded.defend.residentId } : null;
      if (!ids && state && this.now() >= state.matchAt && state.attackers) {
        const attackTeam = edition.teams.find(team => team.id === state.attackers![index]);
        const defendTeam = edition.teams.find(team => [match.teamAId,match.teamBId].includes(team.id) && team.id !== attackTeam?.id);
        const pick = (team: typeof attackTeam) => team && (state.lineups[String(state.teamIds.indexOf(team.id))]?.entries[index]?.member ?? team.members[index]?.id);
        const attack = pick(attackTeam), defend = pick(defendTeam);
        if (attack && defend) ids = { attack, defend };
        if (state.active?.index === index) ids = state.active.members;
      }
      if (!ids) continue;
      const automated = (side: "attack" | "defend") => recorded ? !recorded[side].human : state?.active?.index === index && !!state.active.npc.includes(ids![side]);
      const attack = person(ids.attack,!!automated("attack")), defend = person(ids.defend,!!automated("defend"));
      if (attack && defend) pairings.push({ index:index+1, attack, defend });
    }
    return { currentGameIndex, pairings };
  }
}

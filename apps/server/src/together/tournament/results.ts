import { rankTeams, seedKnockout, type RankingMatch } from "./competition.js";
import type { SnowTournamentCalendar } from "./calendar.js";
import { cancelRegistration, type RegistrationRound } from "./registration.js";
import { SnowTournamentStore } from "./store.js";

type Game = { battleId:string; attackerTeamId:string; defenderTeamId:string; winnerTeamId:string; coreDamage:number; breakTimeRemaining:number;
  endTick?:number; endReason?:SnowTournamentTerminal["endReason"]; participants?:SnowTournamentTerminal["participants"] };
type Match = { id:string; stage:"round_robin"|"semifinal"|"final"; round:number; teamAId:string|null; teamBId:string|null; attackerTeamId:string|null; defenderTeamId:string|null; status:"scheduled"|"in_progress"|"completed"|"forfeit"|"cancelled"; scheduledAt:string|null; score:[number,number]|null; winnerTeamId:string|null; games?:Game[]; plannedAttackers?:[string,string,string] };
type State = { id:string; phase:string; rulesVersion:string; registrationOpenAt:string; revision:number; battleStarted?:boolean; calendar?:SnowTournamentCalendar;
  teams:{id:string;status:string;drawOrder:number|null;captainId:string|null;members:{id:string;npc?:true}[];ineligibleMemberIds?:string[]}[]; matches:Match[]; standings:unknown[];
  bracket:{semifinalMatchIds:string[];finalMatchId:string|null;championTeamId:string|null}; registrationRounds:RegistrationRound[] };

export type SnowTournamentTerminal = {
  battleId:string; rulesVersion:string; attackSideId:string; defendSideId:string;
  status:"attack_win"|"defend_win"; endReason:"core_broken"|"time_limit"|"surrender";
  tick:number; coreHp:number; surrenderedBy?:"attack"|"defend"; finishedAt?:number;
  participants?:Record<"attack"|"defend",{residentId:string;human:boolean}>;
};

/** Trusted host must read its same-connection engine save and validate its binding to this exact tournament match and game index. */
export interface SnowTournamentEnginePort {
  hasStarted(editionId:string):boolean | null;
  /** Reads the persisted pre-battle choice and draw, never derived from a finished game. */
  readLockedAttackers(input:{editionId:string;matchId:string}):[string,string,string] | null;
  readTerminal(input:{editionId:string;matchId:string;gameIndex:0|1|2}): SnowTournamentTerminal | null;
}

export class SnowTournamentResults {
  constructor(private readonly store:SnowTournamentStore, private readonly engine:SnowTournamentEnginePort,
    private readonly now:()=>number=Date.now) {}
  private state(id:string):State { const state=this.store.read(id) as State|null; if (!state) throw new Error("edition_not_found"); return state; }

  private finish(editionId:string,match:Match,status:"completed"|"forfeit"|"cancelled",at:number) {
    if (match.status==="scheduled" || match.status==="in_progress") this.store.scheduleSnapshotExpiry(editionId,match.id,at);
    match.status=status;
  }

  /** Called by the trusted host, never by a player; there is no winner argument. */
  consumeTerminal(editionId:string,matchId:string,gameIndex:0|1|2):void {
    this.store.transaction(() => {
      const state=this.state(editionId), match=state.matches.find(m=>m.id===matchId);
      if (!match || !match.teamAId || !match.teamBId) throw new Error("match_not_available");
      const battle=this.engine.readTerminal({editionId,matchId,gameIndex});
      if (!battle || !battle.battleId || !["attack_win","defend_win"].includes(battle.status) || battle.rulesVersion!==state.rulesVersion ||
          !Number.isInteger(battle.tick) || battle.tick<0 || battle.tick>600 || !Number.isFinite(battle.coreHp) || battle.coreHp<0 || battle.coreHp>20 ||
          (battle.endReason==="surrender" ? battle.surrenderedBy!==(battle.status==="attack_win"?"defend":"attack") || battle.coreHp<=0 || battle.tick>=600
            : battle.status==="attack_win" ? battle.endReason!=="core_broken" || battle.coreHp!==0
            : battle.endReason!=="time_limit" || battle.tick!==600 || battle.coreHp<=0)) throw new Error("engine_terminal_unverified");
      const pair=[battle.attackSideId,battle.defendSideId];
      if (pair[0]===pair[1] || !pair.includes(match.teamAId) || !pair.includes(match.teamBId) ||
          (match.stage==="round_robin" && (match.attackerTeamId!==pair[0] || match.defenderTeamId!==pair[1]))) throw new Error("engine_sides_mismatch");
      if (match.stage!=="round_robin") {
        const plan=this.engine.readLockedAttackers({editionId,matchId});
        if (!plan || plan.some(id=>id!==match.teamAId && id!==match.teamBId) || plan[0]===plan[1] || plan[gameIndex]!==pair[0] ||
            (match.plannedAttackers && match.plannedAttackers.some((id,i)=>id!==plan[i]))) throw new Error("knockout_directions_unverified");
        match.plannedAttackers=plan;
      }
      const games=match.games ?? [];
      const breakTimeRemaining=battle.endReason==="core_broken"?600-battle.tick:0;
      if (battle.participants && [battle.participants.attack,battle.participants.defend].some((person,i) =>
        !state.teams.find(team=>team.id===pair[i])?.members.some(member=>member.id===person.residentId))) throw new Error("engine_participants_mismatch");
      if (games[gameIndex]) {
        const existing=games[gameIndex]!;
        if (existing.battleId!==battle.battleId || existing.attackerTeamId!==pair[0] || existing.defenderTeamId!==pair[1] ||
            existing.winnerTeamId!==(battle.status==="attack_win"?pair[0]:pair[1]) || existing.coreDamage!==20-battle.coreHp ||
            existing.breakTimeRemaining!==breakTimeRemaining || (existing.endTick!==undefined && existing.endTick!==battle.tick) ||
            (existing.endReason!==undefined && existing.endReason!==battle.endReason)) throw new Error("engine_replay_conflict");
        return;
      }
      if (!["round_robin","knockout"].includes(state.phase)) throw new Error("match_not_available");
      if (match.status!=="scheduled" && match.status!=="in_progress") throw new Error("match_not_available");
      if (gameIndex!==games.length || state.matches.some(m=>m.games?.some(g=>g.battleId===battle.battleId))) throw new Error("engine_round_conflict");
      games.push({battleId:battle.battleId,attackerTeamId:pair[0]!,defenderTeamId:pair[1]!,winnerTeamId:battle.status==="attack_win"?pair[0]!:pair[1]!,
        coreDamage:20-battle.coreHp,breakTimeRemaining,endTick:battle.tick,endReason:battle.endReason,
        ...(battle.participants ? {participants:battle.participants} : {})});
      match.games=games; state.battleStarted=true; match.status="in_progress";
      if (games[2]) {
        const a=games.filter(g=>g.winnerTeamId===match.teamAId).length;
        const now=this.now(), terminalAt=battle.finishedAt;
        const at=terminalAt!==undefined && Number.isSafeInteger(terminalAt) && terminalAt>=0 && terminalAt<=now ? terminalAt : now;
        match.score=[a,3-a]; match.winnerTeamId=a>=2?match.teamAId:match.teamBId;
        this.finish(state.id,match,"completed",at);
        this.advance(state,now);
      }
      state.revision++; this.store.save(state.id,state.registrationOpenAt,state);
    });
  }

  /** Trusted eligibility/withdrawal coordinator, not a player-supplied administrative result. */
  withdrawTeam(editionId:string,teamId:string):void {
    this.withdrawTeams(editionId,[teamId]);
  }
  /** Multiple simultaneous exits are evaluated together before advancing the fixed bracket. */
  withdrawTeams(editionId:string,teamIds:string[]):void {
    this.store.transaction(() => {
      const state=this.state(editionId);
      if (!teamIds.length || new Set(teamIds).size!==teamIds.length || !["round_robin","knockout"].includes(state.phase) || teamIds.some(id=>!state.teams.some(t=>t.id===id))) throw new Error("team_not_available");
      const changed=teamIds.filter(id=>state.teams.find(t=>t.id===id)!.status!=="withdrawn");
      if (!changed.length) return;
      const started=this.engine.hasStarted(editionId);
      if (started===null || (!started && state.battleStarted)) throw new Error("engine_start_unverified");
      state.battleStarted ||= started;
      this.applyWithdrawals(state,changed);
      state.revision++; this.store.save(state.id,state.registrationOpenAt,state);
    });
  }

  /** Access revocation itself stays in the existing identity authority; this records NPC eligibility only. */
  excludeMember(editionId:string,residentId:string):void {
    this.store.transaction(() => {
      const state=this.state(editionId), team=state.teams.find(t=>t.members.some(m=>m.id===residentId) && t.status!=="withdrawn");
      if (!team || !["round_robin","knockout"].includes(state.phase)) throw new Error("member_not_available");
      const excluded=team.ineligibleMemberIds ?? [];
      if (excluded.includes(residentId)) return;
      excluded.push(residentId); team.ineligibleMemberIds=excluded;
      if (team.captainId===residentId) team.captainId=team.members.find(m=>!m.npc&&!excluded.includes(m.id))?.id ?? null;
      if (team.members.every(m=>m.npc||excluded.includes(m.id))) {
        const started=this.engine.hasStarted(editionId);
        if (started===null || (!started && state.battleStarted)) throw new Error("engine_start_unverified");
        state.battleStarted ||= started; this.applyWithdrawals(state,[team.id]);
      }
      state.revision++; this.store.save(state.id,state.registrationOpenAt,state);
    });
  }

  private applyWithdrawals(state:State,teamIds:string[]):void {
      const now=this.now();
      for (const teamId of teamIds) state.teams.find(t=>t.id===teamId)!.status="withdrawn";
      if (!state.battleStarted) for (const round of state.registrationRounds.filter(r=>teamIds.includes(r.teamId))) cancelRegistration(round);
      if (!state.battleStarted && state.teams.filter(t=>t.drawOrder!==null && t.status!=="withdrawn").length<2) {
        for (const round of state.registrationRounds) cancelRegistration(round);
        for (const match of state.matches) { this.finish(state.id,match,"cancelled",now); match.winnerTeamId=null; match.score=null; }
        state.phase="cancelled"; return;
      }
      for (const match of state.matches) {
        if (!teamIds.some(teamId=>[match.teamAId,match.teamBId].includes(teamId))) continue;
        if (state.phase==="knockout" && match.stage==="round_robin") continue;
        if (match.stage!=="round_robin" && ["completed","forfeit","cancelled"].includes(match.status)) continue;
        const a=state.teams.find(t=>t.id===match.teamAId)?.status==="withdrawn";
        const b=state.teams.find(t=>t.id===match.teamBId)?.status==="withdrawn";
        this.finish(state.id,match,a&&b?"cancelled":"forfeit",now);
        match.winnerTeamId=a&&b?null:a?match.teamBId:match.teamAId;
        match.score=match.stage==="round_robin" && !(a&&b) ? a?[0,3]:[3,0] : null;
      }
      this.advance(state,now);
  }

  private advance(state:State,now:number):void {
    if (state.phase==="round_robin") {
      const rr=state.matches.filter(m=>m.stage==="round_robin");
      if (rr.some(m=>!["completed","forfeit","cancelled"].includes(m.status))) return;
      const draw=state.teams.filter(t=>t.drawOrder!==null).sort((a,b)=>a.drawOrder!-b.drawOrder!).map(t=>t.id);
      const withdrawn=new Set(state.teams.filter(t=>t.status==="withdrawn").map(t=>t.id));
      const games:RankingMatch[]=rr.map(m=>({attackerTeamId:m.attackerTeamId!,defenderTeamId:m.defenderTeamId!,
        attackerWins:m.score?.[0]??0,defenderWins:m.score?.[1]??0,doubleForfeit:m.status==="cancelled",
        attackGames:(m.games??[]).map(g=>({coreDamage:g.coreDamage,breakTimeRemaining:g.breakTimeRemaining}))}));
      const standings=rankTeams(draw,games,withdrawn);
      state.standings=standings;
      const seeds=standings.filter(r=>!withdrawn.has(r.teamId)).map(r=>r.teamId);
      const bracket=seedKnockout(seeds,!!state.battleStarted,draw.length);
      if (bracket.cancelled) { state.phase="cancelled"; return; }
      if (bracket.championTeamId) { state.phase="completed"; state.bracket.championTeamId=bracket.championTeamId; return; }
      state.phase="knockout";
      let semi=0;
      for (const fixture of bracket.fixtures) {
        const id=fixture.stage==="final"?`${state.id}:final`:`${state.id}:semi:${++semi}`;
        const scheduledAt=fixture.stage==="semifinal"?state.calendar?.semifinalAt:state.calendar?.finalAt;
        state.matches.push({id,stage:fixture.stage,round:1,teamAId:fixture.teams[0],teamBId:fixture.teams[1],attackerTeamId:null,defenderTeamId:null,status:"scheduled",scheduledAt:scheduledAt??null,score:null,winnerTeamId:null});
        if (fixture.stage==="final") state.bracket.finalMatchId=id; else state.bracket.semifinalMatchIds.push(id);
      }
    }
    if (state.phase!=="knockout") return;
    const semis=state.bracket.semifinalMatchIds.map(id=>state.matches.find(m=>m.id===id)!);
    const final=state.matches.find(m=>m.id===state.bracket.finalMatchId);
    if (!final) return;
    if (semis.length && semis.every(m=>["completed","forfeit","cancelled"].includes(m.status))) {
      if (semis.length===1) final.teamBId=semis[0]!.winnerTeamId;
      else { final.teamAId=semis[0]!.winnerTeamId; final.teamBId=semis[1]!.winnerTeamId; }
      const a=final.teamAId && state.teams.find(t=>t.id===final.teamAId)?.status!=="withdrawn" ? final.teamAId : null;
      const b=final.teamBId && state.teams.find(t=>t.id===final.teamBId)?.status!=="withdrawn" ? final.teamBId : null;
      if (!a || !b) { this.finish(state.id,final,a||b?"forfeit":"cancelled",now); final.winnerTeamId=a||b; }
    }
    if (["completed","forfeit","cancelled"].includes(final.status)) { state.phase="completed"; state.bracket.championTeamId=final.winnerTeamId; }
  }
}

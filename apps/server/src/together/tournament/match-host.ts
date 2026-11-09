import { randomInt, randomUUID } from "node:crypto";
import type { SnowTournamentScheduleHost } from "./scheduler.js";
import { snowRoundRecoveryKey, type SnowTournamentStore } from "./store.js";
import { SnowTournamentRecovery } from "./recovery.js";
import type { SnowSignalSink, SignalChanges } from "./player-signals.js";
import type { SnowTeamMember } from "./roster.js";
import { publicRuntimeFromState, type PublicRuntime } from "./relational-runtime.js";

type Role = "attack" | "defend";
type HostInput = Parameters<SnowTournamentScheduleHost["reconcileMatch"]>[0];
type MatchRef = Pick<HostInput, "editionId" | "matchId">;
type Terminal = NonNullable<ReturnType<SnowTournamentScheduleHost["readTerminal"]>>;
type Status = "running" | Terminal["status"];
type Action =
  | { type: "spawn"; unitType: string; lane: number }
  | { type: "deploy"; unitType: string; lane: number; cell: number }
  | { type: "retreat"; unitId: string }
  | { type: "unit_skill"; unitId: string }
  | { type: "commander_skill"; skill: string; lane?: number };
type Command = Action & { side: Role; member: string; battleId: string; roundId: string; requestId: string };
type EngineReceipt = { ok: boolean; error?: string | null; facts?: unknown };
export type HostBattle = {
  battleId: string; roundId: string; rulesVersion: string;
  attackSideId: string; defendSideId: string;
  status: Status; endReason: string | null; tick: number; coreHp: number;
  runtime?: { started: boolean };
};
export type SnowMatchEngine = {
  rulesVersion: string;
  commanderSkills: Record<Role, readonly string[]>;
  create(input: { battleId: string; roundId: string; attackSideId: string; defendSideId: string;
    participants: Record<Role, string[]>; assignments: Record<Role, Record<string, string[]>>;randomSeed?:number }): HostBattle;
  restore(battle: HostBattle): HostBattle;
  tick(battle: HostBattle): void;
  command(battle: HostBattle, input: Command): EngineReceipt;
  npc(battle: HostBattle, side: Role): Action[];
  view(battle:HostBattle,side:Role):unknown;
  catalog?:unknown;
};
export type SnowPlayerSignal={
  key:string;editionId:string;matchId:string;residentId:string;
  kind:"chat"|"lineup"|"prepare"|"started"|"action";
  facts:unknown;
};
type Team = { id: string; captainId: string | null; drawOrder: number | null; members: SnowTeamMember[]; ineligibleMemberIds?: string[] };
type Match = { id: string; stage: "round_robin" | "semifinal" | "final";
  teamAId: string | null; teamBId: string | null; attackerTeamId: string | null;
  scheduledAt: string | null; status: string;replays?:{gameIndex:number;voidedBattleId:string;replayBattleId:string;randomSeed:number;reason:"invalid_save";at:string}[] };
type Edition = { id: string; rulesVersion: string; phase: string; registrationOpenAt:string; teams: Team[]; matches: Match[]; battleStarted?:boolean;
  standings: {teamId: string; rank: number}[]; roundRecovery?:Record<string,RoundRecovery> };
type Line = { member: string; skills: string[] };
type Lineup = { entries: Line[]; confirmed: boolean; revision?:number };
type Chat = {
  order: string[]; turn: number; until: number;
  messages: {residentId:string;text:string;at:number}[];
  receipts: Record<string,string>;
  readThrough?:Record<string,number>;
};
type ActiveRound = {
  index: 0 | 1 | 2; battle: HostBattle; members: Record<Role, string>; ready: string[];
  npc: string[]; prepareUntil: number; nextTickAt: number | null;
  lastReadyAt?:number;
  batches: Record<string, { payload: string; receipts: EngineReceipt[] }>;
  waitAt: Partial<Record<Role, number>>;
  waitIds?:Partial<Record<Role,string>>;
  commanded?:Partial<Record<Role,true>>;
  commandRevision?:Partial<Record<Role,number>>;
};
type Runtime = {
  teamIds: [string, string]; owner: string; lastSeenAt: number; matchAt: number; choiceTeamId: string;
  attackers: [string, string, string] | null;
  lineups: Partial<Record<"0" | "1", Lineup>>;
  chat?: Partial<Record<"0" | "1", Chat>>;
  suspendedUntil?:number;
  rounds: (Terminal | null)[]; active: ActiveRound | null;
};
type RoundRecovery={attempt:0|1;input:Parameters<SnowMatchEngine["create"]>[0];
  context:Pick<Runtime,"teamIds"|"matchAt"|"choiceTeamId"|"attackers"|"lineups"|"rounds">;
  battleId:string;voided:{battleId:string;at:number;runtime:string|null}[]};
const second = 1000;
const minute = 60 * second;
const roles = ["attack", "defend"] as const;
function readyNpcSeats(teams:Team[],members:Record<Role,string>) {
  const npc=roles.map(side=>members[side]).filter(id=>teams.some(team=>team.members.some(member=>member.id===id&&member.npc)));
  return {ready:[...npc],npc};
}

/** Existing host validity rules, shared with migration so damaged saves keep their original bytes. */
export function validateSnowMatchRuntime(state:unknown,gameIndex:number,engine:SnowMatchEngine,entry?:{battleId:string}):void {
  const runtime=state as Runtime;
  if(!runtime || !Array.isArray(runtime.rounds) || !Array.isArray(runtime.teamIds)) throw new Error("snow_runtime_invalid");
  if(runtime.active && runtime.active.index===gameIndex) {
    const battle=engine.restore(runtime.active.battle);
    if (!Number.isSafeInteger(battle.tick) || battle.tick<0 || battle.tick>600 ||
        !Number.isFinite(battle.coreHp) || battle.coreHp<0 || battle.coreHp>20 ||
        !["running","attack_win","defend_win"].includes(battle.status) ||
        battle.rulesVersion!==engine.rulesVersion || (entry && battle.battleId!==entry.battleId))
      throw new Error("snow_runtime_invalid");
  }
}

/** Per-match state, bound to this edition and match, never to the old activity. */
export class SnowTournamentMatchHost implements SnowTournamentScheduleHost {
  private readonly owner = randomUUID();
  private readonly watchers = new Map<string, Set<() => void>>();
  private wake:(()=>void)|undefined;
  private signals:SnowSignalSink|undefined;
  bindClock(wake:(()=>void)|undefined) { this.wake=wake; }
  private wakeAfterAction() { queueMicrotask(()=>this.wake?.()); }
  bindSignals(signals:SnowSignalSink|undefined) { this.signals=signals; }
  private readonly recovery:SnowTournamentRecovery;
  constructor(private readonly store: SnowTournamentStore, private readonly engine: SnowMatchEngine,
    private readonly now:()=>number=Date.now) {
    this.recovery=new SnowTournamentRecovery(store);
  }

  private read(ref: MatchRef) {
    return this.store.readMatchRuntime(ref.editionId, ref.matchId) as Runtime | null;
  }
  private match(ref: MatchRef,full=false) {
    const edition = (full ? this.store.read(ref.editionId) : this.store.readMatchEdition(ref.editionId,ref.matchId)) as Edition | null;
    const match = edition?.matches.find(m => m.id === ref.matchId);
    const teams = [match?.teamAId, match?.teamBId].map(id => edition?.teams.find(t => t.id === id));
    if (!edition || !match || !teams[0] || !teams[1]) throw new Error("snow_match_not_available");
    return { edition, match, teams: [teams[0], teams[1]] as [Team, Team] };
  }
  private mutate<T>(ref: MatchRef, fn: (state: Runtime) => T): T {
    let changes:SignalChanges|undefined;
    const result=this.store.transaction(() => {
      const state = this.read(ref);
      const { edition, match } = this.match(ref);
      if (!state || state.owner !== this.owner || !["round_robin", "knockout"].includes(edition.phase) ||
          !["scheduled", "in_progress"].includes(match.status)) throw new Error("snow_match_not_available");
      const value = fn(state);
      this.store.saveMatchRuntime(ref.editionId, ref.matchId, state);
      changes=this.signals?.sync(ref);
      return value;
    });
    if (changes) this.signals?.publish(changes);
    return result;
  }
  hasStarted(editionId: string) {
    const edition = this.store.read(editionId) as Edition | null;
    try { return edition ? !!edition.battleStarted || edition.matches.some(m => {
      const state = this.read({editionId, matchId:m.id});
      return state?.active?.battle.runtime?.started || state?.rounds.some(Boolean);
    }) : null; } catch (error) { if(error instanceof SyntaxError) return null; throw error; }
  }
  readLockedAttackers(ref: MatchRef) { return this.read(ref)?.attackers ?? null; }
  readTerminal(ref: MatchRef & { gameIndex: 0 | 1 | 2 }) {
    try { return this.read(ref)?.rounds?.[ref.gameIndex] ?? null; }
    catch(error) { if(error instanceof SyntaxError) return null; throw error; }
  }

  private recoveryKey(ref:MatchRef,index:number) {return snowRoundRecoveryKey(ref.matchId,index);}
  private retryCorrupt(input:HostInput):Runtime|null {
    const {edition,teams}=this.match(input,true),entry=edition.roundRecovery?.[this.recoveryKey(input,input.gameIndex)];
    if (!entry) throw new Error("snow_round_recovery_setup_missing");
    entry.voided.push({battleId:entry.battleId,at:input.now,runtime:this.store.readMatchRuntimeText(input.editionId,input.matchId)});
    if (entry.attempt===1) {
      this.store.save(edition.id,edition.registrationOpenAt,edition);
      this.recovery.cancelCorruptEdition(edition.id,input.now);
      // Preserve the unreadable bytes in the void audit, while leaving a safe,
      // inactive runtime so the cancellation can invalidate existing wakes.
      this.store.saveMatchRuntime(input.editionId,input.matchId,{...entry.context,
        owner:this.owner,lastSeenAt:input.now,active:null});
      return null;
    }
    const pending=this.recovery.pending(input);
    if(pending!==undefined) this.recovery.resume(input,pending,input.now);
    const latest=this.match(input,true).edition;
    if(latest.phase==="cancelled") return null;
    entry.attempt=1;
    const voidedBattleId=entry.battleId;
    entry.battleId=JSON.stringify([input.editionId,input.matchId,input.gameIndex,"replay",randomUUID()]);
    let randomSeed=randomInt(1,0x100000000);
    while(randomSeed===entry.input.randomSeed) randomSeed=randomInt(1,0x100000000);
    const battle=this.engine.create({...entry.input,battleId:entry.battleId,roundId:entry.battleId,randomSeed});
    (latest.matches.find(match=>match.id===input.matchId)!.replays??=[]).push({gameIndex:input.gameIndex+1,voidedBattleId,
      replayBattleId:entry.battleId,randomSeed,reason:"invalid_save",at:new Date(input.now).toISOString()});
    battle.runtime={started:false};
    const members={attack:entry.input.participants.attack[0]!,defend:entry.input.participants.defend[0]!};
    const state:Runtime={...structuredClone(entry.context),owner:this.owner,lastSeenAt:input.now,
      active:{index:input.gameIndex,battle,members,...readyNpcSeats(teams,members),
        prepareUntil:input.now+2*minute,nextTickAt:null,batches:{},waitAt:{}}};
    (latest.roundRecovery??={})[this.recoveryKey(input,input.gameIndex)]=entry;
    this.store.save(latest.id,latest.registrationOpenAt,latest);
    this.store.saveMatchRuntime(input.editionId,input.matchId,state);
    return state;
  }

  private restoreRuntime(input:HostInput):Runtime|null {
    let state:Runtime|null;
    try {state=this.read(input);} catch(error) {
      if(!(error instanceof SyntaxError)) throw error;
      return this.retryCorrupt(input);
    }
    const entry=this.store.readRoundRecovery(input.editionId,input.matchId,input.gameIndex) as RoundRecovery|undefined;
    if(!state) return entry?this.retryCorrupt(input):null;
    try {
      validateSnowMatchRuntime(state,input.gameIndex,this.engine,entry);
      return state;
    } catch { return this.retryCorrupt(input); }
  }

  reconcileMatch(input: HostInput) {
    const changed=new Set<string>();
    const frame=(state:Runtime|null)=>state?.active?JSON.stringify([
      state.active.battle.battleId,state.active.battle.tick,state.active.battle.status,state.active.battle.runtime?.started,
    ]):"none";
    let before="none";
    let savedAfter:Runtime|null|undefined;
    let signalChanges:SignalChanges|undefined;
    const next = this.store.transaction(() => {
      const advance=()=>{
      if (this.recovery.expire(input.editionId,input.now)) return null;
      let { edition, match, teams } = this.match(input);
      if (edition.rulesVersion !== this.engine.rulesVersion) throw new Error("snow_engine_rules_mismatch");
      if (!["scheduled", "in_progress"].includes(match.status)) return null;
      let state = this.restoreRuntime(input);
      if(this.store.readEditionPhase(input.editionId)==="cancelled") return null;
      before=frame(state);
      if (state?.suspendedUntil!==undefined && input.now<state.suspendedUntil) return state.suspendedUntil;
      const paused=this.recovery.pending(input);
      const restarted=state && state.owner!==this.owner;
      const previousTick=state && !restarted && paused===undefined && state.suspendedUntil===undefined &&
        !!state.attackers && !state.rounds[input.gameIndex] && state.active?.index===input.gameIndex &&
        state.active.nextTickAt!==null && state.active.battle.runtime?.started===true && state.active.battle.status==="running"
        ? publicRuntimeFromState(state) : undefined;
      if (paused!==undefined || restarted) {
        // A terminal is already authoritative. Downtime must not delay its settlement.
        if (!(state?.active && state.active.battle.status!=="running")) {
          for (const id of this.recovery.resume(input,paused??state!.lastSeenAt,input.now)) changed.add(id);
          ({edition,match,teams}=this.match(input));
          if (match.status==="cancelled") return null;
          state=this.read(input);
        }
        if (state) state.owner=this.owner;
      }
      if (!state) {
        let scheduledAt=Date.parse(match.scheduledAt??"")||input.scheduledAt;
        let prepAt = scheduledAt - (match.stage === "round_robin" ? 8 : 10) * minute;
        if (input.now < prepAt) return prepAt;
        if (input.now>=scheduledAt) {
          for (const id of this.recovery.resume(input,prepAt,input.now)) changed.add(id);
          ({edition,match,teams}=this.match(input));
          if (match.status==="cancelled") return null;
          scheduledAt=Date.parse(match.scheduledAt!);
          prepAt=scheduledAt-(match.stage==="round_robin"?8:10)*minute;
          if (input.now<prepAt) return prepAt;
        }
        const seeds = edition.standings.length ? edition.standings.map(row => row.teamId) :
          [...teams].sort((a, b) => (a.drawOrder ?? Infinity) - (b.drawOrder ?? Infinity)).map(t => t.id);
        state = {
          teamIds: teams.map(team => team.id) as [string, string], owner: this.owner,
          lastSeenAt: input.now, matchAt: scheduledAt, choiceTeamId: seeds.find(id => teams.some(t => t.id === id))!,
          attackers: match.attackerTeamId ? [match.attackerTeamId, match.attackerTeamId, match.attackerTeamId] : null,
          lineups: {}, rounds: [], active: null,
        };
      }
      if (state.teamIds[0] !== teams[0].id || state.teamIds[1] !== teams[1].id) throw new Error("snow_match_roster_mismatch");
      if (state.suspendedUntil!==undefined && input.now<state.suspendedUntil) {
        this.store.saveMatchRuntime(input.editionId,input.matchId,state);
        return state.suspendedUntil;
      }
      delete state.suspendedUntil;
      const saved = state;
      const finish = (at: number | null,ordinaryTick=false) => {
        saved.lastSeenAt = Math.max(saved.lastSeenAt,input.now);
        if(ordinaryTick && previousTick)this.store.saveBattleTick(input.editionId,input.matchId,saved,previousTick);
        else this.store.saveMatchRuntime(input.editionId, input.matchId, saved);
        savedAfter=saved;
        return at;
      };
      if (!saved.attackers && input.now >= saved.matchAt - 10 * minute) {
        this.chooseDirections(saved, saved.choiceTeamId);
      }
      if (input.now < saved.matchAt) {
        const next = [saved.matchAt - 8 * minute, saved.matchAt - 2 * minute, saved.matchAt];
        if (input.now >= saved.matchAt - 8 * minute && input.now < saved.matchAt - 2 * minute) {
          for (const [index,team] of teams.entries()) {
            const chat = this.discussion(saved,team,index === 0 ? "0" : "1",input.now);
            if (chat) next.push(chat.until);
          }
        }
        return finish(Math.min(...next.filter(at=>at>input.now)));
      }
      if (saved.rounds[input.gameIndex]) return finish(null);
      if (!saved.active || saved.active.index !== input.gameIndex) {
        saved.active = this.prepare(saved, teams, input, saved.active ? input.now : saved.matchAt);
      }
      const round = saved.active;
      const battle = this.engine.restore(round.battle);
      if (round.nextTickAt === null) {
        if (input.now < round.prepareUntil && round.ready.length < 2) return finish(round.prepareUntil);
        round.npc = roles.map(side => round.members[side]).filter(id => round.npc.includes(id) || !round.ready.includes(id));
        const startAt=round.ready.length===2 ? Math.min(round.prepareUntil,round.lastReadyAt??input.now) : round.prepareUntil;
        round.nextTickAt = startAt + second;
        battle.runtime = { started: true };
      }
      if (input.now < round.nextTickAt) return finish(round.nextTickAt);
      // Keep the original wall-clock phase: normal event-loop delay is not downtime.
      // A round itself bounds catch-up to its remaining 600 ticks.
      const dueTicks=Math.min(600-battle.tick,Math.floor((input.now-round.nextTickAt)/second)+1);
      for (let remaining=dueTicks;remaining>0 && battle.status==="running";remaining--) {
        for (const side of roles) {
          const member = round.members[side];
          const team = teams.find(t => t.members.some(m => m.id === member));
          if (team?.ineligibleMemberIds?.includes(member) && !round.npc.includes(member)) round.npc.push(member);
          if (!round.npc.includes(member)) continue;
          for (const [index, action] of this.engine.npc(battle, side).entries()) {
            this.engine.command(battle, { ...action, side, member, battleId: battle.battleId, roundId: battle.roundId,
              requestId: JSON.stringify(["npc", side, battle.tick, index]) });
          }
        }
        this.engine.tick(battle);
        round.nextTickAt+=second;
      }
      if (battle.status === "running") {
        return finish(round.nextTickAt,true);
      }
      if (battle.endReason !== "core_broken" && battle.endReason !== "time_limit") throw new Error("snow_engine_terminal_invalid");
      saved.rounds[round.index] = {
        battleId: battle.battleId, rulesVersion: battle.rulesVersion, attackSideId: battle.attackSideId,
        defendSideId: battle.defendSideId, status: battle.status, endReason: battle.endReason, tick: battle.tick, coreHp: battle.coreHp,
        participants: this.participants(round), finishedAt:round.nextTickAt-second,
      };
      return finish(null);
      };
      const result=advance();
      signalChanges=this.signals?.sync(input);
      return result;
    });
    if (signalChanges) this.signals?.publish(signalChanges);
    if (before!==frame(savedAfter===undefined?this.read(input):savedAfter)) changed.add(input.matchId);
    for (const matchId of changed) this.notify({editionId:input.editionId,matchId});
    return next;
  }

  private chooseDirections(state: Runtime, firstAttack: string) {
    const other = state.teamIds.find(id => id !== firstAttack)!;
    state.attackers = [firstAttack, other, state.teamIds[randomInt(2)]!];
  }

  private discussion(state:Runtime,team:Team,key:"0"|"1",now:number) {
    const starts=state.matchAt-8*minute, ends=state.matchAt-2*minute;
    if (now<starts || now>=ends) return null;
    const eligible=team.members.filter(m=>!m.npc&&!team.ineligibleMemberIds?.includes(m.id)).map(m=>m.id);
    if (!eligible.length) return null;
    const channels=state.chat??={};
    let chat=channels[key];
    if (!chat) {
      const other=eligible.filter(id=>id!==team.captainId);
      if (other.length===2 && randomInt(2)) other.reverse();
      const order=team.captainId && eligible.includes(team.captainId) ? [team.captainId,...other] : other;
      chat=channels[key]={order,turn:0,until:starts+minute,messages:[],receipts:{}};
    }
    if (now>=chat.until) {
      const missed=1+Math.floor((now-chat.until)/minute);
      chat.turn+=missed;
      chat.until+=missed*minute;
    }
    for (let i=0;i<chat.order.length && !eligible.includes(chat.order[chat.turn%chat.order.length]!);i++) chat.turn++;
    return chat;
  }

  teamDiscussion(ref:MatchRef,actor:string,now:number) {
    return this.mutate(ref,state=>{
      const index=this.match(ref).teams.findIndex(team=>team.members.some(member=>member.id===actor) && !team.ineligibleMemberIds?.includes(actor));
      if (index<0) throw new Error("snow_team_member_required");
      const key=index===0?"0":"1";
      const chat=this.discussion(state,this.match(ref).teams[index]!,key,now);
      return {messages:structuredClone(state.chat?.[key]?.messages??[]),
        canSpeak:!!chat && chat.order[chat.turn%chat.order.length]===actor};
    });
  }

  speak(ref:MatchRef,actor:string,requestId:string,text:string|null,now:number) {
    if (!requestId || (text!==null && !text.trim())) throw new Error("snow_chat_invalid");
    return this.mutate(ref,state=>{
      const teams=this.match(ref).teams;
      const index=teams.findIndex(team=>team.members.some(member=>member.id===actor) && !team.ineligibleMemberIds?.includes(actor));
      if (index<0) throw new Error("snow_team_member_required");
      const slot=index===0?"0":"1", key=JSON.stringify([actor,requestId]), payload=JSON.stringify(text);
      const previous=state.chat?.[slot]?.receipts[key];
      if (previous!==undefined) {
        if (previous!==payload) throw new Error("snow_request_conflict");
        return {replay:true};
      }
      const chat=this.discussion(state,teams[index]!,slot,now);
      if (!chat || chat.order[chat.turn%chat.order.length]!==actor) throw new Error("snow_chat_not_your_turn");
      chat.readThrough={...chat.readThrough,[actor]:chat.messages.length};
      if (text!==null) chat.messages.push({residentId:actor,text,at:now});
      chat.receipts[key]=payload;
      chat.turn++;
      chat.until=now+minute;
      state.lastSeenAt=Math.max(state.lastSeenAt,now);
      return {replay:false};
    });
  }

  chooseOpeningSide(ref: MatchRef, actor: string, side: Role, now: number) {
    // Choice can be made as soon as the bracket is published, before the scheduler's first wake.
    this.store.transaction(() => {
      const { edition, match, teams } = this.match(ref);
      const at = Date.parse(match.scheduledAt ?? "");
      const seeds = edition.standings.length ? edition.standings.map(row => row.teamId) :
        [...teams].sort((a,b) => a.drawOrder! - b.drawOrder!).map(team => team.id);
      const chooser = teams.find(team => team.id === seeds.find(id => teams.some(t => t.id === id)))!;
      if (match.stage === "round_robin" || match.status !== "scheduled" || !Number.isFinite(at) ||
          now >= at - 10 * minute || chooser.captainId !== actor) throw new Error("snow_side_choice_closed");
      const state = this.read(ref);
      if (state?.attackers) throw new Error("snow_sides_locked");
      const saved = state ?? { teamIds: [teams[0].id, teams[1].id] as [string,string], owner:this.owner, lastSeenAt:now,
        matchAt:at, choiceTeamId:chooser.id, attackers:null, lineups:{}, rounds:[], active:null };
      this.chooseDirections(saved, side === "attack" ? chooser.id : teams.find(t => t.id !== chooser.id)!.id);
      this.store.saveMatchRuntime(ref.editionId, ref.matchId, saved);
    });
  }

  private prepare(state: Runtime, teams: [Team, Team], input: HostInput, at: number): ActiveRound {
    const attackId = state.attackers?.[input.gameIndex];
    const attackTeam = teams.find(t => t.id === attackId), defendTeam = teams.find(t => t.id !== attackId);
    if (!attackTeam || !defendTeam) throw new Error("snow_attackers_not_locked");
    const pick = (team: Team, side: Role) => {
      const entries = state.lineups[team.id === state.teamIds[0] ? "0" : "1"]?.entries;
      return entries?.[input.gameIndex] ?? { member: team.members[input.gameIndex]!.id, skills: [...this.engine.commanderSkills[side].slice(0,2)] };
    };
    const a = pick(attackTeam, "attack"), d = pick(defendTeam, "defend");
    const battleId = JSON.stringify([input.editionId, input.matchId, input.gameIndex]);
    const createInput:Parameters<SnowMatchEngine["create"]>[0]={
      battleId, roundId: battleId, attackSideId: attackTeam.id, defendSideId: defendTeam.id,
      randomSeed:randomInt(1,0x100000000),
      participants: { attack:[a.member], defend:[d.member] },
      assignments: { attack:{ [a.member]:a.skills }, defend:{ [d.member]:d.skills } },
    };
    const battle = this.engine.create(createInput);
    battle.runtime = { started: false };
    const edition=this.match(input,true).edition;
    (edition.roundRecovery??={})[this.recoveryKey(input,input.gameIndex)]={attempt:0,input:createInput,battleId,
      context:structuredClone({teamIds:state.teamIds,matchAt:state.matchAt,choiceTeamId:state.choiceTeamId,
        attackers:state.attackers,lineups:state.lineups,rounds:state.rounds}),voided:[]};
    this.store.save(edition.id,edition.registrationOpenAt,edition);
    const members={attack:a.member,defend:d.member};
    return { index:input.gameIndex, battle, members, ...readyNpcSeats(teams,members),
      prepareUntil:at + 2 * minute, nextTickAt:null, batches:{}, waitAt:{} };
  }

  lineup(ref: MatchRef, actor: string, entries: Line[], confirmed: boolean, now: number) {
    return this.mutate(ref, state => {
      const team = this.match(ref).teams.find(team => team.captainId === actor);
      if (!team || !state.attackers || now < state.matchAt - 8 * minute || now >= state.matchAt ||
          (confirmed && now < state.matchAt - 2 * minute)) throw new Error("snow_lineup_closed");
      const key = team.id === state.teamIds[0] ? "0" : "1";
      if (state.lineups[key]?.confirmed) throw new Error("snow_lineup_locked");
      if (entries.length !== 3 || new Set(entries.map(e => e.member)).size !== 3 || entries.some(({member,skills}, i) =>
        !team.members.some(m => m.id === member) || skills.length !== 2 || skills[0] === skills[1] ||
        skills.some(skill => !this.engine.commanderSkills[state.attackers![i] === team.id ? "attack" : "defend"].includes(skill)))) {
        throw new Error("snow_lineup_invalid");
      }
      state.lineups[key] = { entries: structuredClone(entries), confirmed,revision:(state.lineups[key]?.revision??0)+1 };
      state.lastSeenAt=Math.max(state.lastSeenAt,now);
    });
  }

  ready(ref: MatchRef, actor: string, battleId: string, now: number) {
    const result=this.mutate(ref, state => {
      const round = state.active;
      if (!round || round.battle.battleId !== battleId || !roles.some(side => round.members[side] === actor) || round.npc.includes(actor) ||
          now >= round.prepareUntil || round.nextTickAt !== null ||
          this.match(ref).teams.some(team => team.ineligibleMemberIds?.includes(actor))) throw new Error("snow_ready_closed");
      if (!round.ready.includes(actor)) round.ready.push(actor);
      round.lastReadyAt=Math.max(round.lastReadyAt??now,now);
      state.lastSeenAt=Math.max(state.lastSeenAt,now);
    });
    this.advanceBeforeAction(ref,now);
    this.wakeAfterAction();
    return result;
  }

  private participants(round: ActiveRound): NonNullable<Terminal["participants"]> {
    const participant = (side:Role) => ({residentId:round.members[side],human:!round.npc.includes(round.members[side])});
    return {attack:participant("attack"),defend:participant("defend")};
  }

  private advanceBeforeAction(ref:MatchRef,now:number) {
    const state=this.read(ref);
    if (!state?.active) return;
    const {match}=this.match(ref);
    this.reconcileMatch({...ref,gameIndex:state.active.index,scheduledAt:Date.parse(match.scheduledAt!),now});
  }

  surrender(ref: MatchRef, actor: string, battleId: string) {
    const now=this.now();
    this.advanceBeforeAction(ref,now);
    this.mutate(ref, state => {
      const round = state.active, side = roles.find(role => round?.members[role] === actor);
      if (!round || !side || round.battle.battleId !== battleId || round.npc.includes(actor) ||
          this.match(ref).teams.some(team => team.ineligibleMemberIds?.includes(actor))) throw new Error("snow_not_battle_participant");
      if (state.rounds[round.index]?.surrenderedBy === side) return;
      const battle = round.battle;
      if (!battle.runtime?.started || battle.status !== "running") throw new Error("snow_battle_not_running");
      battle.status = side === "attack" ? "defend_win" : "attack_win";
      battle.endReason = "surrender";
      round.waitAt = {};
      state.rounds[round.index] = {battleId, rulesVersion:battle.rulesVersion, attackSideId:battle.attackSideId,
        defendSideId:battle.defendSideId,status:battle.status,endReason:"surrender",tick:battle.tick,coreHp:battle.coreHp,
        surrenderedBy:side,participants:this.participants(round),finishedAt:now};
    });
    this.notify(ref);
    this.wakeAfterAction();
  }

  submit(ref: MatchRef, actor: string, battleId: string, requestId: string, actions: Action[], waitTicks: number) {
    if (!requestId || !Number.isSafeInteger(waitTicks) || waitTicks < 30) throw new Error("snow_invalid_batch");
    this.advanceBeforeAction(ref,this.now());
    const result = this.mutate(ref, state => {
      const round = state.active, side = roles.find(role => round?.members[role] === actor);
      if (!round || !side || round.battle.battleId !== battleId || round.npc.includes(actor) ||
          this.match(ref).teams.some(team => team.ineligibleMemberIds?.includes(actor))) throw new Error("snow_not_battle_participant");
      const key = JSON.stringify([actor,requestId]), payload = JSON.stringify([actions,waitTicks]);
      const previous = round.batches[key];
      if (previous) {
        if (previous.payload !== payload) throw new Error("snow_request_conflict");
        return { ok:true as const, receipts:previous.receipts, replay:true };
      }
      if (!round.battle.runtime?.started || round.battle.status !== "running") throw new Error("snow_battle_not_running");
      const trial = this.engine.restore(structuredClone(round.battle));
      const receipts: EngineReceipt[] = [];
      for (const [index, action] of actions.entries()) {
        const receipt = this.engine.command(trial, { ...action, side, member:actor, battleId, roundId:trial.roundId, requestId: JSON.stringify(["human",key,index]) });
        if (!receipt.ok) return { ok:false as const, failedCommand:index+1, receipt };
        if(action.type==='commander_skill'||action.type==='unit_skill'){
          const view=this.engine.view(trial,side) as {ownCommanderSkills?:{skill:string;readyInTicks:number}[];visibleUnits?:{id:string;unitSkillReadyInTicks?:number}[]};
          const readyIn=action.type==='commander_skill'?view.ownCommanderSkills?.find(skill=>skill.skill===action.skill)?.readyInTicks:
            view.visibleUnits?.find(unit=>unit.id===action.unitId)?.unitSkillReadyInTicks;
          receipts.push(readyIn===undefined?receipt:{...receipt,facts:{...receipt.facts as object,cooldownUntilTick:trial.tick+readyIn}});
        }else receipts.push(receipt);
      }
      round.battle = trial;
      round.batches[key] = { payload, receipts };
      (round.commanded??={})[side]=true;
      (round.commandRevision??={})[side]=(round.commandRevision?.[side]??0)+1;
      const due = trial.tick + waitTicks;
      const ids=round.waitIds??={};
      if (due < 600) { round.waitAt[side] = due; ids[side]=key; }
      else { delete round.waitAt[side]; delete ids[side]; }
      return { ok:true as const, receipts, replay:false,waitTicks,dueTick:due<600?due:null };
    });
    if (result.ok && !result.replay) { this.notify(ref); this.wakeAfterAction(); }
    return result;
  }

  private notify(ref: MatchRef) {
    for (const listener of this.watchers.get(JSON.stringify([ref.editionId,ref.matchId])) ?? []) listener();
  }
  invalidateMatch(ref:MatchRef) { this.notify(ref); }
  subscribe(ref: MatchRef, listener: () => void) {
    const key = JSON.stringify([ref.editionId,ref.matchId]);
    const listeners = this.watchers.get(key) ?? new Set<() => void>();
    this.watchers.set(key,listeners);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.watchers.delete(key);
    };
  }
  /** Only a server projection should turn this state into a spectator response. */
  battleForProjection(ref: MatchRef) {
    const edition = this.store.read(ref.editionId) as Edition | null;
    const match = edition?.matches.find(m => m.id === ref.matchId);
    if (!match || !["scheduled", "in_progress", "completed"].includes(match.status)) return null;
    const state = this.read(ref);
    if (state?.active && ((state.suspendedUntil??0)>this.now() || this.recovery.pending(ref)!==undefined)) {
      const frozen=structuredClone(state.active.battle);
      frozen.runtime={started:false};
      return frozen;
    }
    return state?.active?.battle ?? null;
  }
  playerState(ref:MatchRef,actor:string,now=this.now()) {
    const {edition,match,teams}=this.match(ref);
    const team=teams.find(team=>team.members.some(member=>member.id===actor) && !team.ineligibleMemberIds?.includes(actor));
    if (!team) throw new Error("snow_team_member_required");
    const state=this.read(ref),round=state?.active,slot=team.id===teams[0].id?"0":"1";
    const side=roles.find(role=>round?.members[role]===actor)??null;
    const current=state?.owner===this.owner && (state.suspendedUntil??0)<=now && this.recovery.pending(ref)===undefined &&
      ["round_robin","knockout"].includes(edition.phase) && ["scheduled","in_progress"].includes(match.status);
    const ownLineup=state?.lineups[slot];
    const chat=state && current ? this.discussion(state,team,slot,now) : null;
    const isPlayer=side!==null && !round?.npc.includes(actor);
    return {
      editionId:edition.id,matchId:match.id,teamId:team.id,captainId:team.captainId,
      matchNumber:edition.matches.findIndex(entry=>entry.id===match.id)+1,
      scheduledAt:match.scheduledAt,attackers:state?.attackers??null,
      members:team.members.map(member=>member.id),
      lineup:structuredClone(ownLineup??null),
      lineupRevision:ownLineup?.revision??0,
      revealedLineups:state && now>=state.matchAt?structuredClone(state.lineups):null,
      messages:structuredClone(state?.chat?.[slot]?.messages??[]),
      chatReadThrough:state?.chat?.[slot]?.readThrough?.[actor]??0,
      canChat:!!chat && chat.order[chat.turn%chat.order.length]===actor,
      chatTurn:chat?.turn??null,
      canChooseSide:team.captainId===actor && match.stage!=="round_robin" && match.status==="scheduled" &&
        !state?.attackers && now<Date.parse(match.scheduledAt!)-10*minute &&
        (edition.standings.length?edition.standings.map(row=>row.teamId):[...teams].sort((a,b)=>(a.drawOrder??Infinity)-(b.drawOrder??Infinity)).map(t=>t.id))
          .find(id=>teams.some(t=>t.id===id))===team.id,
      canLineup:!!current && team.captainId===actor && !ownLineup?.confirmed && now>=state.matchAt-8*minute && now<state.matchAt,
      canConfirmLineup:!!current && team.captainId===actor && !!ownLineup && !ownLineup.confirmed && now>=state.matchAt-2*minute && now<state.matchAt,
      lineupPhase:state && now<state.matchAt ? now>=state.matchAt-2*minute?"confirmation":"discussion":"locked",
      canReady:!!current && isPlayer && !!round && !round.ready.includes(actor) && round.nextTickAt===null && now<round.prepareUntil,
      canCommand:!!current && isPlayer && !!round?.battle.runtime?.started && round.battle.status==="running",
      role:side,battleId:side && round?round.battle.battleId:null,gameIndex:side && round?round.index:null,
      commandRevision:side && round?round.commandRevision?.[side]??0:null,
      battle:side && round && isPlayer?this.engine.view(round.battle,side):null,
    };
  }
  playerSignals(ref:MatchRef,now=this.now()):SnowPlayerSignal[] {
    const state=this.read(ref);
    if (!state || state.owner!==this.owner || (state.suspendedUntil??0)>now || this.recovery.pending(ref)!==undefined) return [];
    const {edition,match,teams}=this.match(ref);
    if (!["round_robin","knockout"].includes(edition.phase) || !["scheduled","in_progress"].includes(match.status)) return [];
    const result:SnowPlayerSignal[]=[];
    const put=(residentId:string,kind:SnowPlayerSignal["kind"],identity:unknown)=>{
      const facts=this.playerState(ref,residentId,now);
      result.push({key:JSON.stringify([ref.editionId,ref.matchId,residentId,kind,identity]),...ref,residentId,kind,facts});
    };
    for (const team of teams) {
      const slot=team.id===teams[0].id?"0":"1",chat=this.discussion(state,team,slot,now);
      const actor=chat?.order[chat.turn%chat.order.length];
      if (actor && !team.ineligibleMemberIds?.includes(actor)) put(actor,"chat",chat!.turn);
      if (team.captainId && !team.ineligibleMemberIds?.includes(team.captainId) &&
          now>=state.matchAt-8*minute && now<state.matchAt && !state.lineups[slot]?.confirmed) {
        put(team.captainId,"lineup",now>=state.matchAt-2*minute?"confirm":"draft");
      }
    }
    const round=state.active;
    if (!round) return result;
    for (const side of roles) {
      const actor=round.members[side];
      if (round.npc.includes(actor) || teams.some(team=>team.ineligibleMemberIds?.includes(actor))) continue;
      if (round.nextTickAt===null && !round.ready.includes(actor) && now<round.prepareUntil) put(actor,"prepare",round.battle.battleId);
      if (!round.battle.runtime?.started || round.battle.status!=="running") continue;
      if (!round.commanded?.[side]) {
        put(actor,"started",round.battle.battleId);
      } else if (round.waitAt[side]!==undefined && round.battle.tick>=round.waitAt[side]!) {
        put(actor,"action",[round.battle.battleId,round.waitIds?.[side]]);
      }
    }
    return result;
  }
  publicMatchProgress(ref: MatchRef,context?:{runtime:PublicRuntime|null;scheduledAt:string|null}) {
    const state = context===undefined ? this.store.readPublicMatchRuntimes(ref.editionId,ref.matchId).get(ref.matchId)??null : context.runtime;
    if (!state) return null;
    const scheduledAt=context===undefined ? this.match(ref).match.scheduledAt : context.scheduledAt;
    return { scheduledAt:scheduledAt??new Date(state.matchAt).toISOString(),started:state.active?.started===true };
  }
}

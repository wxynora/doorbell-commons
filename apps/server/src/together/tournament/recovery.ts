import { cancelRegistration, type RegistrationRound } from "./registration.js";
import type { SnowTournamentCalendar } from "./calendar.js";
import type { SnowTournamentStore } from "./store.js";
import type { ScheduledSnowMatch } from "./relational-match-view.js";

const minute=60_000;
const day=86_400_000;
const offset=8*60*minute;
const timeout=30*minute;
const done=(status:string)=>["completed","forfeit","cancelled"].includes(status);
const dayStart=(time:number)=>Math.floor((time+offset)/day)*day-offset;
type MatchRef={editionId:string;matchId:string};
type Match={
  id:string;stage:"round_robin"|"semifinal"|"final";status:string;
  teamAId:string|null;teamBId:string|null;scheduledAt:string|null;
  originalScheduledAt?:string;games?:unknown[];
};
type Technical={
  makeupAt:number;expiresAt:number;
  pauses:[number,number][];
  pending:Record<string,number>;
  deferred:string[];
  recoveredThrough?:Record<string,number>;
  cancelledReason?:string;
};
type Edition={
  id:string;registrationOpenAt:string;registrationCloseAt:string;revision:number;phase:string;
  matches:Match[];calendar?:Omit<SnowTournamentCalendar,"finalAt"> & {finalAt:string|null};registrationRounds:RegistrationRound[];
  bracket:{championTeamId:string|null;semifinalMatchIds?:string[]};technical?:Technical;
  teams?:{drawOrder:number|null}[];
};
type Runtime={
  lastSeenAt:number;matchAt:number;suspendedUntil?:number;
  chat?:Record<string,{until:number}>;
  active?:{prepareUntil:number;nextTickAt:number|null;lastReadyAt?:number;battle:{status:string;runtime?:{started:boolean}}}|null;
};
const lead=(match:Pick<Match,"stage">)=>match.stage==="round_robin"?8*minute:10*minute;
const duration=(match:Match)=>Math.max(0,3-(match.games?.length??0))*12*minute;

function merge(pauses:[number,number][]):[number,number][] {
  const combined:[number,number][]=[];
  for (const [from,to] of pauses.sort((a,b)=>a[0]-b[0])) {
    const last=combined.at(-1);
    if (last && from<=last[1]) last[1]=Math.max(to,last[1]);
    else combined.push([from,to]);
  }
  return combined;
}
function exceedsDailyLimit(pauses:[number,number][],from:number,to:number,notBefore=-Infinity) {
  if (from>to) return false;
  for (let start=dayStart(from);start<=dayStart(to);start+=day) {
    const total=pauses.reduce((sum,[a,b])=>sum+Math.max(0,Math.min(b,start+day)-Math.max(a,start,notBefore)),0);
    if (total>timeout) return true;
  }
  return false;
}

/** Persisted bounded technical recovery; announced waiting is never counted as another outage. */
export class SnowTournamentRecovery {
  constructor(private readonly store:SnowTournamentStore) {}
  private read(id:string) { return this.store.read(id) as Edition|null; }
  private runtime(ref:MatchRef):Runtime|null {
    // Recovery can still account for a failed court when its own save cannot be decoded.
    // Never replace that save or invent a battle from this absence.
    try {
      const state=this.store.readMatchRuntime(ref.editionId,ref.matchId) as Runtime|null;
      return state && Number.isFinite(state.lastSeenAt) && Number.isFinite(state.matchAt) ? state : null;
    } catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }
  private technical(edition:Edition) {
    if (!edition.technical) {
      const originalLast=Date.parse(edition.calendar?.finalAt??"");
      const last=Number.isFinite(originalLast)?originalLast:Math.max(...edition.matches.map(m=>Date.parse(m.originalScheduledAt??m.scheduledAt??"")).filter(Number.isFinite));
      if (!Number.isFinite(last)) throw new Error("snow_calendar_missing");
      const makeupDay=dayStart(last)+day;
      edition.technical={makeupAt:makeupDay+9*60*minute,expiresAt:makeupDay+day,pauses:[],pending:{},deferred:[]};
    }
    return edition.technical;
  }
  private save(edition:Edition) {
    edition.revision++;
    this.store.save(edition.id,edition.registrationOpenAt,edition);
  }
  private cancel(edition:Edition,reason:string,now:number) {
    edition.phase="cancelled";
    edition.bracket.championTeamId=null;
    this.technical(edition).cancelledReason=reason;
    for (const match of edition.matches) if (!done(match.status)) {
      match.status="cancelled";
      this.store.scheduleSnapshotExpiry(edition.id,match.id,now);
    }
    for (const round of edition.registrationRounds) cancelRegistration(round);
  }

  cancelCorruptEdition(editionId:string,now:number) {
    const edition=this.read(editionId);
    if (!edition || !["round_robin","knockout"].includes(edition.phase)) return;
    this.cancel(edition,"technical_round_replay_exhausted",now);
    this.save(edition);
  }

  /** Also called with no runnable host, so a corrupt record cannot wait forever. */
  expire(editionId:string,now:number):boolean {
    return this.store.transaction(()=>{
      const status=this.store.readTechnical(editionId);
      if (!status || !["round_robin","knockout"].includes(status.phase) ||
          !status.technical || now<status.technical.expiresAt) return false;
      const edition=this.read(editionId)!;
      this.cancel(edition,"technical_makeup_expired",now);this.save(edition);return true;
    });
  }
  boundary(editionId:string,now:number,matches:ScheduledSnowMatch[]):number|null {
    const state=this.store.readTechnical(editionId)?.technical as Technical|undefined;
    if (!state) return null;
    const boundaries=[state.expiresAt,...Object.values(state.pending).map(from=>from+timeout+1)];
    for (const match of matches) if (!done(match.status) && match.scheduledAt) {
      const scheduled=Date.parse(match.scheduledAt);
      boundaries.push(scheduled-lead(match),scheduled);
      if (match.suspendedUntil!==null) boundaries.push(match.suspendedUntil);
    }
    const future=boundaries.filter(at=>at>now);
    return future.length?Math.min(...future):null;
  }
  pending(ref:MatchRef) {
    const value=this.store.readTechnical(ref.editionId)?.technical?.pending;
    return value && Object.hasOwn(value,ref.matchId)?value[ref.matchId]:undefined;
  }
  failed(ref:MatchRef,now:number) {
    this.store.transaction(()=>{
      const edition=this.read(ref.editionId),match=edition?.matches.find(m=>m.id===ref.matchId);
      if (!edition || !match || done(match.status)) return;
      const technical=this.technical(edition);
      if (!Object.hasOwn(technical.pending,ref.matchId)) {
        const runtime=this.runtime(ref);
        technical.pending[ref.matchId]=Math.min(now,runtime?.lastSeenAt??Date.parse(match.scheduledAt!)-lead(match));
      }
      if (now>=technical.expiresAt) this.cancel(edition,"technical_makeup_expired",now);
      this.save(edition);
    });
  }

  resume(ref:MatchRef,from:number,now:number) {
    return this.store.transaction(()=>{
      const edition=this.read(ref.editionId),match=edition?.matches.find(m=>m.id===ref.matchId);
      if (!edition || !match || done(match.status)) return [];
      const before=new Map(edition.matches.map(m=>[m.id,JSON.stringify([m.status,m.scheduledAt])]));
      const changed=()=>edition.matches.filter(m=>before.get(m.id)!==JSON.stringify([m.status,m.scheduledAt])).map(m=>m.id);
      const technical=this.technical(edition);
      if (now>=technical.expiresAt) {
        this.cancel(edition,"technical_makeup_expired",now);this.save(edition);return changed();
      }
      const recovered=technical.recoveredThrough??={};
      const effectiveFrom=Math.max(from,Object.hasOwn(recovered,ref.matchId)?recovered[ref.matchId]!:from);
      const pause=Math.max(0,now-effectiveFrom);
      if (pause) technical.pauses=merge([...technical.pauses,[effectiveFrom,now]]);
      recovered[ref.matchId]=Math.max(now,effectiveFrom);
      delete technical.pending[ref.matchId];
      const excessive=exceedsDailyLimit(technical.pauses,from,now);
      const onMakeup=dayStart(now)>=dayStart(technical.makeupAt);
      const runtime=this.runtime(ref);
      const makeupWindowStart=technical.makeupAt-(runtime?.active?0:lead(match));
      if (onMakeup && exceedsDailyLimit(technical.pauses,makeupWindowStart,now,makeupWindowStart)) {
        this.cancel(edition,"technical_makeup_pause_exceeded",now);this.save(edition);return changed();
      }
      const oldAt=Date.parse(match.scheduledAt!);
      let target=oldAt+pause;
      if (excessive) {
        target=Math.max(technical.makeupAt,onMakeup
          ? runtime ? runtime.active ? now : oldAt+pause : now+lead(match)
          : technical.makeupAt);
        if (!technical.deferred.includes(match.id)) technical.deferred.push(match.id);
      }
      this.move(edition,match,target,now,excessive?from:undefined);
      this.dependencies(edition,now);
      this.save(edition);
      return changed();
    });
  }

  private move(edition:Edition,match:Match,at:number,now:number,resumeFrom?:number) {
    const oldAt=Date.parse(match.scheduledAt!);
    if (!Number.isFinite(oldAt) || at<=oldAt) return;
    match.originalScheduledAt??=match.scheduledAt!;
    match.scheduledAt=new Date(at).toISOString();
    const runtime=this.runtime({editionId:edition.id,matchId:match.id});
    if (!runtime) return;
    const active=runtime.active;
    // An in-progress match resumes at the published time, from its exact saved tick.
    const delta=resumeFrom!==undefined && active ? at-resumeFrom : at-oldAt;
    runtime.matchAt+=delta;
    for (const chat of Object.values(runtime.chat??{})) chat.until+=delta;
    if (active) {
      active.prepareUntil+=delta;
      if (active.nextTickAt!==null) active.nextTickAt+=delta;
      if (active.lastReadyAt!==undefined) active.lastReadyAt+=delta;
    }
    const resumeAt=runtime.lastSeenAt+delta;
    if (resumeAt>now) runtime.suspendedUntil=resumeAt;
    else delete runtime.suspendedUntil;
    runtime.lastSeenAt=Math.max(runtime.lastSeenAt,now,resumeAt);
    this.store.saveMatchRuntime(edition.id,match.id,runtime);
  }

  private dependencies(edition:Edition,now:number) {
    const technical=edition.technical!;
    const stageRank={round_robin:0,semifinal:1,final:2};
    const matches=[...edition.matches].sort((a,b)=>stageRank[a.stage]-stageRank[b.stage] ||
      Date.parse(a.originalScheduledAt??a.scheduledAt!)-Date.parse(b.originalScheduledAt??b.scheduledAt!));
    const available=new Map<string,number>();
    let robinEnd=0,semiEnd=0;
    const deferredTeams=new Set<string>();
    for (const match of matches) {
      if (done(match.status) || !match.scheduledAt) continue;
      const teams=[match.teamAId,match.teamBId].filter((id):id is string=>id!==null);
      let at=Date.parse(match.scheduledAt);
      for (const team of teams) at=Math.max(at,(available.get(team)??0)+lead(match));
      if (match.stage==="semifinal") at=Math.max(at,robinEnd+lead(match));
      if (match.stage==="final") at=Math.max(at,(semiEnd||robinEnd)+lead(match));
      if (teams.some(id=>deferredTeams.has(id)) || (match.stage!=="round_robin" && technical.deferred.length>0)) {
        at=Math.max(at,technical.makeupAt);
        if (!technical.deferred.includes(match.id)) technical.deferred.push(match.id);
      }
      this.move(edition,match,at,now);
      if (technical.deferred.includes(match.id)) for (const team of teams) deferredTeams.add(team);
      const end=this.projectedEnd(edition.id,match,at);
      for (const team of teams) available.set(team,end);
      if (match.stage==="round_robin") robinEnd=Math.max(robinEnd,end);
      if (match.stage==="semifinal") semiEnd=Math.max(semiEnd,end);
    }
    // These are future bracket slots, not fabricated matches or outcomes.
    if (edition.calendar) {
      edition.calendar.semifinalAt=new Date(Math.max(Date.parse(edition.calendar.semifinalAt),robinEnd+10*minute)).toISOString();
      if (edition.calendar.finalAt!==null) {
        const hasSemis=(edition.bracket.semifinalMatchIds?.length??0)>0 ||
          (edition.teams?.filter(t=>t.drawOrder!==null).length??0)>=4;
        edition.calendar.finalAt=new Date(Math.max(Date.parse(edition.calendar.finalAt),semiEnd+10*minute,
          robinEnd ? (hasSemis ? Date.parse(edition.calendar.semifinalAt)+46*minute : robinEnd+10*minute) : 0)).toISOString();
      }
    }
  }

  private projectedEnd(editionId:string,match:Match,at:number) {
    const runtime=this.runtime({editionId,matchId:match.id}) as (Runtime & {active?:Runtime["active"] & {index:number;battle:{tick:number;status:string;runtime?:{started:boolean}}}})|null;
    const active=runtime?.active;
    if (!runtime || !active) return at+duration(match);
    const remainingBattle=active.battle.status==="running"?(600-active.battle.tick)*1000:0;
    const prepare=active.nextTickAt===null?Math.max(0,active.prepareUntil-runtime.lastSeenAt):0;
    return Math.max(at,runtime.lastSeenAt)+prepare+remainingBattle+(2-active.index)*12*minute;
  }
}

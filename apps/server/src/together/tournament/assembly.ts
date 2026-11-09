import type Database from "better-sqlite3";
import type { MainActivitySource } from "../../moments/main-activity-source.js";
import type { SnowReplicaBattle, SnowTournamentResponse } from "@doorbell/protocol";
import { SnowTournamentStore } from "./store.js";
import { SnowTournamentService } from "./service.js";
import { SnowTournamentTeamService, type SnowTournamentIdentityPort } from "./team-service.js";
import { SnowTournamentResults, type SnowTournamentEnginePort } from "./results.js";
import { SnowTournamentScheduler, startSnowTournamentClock, type SnowTournamentScheduleHost } from "./scheduler.js";
import { monthlyWindow, type MonthlySnowSeason } from "./calendar.js";
import { SnowTournamentMatchHost, type HostBattle, type SnowMatchEngine, type SnowBattleFrame } from "./match-host.js";
import { SnowTournamentRegistrationBell } from "./registration-bell.js";
import { SnowTournamentSettlement, type SnowTournamentEconomy } from "./settlement.js";
import { SnowTournamentPlayerSignals } from "./player-signals.js";
import { snowTournamentForResident } from "./resident-facade.js";
import { SnowTournamentTools } from "./tools.js";
import { renderSnowPlayerSignal } from "./player-copy.js";
import { SnowTournamentResultBell, renderSnowResult } from "./result-bell.js";
import {SnowTournamentTeamSignals} from "./team-signals.js";
import { SnowTournamentSpectators } from "./spectators.js";

/** Caller supplies the migrated community connection and the existing authoritative adapters. */
export function createSnowTournamentDomain(db:Database.Database, dependencies:{
  identity:SnowTournamentIdentityPort;
  mainActivity?:Pick<MainActivitySource,"syncSnow"|"snowShares">;
  displayName:(name:string)=>string;
  parsePublic:(value:unknown)=>SnowTournamentResponse;
  now?:()=>number;
  engine?:SnowTournamentEnginePort;
  economy?:SnowTournamentEconomy;
  schedule?: {
    season: MonthlySnowSeason;
    host: SnowTournamentScheduleHost;
    isEligible(residentId: string): boolean | Promise<boolean>;
  };
  runtime?: {
    season?: MonthlySnowSeason;
    engine: SnowMatchEngine;
    isEligible(residentId: string): boolean | Promise<boolean>;
    projectBattle(battle: HostBattle): SnowReplicaBattle;
    registrationBell?: { isEligible(residentId:string):boolean; notify(residentId:string):void };
    playerSignals?:Omit<ConstructorParameters<typeof SnowTournamentPlayerSignals>[1],"read"|"render">;
  };
}) {
  const store=new SnowTournamentStore(db);
  const teams=new SnowTournamentTeamService(store,dependencies.identity);
  const runtime=dependencies.runtime;
  const now=dependencies.now??Date.now;
  const configuredSeason=runtime?.season??dependencies.schedule?.season;
  if(configuredSeason) monthlyWindow(configuredSeason,now());
  const matchHost=runtime ? new SnowTournamentMatchHost(store,runtime.engine,now) : null;
  const engine=matchHost ?? dependencies.schedule?.host ?? dependencies.engine;
  const results=engine ? new SnowTournamentResults(store,engine,now) : null;
  const settlement=dependencies.economy ? new SnowTournamentSettlement(store,teams,dependencies.economy,now) : null;
  const resultBell=runtime?.season && runtime.playerSignals && settlement
    ? new SnowTournamentResultBell(db,store,{...runtime.playerSignals,render:renderSnowResult}) : null;
  let reportSettlement:(id:string,error:unknown)=>void=()=>{};
  const syncActivity=(id:string)=>{
    if (!dependencies.mainActivity) return;
    const edition=store.read(id);
    if (!edition) return;
    try { dependencies.mainActivity.syncSnow(edition as Parameters<MainActivitySource["syncSnow"]>[0],now()); }
    catch (error) { reportSettlement(id,error); }
  };
  const reconcileSettlement=(id:string)=>{
    syncActivity(id);
    if (!settlement) return;
    void settlement.reconcile(id).then(failures=>{
      for (const failure of failures) reportSettlement(failure.id,failure.error);
      syncActivity(id);
      resultBell?.queue(id);
    }).catch(error=>reportSettlement(id,error));
  };
  const registrationBell=runtime?.season && runtime.registrationBell
    ? new SnowTournamentRegistrationBell(db,runtime.registrationBell.isEligible,runtime.registrationBell.notify,now,{
      call:(residentId,editionId)=>tools?.registrationCall(residentId,editionId)??null,
      ...(runtime.playerSignals?{cancelled:runtime.playerSignals.cancelled}:{}),
    }) : null;
  let tools:SnowTournamentTools|null=null;
  const teamSignals=runtime?.season&&runtime.registrationBell?new SnowTournamentTeamSignals(db,store,{
    eligible:runtime.registrationBell.isEligible,notify:runtime.registrationBell.notify,now,
    ...(runtime.playerSignals?{cancelled:runtime.playerSignals.cancelled}:{}),
    name:id=>{
      const row=db.prepare("SELECT resident_name FROM residents WHERE resident_id=?").get(id) as {resident_name:string}|undefined;
      return dependencies.displayName(row?.resident_name??id);
    },choices:(id,editionId,offerId)=>tools?.offerOptions(id,editionId,offerId)??[],
    formationChoices:(id,editionId)=>tools?.formationOptions(id,editionId)??[],
  }):null;
  const playerSignals=runtime?.season && runtime.playerSignals && matchHost
    ? new SnowTournamentPlayerSignals(db,{now,...runtime.playerSignals,read:matchHost.playerSignals.bind(matchHost),
      render:signal=>renderSnowPlayerSignal(signal,id=>{
        const row=db.prepare("SELECT resident_name FROM residents WHERE resident_id=?").get(id) as {resident_name:string}|undefined;
        return dependencies.displayName(row?.resident_name??id);
      },signal.kind==='started'||signal.kind==='action'?tools?.battleCommandExamples(signal.residentId,signal)??[]:[])}) : null;
  if (playerSignals) matchHost?.bindSignals(playerSignals);
  const schedule=runtime?.season && matchHost ? {
    season:runtime.season, host:matchHost, isEligible:runtime.isEligible,
    ...(registrationBell ? {registrationBell} : {}),
    ...(teamSignals?{teamSignals}:{}),
    ...(settlement?{settleRegistration:async(id:string)=>{
      const failures=await settlement.settleRegistration(id);
      for(const failure of failures)reportSettlement(failure.id,failure.error);
      return failures;
    }}:{}),
    onResult:reconcileSettlement,
  } : dependencies.schedule ? { ...dependencies.schedule, onResult:reconcileSettlement } : undefined;
  type MatchRef={editionId:string;matchId:string};
  type ReadBattleFrame=()=>SnowReplicaBattle|null;
  // Each notification owns one lazy public projection. Pending connections keep
  // only the latest notification; there is no retained per-match snapshot.
  const battleFrame=(ref:MatchRef,committedFrame?:SnowBattleFrame):ReadBattleFrame=>{
    let projected:SnowReplicaBattle|null|undefined,nextTickAt:number|null=null;
    return ()=>{
      if(projected===undefined){
        const frame=committedFrame??matchHost?.frameForProjection(ref);
        projected=frame&&runtime?runtime.projectBattle(frame.battle):null;
        nextTickAt=frame?.nextTickAt??null;
      }
      return projected?{...projected,untilNextTick:projected.started&&nextTickAt!==null?Math.max(0,nextTickAt-now()):null}:null;
    };
  };
  const battleSubscribers=new Map<string,{listeners:Set<(read:ReadBattleFrame)=>void>;stop:()=>void}>();
  const battleRead=matchHost && runtime ? {
    read: (ref:MatchRef) => battleFrame(ref)(),
    subscribe: (ref:MatchRef,listener:(read:ReadBattleFrame)=>void) => {
      const key=JSON.stringify([ref.editionId,ref.matchId]);
      let group=battleSubscribers.get(key);
      if(!group){
        const listeners=new Set<(read:ReadBattleFrame)=>void>();
        const stop=matchHost.subscribe(ref,frame=>{
          const read=battleFrame(ref,frame);
          for(const notify of listeners)notify(read);
        });
        group={listeners,stop};battleSubscribers.set(key,group);
      }
      const subscribed=group;
      subscribed.listeners.add(listener);
      return ()=>{
        if(!subscribed.listeners.delete(listener))return;
        if(!subscribed.listeners.size){subscribed.stop();battleSubscribers.delete(key);}
      };
    },
  } : null;
  const scheduler=schedule && results ? new SnowTournamentScheduler(store,teams,results,schedule.host,schedule) : null;
  const publicService=new SnowTournamentService(store,dependencies.parsePublic,dependencies.displayName,matchHost?.publicMatchProgress.bind(matchHost),new SnowTournamentSpectators(db,store,now),now);
  tools=runtime?.season && runtime.registrationBell && playerSignals && matchHost && dependencies.economy
    ? new SnowTournamentTools(db,{store,teams,identity:dependencies.identity,publicService,host:matchHost,catalog:runtime.engine.catalog,now,
      ...(dependencies.mainActivity ? {mainActivity:dependencies.mainActivity} : {}),
      residents:()=>{
        const rows=db.prepare("SELECT resident_id AS id,resident_name AS name FROM residents ORDER BY resident_id").all() as {id:string;name:string}[];
        return rows.filter(row=>runtime.registrationBell!.isEligible(row.id)).map(row=>({...row,name:dependencies.displayName(row.name)}));
      },afterTeamMutation:id=>teamSignals?.sync(id),afterMutation:async id=>{const failures=await settlement!.reconcile(id);resultBell?.queue(id);return failures;}}) : null;
  return {
    store,
    publicService,
    teams,
    results,
    matchHost,
    battleRead,
    registrationWakeSource:registrationBell?.source ?? null,
    teamWakeSource:teamSignals?.source??null,
    playerWakeSource:playerSignals?.source??null,
    resultWakeSource:resultBell?.source??null,
    settlement,
    scheduler,
    tools,
    forResident: (residentId:string) => snowTournamentForResident(residentId,{store,teams,identity:dependencies.identity,publicService,host:matchHost}),
    start: (report: (id:string,error:unknown)=>void) => {
      if (!scheduler) return null;
      reportSettlement=report;
      registrationBell?.repairLegacy();
      for (const entry of store.all() as {id:string}[]) reconcileSettlement(entry.id);
      const clock=startSnowTournamentClock(scheduler,report);
      matchHost?.bindClock(clock.wake);
      return {wake:clock.wake,stop(){matchHost?.bindClock(undefined);clock.stop();}};
    },
  };
}

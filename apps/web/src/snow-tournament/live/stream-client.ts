import {snowBattleStreamSchema,snowEditionStreamSchema,type SnowPixelBattle,type SnowReplicaBattle,type SnowTournamentResponse} from "../../../../../packages/protocol/src/snow-tournament";
import {createPublicSimulation,advancePublicSimulation,publicReplica,applyPublicSnapshot,projectPublicSimulation,type PublicSimulation} from "../../../../server/src/together/tournament/shared/replica";

function applyFields<T extends object>(prior:T,changes:object):T {
  const next={...prior};for(const [key,value]of Object.entries(changes))if(value!==undefined)Reflect.set(next,key,value);return next;
}
export class BattleStreamState {
  revision=0;
  value:SnowReplicaBattle|null=null;
  private simulation:PublicSimulation|null=null;
  accept(input:unknown,at=performance.now()):BattleStreamUpdate|null {
    const frame=snowBattleStreamSchema.parse(input);
    if(frame.kind==="snapshot"){
      this.revision=frame.revision;this.value=frame.battle;this.simulation=frame.battle?createPublicSimulation(frame.battle):null;
      return this.update(true,at);
    }
    if(frame.revision<=this.revision)return null;
    if(frame.base!==this.revision||frame.revision<=frame.base||frame.id!==this.value?.id)throw Error("battle_stream_gap");
    if(!this.simulation)throw Error("battle_stream_gap");
    advancePublicSimulation(this.simulation,frame.tick);
    const predicted=publicReplica(this.simulation),units=new Map(predicted.units.map(unit=>[unit.id,unit]));
    for(const id of frame.units.remove)units.delete(id);
    for(const update of frame.units.update){const prior=units.get(update.id);if(!prior)throw Error("battle_stream_gap");units.set(update.id,applyFields(prior,update.changes));}
    for(const unit of frame.units.add)units.set(unit.id,unit);
    this.value={...applyFields(predicted,frame.changes),tick:frame.tick,units:[...units.values()]};this.revision=frame.revision;
    applyPublicSnapshot(this.simulation,this.value);return this.update(false,at);
  }
  private update(reset:boolean,at:number):BattleStreamUpdate {return {value:this.simulation?projectPublicSimulation(this.simulation):null,
    simulation:this.simulation?structuredClone(this.simulation):null,untilNextTick:this.value?.untilNextTick??null,reset,at};}
}
export type BattleStreamUpdate={value:SnowPixelBattle|null;simulation:PublicSimulation|null;untilNextTick:number|null;reset:boolean;at:number};
export class EditionStreamState {
  revision=0;
  value:SnowTournamentResponse={edition:null};
  accept(input:unknown) {
    const frame=snowEditionStreamSchema.parse(input);
    if(frame.kind==="snapshot"){this.revision=frame.revision;this.value=frame.data;return this.value;}
    if(frame.revision<=this.revision)return null;
    if(frame.base!==this.revision||frame.revision<=frame.base||frame.id!==this.value.edition?.id)throw Error("edition_stream_gap");
    const apply=<T extends {id:string}>(before:T[],delta:{put:T[];remove:string[]})=>{
      const records=new Map(before.map(item=>[item.id,item]));for(const id of delta.remove)records.delete(id);for(const item of delta.put)records.set(item.id,item);return [...records.values()];
    };
    this.value={edition:{...applyFields(this.value.edition,frame.changes),
      teams:apply(this.value.edition.teams,frame.teams),matches:apply(this.value.edition.matches,frame.matches)}};
    this.revision=frame.revision;return this.value;
  }
}
export type StreamStatus="connecting"|"connected"|"offline"|"invalid";
function subscribe<T>(url:string,accept:(input:unknown)=>T|null,receive:(value:T)=>void,status:(value:StreamStatus)=>void) {
  const source=new EventSource(url);let active=true;status("connecting");
  source.addEventListener("update",event=>{
    if(!active)return;
    try {const next=accept(JSON.parse((event as MessageEvent<string>).data));if(next!==null){receive(next);status("connected");}}
    catch {active=false;source.close();status("invalid");}
  });
  source.onerror=()=>{if(active)status("offline");}; // Native EventSource reconnects; no polling or extra retry timer.
  return ()=>{active=false;source.close();};
}
export function watchSnowBattle(url:string,receive:(value:BattleStreamUpdate)=>void,status:(value:StreamStatus)=>void) {
  const state=new BattleStreamState();return subscribe(url,input=>state.accept(input),receive,status);
}
export function watchSnowEdition(editionId:string|undefined,receive:(value:SnowTournamentResponse)=>void,status:(value:StreamStatus)=>void) {
  const state=new EditionStreamState(),query=editionId?`?${new URLSearchParams({editionId})}`:"";
  return subscribe(`/api/snow-tournament/stream${query}`,input=>state.accept(input),receive,status);
}

import type {SnowReplicaBattle,SnowTournamentResponse,SnowBattleStream,SnowEditionStream} from "@doorbell/protocol";
import {createPublicSimulation,advancePublicSimulation,publicReplica,applyPublicSnapshot,type PublicSimulation} from "./shared/replica.js";

const equal=(a:unknown,b:unknown)=>a===b || JSON.stringify(a)===JSON.stringify(b);
function changed<T extends object>(before:T,after:T,omit:string[]) {
  return Object.fromEntries(Object.entries(after).filter(([key,value])=>!omit.includes(key)&&!equal(before[key as keyof T],value))) as Partial<T>;
}
function records<T extends {id:string}>(before:T[],after:T[]) {
  const previous=new Map(before.map(item=>[item.id,item])),current=new Set(after.map(item=>item.id));
  return {put:after.filter(item=>!equal(previous.get(item.id),item)),remove:before.filter(item=>!current.has(item.id)).map(item=>item.id)};
}

function battleStreamFrame(before:SnowReplicaBattle|null,after:SnowReplicaBattle|null,revision:number,terminal=false):SnowBattleStream|null {
  if(!revision || before?.id!==after?.id)return {kind:"snapshot",revision:revision+1,battle:after};
  if(!before || !after)return null;
  const previous=new Map(before.units.map(unit=>[unit.id,unit])),ids=new Set(after.units.map(unit=>unit.id));
  const units:Extract<SnowBattleStream,{kind:"patch"}>["units"]={add:[],remove:before.units.filter(unit=>!ids.has(unit.id)).map(unit=>unit.id),update:[]};
  for(const unit of after.units){
    const prior=previous.get(unit.id);
    if(!prior)units.add.push(unit);
    else {const changes=changed(prior,unit,["id"]);if(Object.keys(changes).length)units.update.push({id:unit.id,changes});}
  }
  const changes=changed(before,after,["id","tick","units","untilNextTick"]);
  if(before.started!==after.started)changes.untilNextTick=after.untilNextTick;
  if(terminal)changes.status=after.status;
  return Object.keys(changes).length||units.add.length||units.remove.length||units.update.length
    ? {kind:"patch",base:revision,revision:revision+1,id:after.id,tick:after.tick,changes,units}:null;
}

/** Ordinary ticks, movement, hits and deaths are predicted by the same core.
 * Only unpredicted public inputs/corrections and an authoritative terminal leave the server. */
export class BattleStreamEncoder {
  private simulation:PublicSimulation|null=null;
  private revision=0;
  private terminal=false;
  private id:string|null=null;
  read(after:SnowReplicaBattle|null):SnowBattleStream|null {
    if(!this.revision||this.id!==(after?.id??null)|| (this.simulation&&after&&after.tick<this.simulation.tick)){
      this.id=after?.id??null;this.simulation=after?createPublicSimulation(after):null;
      this.terminal=!!after&&after.status!=="running";
      return {kind:"snapshot",revision:++this.revision,battle:after};
    }
    if(!after||!this.simulation)return null;
    advancePublicSimulation(this.simulation,after.tick);
    const predicted=publicReplica(this.simulation),terminal=after.status!=="running"&&!this.terminal;
    const frame=battleStreamFrame(predicted,after,this.revision,terminal);
    if(frame){applyPublicSnapshot(this.simulation,after);this.revision=frame.revision;this.terminal=after.status!=="running";}
    return frame;
  }
}

export function editionStreamFrame(before:SnowTournamentResponse|null,after:SnowTournamentResponse,revision:number):SnowEditionStream|null {
  if(!revision || before?.edition?.id!==after.edition?.id)return {kind:"snapshot",revision:revision+1,data:after};
  if(!before?.edition || !after.edition)return null;
  const teams=records(before.edition.teams,after.edition.teams),matches=records(before.edition.matches,after.edition.matches);
  const changes=changed(before.edition,after.edition,["id","teams","matches"]);
  return Object.keys(changes).length||teams.put.length||teams.remove.length||matches.put.length||matches.remove.length
    ? {kind:"patch",base:revision,revision:revision+1,id:after.edition.id,changes,teams,matches}:null;
}

type WireFrame=SnowBattleStream|SnowEditionStream;
type WirePacket={revision:number;text:string};
type StreamSource<State>={
  initial:()=>State;
  subscribe:(changed:(read:()=>State)=>void)=>()=>void;
  encode:(state:State)=>WireFrame|null;
  snapshot:(state:State,revision:number)=>WireFrame;
};

class SharedSnowFeed<State> {
  private readLatest:()=>State;
  private dirty=true;
  private latest!:State;
  private patch:{base:number;packet:WirePacket}|undefined;
  private currentSnapshot:WirePacket|undefined;
  private revision=0;
  constructor(private readonly source:StreamSource<State>){this.readLatest=source.initial;}
  changed(read:()=>State){this.readLatest=read;this.dirty=true;}
  read(after:number):WirePacket|null {
    if(this.dirty){
      const latest=this.readLatest(),frame=this.source.encode(latest);
      this.latest=latest;this.currentSnapshot=undefined;this.patch=undefined;this.dirty=false;
      if(frame){
        const packet={revision:frame.revision,text:JSON.stringify(frame)};
        this.revision=frame.revision;
        if(frame.kind==="patch")this.patch={base:frame.base,packet};
        else this.currentSnapshot=packet;
      }
    }
    if(after===this.revision)return null;
    if(this.patch?.base===after)return this.patch.packet;
    return this.currentSnapshot??={revision:this.revision,text:JSON.stringify(this.source.snapshot(this.latest,this.revision))};
  }
}

/** One encoder and one current public board per watched match or edition. */
export class SharedSnowStreams<Key,State> {
  private readonly active=new Map<string,{feed:SharedSnowFeed<State>;listeners:Set<()=>void>;stop:()=>void}>();
  constructor(private readonly keyOf:(key:Key)=>string,private readonly sourceFor:(key:Key)=>StreamSource<State>){}
  connect(key:Key,notify:()=>void){
    const id=this.keyOf(key);
    let group=this.active.get(id);
    if(!group){
      const source=this.sourceFor(key),feed=new SharedSnowFeed(source),listeners=new Set<()=>void>();
      const stop=source.subscribe(read=>{feed.changed(read);for(const listener of listeners)listener();});
      group={feed,listeners,stop};this.active.set(id,group);
    }
    const joined=group;
    joined.listeners.add(notify);
    return {read:(after:number)=>joined.feed.read(after),close:()=>{
      if(!joined.listeners.delete(notify)||joined.listeners.size)return;
      joined.stop();this.active.delete(id);
    }};
  }
}

import {createBattle,tick,viewForSide} from "./engine.mjs";
import {SNOW_WAR_CONFIG as CFG} from "./config.mjs";
import type {SnowReplicaBattle,SnowReplicaUnit,SnowPixelBattle} from "@doorbell/protocol";

// Only observable combat calculation state. Never copy the authority's whole save.
const unitKeys=["id","side","typeKey","lane","pos","ground","hp","maxHp","armor","spellResist","moveSeconds","moveProgress",
  "attackInterval","attack","damageType","heal","healRadius","range","splash","breakthrough","stealth","sprintUntilTick","sprintMult",
  "blockedBy","blocking","attackTimer","alive","blockCapacity","shield","fireFocusUntilTick","silencedUntilTick","decayStartTick","systemWave"] as const;
const effectKeys=["id","kind","side","lane","value","untilTick"];
const pick=(value:Record<string,unknown>,keys:readonly string[])=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,structuredClone(value[key])]));
export type PublicSimulation=ReturnType<typeof createBattle>;

export function publicReplica(battle:PublicSimulation,untilNextTick:number|null=null):SnowReplicaBattle {
  const view=viewForSide(battle,"defend"),visible=new Set<string>(view.visibleUnits.map((unit:{id:string})=>unit.id));
  return {id:battle.battleId,rulesVersion:battle.rulesVersion,tick:battle.tick,started:battle.runtime?.started===true,status:battle.status,
    endReason:battle.endReason,coreHp:battle.coreHp,untilNextTick,
    units:Object.values(battle.units as Record<string,SnowReplicaUnit>).filter(unit=>visible.has(unit.id)).map(unit=>pick(unit as unknown as Record<string,unknown>,unitKeys) as SnowReplicaUnit),
    effects:battle.effects.map((effect:Record<string,unknown>)=>pick(effect,effectKeys)),
    visual:battle.lastVisualFrame?.tick===battle.tick?structuredClone(battle.lastVisualFrame.events):[],
  };
}
export function createPublicSimulation(snapshot:SnowReplicaBattle):PublicSimulation {
  if(snapshot.rulesVersion!==CFG.rulesVersion)throw Error("snow_replica_rules_mismatch");
  const state=createBattle({battleId:snapshot.id,roundId:"public",attackSideId:"public-attack",defendSideId:"public-defend",participants:{attack:[],defend:[]},assignments:{attack:{},defend:{}},randomSeed:1});
  // Public simulation has its own deterministic random state. It cannot reveal
  // the authority's seed/future wave lanes, wallet, assignments or cooldowns.
  state.systemWaves=null;state.cost={attack:0,defend:0};
  applyPublicSnapshot(state,snapshot);return state;
}
export function applyPublicSnapshot(state:PublicSimulation,snapshot:SnowReplicaBattle) {
  state.battleId=snapshot.id;state.tick=snapshot.tick;state.runtime={started:snapshot.started};state.status=snapshot.status;
  state.endReason=snapshot.endReason;state.coreHp=snapshot.coreHp;
  state.units=Object.fromEntries(snapshot.units.map(unit=>[unit.id,structuredClone(unit)]));state.effects=structuredClone(snapshot.effects);
  state.lastVisualFrame={tick:snapshot.tick,events:structuredClone(snapshot.visual)};
}
export function advancePublicSimulation(state:PublicSimulation,toTick:number) {
  while(state.runtime?.started && state.status==="running" && state.tick<Math.min(toTick,CFG.battleTicks)){
    tick(state);
    // A once-visible scout that becomes hidden must leave all browser state,
    // not merely be hidden by CSS while its future position is still available.
    const visible=new Set<string>(viewForSide(state,"defend").visibleUnits.map((unit:{id:string})=>unit.id));
    for(const id of Object.keys(state.units))if(!visible.has(id))delete state.units[id];
  }
}
export function projectPublicSimulation(state:PublicSimulation):SnowPixelBattle {
  const snapshot=publicReplica(state);
  return {id:snapshot.id,tick:snapshot.tick,started:snapshot.started,status:snapshot.status,coreHp:snapshot.coreHp,coreMaxHp:CFG.coreMaxHp,
    groundSlots:[...CFG.groundSlots],highSlots:[...CFG.highSlots],
    units:snapshot.units.map(unit=>{
      let multiplier=1;
      for(const effect of snapshot.effects)if(effect.kind==="speed"&&effect.side==="attack"&&effect.lane===unit.lane&&Number(effect.untilTick)>=snapshot.tick)multiplier=Math.max(multiplier,Number(effect.value??1));
      if((unit.sprintUntilTick??0)>=snapshot.tick&&(unit.sprintUntilTick??0)>0)multiplier=Math.max(multiplier,unit.sprintMult??1);
      return {id:unit.id,type:unit.systemWave?"system_inf":unit.typeKey,name:unit.systemWave?"系统小兵":(unit.side==="attack"?CFG.attackerUnits:CFG.defenderUnits)[unit.typeKey].name,
        role:unit.side,ground:unit.ground,lane:unit.lane,position:unit.pos,hp:unit.hp,maxHp:unit.maxHp,shield:unit.shield&&unit.shield.untilTick>=snapshot.tick?unit.shield.amount:0,
        blockedBy:unit.blockedBy??null,blocking:[...(unit.blocking??[])],motion:{moving:snapshot.started&&snapshot.status==="running"&&unit.side==="attack"&&!unit.blockedBy,
          secondsPerCell:unit.moveSeconds??null,speedMultiplier:multiplier}};
    }),effects:snapshot.effects.map(effect=>({id:String(effect.id),kind:String(effect.kind),role:effect.side as "attack"|"defend",lane:Number(effect.lane),untilTick:Number(effect.untilTick)})),events:snapshot.visual};
}

import {advancePublicSimulation,projectPublicSimulation,type PublicSimulation} from "../../../../server/src/together/tournament/shared/replica";
import type {BattleStreamUpdate} from "./stream-client";
import type {SnowPixelTimeline} from "./timeline";

/** Runs the same pure combat core, not a second set of browser damage rules. */
export class SnowReplicaTimeline {
  private state:PublicSimulation|null=null;
  private anchorTick=0;
  private anchorAt=0;
  private pausedAt:number|null=null;
  private authorityStatus="running";
  private nextState:PublicSimulation|null=null;
  private nextTick=-1;
  accept(update:BattleStreamUpdate) {
    const wasStarted=this.state?.runtime?.started;
    if(update.reset||!this.state||this.state.battleId!==update.simulation?.battleId||wasStarted!==update.simulation?.runtime?.started){
      this.anchorTick=update.simulation?.tick??0;this.anchorAt=update.at+(update.untilNextTick??1000)-1000;
    }
    this.state=update.simulation?structuredClone(update.simulation):null;
    this.authorityStatus=update.value?.status??"running";this.pausedAt=null;this.nextState=null;this.nextTick=-1;
  }
  pause(at:number) {this.pausedAt??=at;}
  frame(at:number,reducedMotion=false):ReturnType<SnowPixelTimeline["frame"]> {
    if(!this.state)return {battle:null,units:[],events:[]};
    const time=this.pausedAt??at,elapsed=Math.max(0,time-this.anchorAt),target=this.anchorTick+Math.floor(elapsed/1000);
    advancePublicSimulation(this.state,target);
    if(this.nextTick!==this.state.tick){this.nextState=structuredClone(this.state);advancePublicSimulation(this.nextState,this.state.tick+1);this.nextTick=this.state.tick;}
    const battle=projectPublicSimulation(this.state),fraction=(elapsed%1000)/1000;
    // Predicted combat may finish before the authoritative terminal arrives.
    // Only that terminal is allowed to display the winner.
    if(this.authorityStatus==="running"&&battle.status!=="running")battle.status="running";
    const units=battle.units.map(unit=>{
      const raw=this.state.units[unit.id],next=this.nextState?.units[unit.id];
      const start=raw.pos+(raw.moveProgress??0),end=next?next.pos+(next.moveProgress??0):Math.min(13,start+unit.motion.speedMultiplier/(unit.motion.secondsPerCell??1));
      const canMove=this.state.runtime?.started&&this.state.status==="running"&&unit.motion.moving;
      const position=canMove?Math.min(13,start+Math.max(0,end-start)*fraction):start;
      const moving=!reducedMotion&&this.pausedAt===null&&canMove&&end>start;
      return {unit,position,moving,walkFrame:moving?Math.floor(position*18%3) as 0|1|2:0 as const};
    });
    const eventAt=this.anchorAt+(this.state.tick-this.anchorTick)*1000,age=time-eventAt;
    return {battle,units,events:reducedMotion||this.pausedAt!==null||age>=800?[]:battle.events.map(event=>({event,progress:Math.max(0,age/800)}))};
  }
}

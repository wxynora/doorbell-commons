import type { SnowPixelBattle, SnowPixelEvent } from "../../../../../packages/protocol/src/snow-tournament";

export type PixelUnit = SnowPixelBattle["units"][number];
export type AnimatedUnit = { unit: PixelUnit; position: number; walkFrame: 0 | 1 | 2; moving: boolean };
type Motion = { position: number; at: number; speed: number; stopAt: number | null };

/** Draw on demand; keep one frame queued only while the scene needs animation. */
export function createSnowFrameLoop(
  draw:(at:number)=>boolean,
  request:(callback:FrameRequestCallback)=>number = callback=>requestAnimationFrame(callback),
  cancel:(id:number)=>void = id=>cancelAnimationFrame(id),
) {
  let frame:number|null=null,closed=false;
  const invalidate=()=>{
    if(closed||frame!==null)return;
    frame=request(at=>{
      frame=null;
      if(!closed&&draw(at))invalidate();
    });
  };
  return {invalidate,close(){
    closed=true;
    if(frame!==null)cancel(frame);
    frame=null;
  }};
}

/** Local visual clock: move at the real speed between state changes; never settle combat here. */
export class SnowPixelTimeline {
  private battle: SnowPixelBattle | null = null;
  private motions = new Map<string, Motion>();
  private eventTick: number | null = null;
  private effects: { event: SnowPixelEvent; at: number }[] = [];

  accept(snapshot: SnowPixelBattle, at: number): boolean {
    const prior = this.battle;
    if (prior?.id === snapshot.id && snapshot.tick < prior.tick) return false;
    const sameBattle = prior?.id === snapshot.id;
    if (!sameBattle) {
      this.motions.clear(); this.effects = []; this.eventTick = snapshot.tick;
    }
    const next = new Map<string, Motion>();
    for (const unit of snapshot.units) {
      const existing = this.motions.get(unit.id);
      let current = existing ? this.sample(existing, at) : unit.position;
      const moving = snapshot.started && snapshot.status === "running" && unit.role === "attack" && !unit.blockedBy && unit.motion.moving;
      const travelSpeed = unit.motion.secondsPerCell ? unit.motion.speedMultiplier / unit.motion.secondsPerCell : 0;
      let speed = moving ? travelSpeed : 0;
      let stopAt: number | null = null;
      // A cell number is not a new movement anchor. Preserve the trajectory across packets.
      // On a real stop, finish any remaining approach at the unit's own speed, never a catch-up sprint.
      if (existing && snapshot.started && snapshot.status === "running" && unit.blockedBy && unit.role === "attack" && travelSpeed > 0 &&
          (current < unit.position || current >= unit.position + 1)) {
        current=Math.min(current,unit.position);
        stopAt = unit.position;
        speed = current < stopAt ? travelSpeed : 0;
      }
      next.set(unit.id, { position: current, at, speed, stopAt });
    }
    this.motions = next; // No visibility history: a removed/hidden unit disappears immediately.
    this.battle = snapshot;
    const visible = new Set(snapshot.units.map(unit => unit.id));
    const observable = (event: SnowPixelEvent) => event.kind === "death" || event.kind === "breakthrough" ||
      (visible.has(event.source.id) && event.targets.every(target => visible.has(target.id)));
    this.effects = this.effects.filter(effect => observable(effect.event));
    if (sameBattle && snapshot.tick !== this.eventTick) {
      this.effects.push(...snapshot.events.filter(observable).map(event => ({ event, at })));
      this.eventTick = snapshot.tick;
    }
    return true;
  }

  private sample(motion: Motion, at: number) {
    const position = motion.position + Math.max(0, at - motion.at) / 1000 * motion.speed;
    if (motion.stopAt !== null)
      return motion.speed > 0 ? Math.min(motion.stopAt, position) : Math.max(motion.stopAt, position);
    // Stop visually at the exit; only the authority can remove units or damage the core.
    return Math.min(13, position);
  }

  pause(at:number) {
    for(const motion of this.motions.values()){
      motion.position=this.sample(motion,at);motion.at=at;motion.speed=0;motion.stopAt=null;
    }
    this.effects=[];
  }

  frame(at: number, reducedMotion = false): { battle: SnowPixelBattle | null; units: AnimatedUnit[]; events: { event: SnowPixelEvent; progress: number }[] } {
    // Visual lifetimes do not affect battle ticks, waits, authority or network traffic.
    this.effects = this.effects.filter(effect => at - effect.at < 800);
    return { battle: this.battle, units: (this.battle?.units ?? []).map(unit => {
      const motion = this.motions.get(unit.id)!;
      const position = this.sample(motion, at);
      const moving = !reducedMotion && motion.speed !== 0 && (motion.stopAt === null ? position < 13 : position !== motion.stopAt);
      return { unit, position, moving,
        walkFrame: moving ? Math.floor((position * 18) % 3) as 0 | 1 | 2 : 0 };
    }), events: reducedMotion ? [] : this.effects.map(effect => ({ event: effect.event, progress: Math.max(0, (at - effect.at) / 800) })) };
  }
}

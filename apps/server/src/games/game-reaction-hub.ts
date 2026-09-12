import type { GameCaller } from './game-identity.js';
import type { ReactionDelivery } from './game-reaction-service.js';
import type { GameReactionStore } from './game-reaction-store.js';
import { GameAccessError, type GameRoomStore } from './types.js';

type Event = Parameters<ReactionDelivery['publish']>[0];
/** Transient animation delivery; purchase/recovery records stay in the reaction store. */
export class GameReactionHub {
  private readonly listeners = new Set<{roomId:string;caller:GameCaller;playerId:string;emit:(event:Event)=>void|Promise<void>;close:()=>void}>();
  constructor(private readonly rooms:GameRoomStore,private readonly history?:Pick<GameReactionStore,'inRoom'>) {}
  async read(caller:GameCaller,roomId:string):Promise<Event[]>{
    await this.member(caller,roomId);
    return (this.history?.inRoom(roomId)??[]).map(({id,roomId,senderId,targetId,kind})=>({id,roomId,senderId,targetId,kind}));
  }
  private async member(caller:GameCaller,roomId:string) {
    const actor=await caller.authenticate();
    if(!this.rooms.read(roomId)?.seats.some(s=>s.playerId===actor.playerId&&s.controllerType===actor.controllerType)) throw new GameAccessError('not_seated');
    return actor;
  }
  async subscribe(caller:GameCaller,roomId:string,emit:(event:Event)=>void|Promise<void>) {
    const actor=await this.member(caller,roomId);
    let resolve!: (reason:unknown|null)=>void;
    const closed=new Promise<unknown|null>(r=>{resolve=r;});
    const listener={roomId,caller,playerId:actor.playerId,emit,close:()=>{this.listeners.delete(listener);resolve(null);}};
    this.listeners.add(listener);
    return {close:listener.close,closed};
  }
  async publish(event:Event) {
    await Promise.all([...this.listeners].filter(s=>s.roomId===event.roomId).map(async s=>{
      try { const actor=await this.member(s.caller,s.roomId);if(actor.playerId!==s.playerId)throw new GameAccessError('identity_changed');
        if(this.listeners.has(s)) await s.emit(event);
      } catch { s.close(); }
    }));
  }
  close(){for(const s of [...this.listeners])s.close();}
}

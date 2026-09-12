import type {GameRoom,GameRoomStore,GameKind} from './types.js';
export interface GameDeadline {key:string;playerId:string;at:number}
const rec=(value:unknown):Record<string,any>=>value&&typeof value==='object'?value as Record<string,any>:{};

export function nextGameDeadline(room:GameRoom,now:number):GameDeadline|null {
  const outer=rec(room.snapshot), state=room.kind==='mahjong'?rec(outer.state):outer;
  if(room.phase!=='playing'||['round_over','game_over','finished'].includes(state.phase)||state.status==='finished')return null;
  if(room.kind==='leaf-game'&&state.phase==='final_challenge'){
    return typeof state.final_challenge_deadline_ms==='number'
      ?{key:`final:${state.final_challenge_deadline_ms}`,playerId:'system',at:state.final_challenge_deadline_ms}:null;
  }
  const playerId=room.kind==='mahjong'?state.turn_player_id
    :room.kind==='monopoly'&&state.pending_debt?state.pending_debt.player_id:state.current_player_id;
  if(typeof playerId!=='string'||!room.seats.some(s=>s.playerId===playerId))return null;
  const key=JSON.stringify([room.kind,state.phase,playerId,
    room.kind==='uno'?state.pending?.card_id:null,
    room.kind==='mahjong'?state.last_discard:null]);
  return room.deadline?.key===key?room.deadline:{key,playerId,at:now+180_000};
}

/** Only legal, conservative single-step fallback. Never chooses social actions. */
export function timeoutCommand(kind:GameKind,projection:unknown,commandId:string):Record<string,unknown>|null {
  const view=rec(projection);
  if(kind==='leaf-game'){
    const actions=view.legal_actions as string[]|undefined;
    if(actions?.includes('concede'))return {command_id:commandId,expected_revision:view.revision,action:'concede'};
    if(actions?.includes('lead')){
      const own=(view.players as any[]).find(p=>p.id===view.viewer_id);
      const card=own?.hand?.[0];
      if(card)return {command_id:commandId,expected_revision:view.revision,action:'lead',card_ids:[card.id],declared_rank:typeof card.rank==='number'?card.rank:1};
    }
    return null;
  }
  const moves:Record<string,any>[]=kind==='mahjong'?rec(view.private).legal_actions??[]:view.legal_moves??[];
  const priority=kind==='mahjong'?['pass','discard','hu']
    :kind==='monopoly'?['decline','end_turn','card_ack','roll','declare_bankrupt']
    :kind==='doudizhu'?['pass','bid','play']
    :kind==='uno'?['keep','play','draw']
    :['roll','move','penalty_return'];
  for(const action of priority){
    const move=moves.find(m=>(kind==='mahjong'?m.kind:m.action)===action&&(action!=='bid'||m.value===0));
    if(!move)continue;
    if(kind==='mahjong')return {command_id:commandId,revision:view.revision,action_id:move.action_id};
    const {label,...fields}=move;
    return {...fields,command_id:commandId,expected_revision:view.revision};
  }
  return null;
}

export class GameTimeoutScheduler {
  private timers=new Map<string,{key:string;at:number;timer:ReturnType<typeof setTimeout>}>();
  constructor(private store:GameRoomStore,private run:(id:string,key:string)=>Promise<void>,private now=Date.now,
    private onError:(error:unknown)=>void=()=>{}){}
  publish(room:GameRoom){
    const current=this.timers.get(room.roomId);
    if(current?.key===room.deadline?.key&&current?.at===room.deadline?.at)return;
    if(current)clearTimeout(current.timer);
    this.timers.delete(room.roomId);
    if(!room.deadline)return;
    const {key,at}=room.deadline;
    const timer=setTimeout(()=>{
      this.timers.delete(room.roomId);
      const latest=this.store.read(room.roomId);
      if(latest?.deadline?.key!==key||latest.deadline.at!==at)return;
      void this.run(room.roomId,key).catch(this.onError);
    },Math.max(0,room.deadline.at-this.now()));
    timer.unref?.();this.timers.set(room.roomId,{key,at,timer});
  }
  close(){for(const {timer} of this.timers.values())clearTimeout(timer);this.timers.clear();}
}

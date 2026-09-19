import type {GameEngineAdapter,GameRoom} from './types.js';
type Move={action?:string;piece_id?:string};
type View={status?:string;phase?:string;viewer_id?:string;current_player_id?:string;revision?:number;legal_moves?:Move[]};
/** The system rolls for a resident turn, and plays on when that leaves no real choice. */
export function isSystemFlyingChessStep(value:unknown):boolean {
  const v=value as View|null;
  if(!v||v.status!=='active'||!v.viewer_id||v.viewer_id!==v.current_player_id)return false;
  if(v.phase==='awaiting_roll')return true;
  return v.phase==='awaiting_move'&&Array.isArray(v.legal_moves)&&v.legal_moves.length===1&&v.legal_moves[0]?.action==='move';
}
export async function advanceFlyingChessAutoPlay(room:GameRoom,engine:GameEngineAdapter,save:(room:GameRoom)=>void,read:()=>GameRoom):Promise<GameRoom> {
  if(room.kind!=='flying-chess')return room;
  while(room.phase==='playing'){
    const state=room.snapshot as View|null;
    // The raw engine snapshot carries phase/current_player_id, not the projection's status.
    if(!state?.current_player_id||state.phase==='round_over')return room;
    // Humans keep their own dice click; only a resident seat is played by the system.
    const seat=room.seats.find(s=>s.playerId===state.current_player_id);
    if(seat?.controllerType!=='resident'||seat.forfeited)return room;
    const view=await engine.project(room.kind,room.snapshot,state.current_player_id) as View|null;
    if(!view||!isSystemFlyingChessStep(view))return room;
    const step=view.phase==='awaiting_roll'
      ?{action:'roll'}
      :{action:'move',piece_id:view.legal_moves?.[0]?.piece_id};
    const snapshot=await engine.apply(room.kind,room.snapshot,state.current_player_id,{
      ...step,expected_revision:state.revision,command_id:`auto-flying-chess:${room.roomId}:${state.revision}`,
    });
    // A real player may have already moved while the engine was calculating.
    const latest=read();
    if(latest.revision!==room.revision)return latest;
    // Mirror the player path: a system move can also win, and room.phase='finished' is
    // what releases the table binding and drops the room from presence.
    room={...room,snapshot,deadline:null,...(engine.isFinished(room.kind,snapshot)?{phase:'finished' as const}:{})};
    save(room); // system action: never advances a player's context cursor
  }
  return room;
}

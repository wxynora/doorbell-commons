import type {GameEngineAdapter,GameRoom} from './types.js';
type View={phase?:string;field?:unknown;viewer_id?:string;current_player_id?:string;revision?:number;legal_moves?:Array<{action?:string}>};
/** Only the authoritative, current viewer's sole legal pass is automatic. */
export function isForcedDoudizhuPass(value:unknown):boolean {
  const v=value as View|null;
  return !!v && v.phase==='playing' && !!v.field && !!v.viewer_id && v.viewer_id===v.current_player_id
    && Array.isArray(v.legal_moves) && v.legal_moves.length===1 && v.legal_moves[0]?.action==='pass';
}
export async function advanceDoudizhuPasses(room:GameRoom,engine:GameEngineAdapter,save:(room:GameRoom)=>void,read:()=>GameRoom):Promise<GameRoom> {
  if(room.kind!=='doudizhu')return room;
  while(room.phase==='playing'){
    const state=room.snapshot as View|null;
    if(state?.phase!=='playing'||!state.field||!state.current_player_id)return room;
    const view=await engine.project(room.kind,room.snapshot,state.current_player_id);
    if(!isForcedDoudizhuPass(view))return room;
    const snapshot=await engine.apply(room.kind,room.snapshot,state.current_player_id,{
      action:'pass',expected_revision:state.revision,command_id:`auto-pass:${room.roomId}:${state.revision}`,
    });
    // A real player may have already moved while the engine was calculating.
    const latest=read();
    if(latest.revision!==room.revision)return latest;
    room={...room,snapshot,deadline:null};
    save(room); // system action: never advances a player's context cursor
  }
  return room;
}

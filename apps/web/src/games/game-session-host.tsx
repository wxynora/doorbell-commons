import {useEffect,useMemo,useRef,useState} from "react";
import {GameSessionContext,type GameSessionBinding} from "./game-session-binding";
import {GameChatContext} from "./game-chat-window";
import {GameReactionContext,type GameReactionBinding,type GameReactionEvent} from "./game-reaction-binding";
import {GameRoundExitContext} from "./game-round-exit";
import {GameWaitingRoom,type GameWaitingRoomProps} from "./game-waiting-room";
import {gameSessionClient,type GameSessionTransport,type SessionRoom,type SessionChatMessage} from "./game-session-client";
import {UnoPage} from "./uno/uno-page";
import {DoudizhuPage} from "./doudizhu/doudizhu-page";
import {LeafGamePage} from "./leaf-game/leaf-game-page";
import {FlyingChessPage} from "./flying-chess/flying-chess-page";
import {MonopolyPage} from "./monopoly/monopoly-page";
import {MahjongPage} from "./mahjong/mahjong-page";
import "./game-session-host.css";

export interface GameSessionHostProps {
  roomId:string;
  /** Supplied by authenticated session, not a query parameter. */
  viewerId:string;
  profiles:GameWaitingRoomProps["profiles"];
  transport?:GameSessionTransport;
  reactions?:GameReactionBinding;
  onExit():void|Promise<void>;
  /** Finished single-round games return to the table chooser after real departure. */
  onNewTable?():void|Promise<void>;
}
export function GameSessionHost(props:GameSessionHostProps){
  return <Session key={`${props.roomId}:${props.viewerId}`} {...props}/>;
}
const pages={uno:UnoPage,doudizhu:DoudizhuPage,"leaf-game":LeafGamePage,"flying-chess":FlyingChessPage,monopoly:MonopolyPage,mahjong:MahjongPage};
const projection=(game:unknown)=>game as {viewer_id?:string;revision?:number;phase?:string};
function Session({roomId,viewerId,profiles,transport=gameSessionClient,reactions,onExit,onNewTable}:GameSessionHostProps){
  const [room,setRoom]=useState<SessionRoom|null>(null);
  const current=useRef<SessionRoom|null>(null);
  const active=useRef(true);
  const [connected,setConnected]=useState(false);
  const connection=useRef(false);
  const [error,setError]=useState("");
  const [reloadKey,setReloadKey]=useState(0);
  const [messages,setMessages]=useState<SessionChatMessage[]>([]);
  const reactionListeners=useRef(new Set<(event:GameReactionEvent)=>void>());
  const accept=(next:SessionRoom)=>{
    if(next.roomId!==roomId)throw new Error("房间不匹配");
    if(next.game && projection(next.game).viewer_id!==viewerId)throw new Error("玩家局面不匹配");
    if(active.current && (!current.current || next.revision>=current.current.revision)){
      current.current=next;setRoom(next);
    }
    return current.current ?? next;
  };
  useEffect(()=>{
    active.current=true;
    setError("");
    let disposed=false;
    let close:(()=>void)|undefined;
    transport.read(roomId).then(next=>{
      if(disposed)return;
      accept(next);
      close=transport.subscribe(roomId,0,{
        game:value=>{try{accept(value);setError("");}catch(e){setError((e as Error).message);connection.current=false;setConnected(false);}},
        chat:message=>{if(active.current&&message.roomId===roomId)setMessages(old=>old.some(m=>m.sequence===message.sequence)?old:[...old,message].sort((a,b)=>a.sequence-b.sequence));},
        connection:value=>{if(active.current){connection.current=value;setConnected(value);}},
        reaction:event=>{if(active.current&&event.roomId===roomId)reactionListeners.current.forEach(listener=>listener(event));},
      });
    }).catch(e=>{if(!disposed)setError((e as Error).message);});
    return()=>{disposed=true;active.current=false;connection.current=false;close?.();};
  },[roomId,viewerId,transport,reloadKey]);
  const requireRoom=()=>{
    if(!connection.current||!current.current)throw new Error("尚未连接本桌");
    return current.current;
  };
  const leave=async()=>{
    const latest=requireRoom();
    await transport.leave(roomId,latest.revision);
    if(active.current)await onExit();
  };
  const command=async(move:Record<string,unknown>)=>{
    const latest=requireRoom();
    // Only the server binds actor_id. Both room and engine revisions travel intact.
    const {actor_id:_actor,...body}=move;
    return accept(await transport.command(roomId,latest.revision,body)).game;
  };
  const namedGame=useMemo(()=>{
    if(!room?.game)return null;
    if(room.kind==="mahjong"){
      const game=room.game as {participants:{player_id:string;display_name:string}[]};
      return {...game,participants:game.participants.map(p=>({...p,display_name:profiles[p.player_id]?.name??p.display_name}))};
    }
    const game=room.game as {players:{id:string;name:string}[]};
    return {...game,players:game.players.map(p=>({...p,name:profiles[p.id]?.name??p.name}))};
  },[room?.game,profiles]);
  const session=useMemo<GameSessionBinding|null>(()=>room?.game?{
    roomId,viewerId,connected,game:namedGame,
    refresh:async()=>accept(await transport.read(roomId)).game,
    command,
    again:async()=>{
      const latest=requireRoom();
      const game=projection(latest.game);
      if((latest.kind==="uno"||latest.kind==="doudizhu")&&game.phase==="round_over"){
        await command({action:"next_round",command_id:crypto.randomUUID(),expected_revision:game.revision});
      }else if(latest.phase==="finished"){
        await transport.leave(roomId,latest.revision);
        if(active.current)await (onNewTable??onExit)();
      }else throw new Error("本局尚未结束");
    },
  }:null,[room,namedGame,connected,transport]);
  const chat=useMemo(()=>({roomId,connected,messages:messages.map(m=>({...m,name:profiles[m.playerId]?.name??m.playerId})),send:async(text:string,id:string)=>{requireRoom();await transport.say(roomId,text,id);}}),[roomId,connected,messages,profiles,transport]);
  const defaultReaction=useMemo<GameReactionBinding>(()=>({roomId,viewerId,connected,
    send:async(targetId,kind,requestId)=>{requireRoom();await transport.sendReaction(roomId,targetId,kind,requestId);},
    subscribe:listener=>{reactionListeners.current.add(listener);return()=>{reactionListeners.current.delete(listener);};},
  }),[roomId,viewerId,connected,transport]);
  const reaction=reactions
    ?reactions.roomId===roomId&&reactions.viewerId===viewerId?{...reactions,connected:connected&&reactions.connected}:null
    :defaultReaction;
  if(!room)return <div className="game-session-status" role="status">{error||"正在连接游戏…"}{error&&<button type="button" onClick={()=>setReloadKey(key=>key+1)}>重新连接</button>}</div>;
  const Page=pages[room.kind];
  return <div className={`game-session-host game-session--${room.kind}`}>
    {room.phase==="waiting"?<GameWaitingRoom room={room} viewerId={viewerId} profiles={profiles} connected={connected}
      onReady={async ready=>{const r=requireRoom();accept(await transport.ready(roomId,r.revision,ready));}}
      onStart={async()=>{const r=requireRoom();accept(await transport.start(roomId,r.revision));}}
      onBack={()=>void leave().catch(e=>setError((e as Error).message))}/>
      :session?<GameSessionContext.Provider value={session}><GameChatContext.Provider value={chat}><GameReactionContext.Provider value={reaction}><GameRoundExitContext.Provider value={leave}><Page/></GameRoundExitContext.Provider></GameReactionContext.Provider></GameChatContext.Provider></GameSessionContext.Provider>
      :<div role="status">正在读取局面…</div>}
    {(error||!connected)&&<div className="game-session-status" role="status">{error||"连接已断开，正在重新连接…"}</div>}
  </div>;
}

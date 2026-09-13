import {gameDisplayProjection,playerDisplayName} from "./game-display-names";
import {GameMidroundExit} from './game-midround-exit';
import {useEffect,useMemo,useRef,useState,type SyntheticEvent} from "react";
import {GameSessionContext,type GameSessionBinding} from "./game-session-binding";
import {GameChatContext} from "./game-chat-window";
import {GameReactionContext,type GameReactionBinding,type GameReactionEvent} from "./game-reaction-binding";
import {GameRoundExitContext} from "./game-round-exit";
import {GameWaitingRoom,type GameWaitingRoomProps} from "./game-waiting-room";
import {gameSessionClient,createWatchClient,GameSessionRequestError,type GameSessionTransport,type SessionRoom,type SessionChatMessage} from "./game-session-client";
import {UnoPage} from "./uno/uno-page";
import {DoudizhuPage} from "./doudizhu/doudizhu-page";
import {LeafGamePage} from "./leaf-game/leaf-game-page";
import {FlyingChessPage} from "./flying-chess/flying-chess-page";
import {MonopolyPage} from "./monopoly/monopoly-page";
import {MahjongPage} from "./mahjong/mahjong-page";
import "./game-session-host.css";
import {gamePlayerProfiles} from './game-player-names';

export interface GameSessionHostProps {
  roomId:string;
  /** Authenticated create/join receipt, reused for the initial waiting room. */
  initialRoom?:SessionRoom;
  watchOnly?:boolean;
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
const projection=(game:unknown)=>(game??{}) as {viewer_id?:string;revision?:number;phase?:string;forfeited?:boolean;public?:{game_result?:unknown}};
function Session({roomId,initialRoom,viewerId,profiles:registeredProfiles,watchOnly=false,transport:suppliedTransport,reactions,onExit,onNewTable}:GameSessionHostProps){
  const transport=useMemo(()=>suppliedTransport??(watchOnly?createWatchClient(viewerId):gameSessionClient),[suppliedTransport,watchOnly,viewerId]);
  const [room,setRoom]=useState<SessionRoom|null>(initialRoom??null);
  const profiles=useMemo(()=>gamePlayerProfiles(room?.seats??[],registeredProfiles),[room?.seats,registeredProfiles]);
  const current=useRef<SessionRoom|null>(initialRoom??null);
  const entryReceiptUsed=useRef(false);
  const [pageVisible,setPageVisible]=useState(()=>typeof document==="undefined"||document.visibilityState!=="hidden");
  const waitingSuspended=!watchOnly&&!pageVisible&&room?.phase==="waiting";
  useEffect(()=>{
    const visibility=()=>setPageVisible(document.visibilityState!=="hidden");
    document.addEventListener("visibilitychange",visibility);
    return()=>document.removeEventListener("visibilitychange",visibility);
  },[]);
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
      if(!watchOnly&&next.seats.some(s=>s.playerId===viewerId&&projection(s).forfeited))void onExit();
      if(next.phase==='finished' && !next.seats.some(s=>projection(s).forfeited) && (next.kind==='doudizhu'||next.kind==='uno') && projection(next.game).phase==='round_over')void onExit();
    }
    return current.current ?? next;
  };
  useEffect(()=>{
    active.current=true;
    setError("");
    connection.current=false;
    setConnected(false);
    if(waitingSuspended)return()=>{active.current=false;};
    let disposed=false;
    let close:(()=>void)|undefined;
    const subscribe=()=>{
      close=transport.subscribe(roomId,0,{
        game:value=>{if(disposed)return;try{accept(value);setError("");}catch(e){setError((e as Error).message);connection.current=false;setConnected(false);}},
        chat:message=>{if(!disposed&&message.roomId===roomId)setMessages(old=>old.some(m=>m.sequence===message.sequence)?old:[...old,message].sort((a,b)=>a.sequence-b.sequence));},
        connection:value=>{if(!disposed){connection.current=value;setConnected(value);}},
        reaction:event=>{if(!disposed&&event.roomId===roomId)reactionListeners.current.forEach(listener=>listener(event));},
      });
    };
    if(initialRoom && reloadKey===0 && !entryReceiptUsed.current){
      entryReceiptUsed.current=true;
      accept(initialRoom);
      subscribe();
    }else{
      // The stream supplies its own snapshot; do not wait for the HTTP read to connect.
      subscribe();
      transport.read(roomId).then(next=>{
        if(disposed)return;
        accept(next);
      }).catch(e=>{
        if(disposed)return;
        if(!watchOnly&&e instanceof GameSessionRequestError&&e.code==="not_seated"){
          void onExit();
          return;
        }
        setError((e as Error).message);
      });
    }
    return()=>{disposed=true;active.current=false;connection.current=false;close?.();};
  },[roomId,viewerId,transport,reloadKey,initialRoom,waitingSuspended]);
  const requireRoom=()=>{
    if(!connection.current||!current.current)throw new Error("尚未连接本桌");
    return current.current;
  };
  const leave=async()=>{
    if(watchOnly){await onExit();return;}
    const latest=current.current;
    if(!latest)throw new Error("尚未读取本桌");
    await transport.leave(roomId,latest.revision);
    if(active.current)await onExit();
  };
  const command=async(move:Record<string,unknown>)=>{
    if(watchOnly)throw new Error("围观时不能操作对局");
    const latest=requireRoom();
    // Only the server binds actor_id. Both room and engine revisions travel intact.
    const {actor_id:_actor,...body}=move;
    return accept(await transport.command(roomId,latest.revision,body)).game;
  };
  const namedGame=useMemo(()=>gameDisplayProjection(room?.game??null,profiles),[room?.game,profiles]);
  const session=useMemo<GameSessionBinding|null>(()=>room?.game?{
    watchOnly,exitWatch:onExit,
    roomId,viewerId,connected,game:namedGame,settlement:room.settlement??null,playerNames:Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,p.name])),
    refresh:async()=>accept(await transport.read(roomId)).game,
    command,
    again:async()=>{
      if(watchOnly)throw new Error("围观时不能操作对局");
      const latest=requireRoom();
      const game=projection(latest.game);
      if(latest.phase==='playing'&&(latest.kind==="uno"||latest.kind==="doudizhu")&&game.phase==="round_over"){
        await command({action:"next_round",command_id:crypto.randomUUID(),expected_revision:game.revision});
      }else if(latest.phase==="finished"){
        await transport.leave(roomId,latest.revision);
        if(active.current)await (onNewTable??onExit)();
      }else throw new Error("本局尚未结束");
    },
  }:null,[room,namedGame,connected,transport,watchOnly,onExit]);
  const chat=useMemo(()=>({roomId,connected,readOnly:watchOnly,messages:messages.map(m=>({...m,name:playerDisplayName(m.playerId,profiles)})),send:async(text:string,id:string)=>{requireRoom();await transport.say(roomId,text,id);}}),[roomId,connected,messages,profiles,transport,watchOnly]);
  const defaultReaction=useMemo<GameReactionBinding>(()=>({roomId,viewerId,connected,
    send:async(targetId,kind,requestId)=>{requireRoom();await transport.sendReaction(roomId,targetId,kind,requestId);},
    subscribe:listener=>{reactionListeners.current.add(listener);return()=>{reactionListeners.current.delete(listener);};},
  }),[roomId,viewerId,connected,transport]);
  const reaction=reactions
    ?reactions.roomId===roomId&&reactions.viewerId===viewerId?{...reactions,connected:connected&&reactions.connected}:null
    :defaultReaction;
  const watchExit=watchOnly&&!(room?.kind==='leaf-game'&&room.game)?<button type="button" className="game-session-status" style={{top:12,bottom:"auto",zIndex:110}} onClick={()=>void onExit()}>退出围观</button>:null;
  if(!room)return <div className="game-session-status" role="status">{watchExit}{error||"正在连接游戏…"}{error&&<button type="button" onClick={()=>setReloadKey(key=>key+1)}>重新连接</button>}</div>;
  const Page=pages[room.kind];
  const blockWatchAction=(event:SyntheticEvent)=>{
    if(watchOnly && !(event.target instanceof Element && event.target.closest('.game-chat-toggle, .game-chat-window, .game-watch-exit, .leaf-rules'))){event.preventDefault();event.stopPropagation();}
  };
  return <div className={`game-session-host game-session--${room.kind}`}>
    {watchExit}
    {!watchOnly&&room.phase==='playing'&&!['round_over','finished','game_over'].includes(String(projection(room.game).phase))&&projection(room.game).public?.game_result==null&&<GameMidroundExit baseStake={room.baseStake??0} onLeave={leave}/>}
    <div style={{display:"contents"}} onClickCapture={blockWatchAction} onPointerDownCapture={blockWatchAction} onKeyDownCapture={blockWatchAction}>
    {room.phase==="waiting"?<GameWaitingRoom room={room} viewerId={viewerId} profiles={profiles} connected={connected}
      onReady={async ready=>{const r=requireRoom();accept(await transport.ready(roomId,r.revision,ready));}}
      onStart={async()=>{const r=requireRoom();accept(await transport.start(roomId,r.revision));}}
      onBack={()=>void leave().catch(e=>setError((e as Error).message))}/>
      :session?<GameSessionContext.Provider value={session}><GameChatContext.Provider value={chat}><GameReactionContext.Provider value={reaction}><GameRoundExitContext.Provider value={leave}><Page/></GameRoundExitContext.Provider></GameReactionContext.Provider></GameChatContext.Provider></GameSessionContext.Provider>
      :<div role="status">正在读取局面…</div>}
    </div>
    {(error||!connected)&&<div className="game-session-status" role="status">{error||"连接已断开，正在重新连接…"}</div>}
  </div>;
}

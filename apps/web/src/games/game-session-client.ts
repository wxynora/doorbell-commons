import type { WaitingRoom, WaitingGameKind } from "./game-waiting-room";
import type {GameReactionEvent,GameReactionKind} from "./game-reaction-binding";
export interface SessionRoom extends WaitingRoom { game: unknown | null }
export interface SessionChatMessage {roomId:string; sequence:number; playerId:string; text:string}
export interface SessionStream {
  game(room:SessionRoom):void;
  chat(message:SessionChatMessage):void;
  connection(connected:boolean):void;
  reaction?(event:GameReactionEvent):void;
}
export interface GameSessionTransport {
  read(roomId:string):Promise<SessionRoom>;
  ready(roomId:string,revision:number,ready:boolean):Promise<SessionRoom>;
  start(roomId:string,revision:number):Promise<SessionRoom>;
  command(roomId:string,revision:number,command:Record<string,unknown>):Promise<SessionRoom>;
  leave(roomId:string,revision:number):Promise<SessionRoom>;
  say(roomId:string,text:string,clientMessageId:string):Promise<unknown>;
  sendReaction(roomId:string,targetId:string,kind:GameReactionKind,requestId:string):Promise<unknown>;
  subscribe(roomId:string,afterChatSequence:number,handlers:SessionStream):()=>void;
}
const ROOT="/api/lounge/games";
const roomPath=(id:string)=>`${ROOT}/rooms/${encodeURIComponent(id)}`;
async function request<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(path,{credentials:"same-origin",...(body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message ?? "游戏请求未完成");
  return data as T;
}
/** Uses cookie-authenticated same-origin routes; no player identity comes from a URL. */
function createSessionClient(watchOnly = false):GameSessionTransport {
const readPath=(id:string)=>watchOnly?`${roomPath(id)}/watch`:roomPath(id);
const rejectWatch=()=>{if(watchOnly)throw new Error("围观时不能操作对局");};
return {
  read:id=>request(readPath(id)),
  ready:(id,revision,ready)=>{rejectWatch();return request(`${roomPath(id)}/ready`,{revision,ready});},
  start:(id,revision)=>{rejectWatch();return request(`${roomPath(id)}/start`,{revision});},
  command:(id,revision,command)=>{rejectWatch();return request(`${roomPath(id)}/command`,{revision,command});},
  leave:(id,revision)=>{rejectWatch();return request(`${roomPath(id)}/leave`,{revision});},
  say:(id,text,clientMessageId)=>{rejectWatch();return request(`${roomPath(id)}/chat`,{text,clientMessageId});},
  sendReaction:(id,targetId,kind,requestId)=>{rejectWatch();return request(`${roomPath(id)}/reactions`,{targetId,kind,requestId});},
  subscribe(id,afterChatSequence,handlers){
    let source:EventSource;
    let baseline:SessionRoom|null=null;
    let chatCursor=afterChatSequence;
    const seenReactions=new Set<string>();
    let historyReady=false,closed=false;
    const deliverReaction=(event:GameReactionEvent)=>{
      if(seenReactions.has(event.id))return;
      seenReactions.add(event.id);handlers.reaction?.(event);
    };
    const open=()=>{
    source=new EventSource(`${readPath(id)}/stream${watchOnly?"":`?afterChatSequence=${chatCursor}`}`);
    source.onopen=()=>{handlers.connection(true);
      if(watchOnly)return;
      const initial=!historyReady;
      void request<GameReactionEvent[]>(`${roomPath(id)}/reactions`).then(events=>{
        if(closed)return;
        for(const event of events){if(initial)seenReactions.add(event.id);else deliverReaction(event);}
        historyReady=true;
      }).catch(()=>handlers.connection(false));
    };
    source.onerror=()=>handlers.connection(false);
    source.addEventListener("game",event=>{baseline=JSON.parse((event as MessageEvent<string>).data) as SessionRoom;handlers.game(baseline);});
    source.addEventListener("game_delta",event=>{
      const delta=JSON.parse((event as MessageEvent<string>).data) as SessionRoom & {baseRevision:number;patch:Array<{path:Array<string|number>;value?:unknown;remove?:boolean}>};
      if(!baseline || baseline.roomId!==delta.roomId || baseline.revision!==delta.baseRevision){
        handlers.connection(false);baseline=null;source.close();open();return;
      }
      let game=structuredClone(baseline.game);
      for(const change of delta.patch){
        if(!change.path.length){game=structuredClone(change.value);continue;}
        let target=game as Record<string|number,unknown>;
        for(const key of change.path.slice(0,-1))target=target[key] as typeof target;
        const key=change.path.at(-1)!;
        if(change.remove)delete target[key];else target[key]=structuredClone(change.value);
      }
      const {baseRevision:_base,patch:_patch,...room}=delta;
      baseline={...room,game};handlers.game(baseline);
    });
    source.addEventListener("chat",event=>{const message=JSON.parse((event as MessageEvent<string>).data) as SessionChatMessage;chatCursor=Math.max(chatCursor,message.sequence);handlers.chat(message);});
    source.addEventListener("reaction",event=>deliverReaction(JSON.parse((event as MessageEvent<string>).data) as GameReactionEvent));
    };
    open();
    return()=>{closed=true;source.close();};
  },
};
}
export const gameSessionClient=createSessionClient();
export const ownerWatchClient=createSessionClient(true);
export function createGameTable(tableId:"square"|"round",kind:WaitingGameKind,baseStake?:number):Promise<SessionRoom>{
  return request(`${ROOT}/tables/${tableId}/rooms`,{kind,...(baseStake===undefined?{}:{baseStake})});
}
export function joinGameTable(roomId:string,revision:number):Promise<SessionRoom>{
  return request(`${roomPath(roomId)}/join`,{revision});
}

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { snowDanmakuSchema, type SnowDanmaku } from "@doorbell/protocol";
import { snowLiveError } from "../../snow-live/api";

const batchSchema = z.object({messages:z.array(snowDanmakuSchema)}).strict();
export function useTournamentDanmaku(editionId:string,matchId:string) {
  const url=`/api/snow-tournament/${encodeURIComponent(editionId)}/matches/${encodeURIComponent(matchId)}/danmaku`;
  const [messages,setMessages]=useState<SnowDanmaku[]>([]),[flying,setFlying]=useState<SnowDanmaku[]>([]);
  const [error,setError]=useState<string|null>(null),[sending,setSending]=useState(false);
  const seen=useRef(new Set<number>()),attempt=useRef<{clientMessageId:string;text:string}|null>(null);
  const request=useRef<AbortController|null>(null);
  const add=(incoming:SnowDanmaku[],animate:boolean)=>{
    const fresh=incoming.filter(message=>!seen.current.has(message.sequence));
    for(const message of fresh)seen.current.add(message.sequence);
    if(fresh.length){setMessages(before=>[...before,...fresh].sort((a,b)=>a.sequence-b.sequence));if(animate)setFlying(before=>[...before,...fresh]);}
  };
  useEffect(()=>{
    let active=true,initial=true;
    const source=new EventSource(`${url}/stream`);
    source.addEventListener("update",event=>{
      if(!active)return;
      try {add(batchSchema.parse(JSON.parse((event as MessageEvent<string>).data)).messages,!initial);initial=false;setError(null);}
      catch{source.close();setError("弹幕暂时无法读取，请重新进入直播。");}
    });
    source.onerror=()=>{if(active)setError("弹幕连接中断，正在重连。");};
    return()=>{active=false;source.close();request.current?.abort();};
  },[url]);
  async function send(text:string) {
    const value=text.trim();if(!value||sending)return false;
    if(attempt.current?.text!==value)attempt.current={clientMessageId:crypto.randomUUID(),text:value};
    const controller=new AbortController();request.current=controller;setSending(true);setError(null);
    try {
      const response=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(attempt.current),signal:controller.signal});
      const body=await response.json();if(!response.ok)throw Error(body?.error?.code??"service_unavailable");
      const message=snowDanmakuSchema.parse(body.message);if(controller.signal.aborted)return false;
      add([message],true);attempt.current=null;return true;
    }catch(cause){if(!controller.signal.aborted)setError(snowLiveError(cause instanceof Error?cause.message:"service_unavailable"));return false;}
    finally{if(!controller.signal.aborted)setSending(false);}
  }
  return {messages,error,sending,send,
    overlay:<div className="snow-match-danmaku-layer" aria-hidden="true">{flying.map(message=><span className="snow-match-flying" key={message.sequence}
      style={{top:`${14+(message.sequence%4)*14}%`}} onAnimationEnd={()=>setFlying(before=>before.filter(item=>item.sequence!==message.sequence))}>
      <b>{message.senderName}</b> {message.text}</span>)}</div>};
}

export function TournamentDanmaku({chat}:{chat:ReturnType<typeof useTournamentDanmaku>}) {
  const [text,setText]=useState(""),list=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight;},[chat.messages.length]);
  return <section className="snow-match-chat" aria-label="观众弹幕"><header><h2>围观席</h2><span>发点弹幕</span></header>
    <div className="snow-match-messages" ref={list} role="log" aria-label="观众消息" aria-live="polite">
      {chat.messages.length?chat.messages.map(message=><article key={message.sequence}><div><b>{message.senderName}</b>
        <time dateTime={new Date(message.createdAt).toISOString()}>{new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(message.createdAt)}</time></div><p>{message.text}</p></article>)
        :<p className="snow-empty-line">前排空着呢，来一句？</p>}
    </div>
    <form onSubmit={event=>{event.preventDefault();void chat.send(text).then(sent=>{if(sent)setText("");});}}>
      <label htmlFor="snow-danmaku-text">弹幕</label><textarea id="snow-danmaku-text" rows={2} placeholder="给雪堡添点热闹…" value={text} onChange={event=>setText(event.target.value)} />
      {chat.error&&<p role="alert">{chat.error}</p>}<button type="submit" className="snow-button" disabled={chat.sending||!text.trim()}>{chat.sending?"发送中…":"发射弹幕 ↗"}</button>
    </form>
  </section>;
}

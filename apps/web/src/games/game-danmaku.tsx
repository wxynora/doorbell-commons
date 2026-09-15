import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {readGameDanmaku,sendGameDanmaku,GameSessionRequestError,type SessionChatMessage,type GameDanmakuOptions} from './game-session-client';
import './game-danmaku.css';

export function GameDanmakuLayer({roomId,messages,canSend}:{roomId:string;messages:readonly SessionChatMessage[];canSend:boolean}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [options,setOptions]=useState<GameDanmakuOptions|null>(null),[deadline,setDeadline]=useState(0),[now,setNow]=useState(Date.now());
  const [unit,setUnit]=useState(1);
  const entry=useRef(Date.now()),seen=useRef(new Set<number>()),nextLane=useRef(0);
  const requests=useRef(new Map<string,string>()),sending=useRef(false);
  const [queue,setQueue]=useState<SessionChatMessage[]>([]);
  const [active,setActive]=useState<(SessionChatMessage&{lane:number})[]>([]);
  const remaining=Math.max(0,Math.ceil((deadline-now)/1000));
  useEffect(()=>{const measure=()=>setUnit(Math.min(window.innerWidth,window.innerHeight)/390);measure();window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure)},[]);
  useEffect(()=>{if(deadline<=Date.now())return;const timer=setInterval(()=>{const time=Date.now();setNow(time);if(time>=deadline)clearInterval(timer)},1000);return()=>clearInterval(timer)},[deadline]);
  const cooldown=(value:{retryAt:number;serverNow:number})=>{setDeadline(Date.now()+Math.max(0,value.retryAt-value.serverNow));setNow(Date.now())};
  useEffect(()=>{
    if(!open||!canSend)return;
    let cancelled=false;
    void readGameDanmaku(roomId).then(value=>{if(!cancelled){setOptions(value);cooldown(value);setError('')}}).catch(e=>{if(!cancelled)setError(e.message)});
    return()=>{cancelled=true};
  },[open,canSend,roomId]);
  useEffect(()=>{
    const fresh=messages.filter(m=>m.roomId===roomId&&m.danmaku&&!seen.current.has(m.sequence));
    fresh.forEach(m=>seen.current.add(m.sequence));
    const live=fresh.filter(m=>(m.createdAt??0)>=entry.current);
    if(live.length)setQueue(old=>[...old,...live]);
  },[messages,roomId]);
  useEffect(()=>{
    if(!queue.length||active.length>=3)return;
    const message=queue[0]!;
    let lane=nextLane.current++%3;
    while(active.some(m=>m.lane===lane))lane=(lane+1)%3;
    setActive(old=>[...old,{...message,lane}]);setQueue(old=>old.slice(1));
  },[queue,active]);
  async function send(phraseId:string){
    if(sending.current||remaining||!canSend)return;
    sending.current=true;setBusy(true);setError('');
    const id=requests.current.get(phraseId)??crypto.randomUUID();requests.current.set(phraseId,id);
    try{const value=await sendGameDanmaku(roomId,phraseId,id);requests.current.delete(phraseId);cooldown(value);setOpen(false)}
    catch(e){if(e instanceof GameSessionRequestError&&e.retryAt!==undefined&&e.serverNow!==undefined)cooldown({retryAt:e.retryAt,serverNow:e.serverNow});setError(e instanceof Error?e.message:'发送失败，请重试')}
    finally{sending.current=false;setBusy(false)}
  }
  return createPortal(<div className="game-danmaku-screen" style={{'--dm-unit':`${unit}px`} as CSSProperties}>
    <div className="game-danmaku-track" aria-live="polite">{active.map(m=><div key={m.sequence} className="game-danmaku-line" style={{'--dm-lane':m.lane} as CSSProperties} onAnimationEnd={()=>setActive(old=>old.filter(x=>x.sequence!==m.sequence))}><span>{m.danmaku!.senderName}</span>{m.text}</div>)}</div>
    {canSend&&<><button className="game-danmaku-toggle" aria-label="发送围观弹幕" aria-expanded={open} onClick={()=>setOpen(!open)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 5h18v12H9l-5 4v-4H3zM7 9h10M7 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/></svg><span>弹幕</span></button>
      {open&&<section className="game-danmaku-picker" aria-label="围观弹幕短句"><header><b>发个弹幕</b><button aria-label="关闭弹幕选项" onClick={()=>setOpen(false)}>×</button></header><small>{remaining?`${remaining} 秒后可以再发`:'每分钟可以发一次'}</small>
      <div>{options?.phrases.map(p=><button key={p.id} disabled={busy||remaining>0} onClick={()=>void send(p.id)}>{p.text}</button>)??<p>正在加载…</p>}</div>{error&&<p role="alert">{error}</p>}</section>}
    </>}
  </div>,document.body);
}

import {useEffect,useRef,useState,useCallback} from 'react';
import {command,sendCommand} from './api.mjs';
import {reserveTimerVersions} from './timer-ordering.mjs';

export function useCollectionTimer(collection,onExpired,notify,ready){
 const [timer,setTimer]=useState(collection?.timer??null),[remaining,setRemaining]=useState(collection?.timer?.remainingMs??0),[paused,setPaused]=useState(false),[transitioning,setTransitioning]=useState(false);
 const expiredCallback=useRef(onExpired);expiredCallback.current=onExpired;
 const current=useRef(collection),readyRef=useRef(ready),live=useRef(true),stamp=useRef({at:performance.now(),remaining:collection?.timer?.remainingMs??0}),manualPause=useRef(false),expired=useRef(false),pending=useRef(new Map()),leaseRef=useRef(null),latestSent=useRef(0),latestApplied=useRef(0),authorityVersion=useRef(0);
 current.current=collection;readyRef.current=ready;
 const apply=useCallback(value=>{if(!value)return;const version=value.transitionVersion??0;authorityVersion.current=Math.max(authorityVersion.current,version);if(!live.current||version<latestSent.current||version<latestApplied.current)return;latestApplied.current=version;stamp.current={at:performance.now(),remaining:value.remainingMs};setTimer(value);setRemaining(value.remainingMs);},[]);
 const wantsRunning=()=>readyRef.current&&!document.hidden&&!manualPause.current&&!expired.current;
 const transition=useCallback((action,keepalive=false)=>{
  const c=current.current;if(!c?.timer||c.status!=='active')return Promise.resolve();
  const key=`${c.session.id}:${c.stage}`,matches=()=>current.current?.session.id===c.session.id&&current.current?.stage===c.stage;
  const allocate=()=>{const seen=Math.max(authorityVersion.current,c.timer.transitionVersion??0);const lease={key,paused:false,pair:reserveTimerVersions(c.session.id,c.stage,seen),enterJob:null,pauseJob:null};leaseRef.current=lease;return lease;};
  const send=async(lease,kind,version,background=false)=>{
   if(!matches())return;
   latestSent.current=Math.max(latestSent.current,version);pending.current.set(key,(pending.current.get(key)??0)+1);if(live.current)setTransitioning(true);
   try{
    const data=await sendCommand(command('collection_timer',{action:kind,sessionId:c.session.id,stage:c.stage,transitionVersion:version}),{keepalive:background});
    if(matches()){
     const value=data.collection?.timer??data.timer;apply(value);
     if(live.current&&data.timedOut&&!expired.current){expired.current=true;expiredCallback.current();}
     if(kind==='enter'&&data.superseded&&wantsRunning()&&leaseRef.current===lease&&!lease.paused){lease.paused=true;manualPause.current=true;if(live.current){setPaused(true);notify('箱子已在另一个页面继续，点接着翻箱子可以回来。');}}
    }
    return data;
   }finally{const left=(pending.current.get(key)??1)-1;if(left)pending.current.set(key,left);else pending.current.delete(key);if(live.current&&matches())setTransitioning(left>0);}
  };
  if(action==='pause'){
   const lease=leaseRef.current?.key===key?leaseRef.current:allocate();lease.paused=true;
   if(lease.pauseJob)return lease.pauseJob;
   const job=lease.pair.then(pair=>send(lease,'pause',pair.pause,keepalive));lease.pauseJob=job;
   job.catch(()=>{if(lease.pauseJob===job)lease.pauseJob=null;});return job;
  }
  if(!wantsRunning())return Promise.resolve();
  const existing=leaseRef.current;if(existing?.key===key&&!existing.paused&&existing.enterJob)return existing.enterJob;
  const lease=allocate();
  const job=lease.pair.then(pair=>matches()&&live.current&&wantsRunning()&&leaseRef.current===lease&&!lease.paused?send(lease,'enter',pair.enter):undefined);
  lease.enterJob=job;job.catch(()=>{if(lease.enterJob===job)lease.enterJob=null;});return job;
 },[apply,notify]);
 const key=collection?`${collection.session.id}:${collection.stage}`:'none';
 useEffect(()=>{live.current=true;return()=>{live.current=false;transition('pause',true).catch(()=>{});};},[transition]);
 useEffect(()=>{expired.current=false;manualPause.current=false;leaseRef.current=null;latestSent.current=0;latestApplied.current=0;authorityVersion.current=collection?.timer?.transitionVersion??0;setPaused(false);setTransitioning((pending.current.get(key)??0)>0);apply(collection?.timer);},[key]);
 useEffect(()=>{if(ready&&collection?.timer&&collection.status==='active'&&!document.hidden&&!manualPause.current)transition('enter').catch(e=>notify(e.message));},[key,ready,transition]);
 useEffect(()=>{apply(collection?.timer);},[collection?.timer,apply]);
 useEffect(()=>{
  const visibility=()=>{if(document.hidden)transition('pause',true).catch(()=>{});else if(wantsRunning())transition('enter').catch(e=>notify(e.message));};
  const pagehide=()=>{transition('pause',true).catch(()=>{});};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);
  return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);};
 },[transition,notify]);
 useEffect(()=>{const id=setInterval(()=>{
  if(!timer)return;const ms=timer.status==='running'&&!document.hidden?Math.max(0,stamp.current.remaining-(performance.now()-stamp.current.at)):stamp.current.remaining;
  setRemaining(ms);if(ms===0&&timer.status==='running'&&!expired.current){expired.current=true;transition('pause').then(()=>expiredCallback.current()).catch(e=>notify(e.message));}
 },100);return()=>clearInterval(id);},[timer,transition,notify]);
 const pause=async()=>{const previous=manualPause.current;manualPause.current=true;try{await transition('pause');if(live.current)setPaused(true);}catch(e){manualPause.current=previous;notify(e.message);}};
 const resume=async()=>{if(!readyRef.current)return;manualPause.current=false;try{await transition('enter');if(live.current&&!manualPause.current)setPaused(false);}catch(e){manualPause.current=true;notify(e.message);}};
 return{timer,remaining,paused,transitioning,pause,resume,leave:()=>{manualPause.current=true;return transition('pause').catch(e=>{manualPause.current=false;throw e;});}};
}

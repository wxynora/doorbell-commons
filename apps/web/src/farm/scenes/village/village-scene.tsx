import {useEffect,useRef,useState,type ReactNode} from 'react';
import {neighborhoodDirectorySchema,neighborhoodLayoutSchema,type NeighborhoodHome,type NeighborhoodLayout} from '@doorbell/protocol';
import {createVillage,type VillageEnvironment} from './runtime.js';
import {assignVillageLots} from './plan.js';
import type {SceneRuntime} from '../field/scene-runtime.js';
import './village.css';
async function read(url:string,signal:AbortSignal){
 const response=await fetch(url,{credentials:'same-origin',signal});const body=await response.json();
 if(!response.ok)throw new Error(body?.error?.message??'居民区暂时无法打开。');return body;
}
function FarmView({data,active,environment}:{data:NeighborhoodLayout;active:boolean;environment:VillageEnvironment}){
 const host=useRef<HTMLDivElement>(null),runtime=useRef<SceneRuntime|null>(null),activeRef=useRef(active);activeRef.current=active;
 const [error,setError]=useState('');
 useEffect(()=>{let cancelled=false;void import('../field/scene-runtime.js').then(({createFieldRuntime})=>{
  if(cancelled||!host.current)return;
  const instance=createFieldRuntime(host.current,{readOnly:true,active:activeRef.current,plots:data.plots,houseLevel:data.house.level,houseStyle:data.house.style??'classic',classicHouseLevel:data.house.classic_level??1,environment,onSelectPlot:()=>{},onEditState:()=>{},onFinishEditing:()=>{},onSaveLayout:async()=>{throw new Error('当前为只读查看。');}});
  runtime.current=instance;
  instance.setDecorations(data);
 }).catch(e=>{if(!cancelled){runtime.current?.dispose();runtime.current=null;setError(e instanceof Error?e.message:'布置画面未能打开。');}});
 return()=>{cancelled=true;runtime.current?.dispose();runtime.current=null;};},[data]);
 useEffect(()=>runtime.current?.setActive(active),[active]);
 useEffect(()=>runtime.current?.setEnvironment(environment),[environment.season,environment.weather,environment.night]);
 return <><div ref={host} className="village-world"/>{error&&<p role="alert" className="village-status">{error}</p>}</>;
}
function Overview({homes,environment,active,onSelect}:{environment:VillageEnvironment;homes:NeighborhoodHome[];active:boolean;onSelect:(home:NeighborhoodHome)=>void}){
 const host=useRef<HTMLDivElement>(null),runtime=useRef<ReturnType<typeof createVillage>|null>(null),select=useRef(onSelect);select.current=onSelect;
 const [error,setError]=useState('');
 useEffect(()=>{if(!host.current)return;try{runtime.current=createVillage(host.current,{residents:homes,environment,onSelect:h=>select.current(h)});runtime.current.setActive(active);}catch(e){setError(e instanceof Error?e.message:'地图未能打开。');}return()=>{runtime.current?.dispose();runtime.current=null;};},[homes]);
 useEffect(()=>runtime.current?.setActive(active),[active]);
 useEffect(()=>runtime.current?.setEnvironment(environment),[environment.season,environment.weather,environment.night]);
 const assigned=new Set(assignVillageLots(homes).map(h=>h.residentId));
 const unplaced=homes.filter(h=>!assigned.has(h.residentId));
 return <><div ref={host} className="village-world"/>
  <nav className="village-pan" aria-label="移动地图">
   <svg className="village-pan__dial" viewBox="0 0 86 86" aria-hidden="true">
    <path className="village-pan__face" d="M36 3h14a10 10 0 0 1 10 10v9a4 4 0 0 0 4 4h9a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10h-9a4 4 0 0 0-4 4v9a10 10 0 0 1-10 10H36a10 10 0 0 1-10-10v-9a4 4 0 0 0-4-4h-9A10 10 0 0 1 3 50V36a10 10 0 0 1 10-10h9a4 4 0 0 0 4-4v-9A10 10 0 0 1 36 3Z"/>
    <path className="village-pan__center" d="M43 36l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/>
   </svg>
   {([{direction:'up',label:'向上看'},{direction:'left',label:'向左看'},{direction:'down',label:'向下看'},{direction:'right',label:'向右看'}] as const).map(({direction,label})=>
    <button key={direction} className={`village-pan__${direction}`} type="button" aria-label={label} disabled={!active} onClick={()=>runtime.current?.pan(direction)}/>)}
  </nav>
  {unplaced.length>0&&<aside className="village-unplaced"><span>待选址</span>{unplaced.map(h=><button key={h.residentId} type="button" onClick={()=>onSelect(h)}>{h.name}</button>)}</aside>}{error&&<p role="alert" className="village-status">{error}</p>}</>;
}
export function VillageScene({environment,active,onClose,children}:{environment:VillageEnvironment;active:boolean;onClose:()=>void;children?:ReactNode}){
 const [homes,setHomes]=useState<NeighborhoodHome[]|null>(null),[selected,setSelected]=useState<NeighborhoodHome|null>(null),[layout,setLayout]=useState<NeighborhoodLayout|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const needsDirectory=active&&!selected&&homes===null;
 useEffect(()=>{
  if(!needsDirectory)return;
  const controller=new AbortController();
  setError('');
  void read('/api/farm/neighborhood',controller.signal).then(payload=>{
   if(controller.signal.aborted)return;
   setHomes(neighborhoodDirectorySchema.parse(payload).homes);
  }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
  return()=>controller.abort();
 },[needsDirectory,retry]);
 useEffect(()=>{setLayout(null);setError('');if(!selected)return;const controller=new AbortController();void read(`/api/farm/neighborhood/${encodeURIComponent(selected.residentId)}/layout`,controller.signal).then(p=>{if(!controller.signal.aborted){const data=neighborhoodLayoutSchema.parse(p);if(data.doorplate!==selected.doorplate)throw new Error('布置与所选门牌不匹配。');setLayout(data);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[selected,retry]);
 return <section className="village-scene" data-night={environment.night>.5} aria-label="居民区">
  {!selected&&homes?<Overview homes={homes} environment={environment} active={active} onSelect={setSelected}/>:selected&&layout&&layout.doorplate===selected.doorplate?<FarmView data={layout} active={active} environment={environment}/>:null}
  <header className="village-header"><button type="button" onClick={()=>selected?setSelected(null):onClose()} aria-label={selected?'返回居民区':'返回农场'}/><div><strong>{selected?selected.name:'铃野居民区'}</strong></div></header>
  {error?<div className="village-status" role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>重试</button></div>:!homes||selected&&!layout?<p className="village-status" role="status">{selected?'正在打开这家的布置':'正在打开居民区'}</p>:null}
  {children}
 </section>;
}

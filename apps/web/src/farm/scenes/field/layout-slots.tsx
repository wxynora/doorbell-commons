import {useEffect,useRef,useState} from "react";
import type {FarmLayoutSlot} from "../../../auth/farm-decoration-client";
import "./layout-slots.css";

export function LayoutSlots({slots,editing,busy,error,onSave,onLoad,onRename,onClose}:{
  slots:readonly {slot:FarmLayoutSlot;name?:string|undefined;decoration_count:number}[];
  editing:boolean;busy:boolean;error:string|null;
  onSave:(slot:FarmLayoutSlot,name:string)=>void;
  onLoad:(slot:FarmLayoutSlot)=>void;
  onRename?:((slot:FarmLayoutSlot,name:string)=>void)|undefined;
  onClose:()=>void;
}) {
  const [target,setTarget]=useState<FarmLayoutSlot|null>(null);
  const [name,setName]=useState(""),[renaming,setRenaming]=useState(false);
  const label=(slot:FarmLayoutSlot)=>slots.find(s=>s.slot===slot)?.name||`布局 ${slot}`;
  const select=(slot:FarmLayoutSlot,rename=false)=>{setTarget(slot);setName(slots.find(s=>s.slot===slot)?.name??"");setRenaming(rename);};
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    panel.current?.focus();
    return()=>previous?.focus();
  },[]);
  useEffect(()=>{if(busy)panel.current?.focus();},[busy]);
  const occupied=slots.some(s=>s.slot===target);
  return <div className="farm-layout-slots-backdrop" onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>{
    event.stopPropagation();
    if(event.key==="Escape"&&!busy)onClose();
    if(event.key==="Tab"){
      const controls=[...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')];
      if(!controls.length){event.preventDefault();return;}
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }}>
    <section ref={panel} tabIndex={-1} className="farm-layout-slots" role="dialog" aria-modal="true" aria-labelledby="farm-layout-slots-title">
      <header><h3 id="farm-layout-slots-title">我的布局 <small>{slots.length}/3</small></h3><button type="button" aria-label="关闭布局管理" disabled={busy} onClick={onClose}>×</button></header>
      <p>{slots.length===3?"已存满三套，另存时请选择要覆盖的布局。":"选一个空位，保存眼前这套布置。"}</p>
      <div className="farm-layout-slots-list">{([1,2,3] as const).map(slot=>{
        const saved=slots.find(s=>s.slot===slot);
        return <div key={slot} className={target===slot?"is-selected":""}>
          <button type="button" disabled={busy} aria-pressed={target===slot} onClick={()=>select(slot)}>
            <strong>{label(slot)}</strong><span>{saved?`${saved.decoration_count} 件装饰` : "空位"}</span>
          </button>
          {saved&&onRename?<button type="button" disabled={busy} onClick={()=>select(slot,true)} aria-label={`改名：${label(slot)}`}>改名</button>:null}
          {saved?<button type="button" disabled={busy||editing} onClick={()=>onLoad(slot)} aria-label={`切换到${label(slot)}`}>切换</button>:null}
        </div>;
      })}</div>
      {editing?<p className="farm-layout-slots-note">正在编辑：可以另存，完成或取消编辑后再切换。</p>:null}
      {target?<><label className="farm-layout-slots-name">布局名字<input value={name} disabled={busy} placeholder={`不填则显示“布局 ${target}”`} onChange={event=>setName(event.target.value)}/></label><p className="farm-layout-slots-note">{renaming?"只修改名字，不改变已存布置或当前农场。":occupied?`将用眼前的布置覆盖“${label(target)}”，其他两套不变。`:`将眼前的布置存入布局 ${target}。`}</p></>:null}
      {error?<p role="alert">{error}</p>:null}
      <footer><button type="button" disabled={busy} onClick={onClose}>返回</button><button type="button" disabled={busy||target===null} onClick={()=>{if(target!==null){if(renaming)onRename?.(target,name);else onSave(target,name);}}}>{busy?"正在保存…":target===null?"选择一个位置":renaming?"保存名字":occupied?`确认覆盖“${label(target)}”`:`保存至布局 ${target}`}</button></footer>
    </section>
  </div>;
}

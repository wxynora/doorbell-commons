import {useEffect,useState} from "react";

export function FieldGroups({groups,selected,onSelect,onSplit,onMerge}:{
  groups:readonly {count:number}[];selected:number;
  onSelect:(index:number)=>boolean|undefined;onSplit:(count:number)=>boolean|undefined;onMerge:(index:number)=>boolean|undefined;
}){
  const [open,setOpen]=useState(false),[count,setCount]=useState(""),[target,setTarget]=useState("");
  useEffect(()=>{setCount("");setTarget("");},[selected,groups.length]);
  const size=groups[selected]?.count??0,split=Number(count);
  const validSplit=count.trim()!==""&&Number.isSafeInteger(split)&&split>0&&split<size;
  return <>
    <div className="farm-field-groups">
      <label><span className="farm-visually-hidden">当前田块</span><select aria-label="当前田块" value={selected} onChange={e=>onSelect(Number(e.currentTarget.value))}>
        {groups.map((group,index)=><option key={index} value={index}>田块{index+1} · {group.count}格</option>)}
      </select></label>
      <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>分组{open?" ▴":" ▾"}</button>
    </div>
    {open?<div className="farm-field-group-tools">
      <div className="farm-field-group-tools__row">
        <label><span>拆出</span><input aria-label="拆出的地块数" type="number" inputMode="numeric" min="1" max={size-1} step="1" value={count} placeholder="格数" onChange={e=>setCount(e.currentTarget.value)}/><span>格</span></label>
        <button type="button" disabled={!validSplit} onClick={()=>{if(onSplit(split))setCount("");}}>拆分</button>
      </div>
      {groups.length>1?<div className="farm-field-group-tools__row">
        <label><span>并入</span><select aria-label="合并到哪块田" value={target} onChange={e=>setTarget(e.currentTarget.value)}>
          <option value="" disabled>选择田块</option>{groups.map((group,index)=>index===selected?null:<option key={index} value={index}>田块{index+1} · {group.count}格</option>)}
        </select></label>
        <button type="button" disabled={target===""} onClick={()=>{if(target!==""&&onMerge(Number(target)))setTarget("");}}>合并</button>
      </div>:null}
    </div>:null}
  </>;
}

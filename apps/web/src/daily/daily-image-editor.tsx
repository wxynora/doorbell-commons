import React,{useEffect,useRef,useState} from "react";
import type {DailyImageCrop} from "@doorbell/protocol";
import "./daily-image-editor.css";

type Point={x:number;y:number};
type Drag={point:Point;crop:DailyImageCrop;mode:string};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function DailyImageEditor({src,initialCrop,onApply,onClose}:{src:string;initialCrop?:DailyImageCrop|undefined;
  onApply:(crop:DailyImageCrop|undefined)=>void;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const surface=useRef<HTMLDivElement>(null);
  const drag=useRef<Drag|null>(null);
  const [crop,setCrop]=useState<DailyImageCrop|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  const full=(width:number,height:number):DailyImageCrop=>({x:0,y:0,width,height,sourceWidth:width,sourceHeight:height});
  const point=(event:React.PointerEvent):Point=>{
    const bounds=surface.current!.getBoundingClientRect();
    return {x:clamp(Math.round((event.clientX-bounds.left)/bounds.width*crop!.sourceWidth),0,crop!.sourceWidth),
      y:clamp(Math.round((event.clientY-bounds.top)/bounds.height*crop!.sourceHeight),0,crop!.sourceHeight)};
  };
  const start=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!crop || (event.pointerType==="mouse" && event.button!==0))return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={point:point(event),crop,mode:(event.target as HTMLElement).dataset.handle ?? "draw"};
  };
  const move=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!crop||!drag.current)return;
    const {point:from,crop:previous,mode}=drag.current;
    const to=point(event),dx=to.x-from.x,dy=to.y-from.y;
    if(mode==="move") {
      setCrop({...previous,x:clamp(previous.x+dx,0,previous.sourceWidth-previous.width),y:clamp(previous.y+dy,0,previous.sourceHeight-previous.height)});return;
    }
    let left=previous.x,top=previous.y,right=left+previous.width,bottom=top+previous.height;
    if(mode==="draw") {
      left=Math.min(from.x,to.x);right=Math.max(from.x,to.x);top=Math.min(from.y,to.y);bottom=Math.max(from.y,to.y);
      if(right===left||bottom===top)return;
    } else {
      if(mode.includes("w"))left=clamp(previous.x+dx,0,right-1);
      if(mode.includes("e"))right=clamp(previous.x+previous.width+dx,left+1,previous.sourceWidth);
      if(mode.includes("n"))top=clamp(previous.y+dy,0,bottom-1);
      if(mode.includes("s"))bottom=clamp(previous.y+previous.height+dy,top+1,previous.sourceHeight);
    }
    setCrop({...previous,x:left,y:top,width:right-left,height:bottom-top});
  };
  const update=(key:"x"|"y"|"width"|"height",value:number)=>{
    if(!crop||!Number.isFinite(value))return;
    const next={...crop,[key]:Math.round(value)};
    next.x=clamp(next.x,0,next.sourceWidth-1);next.y=clamp(next.y,0,next.sourceHeight-1);
    next.width=clamp(next.width,1,next.sourceWidth-next.x);next.height=clamp(next.height,1,next.sourceHeight-next.y);
    setCrop(next);
  };
  return <dialog className="daily-image-editor" ref={dialog} aria-labelledby="daily-image-editor-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header><h2 id="daily-image-editor-title">裁剪图片</h2><button type="button" onClick={onClose} aria-label="关闭裁剪">×</button></header>
    <p>拖动四角调整范围，拖动选区移动位置；只保留框内的部分。</p>
    {error?<p role="alert">图片未能加载，请关闭后重试。</p>:null}
    {!crop&&!error?<p role="status">正在读取图片…</p>:null}
    <div className="daily-crop-stage">
      <div ref={surface} className="daily-crop-surface" onPointerDown={start} onPointerMove={move}
        onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
        <img src={src} alt="待裁剪原图" draggable={false} onError={()=>{setError(true);setCrop(null);}} onLoad={event=>{
          const {naturalWidth:width,naturalHeight:height}=event.currentTarget;
          setCrop(initialCrop?.sourceWidth===width&&initialCrop.sourceHeight===height?initialCrop:full(width,height));
        }}/>
        {crop?<div className="daily-crop-selection" data-handle="move" style={{left:`${crop.x/crop.sourceWidth*100}%`,top:`${crop.y/crop.sourceHeight*100}%`,width:`${crop.width/crop.sourceWidth*100}%`,height:`${crop.height/crop.sourceHeight*100}%`}}>
          {(["nw","ne","sw","se"] as const).map(corner=><span key={corner} className={`daily-crop-handle daily-crop-${corner}`} data-handle={corner}/>)}
        </div>:null}
      </div>
    </div>
    {crop?<div className="daily-crop-fields">{([["x","左侧"],["y","顶部"],["width","宽度"],["height","高度"]] as const).map(([key,label])=><label key={key}>{label}（像素）
      <input type="number" value={crop[key]} min={key==="x"||key==="y"?0:1} step="1"
        max={key==="x"?crop.sourceWidth-1:key==="y"?crop.sourceHeight-1:key==="width"?crop.sourceWidth-crop.x:crop.sourceHeight-crop.y}
        onChange={event=>update(key,event.currentTarget.valueAsNumber)}/></label>)}</div>:null}
    <footer><button type="button" disabled={!crop} onClick={()=>{if(crop)setCrop(full(crop.sourceWidth,crop.sourceHeight));}}>恢复整图</button>
      <button type="button" onClick={onClose}>取消</button>
      <button className="daily-crop-apply" type="button" disabled={!crop} onClick={()=>{
        if(crop)onApply(crop.x===0&&crop.y===0&&crop.width===crop.sourceWidth&&crop.height===crop.sourceHeight?undefined:crop);
      }}>应用裁剪</button></footer>
  </dialog>;
}

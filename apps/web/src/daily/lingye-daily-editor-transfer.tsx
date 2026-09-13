import React, { useState, useRef } from "react";
import { editorRequest, type EditorProgressLane } from "./lingye-daily-editor-client";

export function ReporterTransferControls({date,lane,busy,run,refresh,notify}:{
  date:string;lane:EditorProgressLane;busy:boolean;run:(action:()=>Promise<void>)=>Promise<void>;
  refresh:()=>Promise<void>;notify:(message:string)=>void;
}) {
  const [candidates,setCandidates]=useState<{residentId:string;displayName:string}[]|null>(null);
  const [selected,setSelected]=useState("");
  const request=useRef<{id:string;target:string}|null>(null);
  const timing=lane.timing;
  if(!timing)return null;
  const pending=timing.pendingTransfer;
  return <div className="daily-editor-transfer">
    <small>{pending?"转交尚未完成，可继续原转交。":timing.waitingForDelivery?"铃尚未发出，等待记者连接。":
      `已发出 ${timing.sentCount} 次铃${timing.canTransfer?"，可以选择接手记者。":timing.nextAt?` · ${new Date(timing.nextAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false})} 后可继续操作`:""}`}</small>
    <button disabled={busy} onClick={()=>void run(refresh)}>刷新进度</button>
    {timing.canTransfer&&!pending?<>
      {candidates===null?<button disabled={busy} onClick={()=>void run(async()=>{
        const result=await editorRequest<{candidates:{residentId:string;displayName:string}[]}>(`/issues/${date}/transfer-candidates`);
        setCandidates(result.candidates.filter(person=>person.residentId!==timing.residentId));
      })}>选择接手记者</button>:<label>交给
        <select aria-label="接手记者" disabled={busy} value={selected} onChange={event=>{setSelected(event.target.value);request.current=null;}}>
          <option value="">请选择记者</option>
          {candidates.map(person=><option key={person.residentId} value={person.residentId}>{person.displayName}</option>)}
        </select>
        {candidates.length===0?<small>暂时没有其他可接手的记者。</small>:null}
      </label>}
    </>:null}
    {pending||timing.canTransfer&&selected?<button disabled={busy} onClick={()=>void run(async()=>{
      const target=pending?.targetResidentId??selected;
      const current=pending?{id:pending.requestId,target}:request.current??{id:crypto.randomUUID(),target};
      request.current=current;
      try {
        await editorRequest(`/issues/${date}/transfer`,"POST",{lane:lane.lane,requestId:current.id,
          sourceWakeId:timing.sourceWakeId,targetResidentId:current.target});
        request.current=null;setSelected("");setCandidates(null);
        notify("已转交，并通过铃发送原任务。绩效在接手记者完成后结算。");
      } catch(error) {
        if(error&&typeof error==='object'&&'status' in error&&error.status===409)request.current=null;
        throw error;
      } finally {await refresh();}
    })}>{pending?"继续原转交":"确认转交"}</button>:null}
  </div>;
}

import React,{useEffect,useRef,useState} from "react";
import {editorRequest} from "../lingye-daily-editor-client";

interface ImageStatus {
  imageId:string;reporterName:string;columnTitle:string;
  state:"pending"|"failed"|"ready";attemptCount:number;attemptedAt:number|null;errorCode:string|null;
}
interface ImageResult {
  images:ImageStatus[];
  readyImages:{image_id:string;media_type:string}[];
}

export function columnImageFailureReason(code:string|null):string {
  if(code==="request_interrupted") return "上次请求中断，未保存生图结果。";
  if(code==="daily_column_image_gateway_not_configured") return "生图服务尚未配置。";
  if(code==="daily_column_image_generator_must_return_webp_buffer") return "生图服务未返回有效的压缩图片。";
  const status=/^daily_column_image_gateway_failed_(\d{3})$/u.exec(code ?? "")?.[1];
  return status ? `生图网关返回 HTTP ${status}。` : "生图请求未完成。";
}

export function DailyColumnImageStatusPanel({issueDate,refreshKey,onImages}:{
  issueDate:string;refreshKey:number;onImages:(images:ImageResult["readyImages"])=>void;
}) {
  const [images,setImages]=useState<ImageStatus[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const currentDate=useRef(issueDate);currentDate.current=issueDate;
  const imageCallback=useRef(onImages);imageCallback.current=onImages;
  const load=async()=>{
    const result=await editorRequest<ImageResult>(`/issues/${issueDate}/column-images`);
    if(currentDate.current!==issueDate)return;
    setImages(result.images);imageCallback.current(result.readyImages);
  };
  useEffect(()=>{
    setImages([]);setMessage("");
    void load().catch(error=>{if(currentDate.current===issueDate)setMessage(error instanceof Error?error.message:"配图状态暂时无法读取。");});
  },[issueDate,refreshKey]);
  const run=async(action:()=>Promise<void>)=>{
    if(busy)return;
    setBusy(true);setMessage("");
    try{await action();}catch(error){if(currentDate.current===issueDate)setMessage(error instanceof Error?error.message:"配图操作未完成。");}
    finally{setBusy(false);}
  };
  if(!images.length&&!message)return null;
  return <section className="daily-editor-progress" aria-label="栏目配图">
    <h2>栏目配图</h2>
    {images.map(image=><div key={image.imageId} className="daily-editor-progress-row">
      <p><strong>{image.reporterName} · {image.columnTitle}</strong><br/>
        {image.state==="ready"?"配图已生成":image.state==="pending"?(image.attemptCount?"正在生图，正文可以继续编辑。":"尚未开始生图。"):null}
      </p>
      {image.state==="failed"?<>
        <p role="alert">{columnImageFailureReason(image.errorCode)}已尝试 {image.attemptCount} 次，等待你决定是否重试；正文已保留。</p>
        <button disabled={busy} onClick={()=>void run(async()=>{
          await editorRequest(`/issues/${issueDate}/column-images/${encodeURIComponent(image.imageId)}/retry`,"POST",{attemptCount:image.attemptCount});
          await load();
          if(currentDate.current===issueDate)setMessage("已提交一次重试；稍后点“查看配图结果”。");
        })}>重试一次</button>
      </>:null}
    </div>)}
    <button disabled={busy} onClick={()=>void run(load)}>查看配图结果</button>
    {message?<p role="status">{message}</p>:null}
  </section>;
}

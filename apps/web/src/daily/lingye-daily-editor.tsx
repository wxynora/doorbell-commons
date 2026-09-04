import React,{useEffect,useRef,useState} from "react";
import {dailyDocumentSchema,type DailyBlock,type DailyDocument,type DailyTextRun} from "@doorbell/protocol";
import {DailyDocumentView} from "./lingye-daily-document-view";
import {editorRequest,type EditorDraft,type EditorProgress} from "./lingye-daily-editor-client";
import {DailyEditorDuty} from "./lingye-daily-editor-duty";
import {DailyMasthead} from "./lingye-daily-page";
import "./lingye-daily-editor.css";

function dateLabel(issueDate:string) {
  const [year,month,day]=issueDate.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function textRuns(node:Node,bold=false):DailyTextRun[] {
  if(node.nodeType===3)return node.textContent ? [{text:node.textContent,...(bold?{bold:true}:{})}] : [];
  if(!(node instanceof HTMLElement))return [];
  if(node.tagName==="BR")return [{text:"\n",...(bold?{bold:true}:{})}];
  const strong=bold||["STRONG","B"].includes(node.tagName)||node.style.fontWeight==="bold"||Number(node.style.fontWeight)>=600;
  return [...node.childNodes].flatMap(child=>textRuns(child,strong));
}
export function readEditedDocument(root:HTMLElement):DailyDocument {
  const sections=[...root.querySelectorAll<HTMLElement>("[data-section-key]")].map(section=>{
    const copy=section.querySelector<HTMLElement>(".daily-document-copy")!;
    const blocks:DailyBlock[]=[];
    const walk=(node:Node)=>{
      if(node instanceof HTMLElement && node.dataset.imageId) {
        blocks.push({type:"image",runs:[],imageId:node.dataset.imageId});return;
      }
      if(node instanceof HTMLElement && node.tagName==="DIV" && node.querySelector("p,div,h3,figure")) {
        [...node.childNodes].forEach(walk);return;
      }
      const runs=textRuns(node);
      if(!runs.some(run=>run.text.trim()))return;
      const element=node instanceof HTMLElement?node:null;
      const type=element?.tagName==="H3"?"heading":element?.dataset.blockType ?? "paragraph";
      blocks.push({type:type as DailyBlock["type"],runs,
        ...(element?.dataset.submissionId ? {submissionId:element.dataset.submissionId} : {})});
    };
    [...copy.childNodes].forEach(walk);
    return {key:section.dataset.sectionKey,title:section.querySelector("h2")?.textContent ?? "",blocks};
  });
  return dailyDocumentSchema.parse({version:1,sections});
}

export function LingyeDailyEditor({onBack}:{onBack?:()=>void} = {}) {
  const [issues,setIssues]=useState<{issue_date:string;published_version:number|null}[]>([]);
  const [draft,setDraft]=useState<EditorDraft|null>(null);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [progress,setProgress]=useState<EditorProgress|null>(null);
  const paper=useRef<HTMLDivElement>(null);
  const resendRequestIds=useRef<Partial<Record<"farm"|"submissions",string>>>({});
  const [epoch,setEpoch]=useState(0);
  const install=(next:EditorDraft)=>{setDraft(next);setDirty(false);setEpoch(value=>value+1);setSelected([]);};
  const loadProgress=async(date:string)=>setProgress(await editorRequest<EditorProgress>(`/issues/${date}/progress`));
  const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setNotice("");try{await action();}catch(error){setNotice(error instanceof Error?error.message:"操作未完成，请重试。");}finally{setBusy(false);}};
  const open=async(date:string)=>{
    resendRequestIds.current={};setProgress(null);const saved=await editorRequest<EditorDraft>(`/issues/${date}`);install(saved);
    if(saved.publishedVersion===null) {
      try{install(await editorRequest<EditorDraft>(`/issues/${date}/refresh`,"POST",{}));}
      catch(error){setNotice(`已打开保存的稿件；${error instanceof Error?error.message:"新来稿暂未取到，可稍后更新。"}`);}
    } await loadProgress(date);
  };
  useEffect(()=>{void run(async()=>{
    const result=await editorRequest<{issues:{issue_date:string;published_version:number|null}[]}>("/issues");
    setIssues(result.issues);if(result.issues[0])await open(result.issues[0].issue_date);
  });},[]);
  useEffect(()=>{
    const prevent=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);
  },[dirty]);
  const save=async()=>{
    if(!draft||!paper.current)return draft;
    const next=await editorRequest<EditorDraft>(`/issues/${draft.issueDate}`,"PUT",{version:draft.version,document:readEditedDocument(paper.current)});
    install(next);return next;
  };
  const command=(name:string,value?:string)=>{
    const selection=window.getSelection();
    const anchor=selection?.anchorNode?.parentElement?.closest(".daily-document-copy");
    const focus=selection?.focusNode?.parentElement?.closest(".daily-document-copy");
    if(!anchor||anchor!==focus||!paper.current?.contains(anchor)){setNotice("先在正文中选中文字或把光标放进段落。");return;}
    if(!document.queryCommandSupported(name)){setNotice("当前浏览器不支持此排版操作，请使用最新版浏览器。");return;}
    document.execCommand(name,false,value);setDirty(true);
  };
  const images=Object.fromEntries((draft?.images ?? []).map(image=>[image.image_id,`data:${image.media_type};base64,${image.data_base64}`]));
  return <section className="daily-editor">
    <header className="daily-editor-header"><div><h1>铃野主编工作台</h1><p>改好这一版，再交到大家手里。</p></div>
      <DailyEditorDuty name={draft?.activeEditorName ?? null} />
      {onBack ? <button onClick={()=>{if(!dirty||window.confirm("还有未保存的修改，确定离开？"))onBack();}}>返回日报</button> : null}</header>
    <div className="daily-editor-toolbar" role="toolbar" aria-label="正文排版与出版">
      <select aria-label="选择期次" disabled={busy} value={draft?.issueDate ?? ""} onChange={event=>{
        if(!dirty||window.confirm("切换将放弃未保存的修改，继续？"))void run(()=>open(event.target.value));
      }}>{issues.map(issue=><option key={issue.issue_date} value={issue.issue_date}>{issue.issue_date}{issue.published_version!==null?" · 已出版":" · 待编排"}</option>)}</select>
      <button disabled={busy||!draft} onMouseDown={event=>event.preventDefault()} onClick={()=>command("bold")}><b>B</b> 加粗加黑</button>
      <button disabled={busy||!draft} onMouseDown={event=>event.preventDefault()} onClick={()=>command("formatBlock","h3")}>设为标题</button>
      <button disabled={busy||!draft} onMouseDown={event=>event.preventDefault()} onClick={()=>command("formatBlock","p")}>设为正文</button>
      <button disabled={busy||!draft} onMouseDown={event=>event.preventDefault()} onClick={()=>command("undo")}>撤销</button>
      <button disabled={busy||!draft||!dirty} onClick={()=>void run(async()=>{await save();setNotice("正文与排版已保存，尚未出版。");})}>保存修改</button>
      <button disabled={busy||!draft||dirty} onClick={()=>void run(async()=>{
        if(draft){install(await editorRequest<EditorDraft>(`/issues/${draft.issueDate}/refresh`,"POST",{}));await loadProgress(draft.issueDate);}
        setNotice("已更新到达工作台的稿件，你已保存的修改保持不变。");
      })}>更新来稿</button>
      <button className="daily-editor-publish" disabled={busy||!draft} onClick={()=>void run(async()=>{
        if(!window.confirm("确认将这版正文与排版正式出版？人类和小机将同时读到这一版。"))return;
        const current=dirty?await save():draft;if(!current)return;
        const result=await editorRequest<{draft:EditorDraft}>(`/issues/${current.issueDate}/publish`,"POST",{version:current.version});
        install(result.draft);await loadProgress(current.issueDate);
        const reward=result.draft.publicationReward;
        setNotice(reward?.paid ? `已出版，人类页面和小机读报已同步；${reward.recipientName}的农场已收到 5000 金。`
          : "已出版，人类页面和小机读报已同步。");
      })}>{busy?"处理中…":"出版"}</button>
    </div>
    <p className="daily-editor-status" role="status">{notice || (dirty?"有未保存的修改":draft?`已保存 · ${draft.publishedVersion===draft.version?"当前版本已出版":"仅工作台可见"}`:"正在读取稿件…")}</p>
    {draft ? <div className="daily-editor-layout">
      <div ref={paper} key={epoch} className="lingye-daily-page daily-editor-sheet" onInput={()=>setDirty(true)}
        onPaste={event=>{event.preventDefault();document.execCommand("insertText",false,event.clipboardData.getData("text/plain"));setDirty(true);}}
        onDrop={event=>event.preventDefault()}>
        <DailyMasthead issue={{issueNumber:String(draft.issueNumber),dateLabel:dateLabel(draft.issueDate),editorName:draft.editorModel}} />
        <DailyDocumentView document={draft.document} images={images} editable={!busy} />
      </div>
      <aside className="daily-editor-prizes"><h2>记者进度</h2>
        <div className="daily-editor-progress">{progress?.lanes.map(lane=><div key={lane.lane} className="daily-editor-progress-row">
          <p><strong>{lane.lane==="farm"?"农场稿":"小机投稿"}</strong><br/>{lane.label}{lane.reporterName?` · ${lane.reporterName}`:""}</p>
          {lane.resendable?<button disabled={busy} onClick={()=>void run(async()=>{
            const requestId=resendRequestIds.current[lane.lane] ?? crypto.randomUUID();
            resendRequestIds.current[lane.lane]=requestId;
            const result=await editorRequest<{status:"sent"|"already_sent";reporterName:string}>(`/issues/${draft.issueDate}/resend`,"POST",{lane:lane.lane,requestId});
            delete resendRequestIds.current[lane.lane];
            await loadProgress(draft.issueDate);setNotice(`已向${result.reporterName}补发当前任务的铃。`);
          })}>补发铃</button>:null}
        </div>) ?? <p>正在读取记者进度…</p>}</div>
        <h2>本期来稿</h2><p>群聊 {draft.readiness.group?"已到":"待到"} · 记者 {draft.readiness.reporter?"已到":"待到"}<br/>投稿 {draft.readiness.submissions?"已审":"待审"} · 天气 {draft.readiness.weather?"已到":"待到"}</p>
        <h2>出版审稿奖金</h2><small>{draft.publicationReward
          ? `${draft.publicationReward.recipientName} · ${draft.publicationReward.paid?"已发 5000 金":"5000 金待确认"}`
          : "以本期第一次成功出版时的登录账号为准，每期一次。"}</small>
        <h2>投稿奖金</h2><small>每篇 2000 金；已发放的不再重复发。</small>
        {draft.submissions.map((sub,index)=><label key={sub.submission_id ?? index}>
          <input type="checkbox" disabled={busy||sub.paid||!sub.submission_id} checked={!!sub.submission_id&&selected.includes(sub.submission_id)}
            onChange={event=>{const id=sub.submission_id!;setSelected(current=>event.target.checked?[...current,id]:current.filter(value=>value!==id));}}/>
          {sub.source_label} {sub.paid?"· 已发 2000 金":""}<p>{sub.text}</p></label>)}
        {!draft.submissions.length?<p>暂无入选投稿。</p>:null}
        <button disabled={busy||!selected.length} onClick={()=>void run(async()=>{
          if(!window.confirm(`给选中的 ${selected.length} 篇投稿发放 ${selected.length*2000} 金？`))return;
          const next=await editorRequest<EditorDraft>(`/issues/${draft.issueDate}/rewards`,"POST",{submissionIds:selected});
          setDraft(current=>current?{...current,submissions:next.submissions}:current);setSelected([]);setNotice("所选投稿奖金已发放。");
        })}>发放 {selected.length*2000} 金</button>
      </aside>
    </div>:!busy?<p>还没有待编排的稿件，生成后的日报会先送到这里。</p>:null}
  </section>;
}

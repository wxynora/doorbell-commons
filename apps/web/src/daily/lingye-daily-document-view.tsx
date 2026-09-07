import React,{useState} from "react";
import {lingyeDailyCommentSectionKeySchema,type DailyDocument,type DailyBlock} from "@doorbell/protocol";

export const DAILY_SUBMISSION_STAMP_URL="/lingye/daily/submission-received-stamp-v1.png";

export function DailySubmissionStamp() {
  return <img aria-hidden="true" alt="" className="daily-stamp" contentEditable={false} draggable={false} src={DAILY_SUBMISSION_STAMP_URL} />;
}

type ImageAction = (figure:HTMLElement,action:"crop"|"delete")=>void;
function DailyImageActions({onAction}:{onAction:ImageAction}) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  return <div className="daily-image-actions">
    {confirmDelete?<><button type="button" onClick={event=>onAction(event.currentTarget.closest("figure")!,"delete")}>确认删除</button>
      <button type="button" onClick={()=>setConfirmDelete(false)}>取消</button></>:<>
      <button type="button" onClick={event=>onAction(event.currentTarget.closest("figure")!,"crop")}>裁剪图片</button>
      <button type="button" onClick={()=>setConfirmDelete(true)}>删除图片</button></>}
  </div>;
}
export function DailyDocumentBlock({block,images,onImageAction}:{block:DailyBlock;images:Record<string,string>;onImageAction?:ImageAction|undefined}) {
  const content=block.runs.map((run,index)=>run.bold?<strong key={index}>{run.text}</strong>:run.text);
  if(block.type==="image") return images[block.imageId ?? ""] ? <figure className="daily-hero-image" contentEditable={false} data-image-id={block.imageId} data-image-crop={block.crop?JSON.stringify(block.crop):undefined}>
    {block.crop ? <svg role="img" aria-label="本期来源图片（已裁剪）" viewBox={`${block.crop.x} ${block.crop.y} ${block.crop.width} ${block.crop.height}`}
      style={{display:"block",width:"100%",height:"auto",aspectRatio:`${block.crop.width} / ${block.crop.height}`}}>
      <image href={images[block.imageId ?? ""]} width={block.crop.sourceWidth} height={block.crop.sourceHeight}/>
    </svg> : <img src={images[block.imageId ?? ""]} alt="本期来源图片" />}
    {onImageAction?<DailyImageActions onAction={onImageAction}/>:null}</figure> : null;
  if(block.type==="heading") return <h3>{content}</h3>;
  if(block.type==="submission") return <p className="daily-submission-box daily-document-submission" data-block-type="submission" data-submission-id={block.submissionId}><DailySubmissionStamp />{content}</p>;
  if(block.type==="quote") return <blockquote className="daily-document-quote" data-block-type="quote"><span className="daily-quote-text">{content}</span></blockquote>;
  return <p data-block-type={block.type} className={`daily-document-${block.type}`}>{content}</p>;
}

function DailyDocumentBlocks({blocks,images,groupQuotes,onImageAction}:{blocks:DailyBlock[];images:Record<string,string>;groupQuotes:boolean;onImageAction?:ImageAction|undefined}) {
  const rendered:React.ReactNode[]=[];
  for(let index=0;index<blocks.length;index+=1) {
    const block=blocks[index];
    if(!block) continue;
    const next=blocks[index+1];
    const byline=groupQuotes&&block.type==="quote"&&next?.type==="byline" ? next : null;
    if(byline) {
      rendered.push(<div className="daily-quote-box daily-document-quote-group" key={index}>
        <DailyDocumentBlock block={block} images={images} />
        <DailyDocumentBlock block={byline} images={images} />
      </div>);
      index+=1;
    } else rendered.push(<DailyDocumentBlock key={index} block={block} images={images} onImageAction={onImageAction} />);
  }
  return <>{rendered}</>;
}

export function DailyDocumentView({document,images,editable=false,renderSectionComments,onImageAction}:{document:DailyDocument;images:Record<string,string>;editable?:boolean;
  onImageAction?:ImageAction;
  renderSectionComments?:(section:DailyDocument["sections"][number])=>React.ReactNode}) {
  const render=(key:string)=>{
    const section=document.sections.find(item=>item.key===key);
    if(!section?.blocks.length)return null;
    const tone=key==="front"||key==="quotes"?"red":key==="slices"?"green":key==="farm"?"yellow":key==="submissions"?"ink":"blue";
    const blocks=<DailyDocumentBlocks blocks={section.blocks} images={images} groupQuotes={key==="quotes"} onImageAction={editable?onImageAction:undefined} />;
    return <section key={key} className={`${key==="tomorrow"?"daily-footer-question":"daily-section"}${key==="quotes"?" daily-quotes":""} daily-document-section daily-document-${key}`} data-section-key={key}>
      {key==="tomorrow"
        ? <h2 contentEditable={editable} suppressContentEditableWarning>{section.title}</h2>
        : <h2 contentEditable={editable} suppressContentEditableWarning className={`daily-section-tag daily-section-tag--${tone}`}>{section.title}</h2>}
      {!editable && lingyeDailyCommentSectionKeySchema.safeParse(section.key).success ? renderSectionComments?.(section) : null}
      <div contentEditable={editable} suppressContentEditableWarning className="daily-document-copy" role={editable?"textbox":undefined} aria-label={editable?section.title:undefined} aria-multiline={editable?true:undefined}>{key==="group"?<div className="daily-group-card daily-document-group-card">{blocks}</div>:blocks}</div>
    </section>;
  };
  return <div className="daily-document">
    <div className="daily-newspaper-body"><main className="daily-main-column">{render("front")}{render("slices")}</main>
      <aside className="daily-sidebar">{render("group")}</aside></div>
    {(["farm","voice","weather","quotes","submissions","tomorrow"] as const).map(render)}
  </div>;
}

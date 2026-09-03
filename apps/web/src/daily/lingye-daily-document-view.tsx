import React from "react";
import {type DailyDocument,type DailyBlock} from "@doorbell/protocol";

export function DailyDocumentBlock({block,images}:{block:DailyBlock;images:Record<string,string>}) {
  const content=block.runs.map((run,index)=>run.bold?<strong key={index}>{run.text}</strong>:run.text);
  if(block.type==="image") return images[block.imageId ?? ""] ? <figure className="daily-hero-image" contentEditable={false} data-image-id={block.imageId}>
    <img src={images[block.imageId ?? ""]} alt="本期来源图片" /></figure> : null;
  if(block.type==="heading") return <h3>{content}</h3>;
  if(block.type==="submission") return <p className="daily-submission-box daily-document-submission" data-block-type="submission" data-submission-id={block.submissionId}>{content}</p>;
  if(block.type==="quote") return <blockquote className="daily-quote-box daily-document-quote" data-block-type="quote"><span className="daily-quote-text">{content}</span></blockquote>;
  return <p data-block-type={block.type} className={`daily-document-${block.type}`}>{content}</p>;
}
export function DailyDocumentView({document,images,editable=false}:{document:DailyDocument;images:Record<string,string>;editable?:boolean}) {
  const render=(key:string)=>{
    const section=document.sections.find(item=>item.key===key);
    if(!section?.blocks.length)return null;
    return <section key={key} className={`${key==="tomorrow"?"daily-footer-question":"daily-section"} daily-document-section daily-document-${key}`} data-section-key={key}>
      <h2 contentEditable={editable} suppressContentEditableWarning className={`daily-section-tag daily-section-tag--${key==="front"?"red":key==="slices"?"green":"blue"}`}>{section.title}</h2>
      <div contentEditable={editable} suppressContentEditableWarning className="daily-document-copy" role={editable?"textbox":undefined} aria-label={editable?section.title:undefined} aria-multiline={editable?true:undefined}>{section.blocks.map((block,index)=><DailyDocumentBlock key={index} block={block} images={images} />)}</div>
    </section>;
  };
  return <div className="daily-document">
    <div className="daily-newspaper-body"><main className="daily-main-column">{render("front")}{render("slices")}</main>
      <aside className="daily-sidebar">{render("group")}</aside></div>
    {(["farm","weather","quotes","submissions","tomorrow"] as const).map(render)}
  </div>;
}

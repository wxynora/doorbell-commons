import React from "react";
import {type DailyDocument,type DailyBlock} from "@doorbell/protocol";

export const DAILY_SUBMISSION_STAMP_URL="/lingye/daily/submission-received-stamp-v1.png";

export function DailySubmissionStamp() {
  return <img aria-hidden="true" alt="" className="daily-stamp" contentEditable={false} draggable={false} src={DAILY_SUBMISSION_STAMP_URL} />;
}

export function DailyDocumentBlock({block,images}:{block:DailyBlock;images:Record<string,string>}) {
  const content=block.runs.map((run,index)=>run.bold?<strong key={index}>{run.text}</strong>:run.text);
  if(block.type==="image") return images[block.imageId ?? ""] ? <figure className="daily-hero-image" contentEditable={false} data-image-id={block.imageId}>
    <img src={images[block.imageId ?? ""]} alt="本期来源图片" /></figure> : null;
  if(block.type==="heading") return <h3>{content}</h3>;
  if(block.type==="submission") return <p className="daily-submission-box daily-document-submission" data-block-type="submission" data-submission-id={block.submissionId}><DailySubmissionStamp />{content}</p>;
  if(block.type==="quote") return <blockquote className="daily-document-quote" data-block-type="quote"><span className="daily-quote-text">{content}</span></blockquote>;
  return <p data-block-type={block.type} className={`daily-document-${block.type}`}>{content}</p>;
}

function DailyDocumentBlocks({blocks,images,groupQuotes}:{blocks:DailyBlock[];images:Record<string,string>;groupQuotes:boolean}) {
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
    } else rendered.push(<DailyDocumentBlock key={index} block={block} images={images} />);
  }
  return <>{rendered}</>;
}

export function DailyDocumentView({document,images,editable=false}:{document:DailyDocument;images:Record<string,string>;editable?:boolean}) {
  const render=(key:string)=>{
    const section=document.sections.find(item=>item.key===key);
    if(!section?.blocks.length)return null;
    return <section key={key} className={`${key==="tomorrow"?"daily-footer-question":"daily-section"} daily-document-section daily-document-${key}`} data-section-key={key}>
      <h2 contentEditable={editable} suppressContentEditableWarning className={`daily-section-tag daily-section-tag--${key==="front"?"red":key==="slices"?"green":"blue"}`}>{section.title}</h2>
      <div contentEditable={editable} suppressContentEditableWarning className="daily-document-copy" role={editable?"textbox":undefined} aria-label={editable?section.title:undefined} aria-multiline={editable?true:undefined}><DailyDocumentBlocks blocks={section.blocks} images={images} groupQuotes={key==="quotes"} /></div>
    </section>;
  };
  return <div className="daily-document">
    <div className="daily-newspaper-body"><main className="daily-main-column">{render("front")}{render("slices")}</main>
      <aside className="daily-sidebar">{render("group")}</aside></div>
    {(["farm","weather","quotes","submissions","tomorrow"] as const).map(render)}
  </div>;
}

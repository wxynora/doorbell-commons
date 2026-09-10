import type Database from "better-sqlite3";
import {dailyDocumentFromEdition} from "@doorbell/protocol";
import {DailyEditorError,type LingyeDailyEditorStore} from "./lingye-daily-editor-store.js";
const KIND="human-submission-review";
export function hasHumanSubmissionReview(db:Database.Database,date:string):boolean {
  return Boolean(db.prepare("SELECT 1 FROM lingye_daily_editor_sources WHERE issue_date=? AND kind=?").get(date,KIND));
}
export class HumanSubmissionEditor {
  constructor(private readonly editor:LingyeDailyEditorStore) {}
  private get db(){return this.editor.database;}
  private batch(date:string) {
    const row=this.db.prepare("SELECT candidate_ids_json,selected_ids_json FROM lingye_daily_submission_batches WHERE issue_date=?").get(date) as {candidate_ids_json:string;selected_ids_json:string|null}|undefined;
    if(!row)throw new DailyEditorError(409,"本期投稿批次尚未准备好。");
    return row;
  }
  get(date:string) {
    if(!hasHumanSubmissionReview(this.db,date))return null;
    const batch=this.batch(date),ids=JSON.parse(batch.candidate_ids_json) as string[];
    const candidates=ids.map((id,index)=>{
      const item=this.db.prepare("SELECT submission_id,body AS text,question_text AS question,source_label FROM lingye_daily_submissions WHERE submission_id=? AND target_issue_date=?").get(id,date) as {submission_id:string;text:string;question:string;source_label:string}|undefined;
      if(!item)throw new DailyEditorError(409,"候选投稿缺失，请先核对原稿。");
      return {...item,number:index+1};
    });
    return {candidates,selectedIds:batch.selected_ids_json===null?[]:JSON.parse(batch.selected_ids_json) as string[],decided:batch.selected_ids_json!==null};
  }
  takeover(date:string,account:string,now:number) {
    return this.db.transaction(()=>{
      const row=this.editor.row(date);
      if(date!=="2026-09-10"||row.published_version!==null)throw new DailyEditorError(409,"本次人工接管仅用于9月10日未出版的投稿。");
      if(hasHumanSubmissionReview(this.db,date))return this.editor.get(date);
      if(this.batch(date).selected_ids_json!==null)throw new DailyEditorError(409,"本期投稿已经审完，不能覆盖原审批。");
      // Existing source archive records Human takeover; frozen batch owns selection.
      this.db.prepare("INSERT INTO lingye_daily_editor_sources(issue_date,kind,source_json,received_at) VALUES (?,?,?,?)").run(date,KIND,JSON.stringify({accountId:account}),now);
      return this.editor.get(date);
    }).immediate();
  }
  select(date:string,version:number,ids:string[],account:string,now:number) {
    return this.db.transaction(()=>{
      const review=this.get(date),row=this.editor.row(date);
      if(!review||row.published_version!==null)throw new DailyEditorError(409,"本期不能修改人工选稿。");
      if(row.version!==version)throw new DailyEditorError(409,"稿件已有新版本，请重新打开，避免覆盖已保存的修改。");
      const allowed=new Set(review.candidates.map(item=>item.submission_id));
      if(ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!allowed.has(id)))throw new DailyEditorError(400,"请从本期候选投稿中选择最多三篇。");
      if(review.decided&&JSON.stringify(ids)===JSON.stringify(review.selectedIds))return this.editor.get(date);
      this.db.prepare("UPDATE lingye_daily_submission_batches SET selected_ids_json=?,decided_at=? WHERE issue_date=?").run(JSON.stringify(ids),now,date);
      const edition={...JSON.parse(row.edition_json),submissions:this.editor.daily.selectedSubmissions(date),submission_reviewer:null};
      const document=JSON.parse(row.document_json);
      const section=dailyDocumentFromEdition(edition,date).sections.find(item=>item.key==="submissions");
      const index=document.sections.findIndex((item:{key:string})=>item.key==="submissions");
      if(index>=0)document.sections.splice(index,1,...(section?[section]:[]));
      else if(section){const before=document.sections.findIndex((item:{key:string})=>item.key==="tomorrow");document.sections.splice(before<0?document.sections.length:before,0,section);}
      this.db.prepare("UPDATE lingye_daily_editor_drafts SET edition_json=? WHERE issue_date=?").run(JSON.stringify(edition),date);
      return this.editor.save(date,version,document,account,now);
    }).immediate();
  }
}

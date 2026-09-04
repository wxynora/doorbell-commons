import type Database from "better-sqlite3";
import {
  dailyDocumentFromEdition, dailyDocumentSchema, dailyObservationQuestion,
  lingyeDailyEditionPublishSchema, type DailyDocument, type LingyeDailyEditionPublish,
  type LingyeDailyPublishRequest,
} from "@doorbell/protocol";
import { LingyeDailyStore, type LingyeDailyIssueRecord } from "./lingye-daily-store.js";

export class DailyEditorError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
interface DraftRow {
  issue_date:string; input_json:string; edition_json:string; document_json:string;
  version:number; updated_at:number; updated_by:string|null; published_version:number|null; publication_synced:number;
}
export interface DailyEditorPublisher {
  accountId:string;profileId:string;residentId:string;residentName:string;
}
interface PublicationRewardRow {
  issue_date:string;publication_revision:number;account_id:string;profile_id:string;resident_id:string;
  resident_name:string;reward_id:string;requested_at:number;paid_at:number|null;receipt_id:string|null;
}
interface ResendRow {
  request_id:string;issue_date:string;lane:"farm"|"submissions";source_wake_id:string;wake_id:string;
  recipient_resident_id:string;requested_by:string;created_at:number;
}
export class LingyeDailyEditorStore {
  constructor(readonly database:Database.Database, readonly daily = new LingyeDailyStore(database)) {}
  row(date:string):DraftRow {
    const row=this.database.prepare("SELECT * FROM lingye_daily_editor_drafts WHERE issue_date=?").get(date) as DraftRow|undefined;
    if(!row) throw new DailyEditorError(404,"这期稿件还未送到工作台。");
    return row;
  }
  list() {
    return this.database.prepare(`SELECT issue_date,version,updated_at,published_version FROM lingye_daily_editor_drafts
      ORDER BY issue_date DESC`).all();
  }
  get(date:string) {
    const row=this.row(date);
    const edition=lingyeDailyEditionPublishSchema.parse(JSON.parse(row.edition_json));
    const publishedIssue=this.database.prepare("SELECT issue_number FROM lingye_daily_issues WHERE issue_date=?")
      .get(date) as {issue_number:number}|undefined;
    const issueNumber=publishedIssue?.issue_number ?? (this.database.prepare(
      "SELECT COALESCE(MAX(issue_number), 0) + 1 AS issue_number FROM lingye_daily_issues",
    ).get() as {issue_number:number}).issue_number;
    const activeEditor=row.updated_by ? this.database.prepare(
      "SELECT resident_name FROM residents WHERE account_id=? ORDER BY created_at DESC LIMIT 1",
    ).get(row.updated_by) as {resident_name:string}|undefined : undefined;
    return {issueDate:date,version:row.version,updatedAt:row.updated_at,publishedVersion:row.published_version,
      document:dailyDocumentSchema.parse(JSON.parse(row.document_json)),
      editorModel:(JSON.parse(row.input_json) as LingyeDailyPublishRequest).editor_model,
      issueNumber,activeEditorName:activeEditor?.resident_name ?? null,
      images:edition.images,
      readiness:{group:true,reporter:edition.reporter_articles.length>0,
        submissions:this.reviewReady(date),weather:edition.weather_forecast!==undefined},
      submissions:edition.submissions.map(sub=>({...sub,paid:this.paid(sub.submission_id ?? "")})),
      publicationReward:this.publicationReward(date),
    };
  }
  reviewReady(date:string):boolean {
    try {this.daily.selectedSubmissions(date);return true;} catch{return false;}
  }
  receive(input:LingyeDailyPublishRequest, now:number):void {
    this.database.transaction(()=>{
      const source=JSON.stringify(input);
      if(!this.database.prepare("SELECT 1 FROM lingye_daily_editor_sources WHERE issue_date=? AND kind='group' AND source_json=?").get(input.issue_date,source))
        this.database.prepare("INSERT INTO lingye_daily_editor_sources(issue_date,kind,source_json,received_at) VALUES (?,'group',?,?)").run(input.issue_date,source,now);
      if(this.database.prepare("SELECT 1 FROM lingye_daily_editor_drafts WHERE issue_date=?").get(input.issue_date)) return;
      const {front_page,group_chat,behavior_slices,quotes,farm_observation,tomorrow_question,images}=input;
      // The group compiler is not the authority for either reporter workflow.
      // Its complete input stays in sources; reviewed Farm copy and anonymous
      // selections enter independently through their own authoritative stores.
      const edition={front_page,group_chat,behavior_slices,quotes,farm_observation,
        reporter_articles:[],submissions:[],tomorrow_question,images};
      this.insert(input,edition,now,null);
    }).immediate();
  }
  private insert(input:LingyeDailyPublishRequest,edition:LingyeDailyEditionPublish,now:number,publishedVersion:number|null) {
    const document=dailyDocumentFromEdition(edition,input.issue_date);
    this.database.prepare(`INSERT INTO lingye_daily_editor_drafts
      (issue_date,input_json,edition_json,document_json,version,updated_at,published_version) VALUES (?,?,?,?,1,?,?)`)
      .run(input.issue_date,JSON.stringify(input),JSON.stringify(edition),JSON.stringify(document),now,publishedVersion);
    this.history(input.issue_date,1,document,now,null);
  }
  seedPublished(issue:LingyeDailyIssueRecord,now:number) {
    if(this.database.prepare("SELECT 1 FROM lingye_daily_editor_drafts WHERE issue_date=?").get(issue.issueDate)) return;
    const input={issue_date:issue.issueDate,revision:issue.revision,revision_note:issue.revisionNote,
      period_start:issue.periodStart,period_end:issue.periodEnd,coverage_status:issue.coverageStatus,
      coverage_note:issue.coverageNote,generated_at:issue.generatedAt,editor_model:issue.editorModel,
      screening_model:issue.screeningModel,...issue.edition};
    this.database.transaction(()=>{
      this.database.prepare("INSERT INTO lingye_daily_editor_sources(issue_date,kind,source_json,received_at) VALUES (?,'published',?,?)")
        .run(issue.issueDate,JSON.stringify(input),now);
      this.insert(input,issue.edition,now,1);
    }).immediate();
  }
  // Only newly arrived sections are appended. A reporter arriving after the
  // editor has started never replaces the editor's already saved text.
  merge(date:string,patch:Partial<LingyeDailyEditionPublish>,keys:DailyDocument["sections"][number]["key"][],now:number) {
    this.database.transaction(()=>{
      const row=this.row(date);
      if(row.published_version!==null) return;
      const previousEdition=lingyeDailyEditionPublishSchema.parse(JSON.parse(row.edition_json));
      const edition=lingyeDailyEditionPublishSchema.parse({...previousEdition,...patch});
      const document=dailyDocumentSchema.parse(JSON.parse(row.document_json));
      const fresh=dailyDocumentFromEdition(edition,date);
      const sections=[...document.sections];
      const existingFarm=sections.find(section=>section.key==="farm");
      if(existingFarm && keys.includes("farm")) {
        const knownArticles=new Set(previousEdition.reporter_articles.map(article=>article.publication_id));
        const newArticles=edition.reporter_articles.filter(article=>!knownArticles.has(article.publication_id));
        if(newArticles.length) {
          const added=dailyDocumentFromEdition({...edition,farm_observation:null,reporter_articles:newArticles},date)
            .sections.find(section=>section.key==="farm");
          if(added) existingFarm.blocks.push(...added.blocks);
        }
      }
      const order:DailyDocument["sections"][number]["key"][]=["front","group","slices","farm","weather","quotes","submissions","tomorrow"];
      for(const section of fresh.sections.filter(section=>keys.includes(section.key)&&!sections.some(current=>current.key===section.key))) {
        const position=sections.findIndex(current=>order.indexOf(current.key)>order.indexOf(section.key));
        sections.splice(position<0?sections.length:position,0,section);
      }
      const next={...document,sections};
      const changed=JSON.stringify(edition)!==row.edition_json || JSON.stringify(next)!==row.document_json;
      if(!changed) return;
      this.database.prepare("INSERT INTO lingye_daily_editor_sources(issue_date,kind,source_json,received_at) VALUES (?,?,?,?)")
        .run(date,keys.join(","),JSON.stringify(patch),now);
      this.database.prepare("UPDATE lingye_daily_editor_drafts SET edition_json=?,document_json=?,version=version+1,updated_at=? WHERE issue_date=?")
        .run(JSON.stringify(edition),JSON.stringify(next),now,date);
      this.history(date,row.version+1,next,now,null);
    }).immediate();
  }
  save(date:string,version:number,document:DailyDocument,account:string,now:number) {
    return this.database.transaction(()=>{
      const row=this.row(date);
      if(row.version!==version) throw new DailyEditorError(409,"稿件已有新版本，请先重新打开，避免覆盖已保存的修改。");
      document=dailyDocumentSchema.parse(document);
      const edition=lingyeDailyEditionPublishSchema.parse(JSON.parse(row.edition_json));
      const imageIds=new Set(edition.images.map(image=>image.image_id));
      for(const section of document.sections) for(const block of section.blocks) {
        if(block.type==="image"&&(!block.imageId||!imageIds.has(block.imageId))) throw new DailyEditorError(400,"正文中有不属于本期的图片。");
      }
      this.database.prepare("UPDATE lingye_daily_editor_drafts SET document_json=?,version=version+1,updated_at=?,updated_by=?,publication_synced=0 WHERE issue_date=?")
        .run(JSON.stringify(document),now,account,date);
      this.history(date,version+1,document,now,account);
      return this.get(date);
    }).immediate();
  }
  private history(date:string,version:number,document:DailyDocument,now:number,account:string|null) {
    this.database.prepare("INSERT INTO lingye_daily_editor_history(issue_date,version,document_json,saved_at,saved_by) VALUES (?,?,?,?,?)")
      .run(date,version,JSON.stringify(document),now,account);
  }
  publish(date:string,version:number,publisher:DailyEditorPublisher,now:number) {
    return this.database.transaction(()=>{
      const row=this.row(date);
      if(row.version!==version) throw new DailyEditorError(409,"稿件已变化，请重新打开确认后再出版。");
      const previous=this.database.prepare("SELECT revision,published_at FROM lingye_daily_issues WHERE issue_date=?").get(date) as {revision:number;published_at:number}|undefined;
      if(row.published_version===version && previous) return {duplicate:true};
      const document=dailyDocumentSchema.parse(JSON.parse(row.document_json));
      const edition=lingyeDailyEditionPublishSchema.parse(JSON.parse(row.edition_json));
      if(!edition.reporter_articles.length || !this.reviewReady(date) || edition.weather_forecast===undefined)
        throw new DailyEditorError(409,"记者稿、投稿审批或天气尚未到齐，请先更新来稿。");
      const input={...JSON.parse(row.input_json),...edition,revision:previous?previous.revision+1:1,
        revision_note:previous?"主编工作台修订":null};
      const result=this.daily.publishLingyeDailyIssue(input,previous?.published_at ?? now,edition.weather_forecast ?? null);
      // A manual award may precede publication. Carry its receipt into the
      // legacy outbox rows that publication just created; it is not a new pay.
      this.database.prepare(`UPDATE lingye_daily_submission_rewards AS reward
        SET paid_at=(SELECT manual.paid_at FROM lingye_daily_editor_rewards manual
          WHERE manual.submission_id=reward.submission_id)
        WHERE reward.issue_date=? AND reward.paid_at IS NULL AND EXISTS (
          SELECT 1 FROM lingye_daily_editor_rewards manual
          WHERE manual.submission_id=reward.submission_id AND manual.paid_at IS NOT NULL)`)
        .run(date);
      const question=dailyObservationQuestion(document);
      const publishedEdition={...result.issue.edition,editor_document:document,
        tomorrow_question:question?{text:question,source_event_ids:edition.tomorrow_question?.source_event_ids ?? ["editor"]}:null};
      this.database.prepare("UPDATE lingye_daily_issues SET edition_json=? WHERE issue_date=?").run(JSON.stringify(publishedEdition),date);
      this.database.prepare("UPDATE lingye_daily_editor_drafts SET published_version=version,publication_synced=0 WHERE issue_date=?").run(date);
      if(!previous) this.database.prepare(`INSERT INTO lingye_daily_editor_publication_rewards
        (issue_date,publication_revision,account_id,profile_id,resident_id,resident_name,reward_id,requested_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(date,result.issue.revision,publisher.accountId,publisher.profileId,
          publisher.residentId,publisher.residentName,`daily-editor-publication:${date}`,now);
      return {duplicate:false};
    }).immediate();
  }
  paid(id:string):boolean {
    return Boolean(this.database.prepare(`SELECT 1 FROM lingye_daily_editor_rewards WHERE submission_id=? AND paid_at IS NOT NULL
      UNION ALL SELECT 1 FROM lingye_daily_submission_rewards WHERE submission_id=? AND paid_at IS NOT NULL`).get(id,id));
  }
  requestRewards(date:string,ids:string[],account:string,now:number) {
    return this.database.transaction(()=>{
      const selected=new Set(this.daily.selectedSubmissions(date).map(sub=>sub.submission_id));
      for(const id of ids) if(!selected.has(id)) throw new DailyEditorError(400,"只能给本期入选的投稿发放奖金。");
      for(const id of ids) if(!this.paid(id)) this.database.prepare(`INSERT INTO lingye_daily_editor_rewards
        (submission_id,issue_date,requested_by,requested_at) VALUES (?,?,?,?) ON CONFLICT(submission_id) DO NOTHING`).run(id,date,account,now);
      return this.database.prepare(`SELECT rewards.submission_id,s.resident_id FROM lingye_daily_editor_rewards rewards
        JOIN lingye_daily_submissions s USING(submission_id) WHERE rewards.issue_date=? AND rewards.paid_at IS NULL`).all(date) as {submission_id:string;resident_id:string}[];
    }).immediate();
  }
  markPaid(id:string,now:number) {
    this.database.prepare("UPDATE lingye_daily_editor_rewards SET paid_at=COALESCE(paid_at,?) WHERE submission_id=?").run(now,id);
    this.daily.markSubmissionRewardPaid(id,now);
  }

  publicationReward(date:string) {
    const row=this.database.prepare("SELECT * FROM lingye_daily_editor_publication_rewards WHERE issue_date=?").get(date) as PublicationRewardRow|undefined;
    return row ? {recipientName:row.resident_name,amount:5000,paid:row.paid_at!==null} : null;
  }
  pendingPublicationReward(date:string) {
    return this.database.prepare(`SELECT issue_date AS issueDate,reward_id AS rewardId,resident_id AS residentId
      FROM lingye_daily_editor_publication_rewards WHERE issue_date=? AND paid_at IS NULL`).get(date) as
      {issueDate:string;rewardId:string;residentId:string}|undefined;
  }
  markPublicationRewardPaid(date:string,receiptId:string,now:number) {
    this.database.transaction(()=>{
      const row=this.database.prepare("SELECT paid_at,receipt_id FROM lingye_daily_editor_publication_rewards WHERE issue_date=?").get(date) as
        {paid_at:number|null;receipt_id:string|null}|undefined;
      if(!row) throw new DailyEditorError(404,"本期没有待确认的出版奖金。");
      if(row.paid_at!==null) {
        if(row.receipt_id!==receiptId) throw new DailyEditorError(409,"本期出版奖金回执不一致。");
        return;
      }
      this.database.prepare(`UPDATE lingye_daily_editor_publication_rewards SET paid_at=?,receipt_id=?
        WHERE issue_date=? AND paid_at IS NULL`).run(now,receiptId,date);
    }).immediate();
  }
  resendByRequest(requestId:string) {
    return this.database.prepare("SELECT * FROM lingye_daily_editor_resends WHERE request_id=?").get(requestId) as ResendRow|undefined;
  }
  createResend(input:{requestId:string;issueDate:string;lane:"farm"|"submissions";sourceWakeId:string;
    recipientResidentId:string;requestedBy:string;now:number},persist:(wakeId:string)=>"created"|"duplicate") {
    return this.database.transaction(()=>{
      const current=this.resendByRequest(input.requestId);
      if(current) {
        if(current.issue_date!==input.issueDate||current.lane!==input.lane||current.requested_by!==input.requestedBy)
          throw new DailyEditorError(409,"这次补发请求与原记录不一致。");
        return {status:"already_sent" as const,wakeId:current.wake_id,recipientResidentId:current.recipient_resident_id};
      }
      const wakeId=`daily-editor-resend:${input.requestId}`;
      persist(wakeId);
      this.database.prepare(`INSERT INTO lingye_daily_editor_resends
        (request_id,issue_date,lane,source_wake_id,wake_id,recipient_resident_id,requested_by,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(input.requestId,input.issueDate,input.lane,input.sourceWakeId,wakeId,
          input.recipientResidentId,input.requestedBy,input.now);
      return {status:"sent" as const,wakeId,recipientResidentId:input.recipientResidentId};
    }).immediate();
  }
}

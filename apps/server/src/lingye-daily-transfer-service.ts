import { randomUUID, randomBytes } from "node:crypto";
import { reporterRelayWakeSchema, type ReporterRelayWake } from "@doorbell/protocol";
import { z } from "zod";
import { DailyEditorError, type LingyeDailyEditorStore } from "./lingye-daily-editor-store.js";
import { DailyReporterTransferStore, reporterTransferPending, type ReporterAssignment, type ReporterLane } from "./lingye-daily-transfer-store.js";

export interface TransferTask extends ReporterAssignment { transferable?:boolean; persist(wakeId:string):unknown; }
interface TransferRow {
  request_id:string;issue_date:string;lane:ReporterLane;source_wake_id:string;previous_resident_id:string;
  target_resident_id:string;requested_by:string;status:"prepared"|"completed"|"failed";replacement_wake_id:string|null;
}
interface TransferOptions {
  editor:LingyeDailyEditorStore;now:()=>number;
  farm:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}|undefined;
  current:(date:string,lane:ReporterLane)=>Promise<TransferTask>;
  persistTransferred:(date:string,lane:ReporterLane,wakeId:string,farmWake:ReporterRelayWake|null)=>void;
  notify:(residentId:string)=>void;
  name:(residentId:string)=>string;
}

export class DailyReporterTransferService {
  readonly store:DailyReporterTransferStore;
  constructor(readonly options:TransferOptions) {this.store=new DailyReporterTransferStore(options.editor.database);}
  async request(action:string,body:object):Promise<unknown> {
    const farm=this.options.farm;
    if(!farm) throw new DailyEditorError(503,"记者服务暂时无法连接。");
    const base=new URL(farm.apiBaseUrl);if(!base.pathname.endsWith("/"))base.pathname+="/";
    const response=await (farm.fetchImplementation??fetch)(new URL(`internal/doorbell/lingye-daily/reporter-relay/${action}`,base),{
      method:"POST",headers:{authorization:`Bearer ${farm.serviceToken}`,"content-type":"application/json"},
      body:JSON.stringify(body),signal:AbortSignal.timeout(farm.requestTimeoutMs)});
    const value=await response.json().catch(()=>null) as {ok?:boolean;data?:unknown}|null;
    if(response.status===409)throw new DailyEditorError(409,"任务已经变化或所选记者暂时不能接手，请刷新记者进度。");
    if(!response.ok||value?.ok!==true)throw new DailyEditorError(503,"转交尚未确认，请重试；原有稿件和材料会保留。");
    return value.data;
  }
  async candidates(date:string) {
    return z.object({candidates:z.array(z.object({residentId:z.uuid(),displayName:z.string().min(1)}))})
      .parse(await this.request("transfer-candidates",{issueDate:date}));
  }
  pending(date:string,lane:ReporterLane) {
    return this.store.database.prepare("SELECT * FROM lingye_daily_reporter_transfers WHERE issue_date=? AND lane=? AND status='prepared'").get(date,lane) as TransferRow|undefined;
  }
  source(date:string,lane:ReporterLane,original:string) {
    const row=this.store.database.prepare(`SELECT replacement_wake_id FROM lingye_daily_reporter_transfers
      WHERE issue_date=? AND lane=? AND status='completed' ORDER BY rowid DESC LIMIT 1`).get(date,lane) as {replacement_wake_id:string}|undefined;
    return row?.replacement_wake_id??original;
  }
  async progress(task:TransferTask) {
    const pending=this.pending(task.issueDate,task.lane);
    const timing=this.store.waiting(task,this.options.now());
    return {...timing,canTransfer:timing.canTransfer&&task.transferable!==false,sourceWakeId:pending?.source_wake_id??task.sourceWakeId,
      residentId:pending?.previous_resident_id??task.residentId,pendingTransfer:pending?{requestId:pending.request_id,targetResidentId:pending.target_resident_id}:null};
  }
  assertResend(task:ReporterAssignment) {
    if(reporterTransferPending(this.store.database,task.issueDate,task.lane))throw new DailyEditorError(409,"这份任务正在转交，请先完成转交。");
    if(!this.store.waiting(task,this.options.now()).canResend)throw new DailyEditorError(409,"上一封铃尚未发出或发出后还未满10分钟，请稍后再补发。");
  }
  async transfer(date:string,lane:ReporterLane,sourceWakeId:string,targetResidentId:string,requestId:string,accountId:string) {
    const db=this.store.database;
    let row=db.prepare("SELECT * FROM lingye_daily_reporter_transfers WHERE request_id=?").get(requestId) as TransferRow|undefined;
    if(row) {
      if(row.issue_date!==date||row.lane!==lane||row.source_wake_id!==sourceWakeId||row.target_resident_id!==targetResidentId)
        throw new DailyEditorError(409,"这次转交请求与已保存的选择不一致。");
      if(row.status==='failed')throw new DailyEditorError(409,"这次转交未成立，请刷新后重新选择。");
      if(row.status==='completed') {this.options.notify(targetResidentId);return {transferred:true};}
    } else {
      const task=await this.options.current(date,lane);
      db.transaction(()=>{
        if(this.options.editor.row(date).published_version!==null)throw new DailyEditorError(409,"这期已经出版，不能再转交工作。");
        if(task.transferable===false||task.sourceWakeId!==sourceWakeId||task.residentId===targetResidentId||!this.store.waiting(task,this.options.now()).canTransfer)
          throw new DailyEditorError(409,"当前任务尚未满足三次铃各等待10分钟的转交条件，请刷新进度。");
        if(reporterTransferPending(db,date,lane))throw new DailyEditorError(409,"这份任务已经有待完成的转交，请先继续原转交。");
        // Main-owned task submission and this reservation serialize on this connection.
        if(lane==='voice'&&!db.prepare("SELECT 1 FROM lingye_daily_voice_tasks WHERE issue_date=? AND resident_id=? AND body IS NULL").get(date,task.residentId))
          throw new DailyEditorError(409,"记者已提交或任务已变更，不能转交。");
        if(lane==='submissions'&&!db.prepare("SELECT 1 FROM lingye_daily_submission_batches WHERE issue_date=? AND reviewer_resident_id=? AND selected_ids_json IS NULL").get(date,task.residentId))
          throw new DailyEditorError(409,"记者已提交或任务已变更，不能转交。");
        db.prepare(`INSERT INTO lingye_daily_reporter_transfers
          (request_id,issue_date,lane,source_wake_id,previous_resident_id,target_resident_id,requested_by,status,created_at)
          VALUES (?,?,?,?,?,?,?,'prepared',?)`).run(requestId,date,lane,sourceWakeId,task.residentId,targetResidentId,accountId,this.options.now());
      }).immediate();
      row=db.prepare("SELECT * FROM lingye_daily_reporter_transfers WHERE request_id=?").get(requestId) as TransferRow;
    }
    let result:{wake:ReporterRelayWake|null};
    try {
      result=z.object({issueDate:z.literal(date),lane:z.literal(lane),requestId:z.literal(requestId),targetResidentId:z.literal(targetResidentId),
        wake:reporterRelayWakeSchema.nullable()}).parse(await this.request("manual-transfer",{
          issueDate:date,lane,requestId,sourceWakeId,previousResidentId:row.previous_resident_id,targetResidentId}));
      if((lane==='farm')!==!!result.wake||result.wake&&(result.wake.issue_date!==date||result.wake.recipient_resident_id!==targetResidentId))
        throw new DailyEditorError(503,"转交回执暂未核对成功，请继续原转交。");
    } catch(error) {
      if(error instanceof DailyEditorError&&error.status===409)db.prepare("UPDATE lingye_daily_reporter_transfers SET status='failed' WHERE request_id=? AND status='prepared'").run(requestId);
      throw error;
    }
    db.transaction(()=>{
      const current=db.prepare("SELECT status FROM lingye_daily_reporter_transfers WHERE request_id=?").get(requestId) as {status:string};
      if(current.status==='completed')return;
      if(current.status!=='prepared')throw new DailyEditorError(409,"转交状态已变化，请刷新。");
      const wakeId=result.wake?.wake_id??`daily-editor-transfer:${requestId}`;
      if(lane==='voice') {
        const id=randomUUID();
        db.prepare(`UPDATE lingye_daily_voice_tasks SET resident_id=?,author=?,read_option=?,submit_option=?,submission_id=?,dispatched_at=?
          WHERE issue_date=? AND body IS NULL`).run(targetResidentId,this.options.name(targetResidentId),`daily-voice:read:${id}`,
            `daily-voice:submit:${id}`,`daily-voice:${date}:${id}`,this.options.now(),date);
      } else if(lane==='submissions') {
        db.prepare("UPDATE lingye_daily_submission_batches SET reviewer_resident_id=?,option_id=? WHERE issue_date=? AND selected_ids_json IS NULL")
          .run(targetResidentId,`opt_${randomBytes(9).toString("base64url")}`,date);
      }
      this.options.persistTransferred(date,lane,wakeId,result.wake);
      db.prepare(`UPDATE bell_wakes SET status='cancelled',ended_at=? WHERE status='pending' AND resident_id=?
        AND (wake_id=? OR wake_id IN (SELECT wake_id FROM lingye_daily_editor_resends WHERE issue_date=? AND lane=? AND source_wake_id=?))`)
        .run(this.options.now(),row!.previous_resident_id,sourceWakeId,date,lane,sourceWakeId);
      db.prepare("UPDATE lingye_daily_reporter_transfers SET status='completed',replacement_wake_id=?,completed_at=? WHERE request_id=?")
        .run(wakeId,this.options.now(),requestId);
    }).immediate();
    this.options.notify(targetResidentId);
    return {transferred:true};
  }
}

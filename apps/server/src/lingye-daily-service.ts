import { timingSafeEqual } from "node:crypto";
import type { LingyeDailyPublishRequest, ReporterRelayWake } from "@doorbell/protocol";
import { lingyeDailyReporterArticleSchema, type DailyDocument } from "@doorbell/protocol";
import { LingyeDailyEditorStore, DailyEditorError, type DailyEditorPublisher } from "./lingye-daily-editor-store.js";
import type { DailyEditorPublicationRewardSender, DailySubmissionRewardSender } from "./lingye-daily-reward-client.js";
import type { ReporterRelayStarter } from "./reporter-relay-farm-client.js";
import type { ReporterRelayService } from "./reporter-relay-service.js";
import type { LingyeDailyWeatherReader } from "./lingye-daily-weather.js";
import type {
  CommunityDatabase,
  LingyeDailyIssueRecord,
  LingyeDailyPublishResult,
} from "./community-database.js";

export interface LingyeDailyServiceOptions {
  database: CommunityDatabase;
  publishToken: string;
  now?: () => number;
  submissionRewards?: DailySubmissionRewardSender;
  editorRewards?:DailyEditorPublicationRewardSender;
  reporterFlow?:Pick<ReporterRelayStarter,"pendingIssue">;
  reporterRelay?:Pick<ReporterRelayService,"createResentFarmWake"|"createResentSubmissionWake"|"notifyResentWake">;
  weather?: LingyeDailyWeatherReader;
  farm?: {apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch};
}

export class LingyeDailyPublishAuthenticationError extends Error {
  constructor() {
    super("A valid Lingye Daily publish credential is required");
    this.name = "LingyeDailyPublishAuthenticationError";
  }
}

function credentialsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerCredential(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const credential = authorization.slice("Bearer ".length);
  return credential.length > 0 ? credential : undefined;
}

export class LingyeDailyService {
  readonly editor: LingyeDailyEditorStore;
  readonly #farm: LingyeDailyServiceOptions["farm"];
  readonly #database: CommunityDatabase;
  readonly #publishToken: string;
  readonly #now: () => number;
  readonly #submissionRewards: DailySubmissionRewardSender | undefined;
  readonly #editorRewards:DailyEditorPublicationRewardSender|undefined;
  readonly #reporterFlow:LingyeDailyServiceOptions["reporterFlow"];
  readonly #reporterRelay:LingyeDailyServiceOptions["reporterRelay"];
  readonly #weather: LingyeDailyWeatherReader | undefined;

  constructor(options: LingyeDailyServiceOptions) {
    this.#database = options.database;
    this.#publishToken = options.publishToken;
    this.#now = options.now ?? Date.now;
    this.#submissionRewards = options.submissionRewards;
    this.#editorRewards=options.editorRewards;
    this.#reporterFlow=options.reporterFlow;
    this.#reporterRelay=options.reporterRelay;
    this.#weather = options.weather;
    this.editor=new LingyeDailyEditorStore(options.database.lingyeDailyStore.database);
    this.#farm=options.farm;
  }

  authorize(authorization: string | undefined): void {
    const credential = readBearerCredential(authorization);
    if (!credential || !credentialsEqual(credential, this.#publishToken)) {
      throw new LingyeDailyPublishAuthenticationError();
    }
  }

  async publish(
    authorization: string | undefined,
    input: LingyeDailyPublishRequest,
  ): Promise<LingyeDailyPublishResult> {
    this.authorize(authorization);
    throw new DailyEditorError(403,"自动出版已关闭，请在主编工作台确认后出版。");
  }

  stage(authorization:string|undefined,input:LingyeDailyPublishRequest) {
    this.authorize(authorization);
    this.editor.receive(input,this.#now());
    return {saved:true,published:false,issue_date:input.issue_date};
  }

  async refreshDraft(date:string) {
    const row=this.editor.row(date);
    if(row.published_version!==null) return this.editor.get(date);
    const edition=JSON.parse(row.edition_json);
    const arrivals:Promise<unknown>[]=[];
    if(!edition.reporter_articles.length) arrivals.push((async()=>{
      const payload=await this.farmRequest("publication",{issue_date:date});
      if(payload.issue_date!==date || !["pending","ready"].includes(String(payload.status)))
        throw new DailyEditorError(502,"记者来稿读取回执不匹配，原稿未修改。");
      if(payload.status==="ready") {
        const {scheduled_publication_at,...candidate}=payload.publication as Record<string,unknown>;
        const article=lingyeDailyReporterArticleSchema.parse({...candidate,published_at:scheduled_publication_at});
        this.editor.merge(date,{reporter_articles:[article]},["farm"],this.#now());
      }
    })());
    if(edition.submission_reviewer===undefined && this.editor.reviewReady(date)) {
      this.editor.merge(date,{submissions:this.editor.daily.selectedSubmissions(date),
        submission_reviewer:this.editor.daily.submissionReviewer(date)?.display_name ?? null},["submissions"],this.#now());
    }
    if(edition.weather_forecast===undefined && this.#weather) arrivals.push((async()=>{
      this.editor.merge(date,{weather_forecast:await this.#weather!.read(date)},["weather"],this.#now());
    })());
    // Each source is persisted independently. A failed farm read must not
    // discard already completed anonymous selection or weather for this issue.
    const results=await Promise.allSettled(arrivals);
    const failure=results.find((result):result is PromiseRejectedResult=>result.status==="rejected");
    if(failure) throw failure.reason;
    return this.editor.get(date);
  }

  saveDraft(date:string,version:number,document:DailyDocument,account:string) {
    return this.editor.save(date,version,document,account,this.#now());
  }

  async publishDraft(date:string,version:number,publisher:DailyEditorPublisher) {
    const result=this.editor.publish(date,version,publisher,this.#now());
    const row=this.editor.row(date);
    if(!row.publication_synced) {
      try {
      const edition=JSON.parse(row.edition_json);
      const published=this.editor.database.prepare("SELECT published_at FROM lingye_daily_issues WHERE issue_date=?").get(date) as {published_at:number};
      const publishedAt=new Date(published.published_at).toISOString();
      // Farm finalizes/cancels the frozen roster when publication is confirmed.
      // Record real anonymous work first, including for historical three-role
      // issues. Both RPCs are idempotent if a confirmation is lost.
      const review=this.editor.daily.completedSubmissionReview(date);
      if(review) {
        if(!this.#submissionRewards) throw new DailyEditorError(503,"投稿审批绩效服务未配置。");
        await this.#submissionRewards.recordReview(review);
      }
      for(const article of edition.reporter_articles) {
        const ack=await this.farmRequest("published",{issue_date:date,publication_id:article.publication_id,published_at:publishedAt});
        if(ack.issue_date!==date||ack.publication_id!==article.publication_id||ack.published_at!==publishedAt||!["published","already_published"].includes(String(ack.status)))
          throw new DailyEditorError(502,"正文已出版，记者结算确认尚未完成；再次点出版即可继续，不会重复出版。");
      }
      this.editor.database.prepare("UPDATE lingye_daily_editor_drafts SET publication_synced=1 WHERE issue_date=? AND published_version=?")
        .run(date,version);
      } catch {
        throw new DailyEditorError(502,"正文已出版，记者结算确认尚未完成；再次点出版即可继续，不会重复出版。");
      }
    }
    const reward=this.editor.pendingPublicationReward(date);
    if(reward) {
      if(!this.#editorRewards) throw new DailyEditorError(503,"日报已出版，出版审稿奖金暂未到账，请重试出版确认。");
      try {
        const receipt=await this.#editorRewards.rewardEditorPublication(reward);
        this.editor.markPublicationRewardPaid(date,receipt,this.#now());
      } catch {
        throw new DailyEditorError(503,"日报已出版，出版审稿奖金暂未到账，请重试出版确认。");
      }
    }
    return {published:true,...result,draft:this.editor.get(date)};
  }

  private reporterName(residentId:string) {
    const name=this.#database.findActiveHumanCommunityByResidentId(residentId)?.resident.residentName;
    return name?.includes(" & ") ? name.slice(name.lastIndexOf(" & ")+3) : name ?? "当班记者";
  }

  async editorProgress(date:string) {
    const draft=this.editor.get(date);let farmWake:ReporterRelayWake|null=null;let farmUnavailable=false;
    if(this.#reporterFlow) {
      try {farmWake=await this.#reporterFlow.pendingIssue(date);} catch {farmUnavailable=true;}
    } else farmUnavailable=true;
    const stageLabels={selection:"等待选题",writing:"等待撰稿",review:"等待农场稿审稿",supplement:"等待修改稿"} as const;
    const farm=farmWake ? {lane:"farm" as const,status:"pending" as const,label:stageLabels[farmWake.stage],
      reporterName:this.reporterName(farmWake.recipient_resident_id),resendable:true} :
      farmUnavailable ? {lane:"farm" as const,status:"unavailable" as const,label:"农场稿进度暂时无法读取",resendable:false} :
      draft.readiness.reporter ? {lane:"farm" as const,status:"completed" as const,label:"农场稿已到工作台",resendable:false} :
      {lane:"farm" as const,status:"not_started" as const,label:"农场稿尚未派发",resendable:false};
    const submission=this.editor.daily.submissionReviewStatus(date);
    const submissions=submission.status==="pending" ? {lane:"submissions" as const,status:"pending" as const,
      label:"等待匿名投稿审稿",reporterName:this.reporterName(submission.review.reviewerResidentId),resendable:true} :
      submission.status==="completed" ? {lane:"submissions" as const,status:"completed" as const,label:"匿名投稿已审",resendable:false} :
      submission.status==="empty" ? {lane:"submissions" as const,status:"empty" as const,label:"本期没有待审投稿",resendable:false} :
      {lane:"submissions" as const,status:"not_started" as const,label:"匿名投稿尚未派发",resendable:false};
    return {issueDate:date,lanes:[farm,submissions]};
  }

  async resendEditorWake(date:string,lane:"farm"|"submissions",requestId:string,accountId:string) {
    if(!this.#reporterRelay) throw new DailyEditorError(503,"补发铃服务暂时无法连接。");
    const replay=this.editor.resendByRequest(requestId);
    if(replay) {
      if(replay.issue_date!==date||replay.lane!==lane||replay.requested_by!==accountId)
        throw new DailyEditorError(409,"这次补发请求与原记录不一致。");
      this.#reporterRelay.notifyResentWake(replay.recipient_resident_id);
      return {status:"already_sent" as const,lane,reporterName:this.reporterName(replay.recipient_resident_id)};
    }
    let sourceWakeId:string,recipientResidentId:string,persist:(wakeId:string)=>"created"|"duplicate";
    if(lane==="farm") {
      if(!this.#reporterFlow) throw new DailyEditorError(503,"农场记者进度暂时无法读取。");
      const wake=await this.#reporterFlow.pendingIssue(date);
      if(!wake) throw new DailyEditorError(409,"当前没有可补发的农场记者任务。");
      sourceWakeId=wake.wake_id;recipientResidentId=wake.recipient_resident_id;
      persist=wakeId=>this.#reporterRelay!.createResentFarmWake(wake,wakeId).status;
    } else {
      const status=this.editor.daily.submissionReviewStatus(date);
      if(status.status!=="pending") throw new DailyEditorError(409,"当前没有可补发的匿名投稿审稿任务。");
      sourceWakeId=`daily-submissions:${date}`;recipientResidentId=status.review.reviewerResidentId;
      persist=wakeId=>this.#reporterRelay!.createResentSubmissionWake(status.review,wakeId).status;
    }
    const result=this.editor.createResend({requestId,issueDate:date,lane,sourceWakeId,recipientResidentId,
      requestedBy:accountId,now:this.#now()},persist);
    this.#reporterRelay.notifyResentWake(result.recipientResidentId);
    return {status:result.status,lane,reporterName:this.reporterName(result.recipientResidentId)};
  }

  async rewardSubmissions(date:string,ids:string[],account:string) {
    if(!this.#submissionRewards) throw new DailyEditorError(503,"奖金发放服务未配置。");
    const pending=this.editor.requestRewards(date,ids,account,this.#now());
    for(const item of pending) {
      await this.#submissionRewards.reward({issueDate:date,submissionId:item.submission_id,residentId:item.resident_id});
      this.editor.markPaid(item.submission_id,this.#now());
    }
    return this.editor.get(date);
  }

  private async farmRequest(operation:"publication"|"published",body:Record<string,string>):Promise<Record<string,unknown>> {
    if(!this.#farm) throw new DailyEditorError(503,"记者来稿服务未配置。");
    const base=new URL(this.#farm.apiBaseUrl);
    if(!base.pathname.endsWith("/")) base.pathname+="/";
    const response=await (this.#farm.fetchImplementation ?? fetch)(new URL(`internal/doorbell/lingye-daily/reporter-relay/${operation}`,base),{
      method:"POST",headers:{authorization:`Bearer ${this.#farm.serviceToken}`,"content-type":"application/json"},
      body:JSON.stringify(body),signal:AbortSignal.timeout(this.#farm.requestTimeoutMs),
    });
    const result=await response.json() as {ok?:boolean;data?:Record<string,unknown>};
    if(!response.ok||result.ok!==true||!result.data) throw new DailyEditorError(502,"记者服务暂未确认，已保存的正文不会丢失。");
    return result.data;
  }

  getLatest(): LingyeDailyIssueRecord | undefined {
    return this.#database.getLatestLingyeDailyIssue();
  }

  getPublishedImage(issueDate:string,revision:number,imageId:string) {
    return this.#database.lingyeDailyStore.getPublishedImage(issueDate,revision,imageId,this.#now());
  }

  get humanBulletinStore() {
    return this.#database.humanBulletinStore;
  }
}

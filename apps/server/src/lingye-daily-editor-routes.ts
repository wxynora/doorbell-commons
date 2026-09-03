import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { dailyDocumentSchema, lingyeDailyPublishRequestSchema } from "@doorbell/protocol";
import type { RegistrationAuthService } from "./registration-auth.js";
import type { HumanCommunityRecord } from "./community-database.js";
import { readHumanSessionToken } from "./session-cookie.js";
import { DailyEditorError } from "./lingye-daily-editor-store.js";
import { LingyeDailyPublishAuthenticationError, type LingyeDailyService } from "./lingye-daily-service.js";

export function registerDailyEditorRoutes(app:FastifyInstance, options:{daily:LingyeDailyService;auth:RegistrationAuthService}) {
  const {daily,auth}=options;
  const authorize=async(request:FastifyRequest)=>{
    const token=readHumanSessionToken(request.headers.cookie);
    if(!token) throw new DailyEditorError(401,"请先登录社区。");
    const community=await auth.getCurrentSession(token);
    if(request.method!=="GET" && request.headers.origin) {
      if(new URL(request.headers.origin).host!==request.headers.host) throw new DailyEditorError(403,"请从社区工作台提交修改。");
    }
    return community;
  };
  const handle=(action:(request:FastifyRequest,community:HumanCommunityRecord)=>unknown|Promise<unknown>)=>async(request:FastifyRequest,reply:FastifyReply)=>{
    reply.header("cache-control","no-store");
    try{return await action(request,await authorize(request));}
    catch(error){
      if(error instanceof DailyEditorError) return reply.code(error.status).send({error:{message:error.message}});
      if(error instanceof z.ZodError) return reply.code(400).send({error:{message:"提交内容格式不完整，请重新打开工作台后重试。"}});
      if(error instanceof Error && ["AuthenticationRequiredError","QqNotGroupMemberError","RegistrationProfileRequiredError"].includes(error.name))
        return reply.code(403).send({error:{message:"登录或社区资格已失效，请重新登录。"}});
      request.log.error({error_name:error instanceof Error?error.name:"UnknownError"},"Daily editor request failed");
      return reply.code(503).send({error:{message:"本次操作未能完成，已保存的内容会保留，请重试。"}});
    }
  };
  const date=(request:FastifyRequest)=>z.object({date:z.iso.date()}).parse(request.params).date;
  app.get("/api/lingye-daily/editor/access",handle(()=>({allowed:true})));
  app.get("/api/lingye-daily/editor/issues",handle(()=>{
    const latest=daily.getLatest();if(latest)daily.editor.seedPublished(latest,Date.now());
    return {issues:daily.editor.list()};
  }));
  app.get("/api/lingye-daily/editor/issues/:date",handle(request=>daily.editor.get(date(request))));
  app.post("/api/lingye-daily/editor/issues/:date/refresh",handle(request=>daily.refreshDraft(date(request))));
  app.put("/api/lingye-daily/editor/issues/:date",{bodyLimit:8*1024*1024},handle((request,community)=>{
    const body=z.object({version:z.number().int().positive(),document:dailyDocumentSchema}).strict().parse(request.body);
    return daily.saveDraft(date(request),body.version,body.document,community.account.accountId);
  }));
  app.post("/api/lingye-daily/editor/issues/:date/publish",handle((request,community)=>{
    const body=z.object({version:z.number().int().positive()}).strict().parse(request.body);
    return daily.publishDraft(date(request),body.version,{accountId:community.account.accountId,
      profileId:community.profileId,residentId:community.resident.residentId,residentName:community.resident.residentName});
  }));
  app.post("/api/lingye-daily/editor/issues/:date/rewards",handle((request,community)=>{
    const body=z.object({submissionIds:z.array(z.string().min(1)).min(1)}).strict().parse(request.body);
    return daily.rewardSubmissions(date(request),body.submissionIds,community.account.accountId);
  }));
  app.get("/api/lingye-daily/editor/issues/:date/progress",handle(request=>daily.editorProgress(date(request))));
  app.post("/api/lingye-daily/editor/issues/:date/resend",handle((request,community)=>{
    const body=z.object({lane:z.enum(["farm","submissions"]),requestId:z.uuid()}).strict().parse(request.body);
    return daily.resendEditorWake(date(request),body.lane,body.requestId,community.account.accountId);
  }));
  // The pre-existing machine delivery URL now saves a draft, never a public issue.
  app.post("/api/internal/lingye-daily/issues",{bodyLimit:8*1024*1024},async(request,reply)=>{
    reply.header("cache-control","no-store");
    try{return daily.stage(request.headers.authorization,lingyeDailyPublishRequestSchema.parse(request.body));}
    catch(error){
      if(error instanceof LingyeDailyPublishAuthenticationError)return reply.code(401).send({error:{message:"Authentication required"}});
      if(error instanceof z.ZodError)return reply.code(400).send({error:{message:"Invalid daily draft"}});
      throw error;
    }
  });
}

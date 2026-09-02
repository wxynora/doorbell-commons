import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {z} from "zod";
import {AuthenticationRequiredError, QqNotGroupMemberError, RegistrationProfileRequiredError, type RegistrationAuthService} from "./registration-auth.js";
import {OneBotUnavailableError} from "./qq-group-membership.js";
import {readHumanSessionToken, serializeClearedHumanSessionCookie} from "./session-cookie.js";
import type {HumanBulletinStore} from "./human-bulletin-store.js";

export function registerHumanBulletinRoutes(app: FastifyInstance, options: {
  store: HumanBulletinStore; registrationAuth: Pick<RegistrationAuthService,"getCurrentSession">; secureCookies: boolean;
}) {
  async function handle(request: FastifyRequest, reply: FastifyReply, acknowledge: boolean) {
    reply.header("cache-control","no-store");
    const query=z.strictObject({}).safeParse(request.query);
    const body=acknowledge?z.strictObject({ids:z.array(z.string().min(1))}).safeParse(request.body):null;
    if(!query.success || (acknowledge && !body?.success) || (!acknowledge && request.body!==undefined))
      return reply.code(400).send({error:{code:"invalid_request",message:"通知请求格式不正确。"}});
    const token=readHumanSessionToken(request.headers.cookie);
    if(!token) return reply.code(401).send({error:{code:"authentication_required",message:"请先登录。"}});
    try {
      const current=await options.registrationAuth.getCurrentSession(token);
      if(body?.success) options.store.acknowledge(current.account.accountId,body.data.ids);
      return {notices:options.store.unread(current.account.accountId)};
    } catch(error) {
      if(error instanceof AuthenticationRequiredError) return reply.code(401).send({error:{code:"authentication_required",message:"请先登录。"}});
      if(error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie",serializeClearedHumanSessionCookie(options.secureCookies));
        return reply.code(403).send({error:{code:"qq_not_group_member",message:"当前账号没有社区访问资格。"}});
      }
      if(error instanceof RegistrationProfileRequiredError) return reply.code(409).send({error:{code:"registration_profile_required",message:"请先完成社区注册。"}});
      if(error instanceof OneBotUnavailableError) return reply.code(503).send({error:{code:"onebot_unavailable",message:"暂时无法确认社区资格。"}});
      throw error;
    }
  }
  app.get("/api/human-bulletin",(request,reply)=>handle(request,reply,false));
  app.post("/api/human-bulletin/ack",(request,reply)=>handle(request,reply,true));
}

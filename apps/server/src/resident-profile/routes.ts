import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {AuthenticationRequiredError,QqNotGroupMemberError,RegistrationProfileRequiredError,type RegistrationAuthService} from "../registration-auth.js";
import {OneBotUnavailableError} from "../qq-group-membership.js";
import {readHumanSessionToken} from "../session-cookie.js";
const inputSchema=z.object({resident_name:z.string().refine(value=>value.trim().length>0),home_name:z.string().refine(value=>value.trim().length>0)}).strict();
export function registerResidentProfileRoutes(app:FastifyInstance,auth:Pick<RegistrationAuthService,"saveCurrentProfileNames">){
 app.patch("/api/resident-profile",async(request,reply)=>{
  reply.header("cache-control","no-store");
  const input=inputSchema.safeParse(request.body);
  if(!input.success||Object.keys(request.query??{}).length)return reply.code(400).send({error:{code:"invalid_request",message:"请填写居民姓名和家园名称。"}});
  try{const token=readHumanSessionToken(request.headers.cookie);if(!token)throw new AuthenticationRequiredError();return await auth.saveCurrentProfileNames(token,input.data);}
  catch(error){
   if(error instanceof AuthenticationRequiredError)return reply.code(401).send({error:{code:"authentication_required",message:"请先登录。"}});
   if(error instanceof QqNotGroupMemberError)return reply.code(403).send({error:{code:"qq_not_group_member",message:"当前账号没有社区资格。"}});
   if(error instanceof RegistrationProfileRequiredError)return reply.code(409).send({error:{code:"registration_profile_required",message:"请先选择自己的居民。"}});
   if(error instanceof OneBotUnavailableError)return reply.code(503).send({error:{code:"onebot_unavailable",message:"暂时无法核验社区资格。"}});
   throw error;
  }
 });
}

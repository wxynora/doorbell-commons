import type {FastifyInstance} from 'fastify';
import {residentAvatarSaveSchema} from '@doorbell/protocol';
import {AvatarRevisionConflict} from './store.js';
import {AuthenticationRequiredError,QqNotGroupMemberError,RegistrationProfileRequiredError,type RegistrationAuthService} from '../registration-auth.js';
import {OneBotUnavailableError} from '../qq-group-membership.js';
import {readHumanSessionToken} from '../session-cookie.js';
export function registerResidentAvatarRoutes(app:FastifyInstance,options:{registrationAuth:Pick<RegistrationAuthService,'readCurrentResidentAvatar'|'saveCurrentResidentAvatar'>}){
 const handle=(write:boolean)=>(async(request:any,reply:any)=>{
  reply.header('cache-control','no-store');
  const parsed=write?residentAvatarSaveSchema.safeParse(request.body):null;
  if(Object.keys(request.query??{}).length||(write&&!parsed?.success))return reply.code(400).send({error:{code:'invalid_request',message:'请检查形象选项。'}});
  try{
   const token=readHumanSessionToken(request.headers.cookie);if(!token)throw new AuthenticationRequiredError();
   return write&&parsed?.success?await options.registrationAuth.saveCurrentResidentAvatar(token,parsed.data):await options.registrationAuth.readCurrentResidentAvatar(token,request.params?.residentId);
  }catch(error){
   if(error instanceof AuthenticationRequiredError)return reply.code(401).send({error:{code:'authentication_required',message:'请先登录。'}});
   if(error instanceof QqNotGroupMemberError)return reply.code(403).send({error:{code:'qq_not_group_member',message:'当前账号没有社区资格。'}});
   if(error instanceof RegistrationProfileRequiredError)return reply.code(409).send({error:{code:'registration_profile_required',message:'请先选择自己的居民。'}});
   if(error instanceof OneBotUnavailableError)return reply.code(503).send({error:{code:'onebot_unavailable',message:'暂时无法核验社区资格。'}});
   if(error instanceof AvatarRevisionConflict)return reply.code(409).send({error:{code:'avatar_revision_conflict',message:'形象或当前居民已变更，请重新打开试衣间。'}});
   throw error;
  }
 });
 app.get('/api/resident-avatar',handle(false));
 app.get('/api/residents/:residentId/avatar',handle(false));
 app.put('/api/resident-avatar',handle(true));
}

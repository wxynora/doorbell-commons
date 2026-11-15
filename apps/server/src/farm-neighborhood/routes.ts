import type {FastifyInstance} from 'fastify';
import type {CommunityDatabase} from '../community-database.js';
import {AuthenticationRequiredError,QqNotGroupMemberError,RegistrationProfileRequiredError,type RegistrationAuthService} from '../registration-auth.js';
import {OneBotUnavailableError} from '../qq-group-membership.js';
import {readHumanSessionToken} from '../session-cookie.js';
import {loungeDisplayName} from '../lounge-display-name.js';
import {FarmNeighborhoodClient,NeighborhoodError} from './client.js';
export function registerFarmNeighborhoodRoutes(app:FastifyInstance,options:{auth:Pick<RegistrationAuthService,'getCurrentSessionWithMembership'>;database:Pick<CommunityDatabase,'listActiveHumanCommunities'|'findActiveHumanCommunityByResidentId'>;client:FarmNeighborhoodClient}){
 for(const path of ['/api/farm/neighborhood','/api/farm/neighborhood/:residentId/layout'])app.get(path,async(request,reply)=>{
  reply.header('cache-control','no-store');
  try{
   if(Object.keys(request.query??{}).length)return reply.code(400).send({error:{code:'invalid_request',message:'请求格式不正确。'}});
   const token=readHumanSessionToken(request.headers.cookie);if(!token)throw new AuthenticationRequiredError();
   const actor=await options.auth.getCurrentSessionWithMembership(token);
   if(!actor.farmBinding.farmHumanKey)throw new RegistrationProfileRequiredError();
   const binding={farmDoorplate:actor.farmBinding.farmDoorplate,farmHumanKey:actor.farmBinding.farmHumanKey};
   const residentId=(request.params as {residentId?:string}).residentId;
   if(residentId){
    const target=options.database.findActiveHumanCommunityByResidentId(residentId);if(!target)throw new NeighborhoodError(404,'farm_not_found','没有找到这家农场。');
    const data=await options.client.read(binding,{action:'layout',target:target.farmBinding.farmDoorplate});
    if('homes' in data||data.doorplate!==target.farmBinding.farmDoorplate)throw new NeighborhoodError(502,'upstream_contract_unavailable','农场布置与门牌不匹配。');
    return data;
   }
   const residents=options.database.listActiveHumanCommunities();
   const data=await options.client.read(binding,{action:'overview',doorplates:[...new Set(residents.map(r=>r.farmBinding.farmDoorplate))]});
   if(!('homes' in data))throw new NeighborhoodError(502,'upstream_contract_unavailable','居民区数据暂时无法识别。');
   const byDoorplate=new Map(data.homes.map(h=>[h.doorplate,h]));
   return {homes:residents.flatMap(r=>{const h=byDoorplate.get(r.farmBinding.farmDoorplate);return h?[{...h,residentId:r.resident.residentId,name:loungeDisplayName(r.resident.residentName)}]:[];})};
  }catch(error){
   if(error instanceof NeighborhoodError)return reply.code(error.status).send({error:{code:error.code,message:error.message}});
   if(error instanceof AuthenticationRequiredError)return reply.code(401).send({error:{code:'authentication_required',message:'请先登录。'}});
   if(error instanceof QqNotGroupMemberError)return reply.code(403).send({error:{code:'qq_not_group_member',message:'当前账号没有社区资格。'}});
   if(error instanceof RegistrationProfileRequiredError)return reply.code(409).send({error:{code:'registration_profile_required',message:'请先完成农场绑定。'}});
   if(error instanceof OneBotUnavailableError)return reply.code(503).send({error:{code:'onebot_unavailable',message:'暂时无法核验社区资格。'}});
   throw error;
  }
 });
}

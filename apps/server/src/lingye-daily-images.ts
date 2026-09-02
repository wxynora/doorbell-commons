import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {type LingyeDailyService} from "./lingye-daily-service.js";
import {AuthenticationRequiredError,QqNotGroupMemberError,RegistrationProfileRequiredError,type RegistrationAuthService} from "./registration-auth.js";
import {OneBotUnavailableError} from "./qq-group-membership.js";
import {readHumanSessionToken} from "./session-cookie.js";

export function dailyImageUrl(issueDate:string, revision:number, imageId:string) {
  return `/api/lingye-daily/${encodeURIComponent(issueDate)}/images/${encodeURIComponent(imageId)}?revision=${revision}`;
}

export function registerDailyImageRoutes(app:FastifyInstance, options:{daily: LingyeDailyService; registrationAuth:RegistrationAuthService}) {
  app.get("/api/lingye-daily/:issueDate/images/:imageId",async(request,reply)=>{
    reply.header("cache-control","private, no-store");
    const params=z.strictObject({issueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),imageId:z.string().min(1)}).safeParse(request.params);
    const query=z.strictObject({revision:z.coerce.number().int().positive()}).safeParse(request.query);
    if(!params.success||!query.success) return reply.code(400).send();
    const token=readHumanSessionToken(request.headers.cookie);
    if(!token) return reply.code(401).send();
    try {
      await options.registrationAuth.getCurrentSession(token);
      const image=options.daily.getPublishedImage(params.data.issueDate,query.data.revision,params.data.imageId);
      if(!image) return reply.code(404).send();
      reply.header("x-content-type-options","nosniff");
      return reply.type(image.mediaType).send(Buffer.from(image.dataBase64,"base64"));
    } catch(error) {
      if(error instanceof AuthenticationRequiredError) return reply.code(401).send();
      if(error instanceof QqNotGroupMemberError) return reply.code(403).send();
      if(error instanceof RegistrationProfileRequiredError) return reply.code(409).send();
      if(error instanceof OneBotUnavailableError) return reply.code(503).send();
      throw error;
    }
  });
}

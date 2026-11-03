import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { DailyFarmService } from "./service.js";
export function registerDailyFarmRoutes(app:FastifyInstance,options:{service:DailyFarmService;
  authorize:(authorization:string|undefined)=>void;onSaved?:(date:string)=>Promise<void>}) {
  const route=(action:(request:FastifyRequest)=>Promise<unknown>|unknown)=>async(request:FastifyRequest,reply:FastifyReply)=>{
    reply.header("cache-control","no-store");
    try {options.authorize(request.headers.authorization);}catch{return reply.code(401).send({error:{code:"authentication_required"}});}
    try{return await action(request);}catch(error){
      const code=error instanceof z.ZodError?400:503;
      request.log.error({error_name:error instanceof Error?error.message:"UnknownError"},"Farm manuscript request failed");
      return reply.code(code).send({error:{code:code===400?"invalid_request":"farm_manuscript_unavailable"}});
    }
  };
  app.get("/api/internal/lingye-daily/farm-source",route(request=>options.service.sources(z.strictObject({issue_date:z.iso.date()}).parse(request.query).issue_date)));
  app.post("/api/internal/lingye-daily/farm-manuscript",route(async request=>{
    const saved=options.service.receive(request.body);await options.onSaved?.(saved.issue_date);return saved;
  }));
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { lingyeDailySectionCommentsSuccessSchema } from "@doorbell/protocol";
import { readHumanSessionToken } from "./session-cookie.js";
import { AuthenticationRequiredError, QqNotGroupMemberError, type RegistrationAuthService } from "./registration-auth.js";
import { dailyCommentErrorText, type LingyeDailyCommentsService } from "./lingye-daily-comments-service.js";

export function registerDailyCommentRoutes(app:FastifyInstance,options:{comments:LingyeDailyCommentsService;auth:RegistrationAuthService}) {
  const params = z.object({date:z.iso.date(),section:z.string()}).strict();
  const handler = async (request:FastifyRequest,reply:FastifyReply) => {
    reply.header("cache-control","no-store");
    try {
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) throw new AuthenticationRequiredError();
      const session = await options.auth.getCurrentSession(token);
      if (request.method === "POST" && request.headers.origin && new URL(request.headers.origin).host !== request.headers.host)
        return reply.code(403).send({error:{code:"invalid_request",message:"Origin mismatch"}});
      const {date,section} = params.parse(request.params);
      if (request.method === "POST") {
        const {text} = z.object({text:z.string()}).strict().parse(request.body);
        await options.comments.submitHuman(session.account.accountId,{issueDate:date,section,text});
      }
      return lingyeDailySectionCommentsSuccessSchema.parse(options.comments.list(date,section));
    } catch (error) {
      if (error instanceof AuthenticationRequiredError || error instanceof QqNotGroupMemberError)
        return reply.code(401).send({error:{code:"authentication_required",message:"请先登录社区。"}});
      if (error instanceof z.ZodError)
        return reply.code(400).send({error:{code:"invalid_request",message:"Invalid comment request"}});
      const message = dailyCommentErrorText(error);
      if (message) return reply.code(400).send({error:{code:"invalid_request",message}});
      request.log.error({errorName:error instanceof Error ? error.name : "UnknownError"},"Daily comment request failed");
      return reply.code(503).send({error:{code:"service_unavailable",message:"评论暂时无法处理，请重试。"}});
    }
  };
  const path = "/api/lingye-daily/issues/:date/sections/:section/comments";
  app.get(path,handler);
  app.post(path,handler);
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { farmLayoutShareLookupSchema } from "@doorbell/protocol";
import { FarmDecorationError } from "../farm-decoration-client.js";
import { AuthenticationRequiredError, QqNotGroupMemberError, RegistrationProfileRequiredError, type RegistrationAuthService } from "../registration-auth.js";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";

export function registerFarmLayoutShareRoutes(app: FastifyInstance, options: {
  registrationAuth: Pick<RegistrationAuthService, "createCurrentFarmLayoutShare" | "readCurrentFarmLayoutShare">;
  secureCookies: boolean;
}) {
  for (const lookup of [false, true]) app.post(`/api/farm/decorations/shares${lookup ? "/lookup" : ""}`, async (request, reply) => {
    reply.header("cache-control", "no-store");
    const body = (lookup ? farmLayoutShareLookupSchema : z.strictObject({})).safeParse(request.body);
    if (!body.success || Object.keys(request.query ?? {}).length) return reply.code(400).send({ error: { code: "invalid_request", message: "请检查布局码格式。" } });
    try {
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) throw new AuthenticationRequiredError();
      const share = lookup
        ? await options.registrationAuth.readCurrentFarmLayoutShare(token, farmLayoutShareLookupSchema.parse(body.data).code)
        : await options.registrationAuth.createCurrentFarmLayoutShare(token);
      if (!share) return reply.code(404).send({ error: { code: "layout_share_not_found", message: "没有找到这个布局码，请核对后再试。" } });
      return share;
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return reply.code(401).send({ error: { code: "authentication_required", message: "请先登录。" } });
      }
      if (error instanceof QqNotGroupMemberError) return reply.code(403).send({ error: { code: "qq_not_group_member", message: "当前账号没有社区资格。" } });
      if (error instanceof OneBotUnavailableError) return reply.code(503).send({ error: { code: "onebot_unavailable", message: "暂时无法核验社区资格。" } });
      if (error instanceof RegistrationProfileRequiredError) return reply.code(409).send({ error: { code: "registration_profile_required", message: "请先完成农场绑定。" } });
      if (error instanceof FarmDecorationError) return reply.code(error.status).send({ error: error.detail });
      throw error;
    }
  });
}

import type { FastifyInstance } from "fastify";
import { boundFarmDecorationLayoutSaveRequestSchema } from "@doorbell/protocol";
import { FarmDecorationError } from "./farm-decoration-client.js";
import { AuthenticationRequiredError, QqNotGroupMemberError, RegistrationProfileRequiredError, type RegistrationAuthService } from "./registration-auth.js";
import { OneBotUnavailableError } from "./qq-group-membership.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "./session-cookie.js";

export function registerFarmDecorationRoutes(app: FastifyInstance, options: {
  registrationAuth: Pick<RegistrationAuthService, "getCurrentFarmDecorations" | "saveCurrentFarmDecorationLayout">;
  secureCookies: boolean;
}) {
  for (const save of [false, true]) app.route({
    method: save ? "POST" : "GET", url: save ? "/api/farm/decorations/layout" : "/api/farm/decorations",
    async handler(request, reply) {
      reply.header("cache-control", "no-store");
      const invalid = () => reply.code(400).send({ error: { code: "invalid_request", message: "装饰请求格式不正确。" } });
      if (request.query && Object.keys(request.query).length) return invalid();
      const parsed = save ? boundFarmDecorationLayoutSaveRequestSchema.safeParse(request.body) : null;
      if (save && !parsed?.success) return invalid();
      const token = readHumanSessionToken(request.headers.cookie);
      try {
        if (!token) throw new AuthenticationRequiredError();
        return save && parsed?.success
          ? await options.registrationAuth.saveCurrentFarmDecorationLayout(token, parsed.data)
          : await options.registrationAuth.getCurrentFarmDecorations(token);
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
    },
  });
}

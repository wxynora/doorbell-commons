import type { FastifyInstance } from "fastify";
import { MidAutumnUpstreamError, midAutumnHumanRequestSchema } from "./mid-autumn-client.js";
import { OneBotUnavailableError } from "./qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
  RegistrationProfileRequiredError,
} from "./registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "./session-cookie.js";

export function registerMidAutumnRoutes(
  app: FastifyInstance,
  options: {
    registrationAuth: Pick<RegistrationAuthService, "executeCurrentMidAutumn">;
    secureCookies: boolean;
  },
) {
  app.post("/api/lingye/mid-autumn", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const errorOut = (status: number, code: string) =>
      reply.code(status).send({ ok: false, error: { code } });
    const parsed = midAutumnHumanRequestSchema.safeParse(request.body);
    if (!parsed.success || Object.keys(request.query as object).length !== 0)
      return errorOut(400, "invalid_request");
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) return errorOut(401, "authentication_required");
    try {
      return await options.registrationAuth.executeCurrentMidAutumn(token, parsed.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError)
        return errorOut(401, "authentication_required");
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return errorOut(403, "qq_not_group_member");
      }
      if (error instanceof RegistrationProfileRequiredError)
        return errorOut(409, "registration_profile_required");
      if (error instanceof OneBotUnavailableError) return errorOut(503, "onebot_unavailable");
      if (error instanceof MidAutumnUpstreamError) return errorOut(error.status, error.code);
      request.log.error({ error_name: "MidAutumnProxyError" }, "Mid-autumn request failed");
      return errorOut(503, "service_unavailable");
    }
  });
}


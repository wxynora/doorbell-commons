import type { FastifyInstance } from "fastify";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  RegistrationProfileRequiredError,
  type RegistrationAuthService,
} from "../registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";
import { HalloweenUpstreamError, type HalloweenHumanClient } from "./client.js";
import { humanHalloweenCommand } from "./contract.js";

export function registerHalloweenRoutes(app: FastifyInstance, options: {
  registrationAuth: Pick<RegistrationAuthService, "getCurrentSession">;
  client: HalloweenHumanClient;
  secureCookies: boolean;
}) {
  app.post("/api/lingye/halloween", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const errorOut = (status: number, code: string) => reply.code(status).send({ ok: false, error: { code } });
    const parsed = humanHalloweenCommand.safeParse(request.body);
    if (!parsed.success || Object.keys(request.query as object).length !== 0)
      return errorOut(400, "invalid_request");
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) return errorOut(401, "authentication_required");

    try {
      const current = await options.registrationAuth.getCurrentSession(token);
      const { farmHumanKey, farmDoorplate } = current.farmBinding;
      if (farmHumanKey === null) return errorOut(409, "registration_profile_required");
      return await options.client.execute({ ...parsed.data, farmHumanKey, farmDoorplate });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) return errorOut(401, "authentication_required");
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return errorOut(403, "qq_not_group_member");
      }
      if (error instanceof RegistrationProfileRequiredError) return errorOut(409, "registration_profile_required");
      if (error instanceof OneBotUnavailableError) return errorOut(503, "onebot_unavailable");
      if (error instanceof HalloweenUpstreamError) return errorOut(error.status, error.code);
      request.log.error({ error_name: "HalloweenProxyError" }, "Halloween request failed");
      return errorOut(503, "service_unavailable");
    }
  });
}

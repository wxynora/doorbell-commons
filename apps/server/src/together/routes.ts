import { type TogetherBoard, togetherBoardResponseSchema } from "@doorbell/protocol";
import type { FastifyInstance } from "fastify";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
  RegistrationProfileRequiredError,
} from "../registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";

export interface TogetherBoardPort {
  readBoard(residentId: string): Promise<TogetherBoard | null>;
}
export function registerTogetherRoutes(
  app: FastifyInstance,
  options: {
    registrationAuth: Pick<RegistrationAuthService, "getCurrentSession">;
    board: TogetherBoardPort;
    secureCookies: boolean;
  },
) {
  app.get("/api/lingye-daily/together", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const error = (status: number, code: string) => reply.code(status).send({ error: { code } });
    if (Object.keys(request.query as object).length) return error(400, "invalid_request");
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) return error(401, "authentication_required");
    try {
      const community = await options.registrationAuth.getCurrentSession(token);
      return togetherBoardResponseSchema.parse({
        board: await options.board.readBoard(community.resident.residentId),
      });
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError)
        return error(401, "authentication_required");
      if (cause instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return error(403, "qq_not_group_member");
      }
      if (cause instanceof RegistrationProfileRequiredError)
        return error(409, "registration_profile_required");
      if (cause instanceof OneBotUnavailableError) return error(503, "onebot_unavailable");
      request.log.error({ error_name: "TogetherBoardReadError" }, "Together board read failed");
      return error(503, "service_unavailable");
    }
  });
}

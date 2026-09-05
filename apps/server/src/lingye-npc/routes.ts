import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { lingyeNpcInteractRequestSchema, lingyeNpcReadRequestSchema } from "@doorbell/protocol";
import { AuthenticationRequiredError, QqNotGroupMemberError, RegistrationProfileRequiredError } from "../registration-auth.js";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import { FarmLingyeContractUnavailableError } from "../farm-lingye-client.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";
import { FarmNpcClientError } from "./farm-client.js";
import { HumanNpcService, type HumanNpcAuth } from "./service.js";

export function registerHumanNpcRoutes(app: FastifyInstance, options: { registrationAuth: HumanNpcAuth; secureCookies: boolean }) {
  const service = new HumanNpcService(options.registrationAuth);
  async function handle(request: FastifyRequest, reply: FastifyReply, interact: boolean) {
    reply.header("cache-control", "no-store");
    const query = lingyeNpcReadRequestSchema.safeParse(request.query);
    const body = interact ? lingyeNpcInteractRequestSchema.safeParse(request.body) : null;
    if (!query.success || (interact && !body?.success) || (!interact && request.body !== undefined)) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "Invalid NPC request" } });
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) return reply.code(401).send({ error: { code: "authentication_required", message: "An active human session is required" } });
    try {
      return body?.success ? await service.interact(token, body.data) : await service.read(token);
    } catch (error) {
      let status = 503;
      let code = "farm_unavailable";
      if (error instanceof AuthenticationRequiredError) { status = 401; code = "authentication_required"; }
      else if (error instanceof QqNotGroupMemberError) {
        status = 403; code = "qq_not_group_member";
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      } else if (error instanceof RegistrationProfileRequiredError) { status = 409; code = "registration_profile_required"; }
      else if (error instanceof OneBotUnavailableError) code = "onebot_unavailable";
      else if (error instanceof FarmLingyeContractUnavailableError) code = "upstream_contract_unavailable";
      else if (error instanceof FarmNpcClientError) { code = error.code; status = code === "npc_action_rejected" || code === "registration_profile_required" ? 409 : 503; }
      else throw error;
      return reply.code(status).send({ error: { code, message: "The NPC request could not be completed" } });
    }
  }
  app.get("/api/lingye/npcs", { exposeHeadRoute: false }, (request, reply) => handle(request, reply, false));
  app.post("/api/lingye/npcs/interact", (request, reply) => handle(request, reply, true));
}

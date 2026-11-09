import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthenticationRequiredError, RegistrationProfileRequiredError,
  type RegistrationAuthService } from "../registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";
import { ScratchcardClientError, type LoungeScratchcardClient } from "./client.js";

const readQuery = z.strictObject({ requestId: z.uuid().optional() });
const purchaseBody = z.strictObject({
  requestId: z.uuid(), expectedFarmDoorplate: z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/u),
});
const errorDetails = {
  binding_unavailable: [409, "当前农场绑定不可用，请检查绑定。"],
  quota_exceeded: [409, "今天的 100 张已买完。"],
  insufficient_gold: [409, "金币不足，买一张需要 5,000 金币。"],
  spend_limit_exceeded: [409, "当前消费额度不足，暂时不能购买刮刮乐。"],
  invalid_request: [400, "刮刮乐请求格式不正确。"],
  farm_unavailable: [503, "刮刮乐机暂时不可用。"],
  upstream_contract_unavailable: [502, "暂时无法核对购票结果。"],
} as const;

export function registerLoungeScratchcardRoutes(app: FastifyInstance, options: {
  registrationAuth: Pick<RegistrationAuthService, "getCurrentSession">;
  scratchcards: Pick<LoungeScratchcardClient, "read" | "buy">;
  secureCookies: boolean;
}): void {
  const failure = (reply: FastifyReply, status: number, code: string, message: string) =>
    reply.code(status).send({ error: { code, message } });

  function sendFailure(reply: FastifyReply, error: unknown) {
    if (error instanceof AuthenticationRequiredError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return failure(reply, 401, "authentication_required", "请先登录。");
    }
    if (error instanceof RegistrationProfileRequiredError) return failure(reply, 409, "registration_profile_required", "请先完成农场绑定。");
    if (error instanceof ScratchcardClientError) {
      const [status, message] = errorDetails[error.code];
      return failure(reply, status, error.code, message);
    }
    throw error;
  }

  async function currentFarm(request: FastifyRequest) {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) throw new AuthenticationRequiredError();
    const { farmBinding } = await options.registrationAuth.getCurrentSession(token);
    if (!farmBinding.farmHumanKey) throw new RegistrationProfileRequiredError();
    return { farmDoorplate: farmBinding.farmDoorplate, farmHumanKey: farmBinding.farmHumanKey };
  }

  app.get("/api/lounge/scratchcard", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = readQuery.safeParse(request.query);
    if (!parsed.success || request.body !== undefined) return sendFailure(reply, new ScratchcardClientError("invalid_request"));
    try {
      return reply.send(await options.scratchcards.read(await currentFarm(request), parsed.data.requestId));
    } catch (error) { return sendFailure(reply, error); }
  });

  app.post("/api/lounge/scratchcard/buy", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const origin = request.headers.origin;
    if (origin !== undefined) {
      let sameHost = false;
      try { sameHost = new URL(origin).host === request.headers.host; } catch { /* Reject invalid origins. */ }
      if (!sameHost) return failure(reply, 403, "origin_mismatch", "请求来源无法通过安全校验。");
    }
    const parsed = purchaseBody.safeParse(request.body);
    if (!parsed.success || Object.keys(request.query ?? {}).length > 0) {
      return sendFailure(reply, new ScratchcardClientError("invalid_request"));
    }
    try {
      const binding = await currentFarm(request);
      if (binding.farmDoorplate !== parsed.data.expectedFarmDoorplate) {
        return sendFailure(reply, new ScratchcardClientError("binding_unavailable"));
      }
      return reply.send(await options.scratchcards.buy(binding, parsed.data.requestId, "human"));
    } catch (error) { return sendFailure(reply, error); }
  });
}

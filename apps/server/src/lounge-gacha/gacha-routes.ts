import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  LoungeGachaClient,
  LoungeGachaContractUnavailableError,
  LoungeGachaCredentialInvalidError,
  LoungeGachaIdempotencyConflictError,
  LoungeGachaInsufficientGoldError,
  LoungeGachaInvalidRequestError,
  LoungeGachaNotFoundError,
  LoungeGachaPrizePoolEmptyError,
  LoungeGachaQuotaExceededError,
  LoungeGachaStateConflictError,
  LoungeGachaUnavailableError,
  type LoungeGachaReader,
} from "./gacha-client.js";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  RegistrationProfileRequiredError,
  type RegistrationAuthService,
} from "../registration-auth.js";
import {
  readHumanSessionToken,
  serializeClearedHumanSessionCookie,
} from "../session-cookie.js";

const drawBodySchema = z.strictObject({ requestId: z.uuid() });

export interface LoungeGachaRouteOptions {
  registrationAuth: Pick<
    RegistrationAuthService,
    "getCurrentSessionWithMembership"
  >;
  gacha: LoungeGachaReader;
  secureCookies: boolean;
}

function hasNoQuery(request: FastifyRequest): boolean {
  return Object.keys(request.query ?? {}).length === 0;
}

function sendInvalidRequest(reply: FastifyReply): FastifyReply {
  return reply
    .code(400)
    .send({ error: { code: "invalid_request", message: "扭蛋请求格式不正确。" } });
}

function sendGachaFailure(
  reply: FastifyReply,
  error: unknown,
  secureCookies: boolean,
): FastifyReply {
  if (error instanceof AuthenticationRequiredError) {
    reply.header("set-cookie", serializeClearedHumanSessionCookie(secureCookies));
    return reply
      .code(401)
      .send({ error: { code: "authentication_required", message: "请先登录。" } });
  }
  if (error instanceof QqNotGroupMemberError) {
    reply.header("set-cookie", serializeClearedHumanSessionCookie(secureCookies));
    return reply
      .code(403)
      .send({ error: { code: "qq_not_group_member", message: "当前账号没有社区资格。" } });
  }
  if (error instanceof OneBotUnavailableError) {
    return reply
      .code(503)
      .send({ error: { code: "onebot_unavailable", message: "暂时无法核验社区资格。" } });
  }
  if (error instanceof RegistrationProfileRequiredError) {
    return reply
      .code(409)
      .send({ error: { code: "registration_profile_required", message: "请先完成农场绑定。" } });
  }
  if (error instanceof LoungeGachaCredentialInvalidError) {
    return reply
      .code(401)
      .send({ error: { code: "farm_credential_invalid", message: "当前农场凭证已失效。" } });
  }
  if (error instanceof LoungeGachaNotFoundError) {
    return reply
      .code(404)
      .send({ error: { code: "farm_not_found", message: "当前绑定的农场不存在。" } });
  }
  if (error instanceof LoungeGachaQuotaExceededError) {
    return reply
      .code(409)
      .send({ error: { code: "quota_exceeded", message: "今天的扭蛋次数已用完。" } });
  }
  if (error instanceof LoungeGachaPrizePoolEmptyError) {
    return reply
      .code(409)
      .send({ error: { code: "prize_pool_empty", message: "稀有奖品暂不可用，保底进度已保留。" } });
  }
  if (error instanceof LoungeGachaInsufficientGoldError) {
    return reply
      .code(409)
      .send({ error: { code: "insufficient_gold", message: "金币不足。" } });
  }
  if (error instanceof LoungeGachaIdempotencyConflictError) {
    return reply
      .code(409)
      .send({ error: { code: "idempotency_conflict", message: "这个请求编号已经用于其他抽取。" } });
  }
  if (error instanceof LoungeGachaStateConflictError) {
    return reply
      .code(409)
      .send({ error: { code: "state_conflict", message: "农场状态已变化，请重试。" } });
  }
  if (error instanceof LoungeGachaInvalidRequestError) {
    return sendInvalidRequest(reply);
  }
  if (error instanceof LoungeGachaContractUnavailableError) {
    return reply
      .code(502)
      .send({ error: { code: "upstream_contract_unavailable", message: "农场返回无法核对。" } });
  }
  if (error instanceof LoungeGachaUnavailableError) {
    return reply
      .code(503)
      .send({ error: { code: "farm_unavailable", message: "扭蛋暂时不可用。" } });
  }
  throw error;
}

async function currentFarmBinding(
  request: FastifyRequest,
  options: LoungeGachaRouteOptions,
): Promise<{ farmDoorplate: string; farmHumanKey: string }> {
  const token = readHumanSessionToken(request.headers.cookie);
  if (!token) throw new AuthenticationRequiredError();
  const community = await options.registrationAuth.getCurrentSessionWithMembership(token);
  const farmHumanKey = community.farmBinding.farmHumanKey;
  if (farmHumanKey === null) throw new RegistrationProfileRequiredError();
  return {
    farmDoorplate: community.farmBinding.farmDoorplate,
    farmHumanKey,
  };
}

export function registerLoungeGachaRoutes(
  app: FastifyInstance,
  options: LoungeGachaRouteOptions,
): void {
  app.get("/api/lounge/gacha", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!hasNoQuery(request) || request.body !== undefined) return sendInvalidRequest(reply);
    try {
      const binding = await currentFarmBinding(request, options);
      return reply.send(await options.gacha.read(binding));
    } catch (error) {
      return sendGachaFailure(reply, error, options.secureCookies);
    }
  });

  app.post("/api/lounge/gacha/draw", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!hasNoQuery(request)) return sendInvalidRequest(reply);
    const origin = request.headers.origin;
    if (origin !== undefined) {
      let allowed = false;
      try { allowed = new URL(origin).host === request.headers.host; } catch { /* Invalid origins are rejected. */ }
      if (!allowed) return reply.code(403).send({ error: { code: "origin_mismatch", message: "请求来源无法通过安全校验。" } });
    }
    const parsedBody = drawBodySchema.safeParse(request.body);
    if (!parsedBody.success) return sendInvalidRequest(reply);
    try {
      const binding = await currentFarmBinding(request, options);
      return reply.send(
        await options.gacha.draw({ ...binding, requestId: parsedBody.data.requestId }),
      );
    } catch (error) {
      return sendGachaFailure(reply, error, options.secureCookies);
    }
  });
}

export { LoungeGachaClient };

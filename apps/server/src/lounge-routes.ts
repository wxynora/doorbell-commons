import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { LoungeService } from "./lounge-service.js";
import { OneBotUnavailableError } from "./qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  RegistrationProfileRequiredError,
} from "./registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "./session-cookie.js";

type LoungeRouteService = Pick<LoungeService, "readHumanSnapshot" | "connectHumanStream">;

function validLoungeRequest(request: FastifyRequest): boolean {
  return Object.keys(request.query ?? {}).length === 0 && request.body === undefined;
}

function sendInvalidRequest(reply: FastifyReply) {
  return reply
    .code(400)
    .send({ error: { code: "invalid_request", message: "休息室请求格式不正确。" } });
}

function sendLoungeFailure(reply: FastifyReply, error: unknown, secureCookies: boolean) {
  if (error instanceof AuthenticationRequiredError) {
    return reply
      .code(401)
      .send({ error: { code: "authentication_required", message: "请先登录。" } });
  }
  if (error instanceof QqNotGroupMemberError) {
    reply.header("set-cookie", serializeClearedHumanSessionCookie(secureCookies));
    return reply
      .code(403)
      .send({ error: { code: "qq_not_group_member", message: "当前账号没有社区访问资格。" } });
  }
  if (error instanceof RegistrationProfileRequiredError) {
    return reply
      .code(409)
      .send({ error: { code: "registration_profile_required", message: "请先完成社区注册。" } });
  }
  if (error instanceof OneBotUnavailableError) {
    return reply
      .code(503)
      .send({ error: { code: "onebot_unavailable", message: "暂时无法确认社区资格。" } });
  }
  throw error;
}

function prepareStream(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    "cache-control": "no-store",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  });
}

export function registerLoungeRoutes(
  app: FastifyInstance,
  options: {
    loungeService: LoungeRouteService;
    secureCookies: boolean;
  },
): void {
  app.get("/api/lounge", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("cache-control", "no-store");
    if (!validLoungeRequest(request)) return sendInvalidRequest(reply);

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return reply
        .code(401)
        .send({ error: { code: "authentication_required", message: "请先登录。" } });
    }

    try {
      return await options.loungeService.readHumanSnapshot(token);
    } catch (error) {
      return sendLoungeFailure(reply, error, options.secureCookies);
    }
  });

  app.get("/api/lounge/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("cache-control", "no-store");
    if (!validLoungeRequest(request)) return sendInvalidRequest(reply);

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return reply
        .code(401)
        .send({ error: { code: "authentication_required", message: "请先登录。" } });
    }

    let started = false;
    let closed = false;
    let connection: ReturnType<LoungeService["connectHumanStream"]> | undefined;
    const closeStream = (): void => {
      if (closed) return;
      closed = true;
      if (started && !reply.raw.writableEnded) reply.raw.end();
    };
    try {
      const snapshot = await options.loungeService.readHumanSnapshot(token);
      started = true;
      prepareStream(reply);
      connection = options.loungeService.connectHumanStream(snapshot.self_resident_id, {
        send: (delta) => {
          if (!closed && !reply.raw.writableEnded) {
            reply.raw.write(`event: delta\ndata: ${JSON.stringify(delta)}\n\n`);
          }
        },
        close: closeStream,
      });
      reply.raw.once("close", () => connection?.close());
      if (!closed && !reply.raw.writableEnded) {
        reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
      }
      return reply;
    } catch (error) {
      if (started) {
        closeStream();
        return reply;
      }
      return sendLoungeFailure(reply, error, options.secureCookies);
    }
  });
}

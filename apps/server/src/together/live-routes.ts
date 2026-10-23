import { snowDanmakuInputSchema, snowLiveResponseSchema } from "@doorbell/protocol";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
  RegistrationProfileRequiredError,
} from "../registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";
import { startSseKeepalive } from "../sse-keepalive.js";
import type { SnowLiveService } from "./live-service.js";

export type SnowLivePort = Pick<SnowLiveService, "read" | "send" | "subscribe">;
const cursorQuery = z.object({ after: z.coerce.number().int().nonnegative().optional() }).strict();
function failure(cause: unknown): { status: number; code: string } {
  if (cause instanceof AuthenticationRequiredError)
    return { status: 401, code: "authentication_required" };
  if (cause instanceof QqNotGroupMemberError) return { status: 403, code: "qq_not_group_member" };
  if (cause instanceof RegistrationProfileRequiredError)
    return { status: 409, code: "registration_profile_required" };
  if (cause instanceof OneBotUnavailableError) return { status: 503, code: "onebot_unavailable" };
  if (cause instanceof z.ZodError) return { status: 400, code: "invalid_request" };
  if (cause instanceof Error && cause.message === "message_conflict")
    return { status: 409, code: "message_conflict" };
  if (cause instanceof Error && cause.message === "activity_unavailable")
    return { status: 409, code: "activity_unavailable" };
  if (cause instanceof Error && cause.message === "origin_mismatch")
    return { status: 403, code: "origin_mismatch" };
  return { status: 503, code: "service_unavailable" };
}
export function registerSnowLiveRoutes(
  app: FastifyInstance,
  options: {
    live: SnowLivePort;
    registrationAuth: Pick<RegistrationAuthService, "getCurrentSessionWithMembership">;
    secureCookies: boolean;
  },
) {
  const root = "/api/activities/snow-fort";
  const streams = new Set<() => void>();
  app.addHook("preClose", async () => {
    for (const close of streams) close();
  });
  const authenticate = async (request: FastifyRequest) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) throw new AuthenticationRequiredError();
    return options.registrationAuth.getCurrentSessionWithMembership(token);
  };
  const reject = (reply: FastifyReply, cause: unknown) => {
    const error = failure(cause);
    if (error.code === "qq_not_group_member")
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
    return reply.code(error.status).send({ error: { code: error.code } });
  };
  app.get(root, async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const query = cursorQuery.parse(request.query);
      await authenticate(request);
      return snowLiveResponseSchema.parse(options.live.read(query.after));
    } catch (cause) {
      return reject(reply, cause);
    }
  });
  app.post(`${root}/danmaku`, async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      z.object({}).strict().parse(request.query);
      const input = snowDanmakuInputSchema.parse(request.body);
      if (request.headers.origin) {
        let host: string;
        try {
          host = new URL(request.headers.origin).host;
        } catch {
          throw Error("origin_mismatch");
        }
        if (host !== request.headers.host) throw Error("origin_mismatch");
      }
      const community = await authenticate(request);
      return options.live.send(
        { accountId: community.account.accountId, residentName: community.resident.residentName },
        input,
      );
    } catch (cause) {
      return reject(reply, cause);
    }
  });
  app.get(`${root}/stream`, { exposeHeadRoute: false }, async (request, reply) => {
    let unsubscribe: (() => void) | undefined;
    let closed = false;
    const close = () => {
      closed = true;
      unsubscribe?.();
      streams.delete(close);
      if (!reply.raw.writableEnded) reply.raw.end();
    };
    reply.raw.once("close", close);
    try {
      const query = cursorQuery.parse(request.query);
      const after =
        request.headers["last-event-id"] === undefined
          ? (query.after ?? 0)
          : z.coerce.number().int().nonnegative().parse(request.headers["last-event-id"]);
      await authenticate(request);
      if (closed) return reply;
      const initial = snowLiveResponseSchema.parse(options.live.read(after));
      reply.hijack();
      streams.add(close);
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      startSseKeepalive(reply.raw);
      let chain = Promise.resolve();
      const enqueue = (event: string, value: unknown, sequence?: number) => {
        chain = chain
          .then(async () => {
            if (closed) return;
            await authenticate(request); // Revoke an open stream as soon as its next update is sent.
            if (closed) return;
            const frame = `${sequence === undefined ? "" : `id: ${sequence}\n`}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
            if (!reply.raw.write(frame))
              await new Promise<void>((resolve) => {
                const done = () => {
                  reply.raw.off("drain", done);
                  reply.raw.off("close", done);
                  resolve();
                };
                reply.raw.once("drain", done);
                reply.raw.once("close", done);
              });
          })
          .catch((cause: unknown) => {
            if (!closed) {
              reply.raw.write(
                `event: access_error\ndata: ${JSON.stringify({ error: { code: failure(cause).code } })}\n\n`,
              );
              close();
            }
          });
      };
      enqueue("initial", initial, initial.messages.at(-1)?.sequence ?? after);
      unsubscribe = options.live.subscribe((event) =>
        enqueue(
          event.type,
          event.value,
          event.type === "danmaku" ? event.value.sequence : undefined,
        ),
      );
      return reply;
    } catch (cause) {
      unsubscribe?.();
      return reject(reply, cause);
    }
  });
}

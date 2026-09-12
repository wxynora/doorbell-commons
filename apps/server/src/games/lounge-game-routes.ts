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
import type { GameChatService, GameChatSubscription } from "./game-chat-service.js";
import { GameChatConflictError, type GameChatMessage } from "./game-chat-store.js";
import { GameEconomyError } from "./game-economy.js";
import type { GameCaller, GameIdentity } from "./game-identity.js";
import { ReactionChargeRejected, type ReactionDelivery } from "./game-reaction-service.js";
import type { ReactionKind } from "./game-reaction-store.js";
import type { GameService } from "./game-service.js";
import type { GameSubscription, GameSync } from "./game-sync.js";
import { GAME_KINDS, GameAccessError, type GameRoomView, GameStateError } from "./types.js";

export type LoungeGameRouteGameService = Pick<
  GameService,
  "create" | "join" | "view" | "ready" | "start" | "command" | "leave"
>;

export type LoungeGameRouteChatService = Pick<GameChatService, "read" | "send" | "subscribe">;

export type LoungeGameRouteSyncService = Pick<GameSync, "subscribe">;

export type LoungeGameReactionEvent = Parameters<ReactionDelivery["publish"]>[0];

export interface LoungeGameReactionInput {
  roomId: string;
  targetId: string;
  kind: ReactionKind;
  requestId: string;
}

export interface LoungeGameReactionSubscription {
  readonly closed: Promise<unknown | null>;
  close(): void;
}

export interface LoungeGameReactionPort {
  read?(caller:GameCaller,roomId:string):Promise<LoungeGameReactionEvent[]>;
  send(caller: GameCaller, input: LoungeGameReactionInput): Promise<unknown>;
  subscribe(
    caller: GameCaller,
    roomId: string,
    deliver: (reaction: LoungeGameReactionEvent) => void | Promise<void>,
  ): Promise<LoungeGameReactionSubscription>;
}

export interface LoungeGameRoutesOptions {
  auth: Pick<RegistrationAuthService, "getCurrentSessionWithMembership">;
  identity: Pick<GameIdentity, "human">;
  games: LoungeGameRouteGameService;
  gameChat: LoungeGameRouteChatService;
  gameSync: LoungeGameRouteSyncService;
  reactions?: LoungeGameReactionPort;
  secureCookies: boolean;
}

export class LoungeGameRouteError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LoungeGameRouteError";
  }
}

const ROOT = "/api/lounge/games";
const roomParamsSchema = z.strictObject({ roomId: z.string().min(1) });
const tableParamsSchema = z.strictObject({ tableId: z.enum(["square", "round"]) });
const emptyQuerySchema = z.strictObject({});
const gameKindSchema = z.enum(GAME_KINDS);
const revisionSchema = z.number().int().safe().nonnegative();
const sequenceQuerySchema = z
  .string()
  .regex(/^\d+$/u)
  .transform(Number)
  .refine(Number.isSafeInteger)
  .refine((value) => value >= 0);

const createBodySchema = z.strictObject({
  kind: gameKindSchema,
  baseStake: z.number().int().safe().positive().optional(),
});
const joinBodySchema = z.strictObject({ revision: revisionSchema });
const readyBodySchema = z.strictObject({ revision: revisionSchema, ready: z.boolean() });
const startBodySchema = z.strictObject({ revision: revisionSchema });
const commandBodySchema = z.strictObject({
  revision: revisionSchema,
  command: z.record(z.string(), z.unknown()),
});
const chatBodySchema = z.strictObject({
  clientMessageId: z.string().min(1),
  text: z.string().min(1),
  replyToMessageId: z.string().min(1).optional(),
});
const reactionBodySchema = z.strictObject({
  targetId: z.string().min(1),
  kind: z.enum(["flower", "bomb"]),
  requestId: z.string().min(1),
});
const chatQuerySchema = z.strictObject({ afterSequence: sequenceQuerySchema.optional() });
const streamQuerySchema = z.strictObject({ afterChatSequence: sequenceQuerySchema.optional() });

type RoomParams = z.infer<typeof roomParamsSchema>;
type TableParams = z.infer<typeof tableParamsSchema>;
type AuthenticatedGameRequest = { caller: GameCaller };

function routeError(statusCode: number, code: string, message: string): LoungeGameRouteError {
  return new LoungeGameRouteError(statusCode, code, message);
}

function requestOrigin(request: FastifyRequest): string | undefined {
  const origin = request.headers.origin;
  return Array.isArray(origin) ? origin[0] : origin;
}

function assertSameOrigin(request: FastifyRequest): void {
  if (request.method === "GET") return;
  const origin = requestOrigin(request);
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw routeError(403, "origin_mismatch", "请求来源无法通过安全校验。");
  }
  if (originHost !== request.headers.host) {
    throw routeError(403, "origin_mismatch", "请求来源无法通过安全校验。");
  }
}

async function authenticateRequest(
  request: FastifyRequest,
  options: LoungeGameRoutesOptions,
): Promise<AuthenticatedGameRequest> {
  const token = readHumanSessionToken(request.headers.cookie);
  if (!token) throw new AuthenticationRequiredError();
  await options.auth.getCurrentSessionWithMembership(token);
  return { caller: options.identity.human(token) };
}

function codeFromDomainError(error: unknown): string | undefined {
  if (error instanceof GameEconomyError) return error.code;
  if (error instanceof GameStateError || error instanceof GameAccessError) {
    return /^[a-z][a-z0-9_]*$/u.test(error.message) ? error.message : undefined;
  }
  return undefined;
}

function sendDomainFailure(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ReactionChargeRejected) {
    const code = /^[a-z][a-z0-9_]*$/u.test(error.message)
      ? error.message
      : "reaction_charge_rejected";
    return reply.code(409).send({
      error: { code, message: "游戏服务暂时无法处理请求。" },
    });
  }
  if (error instanceof GameAccessError) {
    const code = codeFromDomainError(error) ?? "game_access_denied";
    return reply.code(403).send({
      error: {
        code,
        message: code === "not_seated" ? "你还没有入座这局游戏。" : "当前身份无权操作这局游戏。",
      },
    });
  }
  if (error instanceof GameChatConflictError) {
    return reply.code(409).send({
      error: {
        code: "game_chat_conflict",
        message: "相同聊天编号对应的内容已经不同。",
      },
    });
  }
  if (error instanceof GameEconomyError) {
    return reply.code(409).send({
      error: {
        code: error.code,
        message: "当前游戏结算状态无法完成该请求。",
      },
    });
  }
  if (error instanceof GameStateError) {
    const code = codeFromDomainError(error) ?? "game_state_error";
    const statusCode = code === "room_not_found" ? 404 : code === "unknown_game" ? 400 : 409;
    const message =
      code === "game_round_limit_reached"
        ? "有玩家已达到今日游戏局数上限，不能开始新一局。"
        : code === "room_not_found"
        ? "找不到这局游戏。"
        : code === "stale_room"
          ? "这局游戏已经发生变化，请重新读取。"
          : code === "not_seated"
            ? "你还没有入座这局游戏。"
            : "当前游戏状态无法完成该请求。";
    return reply.code(statusCode).send({ error: { code, message } });
  }
  return reply
    .code(500)
    .send({ error: { code: "internal_error", message: "游戏服务暂时无法处理请求。" } });
}

function sendFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  secureCookies: boolean,
): FastifyReply {
  if (error instanceof LoungeGameRouteError) {
    return reply
      .code(error.statusCode)
      .send({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof z.ZodError) {
    return reply
      .code(400)
      .send({ error: { code: "invalid_request", message: "游戏请求格式不正确。" } });
  }
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
      .send({ error: { code: "membership_unavailable", message: "暂时无法确认社区资格。" } });
  }
  if (
    error instanceof GameAccessError ||
    error instanceof GameEconomyError ||
    error instanceof GameStateError ||
    error instanceof ReactionChargeRejected ||
    error instanceof GameChatConflictError
  ) {
    return sendDomainFailure(reply, error);
  }
  request.log.error(
    { error_name: error instanceof Error ? error.name : "UnknownError" },
    "Lounge game route failed",
  );
  return reply
    .code(500)
    .send({ error: { code: "internal_error", message: "游戏服务暂时无法处理请求。" } });
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

function writeEvent<T>(reply: FastifyReply, event: string, value: T): void {
  if (reply.raw.writableEnded) return;
  // Only chat advances this cursor; game/reaction frames must not replace it.
  const id = event === "chat" ? `id: ${(value as GameChatMessage).sequence}\n` : "";
  reply.raw.write(`${id}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

async function handleApi(
  request: FastifyRequest,
  reply: FastifyReply,
  options: LoungeGameRoutesOptions,
  action: (authenticated: AuthenticatedGameRequest) => Promise<unknown>,
): Promise<unknown> {
  reply.header("cache-control", "no-store");
  try {
    assertSameOrigin(request);
    const authenticated = await authenticateRequest(request, options);
    return await action(authenticated);
  } catch (error) {
    return sendFailure(request, reply, error, options.secureCookies);
  }
}

export function registerLoungeGameRoutes(
  app: FastifyInstance,
  options: LoungeGameRoutesOptions,
): void {
  app.post(`${ROOT}/tables/:tableId/rooms`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { tableId } = tableParamsSchema.parse(request.params) as TableParams;
      const body = createBodySchema.parse(request.body);
      const created = await options.games.create(caller, body.kind, body.baseStake, tableId);
      return options.games.join(caller, created.roomId, created.revision);
    }),
  );

  app.post(`${ROOT}/rooms/:roomId/join`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const { revision } = joinBodySchema.parse(request.body);
      return options.games.join(caller, roomId, revision);
    }),
  );

  app.get(`${ROOT}/rooms/:roomId`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      emptyQuerySchema.parse(request.query);
      return options.games.view(caller, roomId);
    }),
  );

  app.post(`${ROOT}/rooms/:roomId/ready`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const { revision, ready } = readyBodySchema.parse(request.body);
      return options.games.ready(caller, roomId, revision, ready);
    }),
  );

  app.post(`${ROOT}/rooms/:roomId/start`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const { revision } = startBodySchema.parse(request.body);
      return options.games.start(caller, roomId, revision);
    }),
  );

  app.post(`${ROOT}/rooms/:roomId/command`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const { revision, command } = commandBodySchema.parse(request.body);
      return options.games.command(caller, roomId, revision, command);
    }),
  );

  app.post(`${ROOT}/rooms/:roomId/leave`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const { revision } = startBodySchema.parse(request.body);
      return options.games.leave(caller, roomId, revision);
    }),
  );

  app.get(`${ROOT}/rooms/:roomId/chat`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const { afterSequence = 0 } = chatQuerySchema.parse(request.query);
      return options.gameChat.read(caller, roomId, afterSequence);
    }),
  );

  app.post(`${ROOT}/rooms/:roomId/chat`, async (request, reply) =>
    handleApi(request, reply, options, async ({ caller }) => {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const body = chatBodySchema.parse(request.body);
      return options.gameChat.send(caller, roomId, {clientMessageId: body.clientMessageId, text: body.text, ...(body.replyToMessageId === undefined ? {} : {replyToMessageId: body.replyToMessageId})});
    }),
  );

  if (options.reactions) {
    app.get(`${ROOT}/rooms/:roomId/reactions`, async (request,reply) =>
      handleApi(request, reply, options, async ({caller}) => {
        const {roomId}=roomParamsSchema.parse(request.params);
        return options.reactions!.read ? options.reactions!.read(caller,roomId) : [];
      }));
    app.post(`${ROOT}/rooms/:roomId/reactions`, async (request, reply) =>
      handleApi(request, reply, options, async ({ caller }) => {
        const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
        const body = reactionBodySchema.parse(request.body);
        return options.reactions?.send(caller, { roomId, ...body });
      }),
    );
  }

  app.get(`${ROOT}/rooms/:roomId/stream`, { exposeHeadRoute: false }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    let gameSubscription: GameSubscription | undefined;
    let chatSubscription: GameChatSubscription | undefined;
    let reactionSubscription: LoungeGameReactionSubscription | undefined;
    let streamStarted = false;
    let streamReady = false;
    let closed = false;
    const pendingEvents: Array<{ event: string; value: unknown }> = [];
    const closeStream = (): void => {
      if (closed) return;
      closed = true;
      gameSubscription?.close();
      chatSubscription?.close();
      reactionSubscription?.close();
      if (streamStarted && !reply.raw.writableEnded) reply.raw.end();
    };
    const emit = (event: string, value: unknown): void => {
      if (closed) return;
      if (!streamReady) {
        pendingEvents.push({ event, value });
        return;
      }
      writeEvent(reply, event, value);
    };

    try {
      const { roomId } = roomParamsSchema.parse(request.params) as RoomParams;
      const { afterChatSequence = 0 } = streamQuerySchema.parse(request.query);
      const lastEventId = request.headers["last-event-id"];
      const chatCursor = lastEventId === undefined
        ? afterChatSequence
        : sequenceQuerySchema.parse(lastEventId);
      assertSameOrigin(request);
      const { caller } = await authenticateRequest(request, options);
      gameSubscription = await options.gameSync.subscribe(caller, roomId, (view: GameRoomView, delta) => {
        if (delta) {
          const { game: _game, ...room } = view;
          emit("game_delta", { ...room, baseRevision: delta.baseRevision, patch: delta.patch });
        } else emit("game", view);
      });
      chatSubscription = await options.gameChat.subscribe(
        caller,
        roomId,
        chatCursor,
        (message: GameChatMessage) => {
          emit("chat", message);
        },
      );
      if (options.reactions) {
        reactionSubscription = await options.reactions.subscribe(caller, roomId, (reaction) => {
          emit("reaction", reaction);
        });
      }
      streamStarted = true;
      prepareStream(reply);
      reply.raw.once("close", closeStream);
      streamReady = true;
      for (const pending of pendingEvents) writeEvent(reply, pending.event, pending.value);
      pendingEvents.length = 0;
      const watchClosed = (subscription: { readonly closed: Promise<unknown | null> }): void => {
        void subscription.closed.then(
          () => closeStream(),
          () => closeStream(),
        );
      };
      watchClosed(gameSubscription);
      watchClosed(chatSubscription);
      if (reactionSubscription) watchClosed(reactionSubscription);
      return reply;
    } catch (error) {
      if (streamStarted) {
        closeStream();
        return reply;
      }
      gameSubscription?.close();
      chatSubscription?.close();
      reactionSubscription?.close();
      return sendFailure(request, reply, error, options.secureCookies);
    }
  });
}

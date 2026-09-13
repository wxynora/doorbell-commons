import type { GameChatService, GameChatSubscription } from "./game-chat-service.js";
import { startSseKeepalive } from "../sse-keepalive.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { GameCaller } from "./game-identity.js";
import type { GameService } from "./game-service.js";
import type { GameSync, GameSubscription } from "./game-sync.js";
import { GameAccessError, GameStateError } from "./types.js";

/** Only used by these GET endpoints. Never accepted as an action caller. */
export function ownerWatchCaller(human: GameCaller): GameCaller {
  return { authenticate: async () => {
    const actor = await human.authenticate();
    if (actor.controllerType !== "human" || !actor.residentId) throw new GameAccessError("owner_watch_required");
    return { playerId: `resident:${actor.residentId}`, controllerType: "resident", residentId: actor.residentId };
  } };
}
interface Options {
  authenticate(request: FastifyRequest): Promise<GameCaller>;
  failure(request: FastifyRequest, reply: FastifyReply, error: unknown): unknown;
  games: Pick<GameService, "view">;
  sync: Pick<GameSync, "subscribe">;
  chat: Pick<GameChatService, "subscribe">;
}
const params = z.strictObject({ roomId: z.string().min(1) });
const streamQuery = z.strictObject({afterChatSequence:z.coerce.number().int().nonnegative().default(0)});
export function registerOwnerWatchRoutes(app: FastifyInstance, options: Options): void {
  const root = "/api/lounge/games/rooms/:roomId/watch";
  const failure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
    if (error instanceof GameAccessError && error.message === "not_seated")
      return reply.code(403).send({ error: { code: "owner_not_seated", message: "你的小机不在这桌，不能围观。" } });
    if (error instanceof GameStateError && error.message === "game_not_started")
      return reply.code(409).send({ error: { code: "game_not_started", message: "这桌还没开始游戏。" } });
    return options.failure(request, reply, error);
  };
  app.get(root, async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const { roomId } = params.parse(request.params);
      z.strictObject({}).parse(request.query);
      const caller = ownerWatchCaller(await options.authenticate(request));
      const view = await options.games.view(caller, roomId);
      if (view.phase === "waiting") throw new GameStateError("game_not_started");
      return view;
    } catch (error) { return failure(request, reply, error); }
  });
  app.get(`${root}/stream`, { exposeHeadRoute: false }, async (request, reply) => {
    let subscription: GameSubscription | undefined;
    let chatSubscription: GameChatSubscription | undefined;
    let started = false, closed = false;
    const pending: string[] = [];
    const close = () => { closed = true; subscription?.close(); chatSubscription?.close(); if (started && !reply.raw.writableEnded) reply.raw.end(); };
    reply.raw.once("close", close);
    try {
      const { roomId } = params.parse(request.params);
      const {afterChatSequence}=streamQuery.parse(request.query);
      const cursor=request.headers["last-event-id"]===undefined?afterChatSequence:z.coerce.number().int().nonnegative().parse(request.headers["last-event-id"]);
      const caller = ownerWatchCaller(await options.authenticate(request));
      subscription = await options.sync.subscribe(caller, roomId, (view, delta) => {
        if (closed) return;
        if (view.phase === "waiting") throw new GameStateError("game_not_started");
        const { game: _game, ...room } = view;
        const event = delta ? "game_delta" : "game";
        const payload = delta ? { ...room, baseRevision: delta.baseRevision, patch: delta.patch } : view;
        const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        if (started) reply.raw.write(frame); else pending.push(frame);
      });
      chatSubscription=await options.chat.subscribe(caller,roomId,cursor,message=>{
        if(closed)return;
        const frame=`id: ${message.sequence}\nevent: chat\ndata: ${JSON.stringify(message)}\n\n`;
        if(started)reply.raw.write(frame);else pending.push(frame);
      });
      if (closed) { subscription.close(); chatSubscription.close(); return reply; }
      reply.hijack();
      reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
      started = true;
      startSseKeepalive(reply.raw);
      for (const frame of pending) reply.raw.write(frame);
      pending.length = 0;
      void subscription.closed.then(close, close);
      void chatSubscription.closed.then(close,close);
      return reply;
    } catch (error) {
      subscription?.close();
      chatSubscription?.close();
      if (started) { close(); return reply; }
      return failure(request, reply, error);
    }
  });
}


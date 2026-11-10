import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { MomentActor } from "./types.js";
import { MomentsError } from "./types.js";
import type { MomentsNotifications } from "./notifications.js";

export type MomentsHumanHandler = (action: (actor: MomentActor, request: FastifyRequest) => unknown) =>
  (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** The caller supplies the existing human session, origin and error handler. */
export function registerMomentsNotificationRoutes(app: FastifyInstance, options: {
  notifications: MomentsNotifications; handle: MomentsHumanHandler;
}) {
  app.get("/api/moments/notifications", options.handle((actor, request) => {
    if (Object.keys(request.query ?? {}).length) throw new MomentsError("invalid_request");
    return { notifications: options.notifications.list(actor) };
  }));
  app.post("/api/moments/notifications/read", options.handle((actor, request) => {
    if (Object.keys(request.query ?? {}).length || !z.object({}).strict().safeParse(request.body).success)
      throw new MomentsError("invalid_request");
    return { notifications: options.notifications.markAllRead(actor) };
  }));
  app.post("/api/moments/notifications/:notificationId/read", options.handle((actor, request) => {
    if (Object.keys(request.query ?? {}).length || !z.object({}).strict().safeParse(request.body).success)
      throw new MomentsError("invalid_request");
    return { notification: options.notifications.markRead(actor, (request.params as { notificationId: string }).notificationId) };
  }));
}

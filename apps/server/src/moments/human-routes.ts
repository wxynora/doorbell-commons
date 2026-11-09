import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";
import { AuthenticationRequiredError } from "../registration-auth.js";
import { loungeHumanName } from "../lounge-display-name.js";
import { feedQuerySchema, type MomentsStore } from "./store.js";
import { MomentsError, type MomentActor, type MomentView } from "./types.js";
import { registerMomentsNotificationRoutes } from "./notification-routes.js";
import type { MomentsGiftService } from "./gift-service.js";

export interface MomentsHumanAuth {
  getCurrentSession(token: string): Promise<{
    account: { accountId: string }; resident: { residentId: string; residentName: string };
  }>;
}

function error(reply: FastifyReply, status: number, code: string) {
  return reply.code(status).send({ error: { code } });
}
function sameOrigin(request: FastifyRequest): boolean {
  if (request.headers.origin === undefined) return true;
  try { return new URL(request.headers.origin).host === request.headers.host; } catch { return false; }
}

/** Human endpoint: actor identity comes entirely from the existing browser session. */
export function registerMomentsHumanRoutes(app: FastifyInstance, options: {
  store: MomentsStore; registrationAuth: MomentsHumanAuth; secureCookies: boolean; now?: () => number;
  gifts?: MomentsGiftService | undefined;
}) {
  const now = options.now ?? Date.now;
  function withStatuses(actor: MomentActor, posts: MomentView[], at: number): MomentView[] {
    const authors = new Map<string, NonNullable<MomentView["statuses"]>>();
    return posts.map(post => {
      const id = post.author.residentId;
      if (!id) return post;
      if (!authors.has(id)) authors.set(id, options.store.dailyActivityStatuses(actor, id, at));
      return { ...post, statuses: authors.get(id)! };
    });
  }
  async function authenticate(request: FastifyRequest): Promise<MomentActor> {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) throw new AuthenticationRequiredError();
    const community = await options.registrationAuth.getCurrentSession(token);
    return { kind: "human", accountId: community.account.accountId, residentId: community.resident.residentId, name: loungeHumanName(community.resident.residentName) };
  }
  const handle = (action: (actor: MomentActor, request: FastifyRequest) => unknown) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header("cache-control", "no-store");
      if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) return error(reply,403,"origin_not_allowed");
      try {
        const actor=await authenticate(request), result=await action(actor,request);
        await options.store.syncProgression(actor.residentId);
        return result;
      }
      catch (cause) {
        if (cause instanceof MomentsError) {
          const status = cause.code === "moment_not_found" ? 404 : cause.code === "actor_unavailable" ? 401
            : cause.code === "resident_only" ? 403 : cause.code === "gift_unavailable" ? 503
            : ["farm_binding_mismatch","same_farm","request_conflict","insufficient_stock","item_conflict","item_unavailable","price_changed","insufficient_coins","purchase_unavailable"].includes(cause.code) ? 409 : 400;
          return error(reply,status,cause.code);
        }
        const name = cause instanceof Error ? cause.name : "UnknownError";
        if (name === "AuthenticationRequiredError") return error(reply,401,"authentication_required");
        if (name === "QqNotGroupMemberError") {
          reply.header("set-cookie",serializeClearedHumanSessionCookie(options.secureCookies));
          return error(reply,403,"qq_not_group_member");
        }
        if (name === "RegistrationProfileRequiredError") return error(reply,409,"registration_profile_required");
        request.log.error({ error_name: name },"Moments request failed");
        return error(reply,503,"service_unavailable");
      }
    };
  registerMomentsNotificationRoutes(app, { notifications: options.store.notifications(), handle });
  app.get("/api/moments",handle((actor,request) => {
    const query = { ...request.query as Record<string,unknown> };
    for (const key of ["from","until","count"]) if (key in query) {
      if (typeof query[key] !== "string" || !/^\d+$/.test(query[key])) throw new MomentsError("invalid_request");
      query[key] = Number(query[key]);
    }
    const parsed = feedQuerySchema.safeParse(query);
    if (!parsed.success) throw new MomentsError("invalid_request");
    const at = now();
    return { moments: withStatuses(actor, options.store.list(actor,parsed.data,at), at) };
  }));
  app.get("/api/moments/people",handle((actor,request) => {
    if (Object.keys(request.query??{}).length) throw new MomentsError("invalid_request");
    return { people: options.store.listAudience(actor) };
  }));
  app.get("/api/moments/annual-summary",handle((actor,request) => {
    const parsed=z.object({year:z.string().regex(/^-?\d+$/)}).strict().safeParse(request.query);
    if(!parsed.success)throw new MomentsError("invalid_request");
    return options.store.annualSummary(actor,Number(parsed.data.year));
  }));
  app.get("/api/moments/:momentId",handle((actor,request) => {
    if (Object.keys(request.query??{}).length) throw new MomentsError("invalid_request");
    return withStatuses(actor, [options.store.get(actor,(request.params as { momentId: string }).momentId)], now())[0];
  }));
  app.put("/api/moments/:momentId/like",handle((actor,request) => {
    const parsed = z.object({ liked: z.boolean() }).strict().safeParse(request.body);
    if (!parsed.success || Object.keys(request.query??{}).length) throw new MomentsError("invalid_request");
    const at = now();
    return withStatuses(actor, [options.store.setLike(actor,(request.params as { momentId: string }).momentId,parsed.data.liked,at)], at)[0];
  }));
  const gifts=options.gifts;
  if(gifts){
    app.get("/api/moments/gift-inventory",handle((actor,request)=>{
      if(Object.keys(request.query??{}).length)throw new MomentsError("invalid_request");
      return gifts.inventory(actor);
    }));
    app.post("/api/moments/:momentId/gifts",handle((actor,request)=>{
      if(Object.keys(request.query??{}).length)throw new MomentsError("invalid_request");
      return gifts.send(actor,(request.params as {momentId:string}).momentId,request.body);
    }));
  }
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
  RegistrationProfileRequiredError,
} from "../registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";
import type {
  ResidentSocialActivity,
  ResidentSocialInteractionKind,
  ResidentSocialRelationship,
  ResidentSocialSnapshot,
  ResidentSocialSource,
  ResidentSocialStore,
} from "./resident-social-store.js";

export type ResidentSocialKind = ResidentSocialInteractionKind;
export type { ResidentSocialActivity, ResidentSocialRelationship, ResidentSocialSource };
export type ResidentSocialReadResult = ResidentSocialSnapshot;
export type ResidentSocialStoreReader = Pick<ResidentSocialStore, "read">;
export type ResidentSocialAuthenticatedCommunity = Awaited<
  ReturnType<RegistrationAuthService["getCurrentSession"]>
>;

function isoDateTime(value: number): string {
  return new Date(value).toISOString();
}

function validResidentSocialRequest(request: FastifyRequest): boolean {
  return Object.keys(request.query ?? {}).length === 0 && request.body === undefined;
}

function requestOriginMatchesHost(request: FastifyRequest): boolean {
  const header = request.headers.origin;
  if (header === undefined) return true;
  const origin = Array.isArray(header) ? header[0] : header;
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function residentSocialResponse(result: ResidentSocialSnapshot, farmUnavailable = false) {
  return {
    activities: result.activities.map(({ source, sequence, at, label }) => ({
      source,
      sequence,
      at: isoDateTime(at),
      label,
    })),
    relationships: result.relationships.map(({ residentId, name, kind, count, lastAt }) => ({
      residentId,
      name,
      kind,
      count,
      lastAt: isoDateTime(lastAt),
    })),
    ...(farmUnavailable ? { farmUnavailable: true } : {}),
  };
}

function sendResidentSocialFailure(reply: FastifyReply, error: unknown, secureCookies: boolean) {
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
      .send({ error: { code: "onebot_unavailable", message: "暂时无法核验社区资格。" } });
  }
  throw error;
}

export function registerResidentSocialRoutes(
  app: FastifyInstance,
  options: {
    registrationAuth: Pick<RegistrationAuthService, "getCurrentSessionWithMembership">;
    store: ResidentSocialStoreReader;
    secureCookies: boolean;
    refreshActivity?:
      | ((community: ResidentSocialAuthenticatedCommunity) => Promise<void>)
      | undefined;
  },
): void {
  app.get("/api/profile/activity", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!validResidentSocialRequest(request)) {
      return reply
        .code(400)
        .send({ error: { code: "invalid_request", message: "活动请求格式不正确。" } });
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return reply
        .code(401)
        .send({ error: { code: "authentication_required", message: "请先登录。" } });
    }

    try {
      const community = await options.registrationAuth.getCurrentSessionWithMembership(token);
      return residentSocialResponse(options.store.read(community.resident.residentId));
    } catch (error) {
      return sendResidentSocialFailure(reply, error, options.secureCookies);
    }
  });

  app.post("/api/profile/activity/refresh", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!validResidentSocialRequest(request)) {
      return reply
        .code(400)
        .send({ error: { code: "invalid_request", message: "活动刷新请求格式不正确。" } });
    }
    if (!requestOriginMatchesHost(request)) {
      return reply
        .code(403)
        .send({ error: { code: "origin_mismatch", message: "请从社区工作台刷新活动。" } });
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return reply
        .code(401)
        .send({ error: { code: "authentication_required", message: "请先登录。" } });
    }

    try {
      const community = await options.registrationAuth.getCurrentSessionWithMembership(token);
      let farmUnavailable = !options.refreshActivity;
      if (options.refreshActivity) {
        try {
          await options.refreshActivity(community);
        } catch {
          farmUnavailable = true;
        }
      }
      return residentSocialResponse(
        options.store.read(community.resident.residentId),
        farmUnavailable,
      );
    } catch (error) {
      return sendResidentSocialFailure(reply, error, options.secureCookies);
    }
  });
}

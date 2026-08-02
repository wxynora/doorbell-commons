import {
  currentHumanSessionSuccessSchema,
  farmLookupErrorSchema,
  farmLookupRequestSchema,
  farmLookupSuccessSchema,
  humanAuthenticationErrorSchema,
  humanLogoutSuccessSchema,
  humanSessionRequestSchema,
  humanSessionSuccessSchema,
  qqGroupEligibilityErrorSchema,
  qqGroupEligibilityRequestSchema,
  qqGroupEligibilitySuccessSchema,
  serviceHealthSchema,
} from "@doorbell/protocol";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { FarmDirectoryUnavailableError, FarmNotFoundError } from "./farm-directory-client.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import {
  AuthenticationRequiredError,
  FarmAlreadyBoundError,
  FarmConfirmationMismatchError,
  InvalidRegistrationCodeError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
  RegistrationProfileMismatchError,
  RegistrationProfileRequiredError,
} from "./registration-auth.js";
import {
  readHumanSessionToken,
  serializeClearedHumanSessionCookie,
  serializeHumanSessionCookie,
} from "./session-cookie.js";

export interface BuildAppOptions {
  groupId: string;
  groupMembership: QqGroupMembershipReader;
  registrationAuth: RegistrationAuthService;
  secureCookies: boolean;
  logger?: boolean;
}

function accountResponse(account: {
  accountId: string;
  qqNumber: string;
  createdAt: number;
  membershipStatus: "active" | "inactive";
}) {
  return {
    account_id: account.accountId,
    qq_number: account.qqNumber,
    created_at: new Date(account.createdAt).toISOString(),
    membership_status: account.membershipStatus,
  };
}

function communityResponse(community: {
  account: Parameters<typeof accountResponse>[0];
  resident: { residentId: string; residentName: string };
  home: { homeId: string; homeName: string };
  farmBinding: { farmDoorplate: string };
}) {
  return {
    account: accountResponse(community.account),
    resident: {
      resident_id: community.resident.residentId,
      resident_name: community.resident.residentName,
    },
    home: {
      home_id: community.home.homeId,
      home_name: community.home.homeName,
    },
    farm_binding: {
      farm_doorplate: community.farmBinding.farmDoorplate,
    },
  };
}

function sendAuthenticationError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 503,
  code:
    | "invalid_request"
    | "invalid_registration_code"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "authentication_required"
    | "farm_not_found"
    | "farm_unavailable"
    | "farm_confirmation_mismatch"
    | "registration_profile_required"
    | "registration_profile_mismatch"
    | "farm_already_bound",
  message: string,
) {
  return reply.code(statusCode).send(
    humanAuthenticationErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function reportOneBotUnavailable(request: FastifyRequest, error: OneBotUnavailableError): void {
  request.log.error({ error_name: error.name }, "OneBot group-membership lookup is unavailable");
}

function reportFarmUnavailable(
  request: FastifyRequest,
  error: FarmDirectoryUnavailableError,
): void {
  request.log.error({ error_name: error.name }, "Farm directory lookup is unavailable");
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.get("/api/health", async () =>
    serviceHealthSchema.parse({
      service: "doorbell-commons",
      status: "ok",
    }),
  );

  app.post("/api/registration/qq-group-eligibility", async (request, reply) => {
    const parsedRequest = qqGroupEligibilityRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.code(400).send(
        qqGroupEligibilityErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "qq_number must be a decimal string and no extra fields are accepted",
          },
        }),
      );
    }

    let isCurrentMember: boolean;
    try {
      isCurrentMember = await options.groupMembership.isCurrentMember(
        options.groupId,
        parsedRequest.data.qq_number,
      );
    } catch (error) {
      if (!(error instanceof OneBotUnavailableError)) {
        throw error;
      }

      request.log.error(
        { error_name: error.name },
        "OneBot group-membership lookup is unavailable",
      );
      return reply.code(503).send(
        qqGroupEligibilityErrorSchema.parse({
          error: {
            code: "onebot_unavailable",
            message: "QQ group membership could not be verified",
          },
        }),
      );
    }

    if (!isCurrentMember) {
      return reply.code(403).send(
        qqGroupEligibilityErrorSchema.parse({
          error: {
            code: "qq_not_group_member",
            message: "The submitted QQ number is not a current member of the community group",
          },
        }),
      );
    }

    return qqGroupEligibilitySuccessSchema.parse({
      eligible: true,
      qq_number: parsedRequest.data.qq_number,
      group_id: options.groupId,
    });
  });

  app.post("/api/registration/farm-lookup", async (request, reply) => {
    const parsedRequest = farmLookupRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.code(400).send(
        farmLookupErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "farm_doorplate must be one exact public farm doorplate",
          },
        }),
      );
    }

    try {
      const farm = await options.registrationAuth.lookupFarm(parsedRequest.data.farm_doorplate);
      return farmLookupSuccessSchema.parse({
        farm_doorplate: farm.farmDoorplate,
        farm_name: farm.farmName,
      });
    } catch (error) {
      if (error instanceof FarmNotFoundError) {
        return reply.code(404).send(
          farmLookupErrorSchema.parse({
            error: {
              code: "farm_not_found",
              message: "The submitted farm doorplate does not exist",
            },
          }),
        );
      }
      if (error instanceof FarmDirectoryUnavailableError) {
        reportFarmUnavailable(request, error);
        return reply.code(503).send(
          farmLookupErrorSchema.parse({
            error: {
              code: "farm_unavailable",
              message: "The farm directory could not be queried",
            },
          }),
        );
      }
      throw error;
    }
  });

  app.post("/api/auth/session", async (request, reply) => {
    const parsedRequest = humanSessionRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return sendAuthenticationError(
        reply,
        400,
        "invalid_request",
        "Submit exact QQ and registration-code fields, plus all four first-registration fields when completing resident, home, and farm registration",
      );
    }

    try {
      const firstRegistration =
        "resident_name" in parsedRequest.data
          ? {
              residentName: parsedRequest.data.resident_name,
              homeName: parsedRequest.data.home_name,
              farmDoorplate: parsedRequest.data.farm_doorplate,
              confirmedFarmName: parsedRequest.data.confirmed_farm_name,
            }
          : undefined;
      const session = await options.registrationAuth.createSession({
        qqNumber: parsedRequest.data.qq_number,
        registrationCode: parsedRequest.data.registration_code,
        ...(firstRegistration ? { firstRegistration } : {}),
      });
      reply.header("set-cookie", serializeHumanSessionCookie(session.token, options.secureCookies));
      return humanSessionSuccessSchema.parse({
        authenticated: true,
        account_created: session.accountCreated,
        ...communityResponse(session.community),
      });
    } catch (error) {
      if (error instanceof InvalidRegistrationCodeError) {
        return sendAuthenticationError(
          reply,
          403,
          "invalid_registration_code",
          "The registration code is not current",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        return sendAuthenticationError(
          reply,
          403,
          "qq_not_group_member",
          "The submitted QQ number is not a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof FarmNotFoundError) {
        return sendAuthenticationError(
          reply,
          404,
          "farm_not_found",
          "The submitted farm doorplate does not exist",
        );
      }
      if (error instanceof FarmDirectoryUnavailableError) {
        reportFarmUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "farm_unavailable",
          "The farm directory could not be queried",
        );
      }
      if (error instanceof FarmConfirmationMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_confirmation_mismatch",
          "The farm name changed or does not match the confirmed farm",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendAuthenticationError(
          reply,
          409,
          "registration_profile_required",
          "Resident, home, and farm fields are required to complete first registration",
        );
      }
      if (error instanceof RegistrationProfileMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "registration_profile_mismatch",
          "Submitted resident, home, or farm fields do not match the existing registration",
        );
      }
      if (error instanceof FarmAlreadyBoundError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_already_bound",
          "The submitted farm doorplate is already bound to another account",
        );
      }
      throw error;
    }
  });

  app.get("/api/auth/session", async (request, reply) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendAuthenticationError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const community = await options.registrationAuth.getCurrentSession(token);
      return currentHumanSessionSuccessSchema.parse({
        authenticated: true,
        ...communityResponse(community),
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendAuthenticationError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendAuthenticationError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendAuthenticationError(
          reply,
          409,
          "registration_profile_required",
          "Resident, home, and farm fields are required to complete first registration",
        );
      }
      throw error;
    }
  });

  app.delete("/api/auth/session", async (request, reply) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendAuthenticationError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      options.registrationAuth.logout(token);
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return humanLogoutSuccessSchema.parse({ logged_out: true });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendAuthenticationError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      throw error;
    }
  });

  return app;
}

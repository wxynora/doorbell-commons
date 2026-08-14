import {
  boundFarmOverviewErrorSchema,
  boundFarmOverviewRequestSchema,
  boundFarmOverviewSuccessSchema,
  connectorControlErrorSchema,
  connectorCredentialIssueSuccessSchema,
  connectorCredentialMutationRequestSchema,
  connectorCredentialRevokeSuccessSchema,
  connectorCredentialSchema,
  createdFarmHumanSessionSuccessSchema,
  currentHumanSessionSuccessSchema,
  farmHumanUiErrorSchema,
  farmLookupErrorSchema,
  farmLookupRequestSchema,
  farmLookupSuccessSchema,
  type HumanSettingsPatchRequest,
  humanAuthenticationErrorSchema,
  humanLogoutSuccessSchema,
  humanSessionRequestSchema,
  humanSessionSuccessSchema,
  humanSettingsErrorSchema,
  humanSettingsPatchRequestSchema,
  humanSettingsReadRequestSchema,
  humanSettingsSuccessSchema,
  type McpAccessErrorCode,
  mailboxClaimBodySchema,
  mailboxDetailRequestSchema,
  mailboxDetailSuccessSchema,
  mailboxErrorSchema,
  mailboxListRequestSchema,
  mailboxListSuccessSchema,
  mcpAccessErrorMessages,
  mcpAccessErrorSchema,
  mcpAccessMutationBodySchema,
  mcpAccessReadRequestSchema,
  mcpAccessStatusResponseSchema,
  mcpCredentialIssueResponseSchema,
  qqGroupEligibilityErrorSchema,
  qqGroupEligibilityRequestSchema,
  qqGroupEligibilitySuccessSchema,
  serviceHealthSchema,
  sharedMemeAddRequestSchema,
  sharedMemeAddSuccessSchema,
  sharedMemeDetailSuccessSchema,
  sharedMemeErrorSchema,
  sharedMemeIdSchema,
  sharedMemeLibraryMetadataSchema,
  sharedMemeListSuccessSchema,
  sharedMemeReadRequestSchema,
} from "@doorbell/protocol";
import websocket from "@fastify/websocket";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type {
  HumanSettingsPatch,
  HumanSettingsRecord,
  MailboxLetterRecord,
} from "./community-database.js";
import {
  ConnectorCredentialAuthenticationError,
  type ConnectorService,
} from "./connector-service.js";
import {
  FarmCreationConflictError,
  FarmCreationContractUnavailableError,
  FarmCreationRejectedError,
  FarmCreationUnavailableError,
} from "./farm-creation-client.js";
import {
  FarmDirectoryUnavailableError,
  FarmHumanCredentialInvalidError,
  FarmNotFoundError,
  FarmNotPubliclyReadableError,
  FarmUpstreamContractUnavailableError,
} from "./farm-directory-client.js";
import { InvalidFarmHumanUrlError } from "./farm-human-url.js";
import {
  FarmRewardContractUnavailableError,
  FarmRewardCredentialInvalidError,
  FarmRewardUnavailableError,
} from "./farm-reward-client.js";
import type { HomeWeatherEngine } from "./home-weather-engine.js";
import {
  MAILBOX_PAGE_SIZE,
  MailboxAttachmentNotClaimableError,
  MailboxLetterNotFoundError,
  type MailboxService,
} from "./mailbox-service.js";
import {
  McpAccessInternalContractError,
  type McpAccessService,
  McpCredentialNotConfiguredError,
  McpMigrationNotConfirmedError,
  McpRuntimeUnavailableError,
} from "./mcp-access-service.js";
import {
  FarmMcpMigrationBindingMismatchError,
  FarmMcpMigrationConflictError,
  FarmMcpMigrationContractUnavailableError,
  FarmMcpMigrationCredentialInvalidError,
  FarmMcpMigrationUnavailableError,
} from "./mcp-farm-migration-client.js";
import type { DoorbellMcpRuntime } from "./mcp-runtime.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import {
  AuthenticationRequiredError,
  FarmAlreadyBoundError,
  FarmConfirmationMismatchError,
  FarmCreationStateConflictError,
  FarmHumanKeyMismatchError,
  HumanAccountAlreadyRegisteredError,
  InvalidHumanCredentialsError,
  InvalidRegistrationCodeError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
  RegistrationProfileMismatchError,
  RegistrationProfileRequiredError,
  type RegistrationSessionResult,
} from "./registration-auth.js";
import {
  readHumanSessionToken,
  serializeClearedHumanSessionCookie,
  serializeHumanSessionCookie,
} from "./session-cookie.js";
import {
  SharedMemeDuplicateError,
  SharedMemeInvalidInputError,
  SharedMemeNotFoundError,
  type SharedMemeService,
} from "./shared-meme-service.js";

export interface BuildAppOptions {
  groupId: string;
  groupMembership: QqGroupMembershipReader;
  registrationAuth: RegistrationAuthService;
  connectorService?: ConnectorService;
  weatherEngine?: HomeWeatherEngine;
  mailboxService?: MailboxService;
  mcpAccessService?: McpAccessService;
  mcpRuntime?: DoorbellMcpRuntime;
  sharedMemeService?: SharedMemeService;
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

function humanSettingsResponse(settings: HumanSettingsRecord, connectorService?: ConnectorService) {
  return humanSettingsSuccessSchema.parse({
    connection_status: {
      connector: {
        ...(connectorService?.getSettingsStatus(settings.residentId) ?? {
          status: "not_configured",
          last_online_at: null,
        }),
      },
      wake_bridge: {
        status: "not_integrated",
      },
    },
    home: {
      home_name: settings.homeName,
      environment_description: settings.environmentDescription,
      climate_type: settings.climateType,
      weather_state:
        settings.weatherState === null
          ? null
          : {
              weather_revision: settings.weatherState.weatherRevision,
              season_phase: settings.weatherState.seasonPhase,
              condition: settings.weatherState.condition,
              state_started_at:
                settings.weatherState.stateStartedAt === null
                  ? null
                  : new Date(settings.weatherState.stateStartedAt).toISOString(),
              next_transition_at:
                settings.weatherState.nextTransitionAt === null
                  ? null
                  : new Date(settings.weatherState.nextTransitionAt).toISOString(),
            },
    },
    notification_preferences: {
      pause_all_wakeups: settings.pauseAllWakeups,
      visit_requests_and_invitations_enabled: settings.visitRequestsAndInvitationsEnabled,
      activity_invitations_enabled: settings.activityInvitationsEnabled,
      important_system_notifications_enabled: settings.importantSystemNotificationsEnabled,
    },
    community_connection_preferences: {
      default_connection_duration_minutes: settings.defaultConnectionDurationMinutes,
      initial_recent_activity_count: settings.initialRecentActivityCount,
      chat_mode: settings.chatMode,
      allow_activity_room_warmup: settings.allowActivityRoomWarmup,
    },
  });
}

function humanSettingsPatch(request: HumanSettingsPatchRequest): HumanSettingsPatch {
  const patch: HumanSettingsPatch = {};
  if (request.home?.home_name !== undefined) {
    patch.homeName = request.home.home_name;
  }
  if (request.home?.environment_description !== undefined) {
    patch.environmentDescription = request.home.environment_description;
  }
  if (request.home?.climate_type !== undefined) {
    patch.climateType = request.home.climate_type;
  }
  if (request.notification_preferences?.pause_all_wakeups !== undefined) {
    patch.pauseAllWakeups = request.notification_preferences.pause_all_wakeups;
  }
  if (request.notification_preferences?.visit_requests_and_invitations_enabled !== undefined) {
    patch.visitRequestsAndInvitationsEnabled =
      request.notification_preferences.visit_requests_and_invitations_enabled;
  }
  if (request.notification_preferences?.activity_invitations_enabled !== undefined) {
    patch.activityInvitationsEnabled =
      request.notification_preferences.activity_invitations_enabled;
  }
  if (request.notification_preferences?.important_system_notifications_enabled !== undefined) {
    patch.importantSystemNotificationsEnabled =
      request.notification_preferences.important_system_notifications_enabled;
  }
  if (request.community_connection_preferences?.default_connection_duration_minutes !== undefined) {
    patch.defaultConnectionDurationMinutes =
      request.community_connection_preferences.default_connection_duration_minutes;
  }
  if (request.community_connection_preferences?.initial_recent_activity_count !== undefined) {
    patch.initialRecentActivityCount =
      request.community_connection_preferences.initial_recent_activity_count;
  }
  if (request.community_connection_preferences?.chat_mode !== undefined) {
    patch.chatMode = request.community_connection_preferences.chat_mode;
  }
  if (request.community_connection_preferences?.allow_activity_room_warmup !== undefined) {
    patch.allowActivityRoomWarmup =
      request.community_connection_preferences.allow_activity_room_warmup;
  }
  return patch;
}

function mailboxAttachmentResponse(letter: MailboxLetterRecord) {
  return letter.attachment === null
    ? null
    : {
        attachment_type: letter.attachment.attachmentType,
        status: letter.attachment.status,
      };
}

function mailboxLetterSummaryResponse(letter: MailboxLetterRecord) {
  return {
    letter_id: letter.letterId,
    title: letter.title,
    category: letter.category,
    created_at: new Date(letter.createdAt).toISOString(),
    is_new: letter.isNew,
    attachment: mailboxAttachmentResponse(letter),
  };
}

function readConnectorCredential(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  const parsed = connectorCredentialSchema.safeParse(authorization.slice("Bearer ".length));
  return parsed.success ? parsed.data : undefined;
}

function sendMailboxError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "letter_not_found"
    | "attachment_not_claimable"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(
    mailboxErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendSharedMemeError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "shared_meme_not_found"
    | "duplicate_shared_meme_term"
    | "duplicate_shared_meme_alias"
    | "shared_meme_unavailable",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(sharedMemeErrorSchema.parse({ error: { code, message } }));
}

function sendAuthenticationError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "invalid_credentials"
    | "invalid_registration_code"
    | "account_already_registered"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "authentication_required"
    | "farm_not_found"
    | "farm_unavailable"
    | "farm_confirmation_mismatch"
    | "invalid_farm_human_url"
    | "invalid_farm_human_key"
    | "farm_human_key_mismatch"
    | "upstream_contract_unavailable"
    | "registration_profile_required"
    | "registration_profile_mismatch"
    | "farm_already_bound"
    | "farm_creation_conflict"
    | "farm_creation_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(
    humanAuthenticationErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundFarmError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_not_found"
    | "farm_not_publicly_readable"
    | "farm_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(
    boundFarmOverviewErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendHumanSettingsError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required",
  message: string,
) {
  return reply.code(statusCode).send(
    humanSettingsErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendConnectorControlError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "connector_not_configured",
  message: string,
) {
  return reply.code(statusCode).send(
    connectorControlErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendMcpAccessError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 405 | 409 | 500 | 502 | 503,
  code: McpAccessErrorCode,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    mcpAccessErrorSchema.parse({
      error: {
        code,
        message: mcpAccessErrorMessages[code],
      },
    }),
  );
}

function sendFarmHumanUiError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(
    farmHumanUiErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function reportOneBotUnavailable(request: FastifyRequest, error: OneBotUnavailableError): void {
  request.log.error({ error_name: error.name }, "OneBot group-membership lookup is unavailable");
}

function reportFarmUnavailable(
  request: FastifyRequest,
  error: FarmDirectoryUnavailableError | FarmUpstreamContractUnavailableError,
): void {
  request.log.error({ error_name: error.name }, "Farm directory lookup is unavailable");
}

const FARM_HUMAN_GET_ROUTES = new Map<string, readonly string[]>([
  ["", []],
  ["messages", []],
  ["market", []],
  ["ranch", []],
  ["cooking", []],
  ["ta", []],
  ["expedition", []],
  ["codex", []],
  ["leaderboard", []],
  ["ta/link-design", ["name", "desc", "plant", "harvest", "latin"]],
  ["ta/link-message", ["target", "text"]],
  ["ta/link-craft", ["m1", "m2", "m3"]],
  ["ta/link-visit", ["target"]],
]);

const INDEPENDENT_FARM_HUMAN_SECTIONS = new Set(["glimmer", "together"]);

const FARM_HUMAN_POST_ROUTES = new Map<string, readonly string[]>([
  ["harvest", []],
  ["title", ["id"]],
  ["market/buy", ["seller", "kind", "id", "qty"]],
  ["market/list", ["give", "giveQty", "want", "wantQty"]],
  ["market/trade", ["seller", "listing"]],
  ["market/unlist", ["listing"]],
  ["ranch/collect", []],
  ["ranch/feed", ["animal"]],
  ["ranch/remit", ["amount"]],
  ["ranch/dress", ["acc"]],
  ["ranch/decorate", ["decor"]],
  ["ranch/place", ["decor"]],
  ["ranch/unplace", ["decor"]],
  ["ranch/wear", ["acc", "who"]],
  ["ranch/takeoff", ["acc", "target", "idx"]],
  ["ranch/upgrade", ["animal"]],
  ["ranch/name-animal", ["animal", "name"]],
  ["ranch/name-pet", ["pet", "name"]],
  ["ranch/name-goose", ["name"]],
  ["ranch/pin", ["kind"]],
  ["ranch/variant", ["type", "kind", "variant"]],
  ["ranch/dispatch-raid", ["animal", "to", "hours"]],
  ["ranch/catch-raid", ["raid"]],
  ["cooking/buy-ingredient", ["id", "qty"]],
  ["cooking/buy-recipe", ["id"]],
  ["cooking/cook", ["items"]],
  ["cooking/use", ["dishId", "target"]],
  ["cooking/sell", ["itemId", "itemIds", "qty", "to", "price"]],
  ["ta/names", ["farmName", "aiName", "humanName"]],
  ["ta/welcome", ["text"]],
  ["ta/social", ["key", "on"]],
  ["ta/design", ["name", "desc", "plant", "harvest", "latin"]],
  ["ta/message", ["target", "text"]],
  ["ta/craft", ["m1", "m2", "m3"]],
  ["expedition/roll", []],
  ["expedition/charm", ["kind", "blessing"]],
  ["codex/star", ["id", "anchor"]],
]);

function validateParameters(
  parameters: URLSearchParams,
  allowedFields: readonly string[],
): URLSearchParams | undefined {
  const allowed = new Set(allowedFields);
  const seen = new Set<string>();
  for (const key of parameters.keys()) {
    if (!allowed.has(key) || seen.has(key)) {
      return undefined;
    }
    seen.add(key);
  }
  return parameters;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                'res.headers["set-cookie"]',
              ],
              censor: "[Redacted]",
            },
          },
  });
  app.register(websocket);
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) =>
      done(null, new URLSearchParams(typeof body === "string" ? body : body.toString("utf8"))),
  );

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
        "Submit the exact password-login or first-registration fields",
      );
    }

    try {
      const firstRegistration =
        "resident_name" in parsedRequest.data
          ? "farm_human_url" in parsedRequest.data
            ? {
                mode: "bind_existing" as const,
                residentName: parsedRequest.data.resident_name,
                homeName: parsedRequest.data.home_name,
                farmDoorplate: parsedRequest.data.farm_doorplate,
                farmHumanUrl: parsedRequest.data.farm_human_url,
                confirmedFarmName: parsedRequest.data.confirmed_farm_name,
                password: parsedRequest.data.password,
              }
            : {
                mode: "create_farm" as const,
                residentName: parsedRequest.data.resident_name,
                homeName: parsedRequest.data.home_name,
                farmName: parsedRequest.data.farm_name,
                aiName: parsedRequest.data.ai_name,
                password: parsedRequest.data.password,
              }
          : undefined;
      const session: RegistrationSessionResult =
        "registration_code" in parsedRequest.data
          ? await options.registrationAuth.createSession({
              qqNumber: parsedRequest.data.qq_number,
              registrationCode: parsedRequest.data.registration_code,
              ...(firstRegistration ? { firstRegistration } : {}),
            })
          : await options.registrationAuth.createPasswordSession({
              qqNumber: parsedRequest.data.qq_number,
              password: parsedRequest.data.password,
            });
      try {
        options.mailboxService?.ensureWelcomeLetter(
          session.community.home.homeId,
          session.community.farmBinding.farmHumanKey ?? "",
        );
      } catch (error) {
        request.log.error(
          { error_name: error instanceof Error ? error.name : "UnknownError" },
          "Welcome-letter delivery failed after the human session was created",
        );
      }
      reply.header("set-cookie", serializeHumanSessionCookie(session.token, options.secureCookies));
      if (session.createdFarm) {
        reply.header("cache-control", "no-store");
        return createdFarmHumanSessionSuccessSchema.parse({
          authenticated: true,
          account_created: session.accountCreated,
          ...communityResponse(session.community),
          created_farm: {
            farm_doorplate: session.createdFarm.farmDoorplate,
            farm_name: session.createdFarm.farmName,
            ai_name: session.createdFarm.aiName,
            farm_human_url: session.createdFarm.farmHumanUrl,
          },
        });
      }
      return humanSessionSuccessSchema.parse({
        authenticated: true,
        account_created: session.accountCreated,
        ...communityResponse(session.community),
      });
    } catch (error) {
      if (error instanceof InvalidHumanCredentialsError) {
        return sendAuthenticationError(
          reply,
          401,
          "invalid_credentials",
          "The QQ number or password is incorrect",
        );
      }
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
      if (error instanceof FarmHumanCredentialInvalidError) {
        return sendAuthenticationError(
          reply,
          403,
          "invalid_farm_human_key",
          "The submitted farm human credential is invalid",
        );
      }
      if (error instanceof InvalidFarmHumanUrlError) {
        return sendAuthenticationError(
          reply,
          400,
          "invalid_farm_human_url",
          "farm_human_url must use the configured farm origin and /farm/ui/<humanKey> path",
        );
      }
      if (error instanceof FarmHumanKeyMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_human_key_mismatch",
          "The submitted farm human credential belongs to a different farm doorplate",
        );
      }
      if (error instanceof FarmUpstreamContractUnavailableError) {
        reportFarmUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm identity response could not be verified",
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
      if (error instanceof FarmCreationRejectedError) {
        return sendAuthenticationError(
          reply,
          400,
          "invalid_request",
          "The farm creation details were rejected",
        );
      }
      if (
        error instanceof FarmCreationConflictError ||
        error instanceof FarmCreationStateConflictError
      ) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_creation_conflict",
          "This farm creation request conflicts with an existing attempt",
        );
      }
      if (error instanceof FarmCreationContractUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm creation receipt could not be verified",
        );
        return sendAuthenticationError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm creation response could not be verified",
        );
      }
      if (error instanceof FarmCreationUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm creation service is unavailable");
        return sendAuthenticationError(
          reply,
          503,
          "farm_creation_unavailable",
          "The farm could not be created at this time",
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
      if (error instanceof HumanAccountAlreadyRegisteredError) {
        return sendAuthenticationError(
          reply,
          409,
          "account_already_registered",
          "This QQ account is already registered; use its password to log in",
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

  const sendMailboxFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendMailboxError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendMailboxError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendMailboxError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendMailboxError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    if (error instanceof MailboxLetterNotFoundError) {
      return sendMailboxError(
        reply,
        404,
        "letter_not_found",
        "The requested mailbox letter does not exist in this home",
      );
    }
    if (error instanceof MailboxAttachmentNotClaimableError) {
      return sendMailboxError(
        reply,
        409,
        "attachment_not_claimable",
        "The mailbox letter has no claimable attachment",
      );
    }
    if (error instanceof FarmRewardCredentialInvalidError) {
      return sendMailboxError(
        reply,
        409,
        "farm_credential_invalid",
        "The bound farm credential is no longer valid",
      );
    }
    if (error instanceof FarmRewardUnavailableError) {
      return sendMailboxError(
        reply,
        503,
        "farm_unavailable",
        "The farm reward service is unavailable",
      );
    }
    if (error instanceof FarmRewardContractUnavailableError) {
      return sendMailboxError(
        reply,
        502,
        "upstream_contract_unavailable",
        "The farm reward receipt could not be verified",
      );
    }
    throw error;
  };

  const mailboxService = options.mailboxService;
  if (mailboxService) {
    app.get("/api/mailbox", async (request, reply) => {
      const parsedRequest = mailboxListRequestSchema.safeParse(request.query);
      if (!parsedRequest.success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Mailbox list accepts one positive page number and one supported category",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }

      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const page = mailboxService.listForAudience(
          community.home.homeId,
          "human",
          parsedRequest.data.page,
          parsedRequest.data.category,
        );
        return mailboxListSuccessSchema.parse({
          letters: page.letters.map(mailboxLetterSummaryResponse),
          pagination: {
            page: parsedRequest.data.page,
            page_size: MAILBOX_PAGE_SIZE,
            total_items: page.totalItems,
            total_pages: Math.ceil(page.totalItems / MAILBOX_PAGE_SIZE),
          },
        });
      } catch (error) {
        return sendMailboxFailure(request, reply, error);
      }
    });

    app.get("/api/mailbox/:letterId", async (request, reply) => {
      if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Mailbox detail does not accept query parameters",
        );
      }
      const parsedRequest = mailboxDetailRequestSchema.safeParse({
        letter_id: (request.params as { letterId?: unknown }).letterId,
      });
      if (!parsedRequest.success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "letter_id must be a valid mailbox letter identifier",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }

      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const letter = mailboxService.openForAudience(
          community.home.homeId,
          "human",
          parsedRequest.data.letter_id,
        );
        return mailboxDetailSuccessSchema.parse({
          letter: {
            ...mailboxLetterSummaryResponse(letter),
            body: letter.body,
          },
        });
      } catch (error) {
        return sendMailboxFailure(request, reply, error);
      }
    });

    app.post("/api/mailbox/:letterId/claim", async (request, reply) => {
      const parsedRequest = mailboxDetailRequestSchema.safeParse({
        letter_id: (request.params as { letterId?: unknown }).letterId,
      });
      if (
        !humanSettingsReadRequestSchema.safeParse(request.query).success ||
        !mailboxClaimBodySchema.safeParse(request.body ?? {}).success ||
        !parsedRequest.success
      ) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Mailbox attachment claim accepts only a valid letter_id and an empty body",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }

      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const letter = await mailboxService.claimFarmReward(
          community.home.homeId,
          "human",
          parsedRequest.data.letter_id,
        );
        return mailboxDetailSuccessSchema.parse({
          letter: {
            ...mailboxLetterSummaryResponse(letter),
            body: letter.body,
          },
        });
      } catch (error) {
        return sendMailboxFailure(request, reply, error);
      }
    });
  }

  const sharedMemeService = options.sharedMemeService;
  const sendHumanSharedMemeFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
  ) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendSharedMemeError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendSharedMemeError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendSharedMemeError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendSharedMemeError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    if (error instanceof SharedMemeNotFoundError) {
      return sendSharedMemeError(
        reply,
        404,
        "shared_meme_not_found",
        "The requested shared meme does not exist",
      );
    }
    if (error instanceof SharedMemeDuplicateError) {
      return sendSharedMemeError(
        reply,
        409,
        error.kind === "term" ? "duplicate_shared_meme_term" : "duplicate_shared_meme_alias",
        error.kind === "term"
          ? "The normalized shared meme term already exists"
          : "A normalized shared meme alias already exists",
      );
    }
    if (error instanceof SharedMemeInvalidInputError) {
      return sendSharedMemeError(
        reply,
        400,
        "invalid_request",
        "The shared meme request does not match the supported contract",
      );
    }
    throw error;
  };

  if (sharedMemeService) {
    app.get("/api/shared-memes", async (request, reply) => {
      if (!sharedMemeReadRequestSchema.safeParse(request.query).success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "The shared meme list does not accept query parameters",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendSharedMemeError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        await options.registrationAuth.getCurrentSession(token);
        const library = sharedMemeService.list();
        reply.header("cache-control", "no-store");
        return sharedMemeListSuccessSchema.parse({
          library: library.metadata,
          memes: library.memes,
        });
      } catch (error) {
        return sendHumanSharedMemeFailure(request, reply, error);
      }
    });

    app.get("/api/shared-memes/:memeId", async (request, reply) => {
      const memeId = sharedMemeIdSchema.safeParse((request.params as { memeId?: unknown }).memeId);
      if (!sharedMemeReadRequestSchema.safeParse(request.query).success || !memeId.success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "A positive meme_id and no query parameters are required",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendSharedMemeError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        await options.registrationAuth.getCurrentSession(token);
        const detail = sharedMemeService.get(memeId.data);
        reply.header("cache-control", "no-store");
        return sharedMemeDetailSuccessSchema.parse({
          library_version: detail.libraryVersion,
          meme: detail.meme,
        });
      } catch (error) {
        return sendHumanSharedMemeFailure(request, reply, error);
      }
    });

    app.post("/api/shared-memes", async (request, reply) => {
      if (!sharedMemeReadRequestSchema.safeParse(request.query).success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "The shared meme add request does not accept query parameters",
        );
      }
      const input = sharedMemeAddRequestSchema.safeParse(request.body);
      if (!input.success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "The shared meme request does not match the supported contract",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendSharedMemeError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const created = sharedMemeService.add(input.data, community.account.accountId);
        options.connectorService?.emitSharedMemeVersionHint(created.metadata.library_version);
        reply.header("cache-control", "no-store");
        return sharedMemeAddSuccessSchema.parse({
          created: true,
          library: created.metadata,
          meme: created.meme,
        });
      } catch (error) {
        return sendHumanSharedMemeFailure(request, reply, error);
      }
    });
  }

  const sendHumanSettingsFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
  ) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendHumanSettingsError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendHumanSettingsError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendHumanSettingsError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendHumanSettingsError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    throw error;
  };

  const sendConnectorControlFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
  ) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendConnectorControlError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendConnectorControlError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendConnectorControlError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendConnectorControlError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    throw error;
  };

  const mcpRuntime = options.mcpRuntime;
  if (mcpRuntime) {
    const mcpRuntimeErrorHandler = (
      error: FastifyError,
      request: FastifyRequest,
      reply: FastifyReply,
    ): void => {
      reply.header("cache-control", "no-store");
      if (error.statusCode === 400) {
        void reply.code(400).send({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
        return;
      }
      request.log.error({ error_name: error.name }, "Doorbell MCP request failed");
      void reply.code(500).send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal error" },
      });
    };

    app.post("/mcp", { errorHandler: mcpRuntimeErrorHandler }, async (request, reply) => {
      const authorization = Array.isArray(request.headers.authorization)
        ? request.headers.authorization[0]
        : request.headers.authorization;
      const origin = Array.isArray(request.headers.origin)
        ? request.headers.origin[0]
        : request.headers.origin;
      const protocolVersionHeader = request.headers["mcp-protocol-version"];
      const protocolVersion = Array.isArray(protocolVersionHeader)
        ? protocolVersionHeader[0]
        : protocolVersionHeader;
      const result = await mcpRuntime.handlePost({
        ...(authorization ? { authorization } : {}),
        ...(origin ? { origin } : {}),
        protocolVersion: protocolVersion ?? null,
        body: request.body,
      });
      for (const [name, value] of Object.entries(result.headers)) {
        reply.header(name, value);
      }
      if (result.body === undefined) {
        return reply.code(result.statusCode).send();
      }
      return reply.code(result.statusCode).send(result.body);
    });
    app.route({
      method: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "PUT"],
      url: "/mcp",
      exposeHeadRoute: false,
      errorHandler: mcpRuntimeErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "POST");
        reply.header("cache-control", "no-store");
        return reply.code(405).send();
      },
    });
  }

  const mcpAccessService = options.mcpAccessService;
  if (mcpAccessService) {
    const sendMcpAccessFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
      if (error instanceof AuthenticationRequiredError) {
        return sendMcpAccessError(reply, 401, "authentication_required");
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendMcpAccessError(reply, 403, "qq_not_group_member");
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendMcpAccessError(reply, 503, "membership_verification_unavailable");
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendMcpAccessError(reply, 409, "registration_profile_required");
      }
      if (error instanceof FarmMcpMigrationCredentialInvalidError) {
        return sendMcpAccessError(reply, 409, "farm_credential_invalid");
      }
      if (error instanceof FarmMcpMigrationBindingMismatchError) {
        return sendMcpAccessError(reply, 409, "farm_binding_mismatch");
      }
      if (error instanceof FarmMcpMigrationConflictError) {
        return sendMcpAccessError(reply, 409, "farm_migration_conflict");
      }
      if (error instanceof McpMigrationNotConfirmedError) {
        return sendMcpAccessError(reply, 409, "migration_not_confirmed");
      }
      if (error instanceof FarmMcpMigrationContractUnavailableError) {
        return sendMcpAccessError(reply, 502, "upstream_contract_unavailable");
      }
      if (error instanceof FarmMcpMigrationUnavailableError) {
        return sendMcpAccessError(reply, 503, "farm_unavailable");
      }
      if (error instanceof McpRuntimeUnavailableError) {
        return sendMcpAccessError(reply, 503, "mcp_runtime_unavailable");
      }
      if (error instanceof McpCredentialNotConfiguredError) {
        return sendMcpAccessError(reply, 404, "mcp_credential_not_configured");
      }
      if (error instanceof McpAccessInternalContractError) {
        return sendMcpAccessError(reply, 500, "internal_contract_error");
      }
      request.log.error(
        { error_name: error instanceof Error ? error.name : "UnknownError" },
        "MCP access control request failed",
      );
      return sendMcpAccessError(reply, 500, "internal_contract_error");
    };

    const mcpRouteErrorHandler = (
      error: FastifyError,
      request: FastifyRequest,
      reply: FastifyReply,
    ): void => {
      if (error.statusCode === 400) {
        void sendMcpAccessError(reply, 400, "invalid_request");
        return;
      }
      request.log.error({ error_name: error.name }, "MCP access route parsing failed");
      void sendMcpAccessError(reply, 500, "internal_contract_error");
    };

    app.get(
      "/api/mcp-access",
      { exposeHeadRoute: false, errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          request.body !== undefined ||
          !mcpAccessReadRequestSchema.safeParse(request.query).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const status = await mcpAccessService.getStatus(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpAccessStatusResponseSchema.parse(status));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.post(
      "/api/mcp-access/claim",
      { errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          !mcpAccessReadRequestSchema.safeParse(request.query).success ||
          !mcpAccessMutationBodySchema.safeParse(request.body).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const status = await mcpAccessService.claim(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpAccessStatusResponseSchema.parse(status));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.post(
      "/api/mcp-access/credential",
      { errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          !mcpAccessReadRequestSchema.safeParse(request.query).success ||
          !mcpAccessMutationBodySchema.safeParse(request.body).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const credential = await mcpAccessService.issueCredential(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpCredentialIssueResponseSchema.parse(credential));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.delete(
      "/api/mcp-access/credential",
      { errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          !mcpAccessReadRequestSchema.safeParse(request.query).success ||
          !mcpAccessMutationBodySchema.safeParse(request.body).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const status = await mcpAccessService.revokeCredential(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpAccessStatusResponseSchema.parse(status));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.route({
      method: ["DELETE", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
      url: "/api/mcp-access",
      errorHandler: mcpRouteErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "GET");
        return sendMcpAccessError(reply, 405, "method_not_allowed");
      },
    });
    app.route({
      method: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "PUT"],
      url: "/api/mcp-access/claim",
      exposeHeadRoute: false,
      errorHandler: mcpRouteErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "POST");
        return sendMcpAccessError(reply, 405, "method_not_allowed");
      },
    });
    app.route({
      method: ["GET", "HEAD", "OPTIONS", "PATCH", "PUT"],
      url: "/api/mcp-access/credential",
      exposeHeadRoute: false,
      errorHandler: mcpRouteErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "POST, DELETE");
        return sendMcpAccessError(reply, 405, "method_not_allowed");
      },
    });
  }

  const connectorService = options.connectorService;
  if (connectorService) {
    const sendConnectorMailboxFailure = (
      request: FastifyRequest,
      reply: FastifyReply,
      error: unknown,
    ) => {
      if (
        error instanceof ConnectorCredentialAuthenticationError ||
        error instanceof AuthenticationRequiredError
      ) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active Connector credential is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        return sendMailboxError(
          reply,
          403,
          "qq_not_group_member",
          "The Connector resident is no longer qualified for the community",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendMailboxError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendMailboxError(
          reply,
          409,
          "registration_profile_required",
          "A complete resident and home registration is required",
        );
      }
      if (error instanceof MailboxLetterNotFoundError) {
        return sendMailboxError(
          reply,
          404,
          "letter_not_found",
          "The requested mailbox letter does not exist in this resident's home",
        );
      }
      if (error instanceof MailboxAttachmentNotClaimableError) {
        return sendMailboxError(
          reply,
          409,
          "attachment_not_claimable",
          "The mailbox letter has no claimable attachment",
        );
      }
      if (error instanceof FarmRewardCredentialInvalidError) {
        return sendMailboxError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm credential is no longer valid",
        );
      }
      if (error instanceof FarmRewardUnavailableError) {
        return sendMailboxError(
          reply,
          503,
          "farm_unavailable",
          "The farm reward service is unavailable",
        );
      }
      if (error instanceof FarmRewardContractUnavailableError) {
        return sendMailboxError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm reward receipt could not be verified",
        );
      }
      throw error;
    };

    const sendConnectorSharedMemeFailure = (
      request: FastifyRequest,
      reply: FastifyReply,
      error: unknown,
    ) => {
      if (
        error instanceof ConnectorCredentialAuthenticationError ||
        error instanceof AuthenticationRequiredError
      ) {
        return sendSharedMemeError(
          reply,
          401,
          "authentication_required",
          "An active Connector credential is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        return sendSharedMemeError(
          reply,
          403,
          "qq_not_group_member",
          "The Connector resident is no longer qualified for the community",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendSharedMemeError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendSharedMemeError(
          reply,
          409,
          "registration_profile_required",
          "A complete resident and home registration is required",
        );
      }
      throw error;
    };

    if (sharedMemeService) {
      app.get("/api/connector/shared-memes/version", async (request, reply) => {
        if (!sharedMemeReadRequestSchema.safeParse(request.query).success) {
          return sendSharedMemeError(
            reply,
            400,
            "invalid_request",
            "The shared meme version request does not accept query parameters",
          );
        }
        const credential = readConnectorCredential(request.headers.authorization);
        if (!credential) {
          return sendSharedMemeError(
            reply,
            401,
            "authentication_required",
            "An active Connector credential is required",
          );
        }
        try {
          await connectorService.authorizeCredential(credential);
          reply.header("cache-control", "no-store");
          return sharedMemeLibraryMetadataSchema.parse(sharedMemeService.getMetadata());
        } catch (error) {
          return sendConnectorSharedMemeFailure(request, reply, error);
        }
      });

      app.get("/api/connector/shared-memes/snapshot", async (request, reply) => {
        if (!sharedMemeReadRequestSchema.safeParse(request.query).success) {
          return sendSharedMemeError(
            reply,
            400,
            "invalid_request",
            "The shared meme snapshot request does not accept query parameters",
          );
        }
        const credential = readConnectorCredential(request.headers.authorization);
        if (!credential) {
          return sendSharedMemeError(
            reply,
            401,
            "authentication_required",
            "An active Connector credential is required",
          );
        }
        try {
          await connectorService.authorizeCredential(credential);
          const release = sharedMemeService.getSnapshot();
          reply.header("cache-control", "no-store");
          reply.header("content-type", "application/vnd.sqlite3");
          reply.header("content-length", String(release.metadata.size_bytes));
          reply.header("x-doorbell-library-version", String(release.metadata.library_version));
          reply.header(
            "x-doorbell-snapshot-schema-version",
            String(release.metadata.snapshot_schema_version),
          );
          reply.header("x-doorbell-checksum-sha256", release.metadata.checksum_sha256);
          return reply.send(release.snapshot);
        } catch (error) {
          return sendConnectorSharedMemeFailure(request, reply, error);
        }
      });
    }

    app.post("/api/connector/credential", async (request, reply) => {
      if (
        !humanSettingsReadRequestSchema.safeParse(request.query).success ||
        !connectorCredentialMutationRequestSchema.safeParse(request.body).success
      ) {
        return sendConnectorControlError(
          reply,
          400,
          "invalid_request",
          "The Connector credential request accepts only an empty object body",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendConnectorControlError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        const issued = await connectorService.issueCredential(token);
        return connectorCredentialIssueSuccessSchema.parse({
          configured: true,
          credential_id: issued.credentialId,
          connector_credential: issued.credential,
          issued_at: new Date(issued.issuedAt).toISOString(),
          replaced_previous: issued.replacedPrevious,
        });
      } catch (error) {
        return sendConnectorControlFailure(request, reply, error);
      }
    });

    app.delete("/api/connector/credential", async (request, reply) => {
      if (
        !humanSettingsReadRequestSchema.safeParse(request.query).success ||
        !connectorCredentialMutationRequestSchema.safeParse(request.body).success
      ) {
        return sendConnectorControlError(
          reply,
          400,
          "invalid_request",
          "The Connector credential revocation accepts only an empty object body",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendConnectorControlError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        if (!(await connectorService.revokeCredential(token))) {
          return sendConnectorControlError(
            reply,
            404,
            "connector_not_configured",
            "No active Connector credential is configured",
          );
        }
        return connectorCredentialRevokeSuccessSchema.parse({ revoked: true });
      } catch (error) {
        return sendConnectorControlFailure(request, reply, error);
      }
    });

    app.get("/api/connector/mailbox", async (request, reply) => {
      const parsedRequest = mailboxListRequestSchema.safeParse(request.query);
      if (!parsedRequest.success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Connector mailbox list accepts one positive page number and one supported category",
        );
      }
      const credential = readConnectorCredential(request.headers.authorization);
      if (!credential) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active Connector credential is required",
        );
      }
      try {
        const page = await connectorService.listMailbox(
          credential,
          parsedRequest.data.page,
          parsedRequest.data.category,
        );
        return mailboxListSuccessSchema.parse({
          letters: page.letters.map(mailboxLetterSummaryResponse),
          pagination: {
            page: parsedRequest.data.page,
            page_size: MAILBOX_PAGE_SIZE,
            total_items: page.totalItems,
            total_pages: Math.ceil(page.totalItems / MAILBOX_PAGE_SIZE),
          },
        });
      } catch (error) {
        return sendConnectorMailboxFailure(request, reply, error);
      }
    });

    app.get("/api/connector/mailbox/:letterId", async (request, reply) => {
      if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Connector mailbox detail does not accept query parameters",
        );
      }
      const parsedRequest = mailboxDetailRequestSchema.safeParse({
        letter_id: (request.params as { letterId?: unknown }).letterId,
      });
      if (!parsedRequest.success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "letter_id must be a valid mailbox letter identifier",
        );
      }
      const credential = readConnectorCredential(request.headers.authorization);
      if (!credential) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active Connector credential is required",
        );
      }
      try {
        const letter = await connectorService.readMailbox(credential, parsedRequest.data.letter_id);
        return mailboxDetailSuccessSchema.parse({
          letter: {
            ...mailboxLetterSummaryResponse(letter),
            body: letter.body,
          },
        });
      } catch (error) {
        return sendConnectorMailboxFailure(request, reply, error);
      }
    });

    app.post("/api/connector/mailbox/:letterId/claim", async (request, reply) => {
      const parsedRequest = mailboxDetailRequestSchema.safeParse({
        letter_id: (request.params as { letterId?: unknown }).letterId,
      });
      if (
        !humanSettingsReadRequestSchema.safeParse(request.query).success ||
        !mailboxClaimBodySchema.safeParse(request.body ?? {}).success ||
        !parsedRequest.success
      ) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Connector mailbox claim accepts only a valid letter_id and an empty body",
        );
      }
      const credential = readConnectorCredential(request.headers.authorization);
      if (!credential) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active Connector credential is required",
        );
      }
      try {
        const letter = await connectorService.claimMailboxReward(
          credential,
          parsedRequest.data.letter_id,
        );
        return mailboxDetailSuccessSchema.parse({
          letter: {
            ...mailboxLetterSummaryResponse(letter),
            body: letter.body,
          },
        });
      } catch (error) {
        return sendConnectorMailboxFailure(request, reply, error);
      }
    });

    app.register(async (realtimeApp) => {
      realtimeApp.get("/api/connector/ws", { websocket: true }, (socket) => {
        connectorService.acceptSocket(socket);
      });
    });

    app.addHook("onClose", () => {
      connectorService.close();
    });
  }

  app.get("/api/settings", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The settings read does not accept query parameters",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendHumanSettingsError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const settings = await options.registrationAuth.getCurrentHumanSettings(token);
      return humanSettingsResponse(
        options.weatherEngine?.ensureCurrent(settings) ?? settings,
        options.connectorService,
      );
    } catch (error) {
      return sendHumanSettingsFailure(request, reply, error);
    }
  });

  app.patch("/api/settings", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The settings update does not accept query parameters",
      );
    }
    const parsedRequest = humanSettingsPatchRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The settings update does not match the supported settings contract",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendHumanSettingsError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const settings = await options.registrationAuth.updateCurrentHumanSettings(
        token,
        humanSettingsPatch(parsedRequest.data),
      );
      return humanSettingsResponse(
        options.weatherEngine?.ensureCurrent(settings) ?? settings,
        options.connectorService,
      );
    } catch (error) {
      return sendHumanSettingsFailure(request, reply, error);
    }
  });

  app.get("/api/farm/overview", async (request, reply) => {
    if (!boundFarmOverviewRequestSchema.safeParse(request.query).success) {
      return sendBoundFarmError(
        reply,
        400,
        "invalid_request",
        "The bound farm overview does not accept query parameters",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const farm = await options.registrationAuth.getCurrentFarmOverview(token);
      return boundFarmOverviewSuccessSchema.parse({
        farm: {
          farm_doorplate: farm.farmDoorplate,
          farm_name: farm.farmName,
          plots: farm.plots.map((plot) => ({
            plot_id: plot.plotId,
            state: plot.state,
            seed_type: plot.seedType,
            watered: plot.watered,
          })),
        },
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmNotFoundError) {
        return sendBoundFarmError(reply, 404, "farm_not_found", "The bound farm no longer exists");
      }
      if (error instanceof FarmNotPubliclyReadableError) {
        return sendBoundFarmError(
          reply,
          403,
          "farm_not_publicly_readable",
          "The bound farm cannot be read through the current public farm contract",
        );
      }
      if (error instanceof FarmDirectoryUnavailableError) {
        reportFarmUnavailable(request, error);
        return sendBoundFarmError(
          reply,
          503,
          "farm_unavailable",
          "The bound farm could not be queried",
        );
      }
      throw error;
    }
  });

  const sendFarmHumanFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendFarmHumanUiError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendFarmHumanUiError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendFarmHumanUiError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendFarmHumanUiError(
        reply,
        409,
        "registration_profile_required",
        "A resident, home, and farm binding are required",
      );
    }
    if (error instanceof FarmHumanCredentialInvalidError) {
      return sendFarmHumanUiError(
        reply,
        409,
        "farm_credential_invalid",
        "The bound farm human credential is no longer valid",
      );
    }
    if (error instanceof FarmUpstreamContractUnavailableError) {
      reportFarmUnavailable(request, error);
      return sendFarmHumanUiError(
        reply,
        502,
        "upstream_contract_unavailable",
        "The farm human UI response could not be safely proxied",
      );
    }
    if (error instanceof FarmDirectoryUnavailableError) {
      reportFarmUnavailable(request, error);
      return sendFarmHumanUiError(
        reply,
        503,
        "farm_unavailable",
        "The farm human UI is unavailable",
      );
    }
    throw error;
  };

  const renderFarmHumanPage = async (
    request: FastifyRequest,
    reply: FastifyReply,
    pagePath: string,
    allowedQueryFields: readonly string[],
  ) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendFarmHumanUiError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    const query = new URL(request.raw.url ?? "", "http://doorbell.local").searchParams;
    const validatedQuery = validateParameters(query, allowedQueryFields);
    if (!validatedQuery) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The farm page query does not match the existing farm UI contract",
      );
    }

    try {
      const page = await options.registrationAuth.getCurrentFarmHumanPage(
        token,
        pagePath,
        validatedQuery,
      );
      return reply.type("text/html; charset=utf-8").send(page.html);
    } catch (error) {
      return sendFarmHumanFailure(request, reply, error);
    }
  };

  app.get("/api/farm/ui", async (request, reply) => renderFarmHumanPage(request, reply, "", []));

  app.get("/api/farm/ui/*", async (request, reply) => {
    const pagePath = (request.params as { "*": string })["*"];
    const section = pagePath.split("/", 1)[0]?.toLowerCase();
    if (section && INDEPENDENT_FARM_HUMAN_SECTIONS.has(section)) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The requested farm page has an independent Doorbell entry",
      );
    }
    const allowedQueryFields = FARM_HUMAN_GET_ROUTES.get(pagePath);
    if (!allowedQueryFields) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The requested farm page is not part of the existing human UI contract",
      );
    }
    return renderFarmHumanPage(request, reply, pagePath, allowedQueryFields);
  });

  app.get("/api/lingye-together", async (request, reply) =>
    renderFarmHumanPage(request, reply, "together", []),
  );

  app.get("/api/lingye-glimmer", { exposeHeadRoute: false }, async (request, reply) =>
    renderFarmHumanPage(request, reply, "glimmer", []),
  );

  app.post("/api/farm/ui/*", async (request, reply) => {
    const actionPath = (request.params as { "*": string })["*"];
    const allowedFormFields = FARM_HUMAN_POST_ROUTES.get(actionPath);
    const query = new URL(request.raw.url ?? "", "http://doorbell.local").searchParams;
    if (!allowedFormFields || query.size !== 0 || !(request.body instanceof URLSearchParams)) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The farm action must use the existing form contract",
      );
    }
    const form = validateParameters(request.body, allowedFormFields);
    if (!form) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The farm action fields do not match the existing form contract",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendFarmHumanUiError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.submitCurrentFarmHumanAction(
        token,
        actionPath,
        form,
      );
      return reply.code(303).header("location", result.location).send();
    } catch (error) {
      return sendFarmHumanFailure(request, reply, error);
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

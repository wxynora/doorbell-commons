import { type BoundFarmKitchenCookErrorCode, type BoundFarmSmeltingActionErrorCode, boundFarmCatalogReadRequestSchema, boundFarmKitchenCookErrorSchema, boundFarmKitchenCookRequestSchema, boundFarmKitchenCookSuccessSchema, boundFarmKitchenReadRequestSchema, boundFarmSmeltingActionErrorSchema, boundFarmSmeltingActionRequestSchema, boundFarmSmeltingActionSuccessSchema, farmKitchenCookIdempotencyKeySchema, farmSmeltingActionIdempotencyKeySchema } from "@doorbell/protocol";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { FarmHumanKitchenCookContractUnavailableError, FarmHumanKitchenCookCredentialInvalidError, FarmHumanKitchenCookIdempotencyConflictError, FarmHumanKitchenCookNotFoundError, FarmHumanKitchenCookRejectedError, FarmHumanKitchenCookStateConflictError, FarmHumanKitchenCookUnavailableError } from "../farm-kitchen-cook-client.js";
import { FarmHumanSmeltingActionContractUnavailableError, FarmHumanSmeltingActionCredentialInvalidError, FarmHumanSmeltingActionIdempotencyConflictError, FarmHumanSmeltingActionNotFoundError, FarmHumanSmeltingActionRejectedError, FarmHumanSmeltingActionStateConflictError, FarmHumanSmeltingActionUnavailableError } from "../farm-smelting-action-client.js";
import { OneBotUnavailableError } from "../qq-group-membership.js";
import { AuthenticationRequiredError, QqNotGroupMemberError, type RegistrationAuthService, RegistrationProfileRequiredError } from "../registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../session-cookie.js";

function sendBoundFarmKitchenCookError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmKitchenCookErrorCode,
  message: string,
  currentKitchenInventoryRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmKitchenCookErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentKitchenInventoryRevision === undefined
          ? {}
          : { current_kitchen_inventory_revision: currentKitchenInventoryRevision }),
      },
    }),
  );
}

function sendBoundFarmSmeltingActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmSmeltingActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmSmeltingActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

interface FarmProductionRouteOptions {
  registrationAuth: Pick<RegistrationAuthService, "cookCurrentFarmKitchen" | "executeCurrentFarmSmeltingAction">;
  secureCookies: boolean;
  reportOneBotUnavailable: (request: FastifyRequest, error: OneBotUnavailableError) => void;
}

export function registerFarmProductionRoutes(app: FastifyInstance, options: FarmProductionRouteOptions) {
  app.post("/api/farm/kitchen/cooks", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmKitchenCookRequestSchema.safeParse(request.body);
    if (
      !boundFarmKitchenReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmKitchenCookError(
        reply,
        400,
        "invalid_request",
        "Submit one kitchen cook without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmKitchenCookIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmKitchenCookError(
        reply,
        400,
        "invalid_request",
        "Kitchen cook requires a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmKitchenCookError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.cookCurrentFarmKitchen(token, {
        expectedKitchenInventoryRevision: body.expected_kitchen_inventory_revision,
        ...(body.quantity === undefined ? {} : { quantity: body.quantity }),
        idempotencyKey,
        ...("recipe_id" in body ? { recipeId: body.recipe_id } : { items: body.items }),
      });
      const parsedResult = boundFarmKitchenCookSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmKitchenCookError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen cook response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmKitchenCookError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmKitchenCookError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        options.reportOneBotUnavailable(request, error);
        return sendBoundFarmKitchenCookError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanKitchenCookStateConflictError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "state_conflict",
          "The kitchen inventory has changed",
          error.currentKitchenInventoryRevision,
        );
      }
      if (error instanceof FarmHumanKitchenCookRejectedError) {
        return sendBoundFarmKitchenCookError(reply, 409, "cook_rejected", error.message);
      }
      if (error instanceof FarmHumanKitchenCookIdempotencyConflictError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanKitchenCookCredentialInvalidError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanKitchenCookNotFoundError) {
        return sendBoundFarmKitchenCookError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanKitchenCookContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen cook is unavailable");
        return sendBoundFarmKitchenCookError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen cook response could not be verified",
        );
      }
      if (error instanceof FarmHumanKitchenCookUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen cook is unavailable");
        return sendBoundFarmKitchenCookError(
          reply,
          503,
          "farm_unavailable",
          "The farm kitchen is unavailable",
        );
      }
      throw error;
    }
  });


  app.post("/api/farm/smelting/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmSmeltingActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmSmeltingActionError(
        reply,
        400,
        "invalid_request",
        "Submit exactly three material ids without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmSmeltingActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmSmeltingActionError(
        reply,
        400,
        "invalid_request",
        "Smelting actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmSmeltingActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.executeCurrentFarmSmeltingAction(token, {
        materialIds: body.material_ids,
        ...(body.quantity === undefined ? {} : { quantity: body.quantity }),
        expectedSmeltingRevision: body.expected_smelting_revision,
        idempotencyKey,
      });
      const parsedResult = boundFarmSmeltingActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmSmeltingActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The smelting response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmSmeltingActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        options.reportOneBotUnavailable(request, error);
        return sendBoundFarmSmeltingActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanSmeltingActionStateConflictError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "state_conflict",
          "The smelting inventory has changed",
          error.currentSmeltingRevision,
        );
      }
      if (error instanceof FarmHumanSmeltingActionRejectedError) {
        return sendBoundFarmSmeltingActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanSmeltingActionIdempotencyConflictError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanSmeltingActionCredentialInvalidError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanSmeltingActionNotFoundError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanSmeltingActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm smelting action is unavailable");
        return sendBoundFarmSmeltingActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The smelting response could not be verified",
        );
      }
      if (error instanceof FarmHumanSmeltingActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm smelting action is unavailable");
        return sendBoundFarmSmeltingActionError(
          reply,
          503,
          "farm_unavailable",
          "The farm smelting service is unavailable",
        );
      }
      throw error;
    }
  });

}

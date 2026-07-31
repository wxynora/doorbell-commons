import {
  qqGroupEligibilityErrorSchema,
  qqGroupEligibilityRequestSchema,
  qqGroupEligibilitySuccessSchema,
  serviceHealthSchema,
} from "@doorbell/protocol";
import Fastify, { type FastifyInstance } from "fastify";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";

export interface BuildAppOptions {
  groupId: string;
  groupMembership: QqGroupMembershipReader;
  logger?: boolean;
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

  return app;
}

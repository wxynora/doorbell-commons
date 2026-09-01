import type { FastifyInstance, FastifyReply } from "fastify";
import { LingyeDailyPublishAuthenticationError } from "./lingye-daily-service.js";
import {
  ReporterRelayRenderError,
  type ReporterRelayService,
  ReporterRelayWakeValidationError,
} from "./reporter-relay-service.js";
import { ReporterBellWakeConflictError } from "./reporter-relay-store.js";

export interface ReporterRelayCredentialAuthorizer {
  authorize(authorization: string | undefined): void;
}

export interface ReporterRelayRoutesOptions {
  authorizer: ReporterRelayCredentialAuthorizer;
  service: ReporterRelayService;
}

function sendError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 409 | 500,
  code: "invalid_request" | "authentication_required" | "idempotency_conflict" | "internal_error",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send({ error: { code, message } });
}

function hasQueryParameters(query: unknown): boolean {
  return (
    query === null ||
    typeof query !== "object" ||
    Array.isArray(query) ||
    Object.keys(query).length > 0
  );
}

export function registerReporterRelayRoutes(
  app: FastifyInstance,
  options: ReporterRelayRoutesOptions,
): void {
  app.post("/api/internal/lingye-daily/reporter-relay/wakes", async (request, reply) => {
    if (hasQueryParameters(request.query)) {
      return sendError(
        reply,
        400,
        "invalid_request",
        "The reporter relay request does not accept query parameters",
      );
    }
    try {
      options.authorizer.authorize(request.headers.authorization);
    } catch (error) {
      if (error instanceof LingyeDailyPublishAuthenticationError) {
        return sendError(
          reply,
          401,
          "authentication_required",
          "A valid Lingye Daily publish credential is required",
        );
      }
      throw error;
    }

    try {
      const accepted = options.service.enqueue(request.body);
      reply.header("cache-control", "no-store");
      return reply.code(200).send(accepted);
    } catch (error) {
      if (error instanceof ReporterRelayWakeValidationError) {
        return sendError(
          reply,
          400,
          "invalid_request",
          "The reporter relay wake does not match the supported contract",
        );
      }
      if (error instanceof ReporterBellWakeConflictError) {
        return sendError(
          reply,
          409,
          "idempotency_conflict",
          "The reporter wake id is already bound to different content",
        );
      }
      if (error instanceof ReporterRelayRenderError) {
        return sendError(
          reply,
          500,
          "internal_error",
          "The reporter relay message could not be rendered safely",
        );
      }
      throw error;
    }
  });
}

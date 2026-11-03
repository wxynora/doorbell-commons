import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { DailyMaterialError, type DailyMaterialService } from "./material-service.js";

export function registerDailyMaterialRoutes(app: FastifyInstance, options: {
  service: DailyMaterialService; authorize: (authorization: string | undefined) => void;
  onSaved?: (issueDate: string) => Promise<void>;
}) {
  const handle = (action: (request: FastifyRequest) => unknown | Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header("cache-control", "no-store");
      try {
        try { options.authorize(request.headers.authorization); }
        catch { return reply.code(401).send({ error: { code: "authentication_required" } }); }
        return await action(request);
      } catch (error) {
        if (error instanceof DailyMaterialError) return reply.code(error.status).send({ error: { code: error.code } });
        if (error instanceof z.ZodError || error instanceof RangeError) return reply.code(400).send({ error: { code: "invalid_request" } });
        request.log.error({ error_name: error instanceof Error ? error.name : "UnknownError" }, "Daily materials request failed");
        return reply.code(503).send({ error: { code: "materials_unavailable" } });
      }
    };
  const query = (request: FastifyRequest) => z.strictObject({ issue_date: z.string() }).parse(request.query).issue_date;
  app.get("/api/internal/lingye-daily/material-sources", handle((request) => options.service.sources(query(request))));
  app.get("/api/internal/lingye-daily/materials", handle((request) => options.service.read(query(request))));
  app.post("/api/internal/lingye-daily/materials", handle(async (request) => {
    const saved = options.service.save(request.body);
    await options.onSaved?.(saved.issue_date);
    return saved;
  }));
}

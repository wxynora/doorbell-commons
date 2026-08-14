import {
  connectorLocalEventsQuerySchema,
  connectorLocalEventsSuccessSchema,
  connectorLocalHealthSchema,
  connectorLocalMailboxErrorSchema,
  connectorLocalSharedMemeSyncSchema,
  connectorLocalStatusSchema,
  humanSettingsReadRequestSchema,
  mailboxClaimBodySchema,
  mailboxDetailRequestSchema,
  mailboxDetailSuccessSchema,
  mailboxListRequestSchema,
  mailboxListSuccessSchema,
} from "@doorbell/protocol";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { type ConnectorClient, ConnectorMailboxRequestError } from "./connector-client.js";

function sendMailboxFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof ConnectorMailboxRequestError) {
    return reply.code(error.statusCode).send(
      connectorLocalMailboxErrorSchema.parse({
        error: { code: error.code, message: error.message },
      }),
    );
  }
  throw error;
}

export function buildConnectorLocalApi(client: ConnectorClient): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/v1/health", async () =>
    connectorLocalHealthSchema.parse({
      service: "doorbell-connector",
      api_version: "v1",
      status: "ok",
    }),
  );

  app.get("/v1/status", async () => connectorLocalStatusSchema.parse(client.getStatus()));

  app.get("/v1/events", async (request, reply) => {
    const query = connectorLocalEventsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "after_cursor must be a non-negative integer" },
      });
    }
    return connectorLocalEventsSuccessSchema.parse({
      events: client.listEventsAfter(query.data.after_cursor),
    });
  });

  app.get("/v1/events/stream", async (request, reply) => {
    const query = connectorLocalEventsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "after_cursor must be a non-negative integer" },
      });
    }
    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    });
    for (const event of client.listEventsAfter(query.data.after_cursor)) {
      reply.raw.write(`id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    const unsubscribe = client.subscribe((event) => {
      reply.raw.write(`id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    request.raw.once("close", unsubscribe);
  });

  app.get("/v1/shared-memes/status", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Shared meme sync status does not accept query parameters",
        },
      });
    }
    return connectorLocalSharedMemeSyncSchema.parse(client.getSharedMemeSyncStatus());
  });

  app.get("/v1/mailbox", async (request, reply) => {
    const query = mailboxListRequestSchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(
        connectorLocalMailboxErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "Mailbox list accepts one positive page number and one supported category",
          },
        }),
      );
    }
    try {
      return mailboxListSuccessSchema.parse(
        await client.listMailbox(query.data.page, query.data.category),
      );
    } catch (error) {
      return sendMailboxFailure(reply, error);
    }
  });

  app.get("/v1/mailbox/:letterId", async (request, reply) => {
    const query = humanSettingsReadRequestSchema.safeParse(request.query);
    const params = mailboxDetailRequestSchema.safeParse({
      letter_id: (request.params as { letterId?: unknown }).letterId,
    });
    if (!query.success || !params.success) {
      return reply.code(400).send(
        connectorLocalMailboxErrorSchema.parse({
          error: { code: "invalid_request", message: "A valid letter_id is required" },
        }),
      );
    }
    try {
      return mailboxDetailSuccessSchema.parse(await client.readMailbox(params.data.letter_id));
    } catch (error) {
      return sendMailboxFailure(reply, error);
    }
  });

  app.post("/v1/mailbox/:letterId/claim", async (request, reply) => {
    const query = humanSettingsReadRequestSchema.safeParse(request.query);
    const body = mailboxClaimBodySchema.safeParse(request.body ?? {});
    const params = mailboxDetailRequestSchema.safeParse({
      letter_id: (request.params as { letterId?: unknown }).letterId,
    });
    if (!query.success || !body.success || !params.success) {
      return reply.code(400).send(
        connectorLocalMailboxErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "Mailbox claim accepts only a valid letter_id and an empty body",
          },
        }),
      );
    }
    try {
      return mailboxDetailSuccessSchema.parse(
        await client.claimMailboxReward(params.data.letter_id),
      );
    } catch (error) {
      return sendMailboxFailure(reply, error);
    }
  });

  return app;
}

export async function listenOnLoopback(app: FastifyInstance, port: number): Promise<string> {
  return app.listen({ host: "127.0.0.1", port });
}

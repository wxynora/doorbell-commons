import {
  type ConnectorDeliveryGeneration,
  type ConnectorEventEnvelope,
  connectorLocalEventsErrorSchema,
  connectorLocalEventsQuerySchema,
  connectorLocalEventsSuccessSchema,
  connectorLocalGenerationChangedEventSchema,
  connectorLocalHealthSchema,
  connectorLocalMailboxErrorSchema,
  connectorLocalSharedMemeDetailRequestSchema,
  connectorLocalSharedMemeDetailSuccessSchema,
  connectorLocalSharedMemeErrorSchema,
  connectorLocalSharedMemeListSuccessSchema,
  connectorLocalSharedMemeQuerySchema,
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
import {
  type SharedMemeLibrary,
  SharedMemeLibraryUnavailableError,
  SharedMemeNotFoundError,
} from "./shared-meme-library.js";

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

function sendSharedMemeFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof SharedMemeNotFoundError) {
    return reply.code(404).send(
      connectorLocalSharedMemeErrorSchema.parse({
        error: { code: "shared_meme_not_found", message: error.message },
      }),
    );
  }
  if (error instanceof SharedMemeLibraryUnavailableError) {
    return reply.code(503).send(
      connectorLocalSharedMemeErrorSchema.parse({
        error: { code: "shared_meme_unavailable", message: error.message },
      }),
    );
  }
  throw error;
}

export function buildConnectorLocalApi(
  client: ConnectorClient,
  sharedMemeLibrary: SharedMemeLibrary,
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/v2/health", async () =>
    connectorLocalHealthSchema.parse({
      service: "doorbell-connector",
      api_version: "v2",
      status: "ok",
    }),
  );

  app.get("/v2/status", async () => connectorLocalStatusSchema.parse(client.getStatus()));

  app.get("/v2/events", async (request, reply) => {
    const query = connectorLocalEventsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(
        connectorLocalEventsErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "delivery_generation and a non-negative after_cursor are required",
          },
        }),
      );
    }
    const currentGeneration = client.getStatus().delivery_generation;
    if (query.data.delivery_generation !== currentGeneration) {
      return reply.code(409).send(
        connectorLocalEventsErrorSchema.parse({
          error: {
            code: "delivery_generation_changed",
            message: "The requested delivery generation is no longer current",
            requested_generation: query.data.delivery_generation,
            current_generation: currentGeneration,
          },
        }),
      );
    }
    return connectorLocalEventsSuccessSchema.parse({
      delivery_generation: query.data.delivery_generation,
      events: client.listEventsAfter(query.data.delivery_generation, query.data.after_cursor),
    });
  });

  app.get("/v2/events/stream", async (request, reply) => {
    const query = connectorLocalEventsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(
        connectorLocalEventsErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "delivery_generation and a non-negative after_cursor are required",
          },
        }),
      );
    }
    const requestedGeneration = query.data.delivery_generation;
    const pendingEvents: ConnectorEventEnvelope[] = [];
    let pendingGeneration: ConnectorDeliveryGeneration | undefined;
    let phase: "bootstrapping" | "live" | "closed" = "bootstrapping";
    let lastSentCursor = query.data.after_cursor;
    let cleanedUp = false;
    let unsubscribeEvents = () => {};
    let unsubscribeGeneration = () => {};
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      unsubscribeEvents();
      unsubscribeGeneration();
    };
    const writeEvent = (event: ConnectorEventEnvelope) => {
      if (
        phase === "closed" ||
        event.generation !== requestedGeneration ||
        event.cursor <= lastSentCursor
      ) {
        return;
      }
      reply.raw.write(
        `id: ${event.generation}:${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`,
      );
      lastSentCursor = event.cursor;
    };
    const endForGenerationChange = (generation: ConnectorDeliveryGeneration) => {
      if (phase === "closed") {
        return;
      }
      phase = "closed";
      const payload = connectorLocalGenerationChangedEventSchema.parse({
        delivery_generation: generation,
      });
      reply.raw.write(`event: generation_changed\ndata: ${JSON.stringify(payload)}\n\n`);
      cleanup();
      reply.raw.end();
    };

    unsubscribeEvents = client.subscribe((event) => {
      if (
        phase === "closed" ||
        pendingGeneration !== undefined ||
        event.generation !== requestedGeneration ||
        event.cursor <= query.data.after_cursor
      ) {
        return;
      }
      if (phase === "bootstrapping") {
        pendingEvents.push(event);
        return;
      }
      writeEvent(event);
    });
    unsubscribeGeneration = client.subscribeGenerationChanges((generation) => {
      if (generation === requestedGeneration || phase === "closed") {
        return;
      }
      if (phase === "bootstrapping") {
        pendingGeneration ??= generation;
        return;
      }
      endForGenerationChange(generation);
    });

    const currentGeneration = client.getStatus().delivery_generation;
    if (requestedGeneration !== currentGeneration) {
      cleanup();
      return reply.code(409).send(
        connectorLocalEventsErrorSchema.parse({
          error: {
            code: "delivery_generation_changed",
            message: "The requested delivery generation is no longer current",
            requested_generation: requestedGeneration,
            current_generation: currentGeneration,
          },
        }),
      );
    }
    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    });
    reply.raw.write(": connected\n\n");
    reply.raw.once("close", cleanup);
    const backlog = client.listEventsAfter(requestedGeneration, query.data.after_cursor);
    if (pendingGeneration !== undefined) {
      endForGenerationChange(pendingGeneration);
      return;
    }
    for (const event of backlog) {
      writeEvent(event);
    }
    pendingEvents.sort((left, right) => left.cursor - right.cursor);
    for (const event of pendingEvents) {
      writeEvent(event);
    }
    phase = "live";
  });

  app.get("/v2/shared-memes/status", async (request, reply) => {
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

  app.get("/v2/shared-memes", async (request, reply) => {
    const query = connectorLocalSharedMemeQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(
        connectorLocalSharedMemeErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "Shared meme list accepts only one non-empty term",
          },
        }),
      );
    }
    try {
      if (query.data.term !== undefined) {
        const result = sharedMemeLibrary.resolve(query.data.term);
        return connectorLocalSharedMemeDetailSuccessSchema.parse({
          library_version: result.libraryVersion,
          meme: result.meme,
        });
      }
      const result = sharedMemeLibrary.list();
      return connectorLocalSharedMemeListSuccessSchema.parse({
        library_version: result.libraryVersion,
        memes: result.memes,
      });
    } catch (error) {
      return sendSharedMemeFailure(reply, error);
    }
  });

  app.get("/v2/shared-memes/:memeId", async (request, reply) => {
    const query = humanSettingsReadRequestSchema.safeParse(request.query);
    const params = connectorLocalSharedMemeDetailRequestSchema.safeParse({
      meme_id: (request.params as { memeId?: unknown }).memeId,
    });
    if (!query.success || !params.success) {
      return reply.code(400).send(
        connectorLocalSharedMemeErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "Shared meme detail requires one positive meme ID",
          },
        }),
      );
    }
    try {
      const result = sharedMemeLibrary.getById(params.data.meme_id);
      return connectorLocalSharedMemeDetailSuccessSchema.parse({
        library_version: result.libraryVersion,
        meme: result.meme,
      });
    } catch (error) {
      return sendSharedMemeFailure(reply, error);
    }
  });

  app.get("/v2/mailbox", async (request, reply) => {
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

  app.get("/v2/mailbox/:letterId", async (request, reply) => {
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

  app.post("/v2/mailbox/:letterId/claim", async (request, reply) => {
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

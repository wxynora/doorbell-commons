import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectorAckFrameSchema,
  connectorBootstrapCheckpointSchema,
  connectorClientFrameSchema,
  connectorEventEnvelopeSchema,
  connectorEventFrameSchema,
  connectorGenerationResetAckFrameSchema,
  connectorGenerationResetRequiredFrameSchema,
  connectorHelloFrameSchema,
  connectorLocalEventsErrorSchema,
  connectorLocalEventsQuerySchema,
  connectorLocalEventsSuccessSchema,
  connectorLocalGenerationChangedEventSchema,
  connectorLocalHealthSchema,
  connectorLocalStatusSchema,
  connectorProtocolVersionSchema,
  connectorReadyFrameSchema,
  connectorResyncRequestFrameSchema,
  connectorResyncRequiredFrameSchema,
  connectorServerErrorFrameSchema,
  connectorServerFrameSchema,
  connectorWelcomeMessage,
} from "../src/index.js";

const GENERATION = "11111111-1111-4111-8111-111111111111";
const CONNECTOR_CREDENTIAL = `dbc_${"A".repeat(43)}`;

test("Connector protocol accepts only generation-aware v2 hello frames", () => {
  assert.equal(connectorProtocolVersionSchema.safeParse("2.0").success, true);
  assert.equal(connectorProtocolVersionSchema.safeParse("1.0").success, false);
  assert.equal(
    connectorHelloFrameSchema.safeParse({
      type: "hello",
      protocol_version: "2.0",
      capabilities: ["event_stream_v2", "resync_v2"],
      credential: CONNECTOR_CREDENTIAL,
      generation: null,
      last_persisted_cursor: 0,
    }).success,
    true,
  );
  assert.equal(
    connectorHelloFrameSchema.safeParse({
      type: "hello",
      protocol_version: "1.0",
      capabilities: ["event_stream_v1", "resync_v1"],
      credential: CONNECTOR_CREDENTIAL,
      last_persisted_cursor: 0,
    }).success,
    false,
  );
  assert.equal(
    connectorHelloFrameSchema.safeParse({
      type: "hello",
      protocol_version: "2.0",
      capabilities: ["event_stream_v2", "resync_v2"],
      credential: CONNECTOR_CREDENTIAL,
      generation: null,
      last_persisted_cursor: 1,
    }).success,
    false,
  );
  assert.equal(
    connectorHelloFrameSchema.safeParse({
      type: "hello",
      protocol_version: "2.0",
      capabilities: ["event_stream_v1", "resync_v1"],
      credential: CONNECTOR_CREDENTIAL,
      generation: null,
      last_persisted_cursor: 0,
    }).success,
    false,
  );
  assert.equal(
    connectorHelloFrameSchema.safeParse({
      type: "hello",
      protocol_version: "2.0",
      capabilities: ["event_stream_v2"],
      credential: CONNECTOR_CREDENTIAL,
      generation: null,
      last_persisted_cursor: 0,
    }).success,
    false,
  );
});

test("Connector event identity includes generation", () => {
  assert.equal(
    connectorEventEnvelopeSchema.safeParse({
      generation: GENERATION,
      event_id: "22222222-2222-4222-8222-222222222222",
      cursor: 1,
      event_type: "foundation.fact",
      created_at: "2026-08-14T00:00:00.000Z",
      payload: { value: 1 },
    }).success,
    true,
  );
  assert.equal(
    connectorEventEnvelopeSchema.safeParse({
      event_id: "22222222-2222-4222-8222-222222222222",
      cursor: 1,
      event_type: "foundation.fact",
      created_at: "2026-08-14T00:00:00.000Z",
      payload: { value: 1 },
    }).success,
    false,
  );
});

test("Connector v2 event, ACK, resync, ready, and reset frames require generation", () => {
  const event = {
    generation: GENERATION,
    event_id: "22222222-2222-4222-8222-222222222222",
    cursor: 1,
    event_type: "foundation.fact",
    created_at: "2026-08-14T00:00:00.000Z",
    payload: { value: 1 },
  };
  const generatedFrames = [
    {
      schema: connectorEventFrameSchema,
      frame: { type: "event", event },
    },
    {
      schema: connectorAckFrameSchema,
      frame: {
        type: "ack",
        generation: GENERATION,
        event_id: event.event_id,
        cursor: 1,
      },
    },
    {
      schema: connectorResyncRequestFrameSchema,
      frame: {
        type: "resync_request",
        generation: GENERATION,
        after_cursor: 0,
        reason: "cursor_gap",
      },
    },
    {
      schema: connectorReadyFrameSchema,
      frame: {
        type: "ready",
        protocol_version: "2.0",
        capabilities: ["event_stream_v2", "resync_v2"],
        connection_id: "33333333-3333-4333-8333-333333333333",
        resident_id: "resident-1",
        generation: GENERATION,
        resume_after_cursor: 0,
        welcome: connectorWelcomeMessage,
      },
    },
    {
      schema: connectorResyncRequiredFrameSchema,
      frame: {
        type: "resync_required",
        generation: GENERATION,
        after_cursor: 0,
        reason: "ack_gap",
      },
    },
    {
      schema: connectorGenerationResetRequiredFrameSchema,
      frame: {
        type: "generation_reset_required",
        generation: GENERATION,
        reason: "generation_changed",
      },
    },
    {
      schema: connectorGenerationResetAckFrameSchema,
      frame: { type: "generation_reset_ack", generation: GENERATION },
    },
  ] as const;

  for (const { schema, frame } of generatedFrames) {
    assert.equal(schema.safeParse(frame).success, true);
    assert.equal(schema.safeParse({ ...frame, unexpected: true }).success, false);
  }

  const { generation: _ackGeneration, ...cursorOnlyAck } = generatedFrames[1].frame;
  assert.equal(connectorAckFrameSchema.safeParse(cursorOnlyAck).success, false);
  const { generation: _requestGeneration, ...cursorOnlyRequest } = generatedFrames[2].frame;
  assert.equal(connectorResyncRequestFrameSchema.safeParse(cursorOnlyRequest).success, false);
  const { generation: _readyGeneration, ...cursorOnlyReady } = generatedFrames[3].frame;
  assert.equal(connectorReadyFrameSchema.safeParse(cursorOnlyReady).success, false);
  const { generation: _requiredGeneration, ...cursorOnlyRequired } = generatedFrames[4].frame;
  assert.equal(connectorResyncRequiredFrameSchema.safeParse(cursorOnlyRequired).success, false);

  assert.equal(connectorClientFrameSchema.safeParse(generatedFrames[6].frame).success, true);
  assert.equal(connectorServerFrameSchema.safeParse(generatedFrames[5].frame).success, true);
});

test("Connector local v2 contracts expose and fence delivery generation", () => {
  assert.equal(
    connectorLocalHealthSchema.safeParse({
      service: "doorbell-connector",
      api_version: "v2",
      status: "ok",
    }).success,
    true,
  );
  assert.equal(
    connectorLocalHealthSchema.safeParse({
      service: "doorbell-connector",
      api_version: "v1",
      status: "ok",
    }).success,
    false,
  );
  assert.equal(
    connectorLocalStatusSchema.safeParse({
      connection_state: "offline",
      protocol_version: "2.0",
      delivery_generation: null,
      last_persisted_cursor: 0,
      last_connected_at: null,
      last_error_code: null,
      welcome_message: null,
    }).success,
    true,
  );
  assert.equal(
    connectorLocalStatusSchema.safeParse({
      connection_state: "offline",
      protocol_version: "2.0",
      delivery_generation: null,
      last_persisted_cursor: 1,
      last_connected_at: null,
      last_error_code: null,
      welcome_message: null,
    }).success,
    false,
  );
  assert.deepEqual(
    connectorLocalEventsQuerySchema.parse({
      delivery_generation: GENERATION,
      after_cursor: "3",
    }),
    { delivery_generation: GENERATION, after_cursor: 3 },
  );
  assert.equal(connectorLocalEventsQuerySchema.safeParse({ after_cursor: 0 }).success, false);

  const event = connectorEventEnvelopeSchema.parse({
    generation: GENERATION,
    event_id: "44444444-4444-4444-8444-444444444444",
    cursor: 4,
    event_type: "foundation.fact",
    created_at: "2026-08-14T00:00:00.000Z",
    payload: {},
  });
  assert.equal(
    connectorLocalEventsSuccessSchema.safeParse({
      delivery_generation: GENERATION,
      events: [event],
    }).success,
    true,
  );
  assert.equal(
    connectorLocalEventsSuccessSchema.safeParse({
      delivery_generation: "55555555-5555-4555-8555-555555555555",
      events: [event],
    }).success,
    false,
  );

  assert.equal(
    connectorLocalEventsErrorSchema.safeParse({
      error: { code: "invalid_request", message: "Invalid event cursor" },
    }).success,
    true,
  );
  assert.equal(
    connectorLocalEventsErrorSchema.safeParse({
      error: {
        code: "delivery_generation_changed",
        message: "The delivery generation changed",
        requested_generation: GENERATION,
        current_generation: "55555555-5555-4555-8555-555555555555",
      },
    }).success,
    true,
  );
  assert.equal(
    connectorLocalEventsErrorSchema.safeParse({
      error: {
        code: "delivery_generation_changed",
        message: "The delivery generation changed",
        requested_generation: GENERATION,
      },
    }).success,
    false,
  );
  assert.equal(
    connectorLocalGenerationChangedEventSchema.safeParse({
      delivery_generation: "55555555-5555-4555-8555-555555555555",
    }).success,
    true,
  );
});

test("authoritative bootstrap checkpoints bind generation and through_cursor", () => {
  assert.deepEqual(
    connectorBootstrapCheckpointSchema.parse({
      delivery_generation: GENERATION,
      through_cursor: 9,
    }),
    { delivery_generation: GENERATION, through_cursor: 9 },
  );
  assert.equal(
    connectorBootstrapCheckpointSchema.safeParse({
      delivery_generation: GENERATION,
      through_cursor: 9,
      cursor: 9,
    }).success,
    false,
  );
  assert.equal(connectorBootstrapCheckpointSchema.safeParse({ through_cursor: 9 }).success, false);
});

test("same-generation cursor rollback has a dedicated fail-closed server error", () => {
  const frame = {
    type: "error",
    code: "delivery_generation_inconsistent",
  };
  assert.equal(connectorServerErrorFrameSchema.safeParse(frame).success, true);
  assert.equal(connectorServerFrameSchema.safeParse(frame).success, true);
});

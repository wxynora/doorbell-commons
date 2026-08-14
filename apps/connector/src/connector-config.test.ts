import assert from "node:assert/strict";
import { test } from "node:test";
import { readConnectorHttpTimeoutMs, readConnectorServerWebSocketUrl } from "./connector-config.js";

test("Connector WebSocket URL requires wss outside the trusted loopback hosts", () => {
  assert.equal(
    readConnectorServerWebSocketUrl({
      DOORBELL_SERVER_WS_URL: "wss://doorbell.example/api/connector/ws",
    }),
    "wss://doorbell.example/api/connector/ws",
  );
  for (const loopback of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.match(
      readConnectorServerWebSocketUrl({
        DOORBELL_SERVER_WS_URL: `ws://${loopback}:3000/api/connector/ws`,
      }),
      /^ws:/,
    );
  }
  assert.throws(
    () =>
      readConnectorServerWebSocketUrl({
        DOORBELL_SERVER_WS_URL: "ws://doorbell.example/api/connector/ws",
      }),
    /must use wss outside loopback/,
  );
  assert.throws(
    () =>
      readConnectorServerWebSocketUrl({
        DOORBELL_SERVER_WS_URL: "https://doorbell.example/api/connector/ws",
      }),
    /must use wss outside loopback/,
  );
});

test("Connector HTTP timeout is mandatory and locked to 300000 milliseconds", () => {
  assert.equal(
    readConnectorHttpTimeoutMs({ DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS: "300000" }),
    300_000,
  );
  assert.throws(
    () => readConnectorHttpTimeoutMs({}),
    /DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS is required/,
  );
  assert.throws(
    () => readConnectorHttpTimeoutMs({ DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS: "0" }),
    /positive integer/,
  );
  assert.throws(
    () => readConnectorHttpTimeoutMs({ DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS: "299999" }),
    /must be 300000/,
  );
});

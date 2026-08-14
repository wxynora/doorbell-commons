const LOCKED_CONNECTOR_HTTP_TIMEOUT_MS = 300_000;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function validateConnectorServerWebSocketUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol === "wss:") {
    return url.toString();
  }
  if (url.protocol === "ws:" && isLoopbackHostname(url.hostname)) {
    return url.toString();
  }
  throw new Error("DOORBELL_SERVER_WS_URL must use wss outside loopback development");
}

export function readConnectorServerWebSocketUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return validateConnectorServerWebSocketUrl(required(environment, "DOORBELL_SERVER_WS_URL"));
}

export function readConnectorHttpTimeoutMs(environment: NodeJS.ProcessEnv = process.env): number {
  const value = required(environment, "DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS");
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS must be a positive integer");
  }
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs)) {
    throw new Error("DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS must be a safe integer");
  }
  if (timeoutMs !== LOCKED_CONNECTOR_HTTP_TIMEOUT_MS) {
    throw new Error(
      `DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS must be ${LOCKED_CONNECTOR_HTTP_TIMEOUT_MS}`,
    );
  }
  return timeoutMs;
}

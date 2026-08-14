export const COMMUNITY_QQ_GROUP_ID = "515831305";

export interface QqGroupEligibilityConfig {
  oneBotApiBaseUrl: string;
  oneBotApiToken: string;
  qqGroupId: typeof COMMUNITY_QQ_GROUP_ID;
}

export interface DoorbellServerConfig extends QqGroupEligibilityConfig {
  databasePath: string;
  farmApiBaseUrl: string;
  farmHumanUiBaseUrl: string;
  farmServiceToken: string;
  mcpEndpoint: string;
  mcpRuntimeReady: boolean;
  upstreamRequestTimeoutMs: number;
}

function readRequiredEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readQqGroupEligibilityConfig(
  environment: NodeJS.ProcessEnv = process.env,
): QqGroupEligibilityConfig {
  const oneBotApiBaseUrl = readRequiredEnvironmentValue(environment, "ONEBOT_API_BASE_URL");
  const oneBotApiToken = readRequiredEnvironmentValue(environment, "ONEBOT_API_TOKEN");
  const qqGroupId = readRequiredEnvironmentValue(environment, "DOORBELL_QQ_GROUP_ID");

  const parsedBaseUrl = new URL(oneBotApiBaseUrl);
  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new Error("ONEBOT_API_BASE_URL must use http or https");
  }

  if (qqGroupId !== COMMUNITY_QQ_GROUP_ID) {
    throw new Error(`DOORBELL_QQ_GROUP_ID must be ${COMMUNITY_QQ_GROUP_ID}`);
  }

  return {
    oneBotApiBaseUrl: parsedBaseUrl.toString(),
    oneBotApiToken,
    qqGroupId: COMMUNITY_QQ_GROUP_ID,
  };
}

export function readDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
  return readRequiredEnvironmentValue(environment, "DOORBELL_DATABASE_PATH");
}

export function readUpstreamRequestTimeoutMs(environment: NodeJS.ProcessEnv = process.env): number {
  const value = readRequiredEnvironmentValue(environment, "DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS");
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS must be a positive integer");
  }
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs)) {
    throw new Error("DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS must be a safe integer");
  }
  return timeoutMs;
}

export function readFarmApiBaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const value = readRequiredEnvironmentValue(environment, "DOORBELL_FARM_API_BASE_URL");
  const parsedUrl = new URL(value);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("DOORBELL_FARM_API_BASE_URL must use http or https");
  }
  return parsedUrl.toString();
}

export function readFarmHumanUiBaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const value = readRequiredEnvironmentValue(environment, "DOORBELL_FARM_HUMAN_UI_BASE_URL");
  const parsedUrl = new URL(value);
  const loopbackHttp =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "[::1]");
  if (parsedUrl.protocol !== "https:" && !loopbackHttp) {
    throw new Error("DOORBELL_FARM_HUMAN_UI_BASE_URL must use https outside loopback development");
  }
  if (
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== ""
  ) {
    throw new Error(
      "DOORBELL_FARM_HUMAN_UI_BASE_URL must not contain credentials, query, or fragment",
    );
  }
  if (!parsedUrl.pathname.endsWith("/")) {
    parsedUrl.pathname += "/";
  }
  return parsedUrl.toString();
}

export function readMcpEndpoint(environment: NodeJS.ProcessEnv = process.env): string {
  const value = readRequiredEnvironmentValue(environment, "DOORBELL_PUBLIC_BASE_URL");
  const parsedUrl = new URL(value);
  const loopbackHttp =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "[::1]");
  if (parsedUrl.protocol !== "https:" && !loopbackHttp) {
    throw new Error("DOORBELL_PUBLIC_BASE_URL must use https outside loopback development");
  }
  if (
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    (parsedUrl.pathname !== "" && parsedUrl.pathname !== "/") ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== ""
  ) {
    throw new Error(
      "DOORBELL_PUBLIC_BASE_URL must be an origin without credentials, path, or query",
    );
  }
  return new URL("/mcp", parsedUrl.origin).toString();
}

export function readMcpRuntimeReady(environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.DOORBELL_MCP_RUNTIME_READY?.trim();
  if (!value || value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  throw new Error("DOORBELL_MCP_RUNTIME_READY must be true or false");
}

export function readDoorbellServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DoorbellServerConfig {
  return {
    ...readQqGroupEligibilityConfig(environment),
    databasePath: readDatabasePath(environment),
    farmApiBaseUrl: readFarmApiBaseUrl(environment),
    farmHumanUiBaseUrl: readFarmHumanUiBaseUrl(environment),
    farmServiceToken: readRequiredEnvironmentValue(environment, "DOORBELL_FARM_SERVICE_TOKEN"),
    mcpEndpoint: readMcpEndpoint(environment),
    mcpRuntimeReady: readMcpRuntimeReady(environment),
    upstreamRequestTimeoutMs: readUpstreamRequestTimeoutMs(environment),
  };
}

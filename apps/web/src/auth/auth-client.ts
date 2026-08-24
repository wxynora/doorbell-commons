import {
  boundFarmFieldErrorSchema,
  boundFarmFieldSuccessSchema,
  boundFarmHarvestAssistErrorSchema,
  boundFarmHarvestAssistSuccessSchema,
  type ConnectorControlError,
  type ConnectorCredentialIssueSuccess,
  type CurrentHumanSessionSuccess,
  connectorControlErrorSchema,
  connectorCredentialIssueSuccessSchema,
  connectorCredentialRevokeSuccessSchema,
  currentHumanSessionSuccessSchema,
  type FarmLookupRequest,
  type FarmLookupSuccess,
  farmLookupErrorSchema,
  farmLookupSuccessSchema,
  type HumanAuthenticationError,
  type HumanLogoutSuccess,
  type HumanSessionRequest,
  type HumanSessionSuccess,
  type HumanSettingsPatchRequest,
  type HumanSettingsSuccess,
  humanAuthenticationErrorSchema,
  humanLogoutSuccessSchema,
  humanSessionSuccessSchema,
  humanSettingsErrorSchema,
  humanSettingsSuccessSchema,
  type McpAccessError,
  type McpAccessStatusResponse,
  type McpCredentialIssueResponse,
  mcpAccessErrorSchema,
  mcpAccessStatusResponseSchema,
  mcpCredentialIssueResponseSchema,
} from "@doorbell/protocol";

export type ClientIssueCode = "network_unavailable" | "unexpected_response";
export type AuthIssueCode =
  | HumanAuthenticationError["error"]["code"]
  | ClientIssueCode
  | "invalid_password"
  | "password_confirmation_mismatch";

export interface AuthIssue {
  code: AuthIssueCode;
  serverMessage: string | null;
}

export type ConnectorControlIssueCode = ConnectorControlError["error"]["code"] | ClientIssueCode;

export interface ConnectorControlIssue {
  code: ConnectorControlIssueCode;
  serverMessage: string | null;
}

export type McpAccessIssueCode = McpAccessError["error"]["code"] | ClientIssueCode;

export interface McpAccessIssue {
  code: McpAccessIssueCode;
  serverMessage: string | null;
}

export interface HumanIdentity {
  account: CurrentHumanSessionSuccess["account"];
  resident: CurrentHumanSessionSuccess["resident"];
  home: CurrentHumanSessionSuccess["home"];
  farmBinding: CurrentHumanSessionSuccess["farm_binding"];
}

export type BoundFarmField = ReturnType<typeof boundFarmFieldSuccessSchema.parse>;
export type FarmFieldIssueCode =
  | ReturnType<typeof boundFarmFieldErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface FarmFieldIssue {
  code: FarmFieldIssueCode;
  serverMessage: string | null;
}

export type BoundFarmHarvestAssist = ReturnType<typeof boundFarmHarvestAssistSuccessSchema.parse>;
export type FarmHarvestAssistIssueCode =
  | ReturnType<typeof boundFarmHarvestAssistErrorSchema.parse>["error"]["code"]
  | ClientIssueCode;

export interface FarmHarvestAssistIssue {
  code: FarmHarvestAssistIssueCode;
  currentRevision: string | null;
  serverMessage: string | null;
}

export type ApiResult<T, Issue = AuthIssue> = { ok: true; data: T } | { ok: false; issue: Issue };
export type IdentityResult =
  | { ok: true; identity: HumanIdentity; accountCreated: boolean | null }
  | { ok: false; issue: AuthIssue };
export type FrontendFetcher = (input: string, init?: RequestInit) => Promise<Response>;

type ConnectorCredentialRevokeSuccess = ReturnType<
  typeof connectorCredentialRevokeSuccessSchema.parse
>;

function identityFromResponse(
  response: CurrentHumanSessionSuccess | HumanSessionSuccess,
): HumanIdentity {
  return {
    account: response.account,
    resident: response.resident,
    home: response.home,
    farmBinding: response.farm_binding,
  };
}

function clientIssue(code: ClientIssueCode) {
  return { code, serverMessage: null };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseAuthIssue(payload: unknown): AuthIssue {
  const parsed = humanAuthenticationErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return clientIssue("unexpected_response");
  }
  return {
    code: parsed.data.error.code,
    serverMessage: parsed.data.error.message,
  };
}

function parseSettingsIssue(payload: unknown): AuthIssue {
  const parsed = humanSettingsErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return clientIssue("unexpected_response");
  }
  return {
    code: parsed.data.error.code,
    serverMessage: parsed.data.error.message,
  };
}

function parseFarmFieldIssue(payload: unknown): FarmFieldIssue {
  const parsed = boundFarmFieldErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return clientIssue("unexpected_response");
  }
  return {
    code: parsed.data.error.code,
    serverMessage: parsed.data.error.message,
  };
}

function parseFarmHarvestAssistIssue(payload: unknown): FarmHarvestAssistIssue {
  const parsed = boundFarmHarvestAssistErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return { ...clientIssue("unexpected_response"), currentRevision: null };
  }
  return {
    code: parsed.data.error.code,
    currentRevision: parsed.data.error.current_revision ?? null,
    serverMessage: parsed.data.error.message,
  };
}

function parseConnectorControlIssue(payload: unknown): ConnectorControlIssue {
  const parsed = connectorControlErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return clientIssue("unexpected_response");
  }
  return {
    code: parsed.data.error.code,
    serverMessage: parsed.data.error.message,
  };
}

function parseMcpAccessIssue(payload: unknown): McpAccessIssue {
  const parsed = mcpAccessErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return clientIssue("unexpected_response");
  }
  return {
    code: parsed.data.error.code,
    serverMessage: parsed.data.error.message,
  };
}

export async function getCurrentHumanSession(
  options: { signal?: AbortSignal; fetcher?: FrontendFetcher } = {},
): Promise<IdentityResult> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/auth/session", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseAuthIssue(payload) };
  }

  const parsed = currentHumanSessionSuccessSchema.safeParse(payload);
  return parsed.success
    ? {
        ok: true,
        identity: identityFromResponse(parsed.data),
        accountCreated: null,
      }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function createHumanSession(
  input: HumanSessionRequest,
  fetcher: FrontendFetcher = fetch,
): Promise<IdentityResult> {
  let response: Response;
  try {
    response = await fetcher("/api/auth/session", {
      body: JSON.stringify(input),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseAuthIssue(payload) };
  }

  const parsed = humanSessionSuccessSchema.safeParse(payload);
  return parsed.success
    ? {
        ok: true,
        identity: identityFromResponse(parsed.data),
        accountCreated: parsed.data.account_created,
      }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function deleteHumanSession(
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<HumanLogoutSuccess>> {
  let response: Response;
  try {
    response = await fetcher("/api/auth/session", {
      credentials: "same-origin",
      method: "DELETE",
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseAuthIssue(payload) };
  }

  const parsed = humanLogoutSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function lookupFarm(
  input: FarmLookupRequest,
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<FarmLookupSuccess>> {
  let response: Response;
  try {
    response = await fetcher("/api/registration/farm-lookup", {
      body: JSON.stringify(input),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    const parsed = farmLookupErrorSchema.safeParse(payload);
    return parsed.success
      ? {
          ok: false,
          issue: {
            code: parsed.data.error.code,
            serverMessage: parsed.data.error.message,
          },
        }
      : { ok: false, issue: clientIssue("unexpected_response") };
  }

  const parsed = farmLookupSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function getBoundFarmField(
  options: { signal?: AbortSignal; fetcher?: FrontendFetcher } = {},
): Promise<ApiResult<BoundFarmField, FarmFieldIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/field", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseFarmFieldIssue(payload) };
  }

  const parsed = boundFarmFieldSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function harvestBoundFarmField(
  input: { expectedRevision: string; idempotencyKey: string },
  options: { signal?: AbortSignal; fetcher?: FrontendFetcher } = {},
): Promise<ApiResult<BoundFarmHarvestAssist, FarmHarvestAssistIssue>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/farm/field/harvest-assists", {
      body: JSON.stringify({}),
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
        "if-match": `"${input.expectedRevision}"`,
      },
      method: "POST",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return {
      ok: false,
      issue: { ...clientIssue("network_unavailable"), currentRevision: null },
    };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseFarmHarvestAssistIssue(payload) };
  }

  const parsed = boundFarmHarvestAssistSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : {
        ok: false,
        issue: { ...clientIssue("unexpected_response"), currentRevision: null },
      };
}

export async function getHumanSettings(
  options: { signal?: AbortSignal; fetcher?: FrontendFetcher } = {},
): Promise<ApiResult<HumanSettingsSuccess>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/settings", {
      credentials: "same-origin",
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseSettingsIssue(payload) };
  }

  const parsed = humanSettingsSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function updateHumanSettings(
  input: HumanSettingsPatchRequest,
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<HumanSettingsSuccess>> {
  let response: Response;
  try {
    response = await fetcher("/api/settings", {
      body: JSON.stringify(input),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseSettingsIssue(payload) };
  }

  const parsed = humanSettingsSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function issueConnectorCredential(
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<ConnectorCredentialIssueSuccess, ConnectorControlIssue>> {
  let response: Response;
  try {
    response = await fetcher("/api/connector/credential", {
      body: JSON.stringify({}),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseConnectorControlIssue(payload) };
  }

  const parsed = connectorCredentialIssueSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function revokeConnectorCredential(
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<ConnectorCredentialRevokeSuccess, ConnectorControlIssue>> {
  let response: Response;
  try {
    response = await fetcher("/api/connector/credential", {
      body: JSON.stringify({}),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseConnectorControlIssue(payload) };
  }

  const parsed = connectorCredentialRevokeSuccessSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

async function requestMcpAccess<T>(
  url: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  init: RequestInit,
  fetcher: FrontendFetcher,
): Promise<ApiResult<T, McpAccessIssue>> {
  let response: Response;
  try {
    response = await fetcher(url, {
      credentials: "same-origin",
      ...init,
    });
  } catch {
    return { ok: false, issue: clientIssue("network_unavailable") };
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    return { ok: false, issue: parseMcpAccessIssue(payload) };
  }

  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issue: clientIssue("unexpected_response") };
}

export async function getMcpAccessStatus(
  options: { signal?: AbortSignal; fetcher?: FrontendFetcher } = {},
): Promise<ApiResult<McpAccessStatusResponse, McpAccessIssue>> {
  return requestMcpAccess(
    "/api/mcp-access",
    mcpAccessStatusResponseSchema,
    {
      method: "GET",
      ...(options.signal ? { signal: options.signal } : {}),
    },
    options.fetcher ?? fetch,
  );
}

export async function claimMcpAccess(
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<McpAccessStatusResponse, McpAccessIssue>> {
  return requestMcpAccess(
    "/api/mcp-access/claim",
    mcpAccessStatusResponseSchema,
    {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    fetcher,
  );
}

export async function issueMcpCredential(
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<McpCredentialIssueResponse, McpAccessIssue>> {
  return requestMcpAccess(
    "/api/mcp-access/credential",
    mcpCredentialIssueResponseSchema,
    {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    fetcher,
  );
}

export async function revokeMcpCredential(
  fetcher: FrontendFetcher = fetch,
): Promise<ApiResult<McpAccessStatusResponse, McpAccessIssue>> {
  return requestMcpAccess(
    "/api/mcp-access/credential",
    mcpAccessStatusResponseSchema,
    {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    },
    fetcher,
  );
}

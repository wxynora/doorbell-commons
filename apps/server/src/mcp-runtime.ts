import type { LingyeActionResult } from "@doorbell/protocol";
import type { CareerExamReminderService } from "./career-exam-reminder-service.js";
import type { CommunityDatabase } from "./community-database.js";
import { renderFarmHelp, stripDetail } from "./doorbell-farm-op-registry.js";
import {
  DOORBELL_INITIALIZE_INSTRUCTIONS,
  type DoorbellCallExample,
  type DoorbellOperationDefinition,
  doorbellToolDefinition,
  examplesForDoorbellInvalidArgs,
  findDoorbellOperation,
} from "./doorbell-op-registry.js";
import { hashMcpCredential } from "./mcp-access-service.js";
import {
  FarmMcpActionBindingMismatchError,
  FarmMcpActionContractUnavailableError,
  FarmMcpActionCredentialInvalidError,
  type FarmMcpActionExecutor,
  FarmMcpActionMigrationRequiredError,
  FarmMcpActionUnavailableError,
} from "./mcp-farm-action-client.js";
import {
  LingyeMcpActionBindingMismatchError,
  LingyeMcpActionContractUnavailableError,
  LingyeMcpActionCredentialInvalidError,
  type LingyeMcpActionExecutor,
  LingyeMcpActionMigrationRequiredError,
  LingyeMcpActionUnavailableError,
} from "./mcp-lingye-action-client.js";
import { OneBotUnavailableError } from "./qq-group-membership.js";
import {
  AuthenticationRequiredError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
} from "./registration-auth.js";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const FARM_STATUS_IDLE_MS = 10 * 60 * 1000;
const MCP_CREDENTIAL_PATTERN = /^dbm_[A-Za-z0-9_-]{43}$/;

type JsonRpcId = string | number | null;

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface DoorbellMcpHttpResult {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
}

export interface DoorbellMcpPostInput {
  authorization?: string;
  origin?: string;
  protocolVersion?: string | null;
  body: unknown;
}

interface DoorbellFarmContext {
  homeId: string;
  residentId: string;
  farmDoorplate: string;
  farmHumanKey: string;
}

type DoorbellToolErrorCode =
  | "ELIGIBILITY_REVOKED"
  | "ELIGIBILITY_UNAVAILABLE"
  | "FARM_NOT_BOUND"
  | "FARM_MIGRATION_REQUIRED"
  | "UNKNOWN_OP"
  | "INVALID_ARGS"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

interface DoorbellIssue {
  path: Array<string | number>;
  code: string;
  message: string;
}

interface DoorbellCallToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown> & {
    text?: string;
    error?: Record<string, unknown> & { message: string };
  };
  isError: boolean;
}

class FarmNotBoundError extends Error {}
class FarmMigrationRequiredError extends Error {}

const TOOL_ERROR_MESSAGES = {
  ELIGIBILITY_REVOKED: "当前社区资格已经失效，Doorbell 连接已停用。",
  ELIGIBILITY_UNAVAILABLE: "暂时无法核验社区资格，本次操作没有执行，请稍后重试。",
  FARM_NOT_BOUND: "当前居民没有可用的农场绑定，本次操作没有执行。",
  FARM_MIGRATION_REQUIRED: "这户农场尚未完成 Doorbell 迁移，请由人类伴侣先领取新连接。",
  UPSTREAM_UNAVAILABLE: "农场服务暂时不可用，本次操作没有执行。",
  INTERNAL_ERROR: "Doorbell 暂时无法完成这次操作，本次操作没有执行。",
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRpcSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcFailure(id: JsonRpcId, code: number, message: string): JsonRpcFailure {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function textContent(text: string) {
  return [{ type: "text" as const, text }];
}

function doorbellToolError(
  code: DoorbellToolErrorCode,
  options: {
    op?: string;
    message?: string;
    issues?: readonly DoorbellIssue[];
    examples?: readonly DoorbellCallExample[];
  } = {},
): DoorbellCallToolResult {
  const message = options.message ?? TOOL_ERROR_MESSAGES[code as keyof typeof TOOL_ERROR_MESSAGES];
  if (!message) {
    throw new Error(`Missing Doorbell error message for ${code}`);
  }
  return {
    content: textContent(message),
    structuredContent: {
      ok: false,
      ...(options.op ? { op: options.op } : {}),
      source: "doorbell",
      error: {
        code,
        message,
        ...(options.issues ? { issues: options.issues } : {}),
        ...(options.examples ? { examples: options.examples } : {}),
      },
    },
    isError: true,
  };
}

function farmToolResult(
  op: string,
  text: string,
  ok: boolean,
  farm?: Record<string, unknown>,
): DoorbellCallToolResult {
  if (!ok) {
    return {
      content: textContent(text),
      structuredContent: {
        ok: false,
        op,
        source: "farm",
        error: { code: "OP_REJECTED", message: text },
      },
      isError: true,
    };
  }
  return {
    content: textContent(text),
    structuredContent: {
      ok: true,
      op,
      source: "farm",
      text,
      ...(farm ? { farm } : {}),
    },
    isError: false,
  };
}

function lingyeToolResult(op: string, result: LingyeActionResult): DoorbellCallToolResult {
  if (!result.ok) {
    return {
      content: textContent(result.error.message),
      structuredContent: {
        ok: false,
        op,
        source: "lingye",
        error: result.error,
      },
      isError: true,
    };
  }
  return {
    content: textContent(result.text),
    structuredContent: {
      ok: true,
      op,
      source: "lingye",
      text: result.text,
      lingye: result.data,
    },
    isError: false,
  };
}

function helpToolResult(op: string, text: string): DoorbellCallToolResult {
  return {
    content: textContent(text),
    structuredContent: { ok: true, op, source: "doorbell", text },
    isError: false,
  };
}

function formatIssues(
  operation: DoorbellOperationDefinition,
  error: { issues: readonly unknown[] },
) {
  return (
    error.issues as Array<{
      path?: Array<PropertyKey>;
      code?: string;
      message?: string;
    }>
  ).map((issue) => ({
    path: [
      "args",
      ...(issue.path ?? []).map((part) =>
        typeof part === "string" || typeof part === "number" ? part : String(part),
      ),
    ],
    code: issue.code ?? "invalid_value",
    message: issue.message ?? `参数不符合 ${operation.op} 的要求`,
  }));
}

function transportAuthError(code: "AUTH_REQUIRED" | "AUTH_INVALID"): DoorbellMcpHttpResult {
  const message =
    code === "AUTH_REQUIRED"
      ? "这次连接没有提供 Doorbell 凭据。请由人类伴侣在 Doorbell Commons 重新领取连接。"
      : "这条 Doorbell 连接已经失效。请由人类伴侣在 Doorbell Commons 重新领取连接。";
  return {
    statusCode: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": "Bearer",
    },
    body: { ok: false, error: { code, message } },
  };
}

function protocolVersionError(
  code:
    | "MCP_PROTOCOL_VERSION_REQUIRED"
    | "MCP_PROTOCOL_VERSION_INVALID"
    | "MCP_PROTOCOL_VERSION_UNSUPPORTED",
): DoorbellMcpHttpResult {
  return {
    statusCode: 400,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    body: { ok: false, error: { code, supported: [MCP_PROTOCOL_VERSION] } },
  };
}

export interface DoorbellMcpRuntimeOptions {
  database: CommunityDatabase;
  registrationAuth: RegistrationAuthService;
  farmActions: FarmMcpActionExecutor;
  lingyeActions: LingyeMcpActionExecutor;
  careerExamReminders?: Pick<CareerExamReminderService, "reconcile">;
  mcpEndpoint: string;
  now?: () => number;
  onNotificationDeliveryError?: (error: unknown) => void;
  onLingyeNotification?: (
    notification: NonNullable<Extract<LingyeActionResult, { ok: true }>["notifications"]>[number],
    sourceResidentId: string,
  ) => void;
  onResidentNotificationsRead?: (residentId: string) => void;
}

export class DoorbellMcpRuntime {
  readonly #database: CommunityDatabase;
  readonly #registrationAuth: RegistrationAuthService;
  readonly #farmActions: FarmMcpActionExecutor;
  readonly #lingyeActions: LingyeMcpActionExecutor;
  readonly #careerExamReminders: Pick<CareerExamReminderService, "reconcile"> | undefined;
  readonly #allowedOrigin: string;
  readonly #now: () => number;
  readonly #onNotificationDeliveryError: (error: unknown) => void;
  readonly #onLingyeNotification:
    | ((
        notification: NonNullable<
          Extract<LingyeActionResult, { ok: true }>["notifications"]
        >[number],
        sourceResidentId: string,
      ) => void)
    | undefined;
  readonly #onResidentNotificationsRead: ((residentId: string) => void) | undefined;
  readonly #lastFarmCallAt = new Map<string, number>();

  constructor(options: DoorbellMcpRuntimeOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#farmActions = options.farmActions;
    this.#lingyeActions = options.lingyeActions;
    this.#careerExamReminders = options.careerExamReminders;
    this.#allowedOrigin = new URL(options.mcpEndpoint).origin;
    this.#now = options.now ?? Date.now;
    this.#onNotificationDeliveryError = options.onNotificationDeliveryError ?? (() => undefined);
    this.#onLingyeNotification = options.onLingyeNotification;
    this.#onResidentNotificationsRead = options.onResidentNotificationsRead;
  }

  async handlePost(input: DoorbellMcpPostInput): Promise<DoorbellMcpHttpResult> {
    if (input.origin && input.origin !== this.#allowedOrigin) {
      return { statusCode: 403, headers: { "cache-control": "no-store" } };
    }
    const bearer = this.#readBearerCredential(input.authorization);
    if (bearer === "missing") {
      return transportAuthError("AUTH_REQUIRED");
    }
    if (bearer === "invalid") {
      return transportAuthError("AUTH_INVALID");
    }
    const binding = this.#database.authenticateMcpCredentialHash(hashMcpCredential(bearer));
    if (!binding) {
      return transportAuthError("AUTH_INVALID");
    }

    const isInitialize =
      !Array.isArray(input.body) && isPlainObject(input.body) && input.body.method === "initialize";
    if (!isInitialize && input.protocolVersion !== undefined) {
      if (input.protocolVersion === null || input.protocolVersion === "") {
        return protocolVersionError("MCP_PROTOCOL_VERSION_REQUIRED");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.protocolVersion)) {
        return protocolVersionError("MCP_PROTOCOL_VERSION_INVALID");
      }
      if (input.protocolVersion !== MCP_PROTOCOL_VERSION) {
        return protocolVersionError("MCP_PROTOCOL_VERSION_UNSUPPORTED");
      }
    }
    if (Array.isArray(input.body)) {
      return this.#jsonResponse(jsonRpcFailure(null, -32600, "Invalid Request"));
    }
    const context = this.#resolveContext(binding.residentId);
    void context.catch(() => undefined);
    const response = await this.#dispatchOne(input.body, context);
    return response
      ? this.#jsonResponse(response)
      : { statusCode: 202, headers: { "cache-control": "no-store" } };
  }

  #jsonResponse(body: unknown): DoorbellMcpHttpResult {
    return {
      statusCode: 200,
      headers: { "cache-control": "no-store", "content-type": "application/json" },
      body,
    };
  }

  #readBearerCredential(authorization: string | undefined): string | "missing" | "invalid" {
    if (!authorization) {
      return "missing";
    }
    const match = /^Bearer ([^ ]+)$/.exec(authorization);
    if (!match?.[1] || !MCP_CREDENTIAL_PATTERN.test(match[1])) {
      return "invalid";
    }
    return match[1];
  }

  async #resolveContext(residentId: string): Promise<DoorbellFarmContext> {
    await this.#registrationAuth.confirmCurrentResidentMembership(residentId);
    const homeId = this.#database.findHomeIdByResidentId(residentId);
    if (!homeId) {
      throw new FarmNotBoundError();
    }
    const farmBinding = this.#database.findFarmBindingByHomeId(homeId);
    if (!farmBinding || farmBinding.farmHumanKey === null) {
      throw new FarmNotBoundError();
    }
    const accessBinding = this.#database.getMcpAccessBinding(residentId);
    if (
      !accessBinding ||
      accessBinding.farmRevokedAt === null ||
      accessBinding.farmConfirmationId === null ||
      accessBinding.farmDoorplate !== farmBinding.farmDoorplate
    ) {
      throw new FarmMigrationRequiredError();
    }
    return {
      homeId,
      residentId,
      farmDoorplate: farmBinding.farmDoorplate,
      farmHumanKey: farmBinding.farmHumanKey,
    };
  }

  async #dispatchOne(
    request: unknown,
    contextPromise: Promise<DoorbellFarmContext>,
  ): Promise<JsonRpcResponse | undefined> {
    if (
      !isPlainObject(request) ||
      request.jsonrpc !== "2.0" ||
      typeof request.method !== "string"
    ) {
      return jsonRpcFailure(null, -32600, "Invalid Request");
    }
    const hasId = Object.hasOwn(request, "id");
    const id =
      hasId &&
      (typeof request.id === "string" || typeof request.id === "number" || request.id === null)
        ? request.id
        : null;
    if (hasId && id === null && request.id !== null) {
      return jsonRpcFailure(null, -32600, "Invalid Request");
    }
    const isNotification = !hasId;

    let context: DoorbellFarmContext;
    try {
      context = await contextPromise;
    } catch (error) {
      if (isNotification) {
        return undefined;
      }
      if (
        request.method === "tools/call" &&
        isPlainObject(request.params) &&
        request.params.name === "doorbell"
      ) {
        return jsonRpcSuccess(id, this.#contextToolError(error));
      }
      return jsonRpcFailure(id, -32001, this.#contextProtocolMessage(error));
    }

    switch (request.method) {
      case "initialize": {
        if (isNotification) {
          return undefined;
        }
        const requestedVersion =
          isPlainObject(request.params) && typeof request.params.protocolVersion === "string"
            ? request.params.protocolVersion
            : MCP_PROTOCOL_VERSION;
        return jsonRpcSuccess(id, {
          protocolVersion:
            requestedVersion === MCP_PROTOCOL_VERSION ? requestedVersion : MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "doorbell-commons", version: "1.0.0" },
          instructions: DOORBELL_INITIALIZE_INSTRUCTIONS,
        });
      }
      case "ping":
        return isNotification ? undefined : jsonRpcSuccess(id, {});
      case "tools/list":
        return isNotification ? undefined : jsonRpcSuccess(id, { tools: [doorbellToolDefinition] });
      case "tools/call":
        if (isNotification) {
          return undefined;
        }
        try {
          const result = await this.#callTool(request.params, context);
          try {
            return jsonRpcSuccess(id, this.#appendResidentNotifications(result, context));
          } catch (error) {
            try {
              this.#onNotificationDeliveryError(error);
            } catch {
              // Logging must not overturn an already completed tool call either.
            }
            return jsonRpcSuccess(id, result);
          }
        } catch (error) {
          if (error instanceof ProtocolToolError) {
            return jsonRpcFailure(id, error.code, error.message);
          }
          throw error;
        }
      default:
        if (isNotification) {
          return undefined;
        }
        return jsonRpcFailure(id, -32601, "Method not found");
    }
  }

  #contextToolError(error: unknown) {
    if (error instanceof QqNotGroupMemberError) {
      return doorbellToolError("ELIGIBILITY_REVOKED");
    }
    if (error instanceof OneBotUnavailableError) {
      return doorbellToolError("ELIGIBILITY_UNAVAILABLE");
    }
    if (error instanceof FarmNotBoundError) {
      return doorbellToolError("FARM_NOT_BOUND");
    }
    if (error instanceof FarmMigrationRequiredError) {
      return doorbellToolError("FARM_MIGRATION_REQUIRED");
    }
    return doorbellToolError("INTERNAL_ERROR");
  }

  #contextProtocolMessage(error: unknown): string {
    if (error instanceof QqNotGroupMemberError) {
      return TOOL_ERROR_MESSAGES.ELIGIBILITY_REVOKED;
    }
    if (error instanceof OneBotUnavailableError) {
      return TOOL_ERROR_MESSAGES.ELIGIBILITY_UNAVAILABLE;
    }
    if (error instanceof FarmNotBoundError) {
      return TOOL_ERROR_MESSAGES.FARM_NOT_BOUND;
    }
    if (error instanceof FarmMigrationRequiredError) {
      return TOOL_ERROR_MESSAGES.FARM_MIGRATION_REQUIRED;
    }
    if (error instanceof AuthenticationRequiredError) {
      return "这条 Doorbell 连接已经失效。请由人类伴侣在 Doorbell Commons 重新领取连接。";
    }
    return TOOL_ERROR_MESSAGES.INTERNAL_ERROR;
  }

  async #callTool(params: unknown, context: DoorbellFarmContext): Promise<DoorbellCallToolResult> {
    if (!isPlainObject(params) || params.name !== "doorbell") {
      throw new ProtocolToolError(-32602, "Invalid params");
    }
    const call = params.arguments;
    if (!isPlainObject(call)) {
      return doorbellToolError("INVALID_ARGS", {
        message:
          "参数不符合 doorbell 的要求。请按 issues 修正 args，不要使用旧 action 参数或身份字段。",
        issues: [{ path: ["arguments"], code: "invalid_type", message: "必须是对象" }],
      });
    }
    const keys = Object.keys(call);
    const op = typeof call.op === "string" ? call.op : undefined;
    if (
      keys.length !== 2 ||
      !keys.includes("op") ||
      !keys.includes("args") ||
      !op ||
      !isPlainObject(call.args)
    ) {
      return doorbellToolError("INVALID_ARGS", {
        ...(op ? { op } : {}),
        message: `参数不符合 ${op ?? "doorbell"} 的要求。请按 issues 修正 args，不要使用旧 action 参数或身份字段。`,
        issues: [{ path: ["arguments"], code: "invalid_shape", message: "必须只包含 op 和 args" }],
      });
    }
    const registered = findDoorbellOperation(op);
    if (!registered) {
      return doorbellToolError("UNKNOWN_OP", {
        op,
        message: `未开放的操作：${op}。请使用 doorbell 工具 Schema 中列出的完整 op。`,
      });
    }
    const parsed = registered.operation.argsSchema.safeParse(call.args);
    if (!parsed.success) {
      return doorbellToolError("INVALID_ARGS", {
        op,
        message: `参数不符合 ${op} 的要求。请按 issues 修正 args，不要使用旧 action 参数或身份字段。`,
        issues: formatIssues(registered.operation, parsed.error),
        examples: examplesForDoorbellInvalidArgs(registered.operation, call.args),
      });
    }

    if (registered.kind === "lingye") {
      try {
        const result = await this.#lingyeActions.execute({
          residentId: context.residentId,
          farmDoorplate: context.farmDoorplate,
          farmHumanKey: context.farmHumanKey,
          op: registered.operation.op,
          args: parsed.data,
        });
        if (result.ok && result.notifications && this.#onLingyeNotification) {
          for (const notification of result.notifications) {
            try {
              this.#onLingyeNotification(notification, context.residentId);
            } catch (error) {
              try {
                this.#onNotificationDeliveryError(error);
              } catch {
                // The already completed Lingye action must remain the returned result.
              }
            }
          }
        }
        if (
          registered.operation.op === "go.school.view" ||
          registered.operation.op === "go.school.choose"
        ) {
          this.#careerExamReminders?.reconcile({
            residentId: context.residentId,
            homeId: context.homeId,
            result,
          });
        }
        return lingyeToolResult(op, result);
      } catch (error) {
        if (
          error instanceof LingyeMcpActionCredentialInvalidError ||
          error instanceof LingyeMcpActionBindingMismatchError
        ) {
          return doorbellToolError("FARM_NOT_BOUND", { op });
        }
        if (error instanceof LingyeMcpActionMigrationRequiredError) {
          return doorbellToolError("FARM_MIGRATION_REQUIRED", { op });
        }
        if (error instanceof LingyeMcpActionUnavailableError) {
          return doorbellToolError("UPSTREAM_UNAVAILABLE", { op });
        }
        if (error instanceof LingyeMcpActionContractUnavailableError) {
          return doorbellToolError("INTERNAL_ERROR", { op });
        }
        return doorbellToolError("INTERNAL_ERROR", { op });
      }
    }

    const shouldAppendStatus = this.#noteValidFarmCall(context.residentId);
    const operation = registered.operation;
    const { detail, businessArgs } = stripDetail(parsed.data);
    const plan = operation.adapt(businessArgs);
    if (plan.kind === "help") {
      let text = renderFarmHelp(plan.operation);
      if (shouldAppendStatus) {
        text = await this.#appendStatusWhenAvailable(text, context);
      }
      return helpToolResult(op, text);
    }

    try {
      const result = await this.#farmActions.execute({
        farmDoorplate: context.farmDoorplate,
        farmHumanKey: context.farmHumanKey,
        action: plan.action,
        params: plan.params,
        detail,
      });
      let text = result.text;
      if (shouldAppendStatus && op !== "farm.status") {
        text = await this.#appendStatusWhenAvailable(text, context);
      }
      return farmToolResult(op, text, result.ok, result.farm);
    } catch (error) {
      if (
        error instanceof FarmMcpActionCredentialInvalidError ||
        error instanceof FarmMcpActionBindingMismatchError
      ) {
        return doorbellToolError("FARM_NOT_BOUND", { op });
      }
      if (error instanceof FarmMcpActionMigrationRequiredError) {
        return doorbellToolError("FARM_MIGRATION_REQUIRED", { op });
      }
      if (error instanceof FarmMcpActionUnavailableError) {
        return doorbellToolError("UPSTREAM_UNAVAILABLE", { op });
      }
      if (error instanceof FarmMcpActionContractUnavailableError) {
        return doorbellToolError("INTERNAL_ERROR", { op });
      }
      return doorbellToolError("INTERNAL_ERROR", { op });
    }
  }

  #appendResidentNotifications(
    result: DoorbellCallToolResult,
    context: DoorbellFarmContext,
  ): DoorbellCallToolResult {
    const notifications = this.#database.takeResidentMailboxNotifications(
      context.homeId,
      this.#now(),
    );
    if (notifications.length === 0) {
      return result;
    }
    try {
      this.#onResidentNotificationsRead?.(context.residentId);
    } catch (error) {
      try {
        this.#onNotificationDeliveryError(error);
      } catch {
        // Bell cancellation is a side effect and cannot overturn the tool result.
      }
    }
    const suffix = notifications.join("\n\n");
    const currentText = result.content[0]?.text ?? "";
    const combinedText = currentText ? `${currentText}\n\n${suffix}` : suffix;
    const structuredContent = { ...result.structuredContent };
    if (typeof structuredContent.text === "string") {
      structuredContent.text = combinedText;
    } else if (structuredContent.error) {
      structuredContent.error = {
        ...structuredContent.error,
        message: combinedText,
      };
    }
    return {
      ...result,
      content: [{ type: "text", text: combinedText }],
      structuredContent,
    };
  }

  #noteValidFarmCall(residentId: string): boolean {
    const now = this.#now();
    const previous = this.#lastFarmCallAt.get(residentId);
    this.#lastFarmCallAt.set(residentId, now);
    return previous === undefined || now - previous >= FARM_STATUS_IDLE_MS;
  }

  async #appendStatusWhenAvailable(text: string, context: DoorbellFarmContext): Promise<string> {
    try {
      const status = await this.#farmActions.execute({
        farmDoorplate: context.farmDoorplate,
        farmHumanKey: context.farmHumanKey,
        action: "status",
        params: {},
      });
      return status.ok ? `${text}\n\n${status.text}` : text;
    } catch {
      return text;
    }
  }
}

class ProtocolToolError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "ProtocolToolError";
    this.code = code;
  }
}

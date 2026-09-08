import type { FastifyInstance, FastifyRequest } from "fastify";
import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { FaultStore, type FaultInput } from "./store.js";

const SYSTEM_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "ECONNABORTED", "EPIPE", "EACCES", "ENOENT", "SQLITE_BUSY", "SQLITE_LOCKED", "SQLITE_ERROR"]);

export function safeErrorFacts(error: unknown): Pick<FaultInput, "errorType" | "systemCode" | "locations"> {
  if (!(error instanceof Error)) return {};
  const errorType = error.constructor.name;
  const code = (error as NodeJS.ErrnoException).code;
  const stack = error.stack ?? "";
  const header = `${error.name}: ${error.message}`;
  // Remove the whole message, including embedded newlines and fake frames.
  const frameText = stack.startsWith(header) ? stack.slice(header.length) : "";
  const locations = frameText.split("\n").flatMap(line => {
    const location = line.match(/(?:apps\/server\/(?:src|dist)\/|node_modules\/|node:)[A-Za-z0-9_./@+-]+:\d+:\d+(?=\)?$)/)?.[0];
    return location ? [location] : [];
  });
  return {
    ...(/^[A-Za-z][A-Za-z0-9]*Error$/.test(errorType) || errorType === "Error" ? { errorType } : {}),
    ...(code && SYSTEM_CODES.has(code) ? { systemCode: code } : {}),
    ...(locations.length ? { locations } : {}),
  };
}

export class FaultReports {
  constructor(readonly store: FaultStore, readonly onFailure: () => void = () => undefined) {}
  capture(input: FaultInput, error?: unknown): void {
    try { this.store.capture({ ...input, ...safeErrorFacts(error) }); }
    catch { try { this.onFailure(); } catch { /* Diagnostics cannot replace a business result. */ } }
  }
  tool(code: string, operation: string | undefined, error?: unknown): void {
    this.capture({ source: "mcp", feature: operation ?? "社区连接", stage: code === "ELIGIBILITY_UNAVAILABLE" ? "资格核验" : "工具执行", code }, error);
  }
}

export function installFaultReports(app: FastifyInstance, reports: FaultReports | undefined): void {
  if (!reports) return;
  const errors = new WeakMap<FastifyRequest, ReturnType<typeof safeErrorFacts>>();
  app.addHook("onError", async (request, _reply, error) => { errors.set(request, safeErrorFacts(error)); });
  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode < 500) return;
    const route = request.routeOptions.url;
    const feature = route?.startsWith("/api/farm") ? "农场" : route?.includes("lingye-daily") ? "铃野日报"
      : route?.startsWith("/api/lingye") ? "铃野" : "社区接口";
    reports.capture({ source: "http", feature, stage: "请求处理", code: `HTTP_${reply.statusCode}`,
      ...(route ? { route } : {}), method: request.method, status: reply.statusCode, ...errors.get(request) });
    errors.delete(request);
  });
  app.addHook("onClose", async () => { reports.store.close(); });
}

export function readRuntimeVersion(root = process.cwd()): string | null {
  try {
    const version = readFileSync(join(root, ".doorbell-release-sha"), "utf8").trim();
    return /^[0-9a-f]{40}$/.test(version) ? version : null;
  } catch { return null; }
}

export function createFaultReports(databasePath: string): FaultReports | undefined {
  const onFailure = () => { process.stderr.write("[doorbell-fault-reports] storage_unavailable\n"); };
  try {
    return new FaultReports(new FaultStore({ directory: join(dirname(resolve(databasePath)), "fault-reports"),
      version: readRuntimeVersion(), onError: onFailure }), onFailure);
  } catch { onFailure(); return undefined; }
}

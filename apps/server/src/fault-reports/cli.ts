import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { FaultStore } from "./store.js";
import { readRuntimeVersion } from "./collector.js";

export function executeFaultCommand(directory: string, command: unknown): unknown {
  if (!existsSync(directory)) throw new Error("故障采集目录尚未就绪");
  if (!command || typeof command !== "object") throw new Error("无效操作");
  const input = command as Record<string, unknown>;
  const store = new FaultStore({ directory, automaticCleanup: false,
    version: readRuntimeVersion(fileURLToPath(new URL("../../../../", import.meta.url))) });
  try {
    if (input.op === "list") {
      return { records: store.list().map(({ report: _report, ...record }) => record), now: Date.now() };
    }
    if (input.op === "report" && typeof input.id === "string") {
      return { record: store.report(input.id) ?? null, now: Date.now() };
    }
    if (input.op === "manual" && typeof input.page === "string" && input.page.trim()
        && typeof input.occurredAt === "number" && Number.isFinite(input.occurredAt)
        && !Number.isNaN(new Date(input.occurredAt).getTime())) {
      const record = store.capture({ source: "manual", feature: input.page.trim(), occurredAt: input.occurredAt,
        stage: "未留下明确错误", code: "MANUAL_FEEDBACK" });
      return { record, now: Date.now() };
    }
    throw new Error("无效操作");
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try {
    const [flag, directory, ...extra] = process.argv.slice(2);
    if (flag !== "--directory" || !directory || extra.length) throw new Error("用法：fault-reports/cli --directory <记录目录>");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    process.stdout.write(JSON.stringify(executeFaultCommand(directory, JSON.parse(Buffer.concat(chunks).toString()))));
  } catch {
    process.stderr.write("故障材料读取或整理失败，请核对采集服务与记录目录。\n");
    process.exitCode = 1;
  }
}

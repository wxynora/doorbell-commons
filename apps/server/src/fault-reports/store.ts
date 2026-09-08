import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, lstatSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

export const FAULT_TTL_MS = 24 * 60 * 60 * 1000;
const FILE = /^(\d+)\.([0-9a-f-]{36})\.json(?:\.[0-9a-f-]{36}\.tmp)?$/;
export type FaultSource = "http" | "mcp" | "manual";
export interface FaultInput {
  source: FaultSource;
  feature: string;
  stage: string;
  code: string;
  route?: string;
  method?: string;
  status?: number;
  occurredAt?: number;
  errorType?: string;
  systemCode?: string;
  locations?: string[];
}
export interface FaultRecord extends FaultInput {
  id: string;
  createdAt: number;
  occurredAt: number;
  expiresAt: number;
  version: string | null;
  report?: string;
}

/** Dedicated short-lived files; never part of the community/player database. */
export class FaultStore {
  readonly directory: string;
  readonly #now: () => number;
  readonly #version: string | null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #watcher: FSWatcher | undefined;
  #closed = false;
  readonly #onError: () => void;

  constructor(options: { directory: string; version?: string | null; now?: () => number; automaticCleanup?: boolean; onError?: () => void }) {
    this.directory = options.directory;
    this.#version = options.version ?? null;
    this.#now = options.now ?? Date.now;
    this.#onError = options.onError ?? (() => undefined);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.prune();
    if (options.automaticCleanup !== false) {
      // A maintenance CLI may create a manual record or report in another
      // process. Watch those writes so idle service cleanup still runs on time.
      this.#watcher = watch(this.directory, { persistent: false }, () => {
        try { this.#schedule(); } catch { this.#onError(); }
      });
      this.#watcher.on("error", this.#onError);
      this.#schedule();
    }
  }

  #paths(): Array<{ path: string; id: string; expiresAt: number; temporary: boolean }> {
    return readdirSync(this.directory).flatMap(name => {
      const match = FILE.exec(name);
      if (!match) return [];
      return [{ path: join(this.directory, name), id: match[2]!, expiresAt: Number(match[1]), temporary: name.endsWith(".tmp") }];
    });
  }

  prune(): void {
    for (const file of this.#paths()) {
      if (file.expiresAt <= this.#now()) {
        try { unlinkSync(file.path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    }
  }

  #schedule(): void {
    if (this.#closed) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.prune();
    const deadlines = this.#paths().map(file => file.expiresAt);
    if (!deadlines.length) return;
    const next = deadlines.reduce((earliest, time) => Math.min(earliest, time));
    this.#timer = setTimeout(() => {
      try { this.#schedule(); } catch { this.#onError(); }
    }, Math.max(0, next - this.#now()));
    this.#timer.unref();
  }

  #write(record: FaultRecord): void {
    const path = join(this.directory, `${record.expiresAt}.${record.id}.json`);
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
    renameSync(temporary, path);
    if (this.#watcher) this.#schedule();
  }

  capture(input: FaultInput): FaultRecord {
    const now = this.#now();
    const record: FaultRecord = {
      source: input.source, feature: input.feature, stage: input.stage, code: input.code,
      ...(input.route !== undefined ? { route: input.route } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.errorType !== undefined ? { errorType: input.errorType } : {}),
      ...(input.systemCode !== undefined ? { systemCode: input.systemCode } : {}),
      ...(input.locations !== undefined ? { locations: input.locations } : {}),
      id: randomUUID(), createdAt: now, occurredAt: input.occurredAt ?? now,
      expiresAt: now + FAULT_TTL_MS, version: this.#version,
    };
    this.#write(record);
    return record;
  }

  list(): FaultRecord[] {
    this.prune();
    const records: FaultRecord[] = [];
    for (const file of this.#paths()) {
      if (file.temporary) continue;
      try {
        if (!lstatSync(file.path).isFile()) continue;
        const record = JSON.parse(readFileSync(file.path, "utf8")) as FaultRecord;
        if (record.id !== file.id || record.expiresAt !== file.expiresAt || record.expiresAt <= this.#now()) continue;
        records.push(record);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
    }
    return records.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }

  report(id: string): FaultRecord | undefined {
    const record = this.list().find(item => item.id === id);
    if (!record) return undefined;
    if (!record.report) {
      record.report = renderFaultReport(record);
      // Keep the original deadline. Repeated collection never renews retention.
      if (record.expiresAt <= this.#now()) { this.prune(); return undefined; }
      this.#write(record);
    }
    return record;
  }

  close(): void {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#watcher?.close();
  }
}

export function renderFaultReport(record: FaultRecord): string {
  const lines = ["故障材料", `编号：${record.id}`, `发生时间：${new Date(record.occurredAt).toISOString()}`,
    `自动删除：${new Date(record.expiresAt).toISOString()}`, `功能：${record.feature}`,
    `来源：${{ http: "接口异常", mcp: "工具异常", manual: "未留下明确错误的反馈" }[record.source]}`,
    `阶段：${record.stage}`, `错误类别：${record.code}`, `${record.source === "manual" ? "补录时的社区版本（并非历史故障版本）" : "故障时的社区版本"}：${record.version ?? "未取得版本标记"}`];
  if (record.route) lines.push(`入口：${record.method ?? ""} ${record.route}`.trim());
  if (record.status !== undefined) lines.push(`HTTP状态：${record.status}`);
  if (record.errorType) lines.push(`异常类型：${record.errorType}`);
  if (record.systemCode) lines.push(`系统错误码：${record.systemCode}`);
  if (record.locations?.length) lines.push("代码位置：", ...record.locations.map(location => `- ${location}`));
  lines.push("", record.source === "manual" ? "未找到明确错误记录；此材料仅包含补充的时间和页面，不能据此认定根因。" : "以上为本次捕获的故障事实，不代表已查明根因。",
    "不包含请求正文、响应正文、身份凭据或私人对话。上游农场版本及未接入的后台任务不在本报告中。");
  return lines.join("\n");
}

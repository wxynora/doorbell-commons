#!/usr/bin/env node
// AI 农场本地优先同步客户端。单机存档仍在本地；联机服只收到显式同步的副本。
import {
  chmodSync, existsSync, readFileSync, renameSync, writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args.shift() ?? "help";

function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const FARM_FILE = resolve(option("--farm-file", "farm_save.json"));
const UGC_FILE = resolve(option("--ugc-file", "ugc_save.json"));
const STATE_FILE = resolve(option("--state-file", "farm_sync.json"));
const FARM_ID = option("--farm-id", "");

function readJson(file, optional = false) {
  if (optional && !existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeAtomic(file, value, secret = false) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (secret) chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  if (secret) chmodSync(file, 0o600);
}

function selectFarm(container) {
  const farms = Array.isArray(container)
    ? container
    : Array.isArray(container?.farms)
      ? container.farms
      : [container?.farm ?? container];
  if (!FARM_ID && farms.length > 1) throw new Error("存档里有多座农场，请用 --farm-id 指定门牌号。");
  const index = FARM_ID ? farms.findIndex((farm) => String(farm?.id ?? "") === FARM_ID) : 0;
  if (index < 0 || !farms[index] || typeof farms[index] !== "object") throw new Error("找不到要同步的农场。");
  return { farms, farm: farms[index], index };
}

function currentBundle() {
  const container = readJson(FARM_FILE);
  const selected = selectFarm(container);
  const ugc = Array.isArray(container?.ugc)
    ? container.ugc
    : (readJson(UGC_FILE, true) ?? []);
  return { container, ...selected, ugc: Array.isArray(ugc) ? ugc : [] };
}

function preserveLocalIdentity(snapshot, local) {
  const out = structuredClone(snapshot);
  for (const key of ["id", "token", "humanKey", "agentKey"]) {
    if (local[key] !== undefined) out[key] = local[key];
    else delete out[key];
  }
  delete out.syncHub;
  return out;
}

function installCanonical(bundle, snapshot, ugc) {
  const local = bundle.farm;
  const merged = preserveLocalIdentity(snapshot, local);
  if (Array.isArray(bundle.container)) {
    const next = [...bundle.container];
    next[bundle.index] = merged;
    writeAtomic(FARM_FILE, next);
  } else if (Array.isArray(bundle.container?.farms)) {
    const next = structuredClone(bundle.container);
    next.farms[bundle.index] = merged;
    if (Array.isArray(next.ugc)) next.ugc = ugc;
    writeAtomic(FARM_FILE, next);
  } else if (bundle.container?.farm) {
    const next = { ...bundle.container, farm: merged, ugc };
    writeAtomic(FARM_FILE, next);
  } else {
    writeAtomic(FARM_FILE, merged);
  }
  if (!Array.isArray(bundle.container?.ugc)) writeAtomic(UGC_FILE, ugc);
}

async function request(url, init) {
  const response = await fetch(url, init);
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`联机服返回了非 JSON 响应（HTTP ${response.status}）。`); }
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || payload?.text || `HTTP ${response.status}`);
  return payload;
}

function normalizeServer(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

async function register() {
  const server = normalizeServer(option("--server", process.env.AIFARM_SYNC_SERVER));
  if (!server) throw new Error("首次注册请提供 --server https://…/farm");
  if (existsSync(STATE_FILE)) throw new Error(`${STATE_FILE} 已存在；要同步现有身份请运行 sync，不要重复注册。`);
  const bundle = currentBundle();
  const payload = await request(`${server}/sync/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ farm: bundle.farm, ugc: bundle.ugc }),
  });
  installCanonical(bundle, payload.snapshot, payload.ugc ?? []);
  writeAtomic(STATE_FILE, {
    format: "aifarm-sync-client",
    version: 1,
    server,
    farmId: payload.farmId,
    syncKey: payload.syncKey,
    clientSeq: 0,
    revision: payload.revision,
    updatedAt: new Date().toISOString(),
  }, true);
  console.log(JSON.stringify({
    ok: true,
    text: "已注册并保存同步身份；同步钥匙只写入 mode-600 状态文件，不在终端显示。",
    farmId: payload.farmId,
    humanUrl: payload.humanUrl,
    playUrl: payload.playUrl,
  }));
}

async function sync() {
  const state = readJson(STATE_FILE);
  if (state?.format !== "aifarm-sync-client" || state?.version !== 1) throw new Error("同步状态文件格式无效。");
  const bundle = currentBundle();
  const nextSeq = Number(state.clientSeq ?? 0) + 1;
  const payload = await request(`${normalizeServer(state.server)}/sync/${encodeURIComponent(state.farmId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-farm-sync-key": String(state.syncKey ?? ""),
    },
    body: JSON.stringify({ clientSeq: nextSeq, farm: bundle.farm, ugc: bundle.ugc }),
  });
  installCanonical(bundle, payload.snapshot, payload.ugc ?? []);
  writeAtomic(STATE_FILE, {
    ...state,
    clientSeq: nextSeq,
    revision: payload.revision,
    updatedAt: new Date().toISOString(),
  }, true);
  console.log(JSON.stringify({
    ok: true,
    text: payload.idempotent ? "这次同步已在联机服处理过，已拉回当前规范存档。" : "本地进度已同步，联机期间收到的变化也已合并回本地。",
    farmId: state.farmId,
    revision: payload.revision,
    events: payload.events ?? { messages: [], trail: [] },
  }));
}

async function exportBackup() {
  const state = readJson(STATE_FILE);
  const payload = await request(
    `${normalizeServer(state.server)}/sync/${encodeURIComponent(state.farmId)}/export`,
    { headers: { "x-farm-sync-key": String(state.syncKey ?? "") } },
  );
  const target = resolve(option("--out", `aifarm_sync_export_${state.farmId}.json`));
  const { ok: _ok, ...pack } = payload;
  writeAtomic(target, pack, true);
  console.log(JSON.stringify({ ok: true, text: "联机副本已导出。", file: target }));
}

function help() {
  console.log(`AI 农场本地优先同步

首次注册：
  node farm-sync.mjs register --server https://example.com/farm

以后同步：
  node farm-sync.mjs sync

导出联机副本：
  node farm-sync.mjs export [--out backup.json]

可选：
  --farm-file <path> --ugc-file <path> --state-file <path> --farm-id <门牌号>

运行 sync 时不要让另一个进程同时写同一份本地存档。`);
}

try {
  if (command === "register") await register();
  else if (command === "sync") await sync();
  else if (command === "export") await exportBackup();
  else help();
} catch (error) {
  console.log(JSON.stringify({ ok: false, text: error?.message ?? String(error) }));
  process.exitCode = 1;
}

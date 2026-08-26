import { createHash } from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

/**
 * `craft()` mutates several authoritative farm fields in one operation.  The
 * revision covers those inputs and outputs so a stale full-farm clone cannot
 * overwrite another completed action.  Idempotency receipts are deliberately
 * excluded because replaying the same request must keep the same precondition.
 */
export function smeltingActionRevision(farm) {
  return `farm-smelting-v1:${digest({
    schema: "farm-smelting-v1",
    materials: farm?.materials ?? null,
    seeds: farm?.seeds ?? null,
    rng_state: farm?.rngState ?? null,
    codex: farm?.codex ?? null,
    crafted: farm?.crafted ?? null,
    task: farm?.task ?? null,
    task_daily: farm?.taskDaily ?? null,
    tasks_done: farm?.tasksDone ?? null,
    daily: farm?.daily ?? null,
    qixi_2026: farm?.qixi2026 ?? null,
    log: farm?.log ?? null,
  })}`;
}

export const smeltingRevision = smeltingActionRevision;

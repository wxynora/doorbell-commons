import { COUNTERS } from "./schema.js";
import { addAnnualCounters, beijingYear } from "./store.js";

// One aggregate per year/identity, retained only until the world commit succeeds.
// Being cloneable lets existing staged-farm / receipt recovery preserve it.
export const PENDING_COUNTERS = "annualStatisticsPending";
export function stageAnnualCounters(farm, kind, keys, increments, at) {
  const spec = COUNTERS[kind];
  if (!spec || !farm || typeof farm.id !== "string") throw new TypeError("Invalid statistic source");
  const identity = JSON.stringify([kind,beijingYear(at),...spec.keys.map(key => keys[key])]);
  const pending = farm[PENDING_COUNTERS] ??= {};
  const entry = pending[identity] ??= { kind,keys:{...keys},increments:{},firstAt:at,lastAt:at };
  for (const [key,value] of Object.entries(increments)) {
    if (!spec.values.includes(key) || !Number.isSafeInteger(value) || value < 0)
      throw new TypeError("Invalid statistic increment");
    const total = (entry.increments[key] ?? 0) + value;
    if (!Number.isSafeInteger(total)) throw new RangeError("Statistic counter overflow");
    entry.increments[key]=total;
  }
  entry.firstAt=Math.min(entry.firstAt,at);entry.lastAt=Math.max(entry.lastAt,at);
}

// Call only on the staged farm in the world owner's SQLite transaction.
export function flushAnnualCounters(database, farm) {
  const pending = farm[PENDING_COUNTERS];
  if (!pending) return false;
  for (const entry of Object.values(pending)) {
    addAnnualCounters(database,entry.kind,entry.keys,entry.increments,entry.firstAt);
    const spec=COUNTERS[entry.kind];
    database.prepare(`UPDATE ${spec.table} SET last_at=max(last_at,?) WHERE year=? AND ${spec.keys.map(key => `${key}=?`).join(" AND ")}`)
      .run(entry.lastAt,beijingYear(entry.firstAt),...spec.keys.map(key=>entry.keys[key]));
  }
  delete farm[PENDING_COUNTERS];
  return true;
}

import { COUNTERS } from "./schema.js";

export function beijingYear(at) {
  if (!Number.isSafeInteger(at)) throw new TypeError("Invalid statistic timestamp");
  return new Date(at + 8 * 3600000).getUTCFullYear();
}

export function addAnnualCounters(database, kind, keys, increments, at) {
  const spec = COUNTERS[kind];
  if (!spec || spec.keys.some(key => typeof keys[key] !== "string" || !keys[key]))
    throw new TypeError("Invalid statistic identity");
  for (const [key,value] of Object.entries(increments)) {
    if (!spec.values.includes(key) || !Number.isSafeInteger(value) || value < 0)
      throw new TypeError("Invalid statistic counter");
  }
  const columns = ["year", ...spec.keys, ...spec.values, "first_at", "last_at"];
  const values = [beijingYear(at), ...spec.keys.map(key => keys[key]), ...spec.values.map(key => increments[key] ?? 0), at, at];
  database.prepare(`INSERT INTO ${spec.table} (${columns.join(",")})
    VALUES (${columns.map(() => "?").join(",")})
    ON CONFLICT(year,${spec.keys.join(",")}) DO UPDATE SET
      ${spec.values.map(key => `${key}=${key}+excluded.${key}`).join(",")},
      first_at=min(first_at,excluded.first_at), last_at=max(last_at,excluded.last_at)`)
    .run(...values);
}

export function readAnnualCounters(database, kind, actorId, year) {
  const spec = COUNTERS[kind];
  if (!spec || !Number.isSafeInteger(year)) throw new TypeError("Invalid statistic query");
  return database.prepare(`SELECT * FROM ${spec.table} WHERE year=? AND ${spec.keys[0]}=? ORDER BY ${spec.keys.slice(1).join(",")}`).all(year,actorId);
}

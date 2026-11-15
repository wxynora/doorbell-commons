import { createHash } from "node:crypto";

export const PUBLIC_OPTION_HANDLE_RE = /^opt_[A-Za-z0-9_-]{12}$/u;

// Shared with existing Lingye operations: durable identity and operation scoped
// handles, with validity of the underlying fact checked by each domain.
export function optionHandle(database, residentId, operation, internalOption, now) {
    const existing = database.prepare(`
      SELECT handle FROM lingye_option_handles
      WHERE resident_id = ? AND operation = ? AND internal_option = ?
    `).get(residentId, operation, internalOption);
    if (existing)
        return existing.handle;
    const digest = createHash("sha256")
        .update(JSON.stringify([residentId, operation, internalOption]), "utf8")
        .digest("base64url")
        .slice(0, 12);
    const handle = `opt_${digest}`;
    const collision = database.prepare(`
      SELECT resident_id, operation, internal_option FROM lingye_option_handles WHERE handle = ?
    `).get(handle);
    if (collision && (collision.resident_id !== residentId || collision.operation !== operation ||
        collision.internal_option !== internalOption)) {
        throw new Error("Lingye option handle collision");
    }
    database.prepare(`
      INSERT OR IGNORE INTO lingye_option_handles (
        handle, resident_id, operation, internal_option, issued_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(handle, residentId, operation, internalOption, now);
    return handle;
}

export function lookupOptionHandle(database, residentId, operation, handle) {
    if (typeof handle !== "string" || !PUBLIC_OPTION_HANDLE_RE.test(handle)) return null;
    const row = database.prepare(`
      SELECT internal_option FROM lingye_option_handles
      WHERE handle = ? AND resident_id = ? AND operation = ?
    `).get(handle, residentId, operation);
    return row?.internal_option ?? null;
}

// A single view may expose many choices. Keep the original handle identity and
// collision rules, but resolve the requested set once and insert only missing
// handles in one statement; an unchanged view performs no handle writes.
export function optionHandles(database, residentId, operation, internalOptions, now) {
    if (internalOptions.length === 0) return [];
    const seen = new Map();
    const requested = internalOptions.map(internalOption => {
        const digest = createHash("sha256").update(JSON.stringify([residentId, operation, internalOption]), "utf8")
            .digest("base64url").slice(0, 12);
        const handle = `opt_${digest}`;
        if (seen.has(handle) && seen.get(handle) !== internalOption)
            throw new Error("Lingye option handle collision");
        seen.set(handle, internalOption);
        return [handle, internalOption];
    });
    const rows = database.prepare(`
      WITH requested AS (
        SELECT CAST(key AS INTEGER) AS idx, json_extract(value, '$[0]') AS candidate,
               json_extract(value, '$[1]') AS internal_option FROM json_each(?)
      )
      SELECT requested.idx, requested.candidate, requested.internal_option,
             existing.handle AS existing_handle, collision.resident_id AS collision_resident,
             collision.operation AS collision_operation, collision.internal_option AS collision_option
      FROM requested
      LEFT JOIN lingye_option_handles AS existing ON existing.resident_id = ?
        AND existing.operation = ? AND existing.internal_option = requested.internal_option
      LEFT JOIN lingye_option_handles AS collision ON collision.handle = requested.candidate
      ORDER BY requested.idx
    `).all(JSON.stringify(requested), residentId, operation);
    const missing = [];
    const result = rows.map(row => {
        if (row.existing_handle) return row.existing_handle;
        if (row.collision_resident && (row.collision_resident !== residentId ||
            row.collision_operation !== operation || row.collision_option !== row.internal_option))
            throw new Error("Lingye option handle collision");
        missing.push([row.candidate, row.internal_option]);
        return row.candidate;
    });
    if (missing.length) database.prepare(`
      INSERT OR IGNORE INTO lingye_option_handles (handle, resident_id, operation, internal_option, issued_at)
      SELECT json_extract(value, '$[0]'), ?, ?, json_extract(value, '$[1]'), ? FROM json_each(?)
    `).run(residentId, operation, now, JSON.stringify(missing));
    return result;
}

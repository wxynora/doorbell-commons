import type Database from "better-sqlite3";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function queueTogetherControl(
  database: Database.Database,
  commandId: string,
  payload: unknown,
  now: number,
) {
  if (!commandId) throw new Error("command_id_required");
  const json = JSON.stringify(canonical(payload));
  return database
    .transaction(() => {
      const previous = database
        .prepare(
          "SELECT payload_json,status,result_json FROM together_admin_commands WHERE command_id=?",
        )
        .get(commandId) as
        | { payload_json: string; status: string; result_json: string | null }
        | undefined;
      if (previous) {
        if (previous.payload_json !== json) throw new Error("admin_command_conflict");
        return {
          status: previous.status,
          result:
            previous.result_json === null ? null : (JSON.parse(previous.result_json) as unknown),
        };
      }
      database
        .prepare(
          "INSERT INTO together_admin_commands(command_id,payload_json,status,created_at) VALUES (?,?,'pending',?)",
        )
        .run(commandId, json, now);
      return { status: "pending", result: null };
    })
    .immediate();
}
export function togetherControls(database: Database.Database) {
  return {
    pending() {
      return (
        database
          .prepare(
            "SELECT command_id,payload_json FROM together_admin_commands WHERE status='pending' ORDER BY rowid",
          )
          .all() as { command_id: string; payload_json: string }[]
      ).map((row) => ({
        commandId: row.command_id,
        payload: JSON.parse(row.payload_json) as unknown,
      }));
    },
    complete(commandId: string, status: "complete" | "rejected", result: unknown) {
      database
        .prepare(
          "UPDATE together_admin_commands SET status=?,result_json=? WHERE command_id=? AND status='pending'",
        )
        .run(status, JSON.stringify(result), commandId);
    },
  };
}

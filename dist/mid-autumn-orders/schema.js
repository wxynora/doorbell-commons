// Uses the existing Farm SQLite connection; no separate file or world snapshot.
export function installMidAutumnSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mid_autumn_households (
      event_id TEXT NOT NULL, farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      state_json TEXT NOT NULL CHECK(json_valid(state_json)),
      PRIMARY KEY(event_id, farm_id)
    );
    CREATE TABLE IF NOT EXISTS mid_autumn_cakes (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      side TEXT NOT NULL CHECK(side IN ('ai','human')),
      config_json TEXT NOT NULL CHECK(json_valid(config_json)),
      status TEXT NOT NULL CHECK(status IN ('available','boxed','delivered')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mid_autumn_cakes_owner ON mid_autumn_cakes(event_id,farm_id,side);
    CREATE TABLE IF NOT EXISTS mid_autumn_boxes (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      side TEXT NOT NULL CHECK(side IN ('ai','human')),
      cakes_json TEXT NOT NULL CHECK(json_valid(cakes_json)),
      letter TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('packed','sent','delivered')),
      created_at INTEGER NOT NULL, sent_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS mid_autumn_boxes_owner ON mid_autumn_boxes(event_id,farm_id,side);
    CREATE TABLE IF NOT EXISTS mid_autumn_receipts (
      event_id TEXT NOT NULL, farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE, side TEXT NOT NULL,
      request_id TEXT NOT NULL, command_json TEXT NOT NULL,
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      PRIMARY KEY(event_id,farm_id,side,request_id)
    );
  `);
}

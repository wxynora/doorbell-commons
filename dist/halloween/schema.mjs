// Installed once on the existing Farm SQLite connection, alongside its other
// domain schemas. Reading an event never installs or initializes player state.
export function installHalloweenSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS halloween_households (
      event_id TEXT NOT NULL,
      farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      state_json TEXT NOT NULL CHECK(json_valid(state_json)),
      PRIMARY KEY(event_id, farm_id)
    );
    CREATE TABLE IF NOT EXISTS halloween_candies (
      candy_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      owner_farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      source_json TEXT NOT NULL CHECK(json_valid(source_json)),
      appearance_json TEXT NOT NULL CHECK(json_valid(appearance_json)),
      hidden_effect_json TEXT NOT NULL CHECK(json_valid(hidden_effect_json)),
      rarity TEXT NOT NULL,
      image TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('available', 'eaten')),
      first_gift_by TEXT,
      sender_name TEXT,
      created_at INTEGER NOT NULL,
      eaten_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS halloween_candies_owner
      ON halloween_candies(event_id, owner_farm_id, status);
    CREATE TABLE IF NOT EXISTS halloween_effect_receipts (
      event_id TEXT NOT NULL,
      farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      effect_json TEXT NOT NULL CHECK(json_valid(effect_json)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(event_id, farm_id, target_kind, target_id)
    );
    CREATE TABLE IF NOT EXISTS halloween_receipts (
      event_id TEXT NOT NULL,
      farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      command_json TEXT NOT NULL,
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      PRIMARY KEY(event_id, farm_id, request_id)
    );
    CREATE TABLE IF NOT EXISTS halloween_reward_outbox (
      reward_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      reward_json TEXT NOT NULL CHECK(json_valid(reward_json)),
      status TEXT NOT NULL CHECK(status IN ('pending', 'paid')),
      paid_at INTEGER
    );
  `);
}

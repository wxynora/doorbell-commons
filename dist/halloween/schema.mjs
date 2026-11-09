// Installed once on the existing Farm SQLite connection, alongside its other
// domain schemas. Reading an event never installs or initializes player state.
export function installHalloweenSchema(database) {
  database.exec('SAVEPOINT halloween_effects_migration');
  try {
    database.exec(`
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
    CREATE TABLE IF NOT EXISTS halloween_eaten_effects (
      effect_id INTEGER PRIMARY KEY,
      event_id TEXT NOT NULL,
      farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
      candy_id TEXT,
      actor_side TEXT,
      effect_kind TEXT,
      eaten_at NUMERIC,
      expires_at NUMERIC,
      entry_json TEXT NOT NULL CHECK(json_valid(entry_json))
    );
    CREATE INDEX IF NOT EXISTS halloween_eaten_effects_target
      ON halloween_eaten_effects(event_id, farm_id, actor_side, effect_kind, effect_id);
    CREATE TABLE IF NOT EXISTS halloween_effect_schema_migrations (
      migration_id TEXT PRIMARY KEY
    );
    `);
    const migrationId = 'eaten-effects-v1';
    const legacy = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='halloween_households'").get();
    if (!database.prepare('SELECT 1 FROM halloween_effect_schema_migrations WHERE migration_id=?').get(migrationId)) {
      if (legacy) {
      const invalid = database.prepare(`SELECT 1 FROM halloween_households
        WHERE json_type(state_json,'$.eatenEffects') IS NOT NULL
          AND json_type(state_json,'$.eatenEffects') <> 'array' LIMIT 1`).get();
      const invalidEntry = database.prepare(`SELECT 1 FROM halloween_households AS household,
        json_each(household.state_json,'$.eatenEffects') AS effect
        WHERE effect.type <> 'object' LIMIT 1`).get();
      if (invalid || invalidEntry) throw new Error('halloween_effect_migration_invalid_queue');
      // Only the retained eatenEffects queue is migrated. Its row records
      // replace the obsolete household snapshot in the same transaction.
      database.exec(`INSERT INTO halloween_eaten_effects
        (event_id,farm_id,candy_id,actor_side,effect_kind,eaten_at,expires_at,entry_json)
        WITH entries AS MATERIALIZED (
          SELECT household.event_id,household.farm_id,effect.key AS queue_position,
            effect.value AS entry_json,
            json_extract(effect.value,'$.candyId') AS candy_id,
            json_extract(effect.value,'$.actorSide') AS original_side
          FROM halloween_households AS household,
            json_each(household.state_json,'$.eatenEffects') AS effect
        ), resolved AS MATERIALIZED (
          SELECT entries.*,
            CASE WHEN original_side IN ('ai','human') THEN original_side
              ELSE COALESCE((
                SELECT CASE
                  WHEN COALESCE(json_extract(receipt.command_json,'$.args.target'),'self')='other'
                    THEN CASE json_extract(receipt.command_json,'$.side') WHEN 'ai' THEN 'human' ELSE 'ai' END
                  ELSE json_extract(receipt.command_json,'$.side') END
                FROM halloween_receipts AS receipt
                WHERE receipt.event_id=entries.event_id AND receipt.farm_id=entries.farm_id
                  AND CASE WHEN json_valid(receipt.command_json)
                    THEN json_extract(receipt.command_json,'$.op') END='eat'
                  AND json_extract(receipt.command_json,'$.args.candyId')=entries.candy_id
                  AND json_extract(receipt.command_json,'$.side') IN ('ai','human')
                  AND COALESCE(json_extract(receipt.command_json,'$.args.target'),'self') IN ('self','other')
                ORDER BY receipt.request_id DESC LIMIT 1
              ),original_side) END AS resolved_side
          FROM entries
        )
        SELECT event_id,farm_id,candy_id,resolved_side,
          json_extract(entry_json,'$.effect.kind'),
          json_extract(entry_json,'$.eatenAt'),json_extract(entry_json,'$.expiresAt'),
          CASE WHEN original_side IN ('ai','human') OR resolved_side NOT IN ('ai','human') OR resolved_side IS NULL
            THEN entry_json ELSE json_set(entry_json,'$.actorSide',resolved_side) END
        FROM resolved ORDER BY event_id,farm_id,CAST(queue_position AS INTEGER)`);
      }
      database.prepare('INSERT INTO halloween_effect_schema_migrations VALUES (?)').run(migrationId);
    }
    if (legacy) database.exec('DROP TABLE halloween_households');
    database.exec('RELEASE halloween_effects_migration');
  } catch (error) {
    database.exec('ROLLBACK TO halloween_effects_migration; RELEASE halloween_effects_migration');
    throw error;
  }
}

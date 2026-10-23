// Player patrol persistence shares the existing authoritative SQLite connection.
export function installPlayerPatrolSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS security_player_patrol_days (
        beijing_date TEXT PRIMARY KEY,
        resident_id TEXT REFERENCES residents(resident_id) ON DELETE RESTRICT,
        employment_id TEXT,
        windows_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(windows_json)),
        revision INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_player_patrol_selections (
        beijing_date TEXT NOT NULL REFERENCES security_player_patrol_days(beijing_date),
        resident_id TEXT NOT NULL REFERENCES residents(resident_id),
        requested_revision INTEGER NOT NULL,
        text TEXT NOT NULL,
        result_json TEXT NOT NULL CHECK(json_valid(result_json)),
        PRIMARY KEY(beijing_date,resident_id,requested_revision)
      );
      CREATE TABLE IF NOT EXISTS security_patrol_cases (
        source_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE,
        target_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        fact_json TEXT NOT NULL CHECK(json_valid(fact_json)),
        authority_json TEXT NOT NULL CHECK(json_valid(authority_json)),
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_patrol_resolutions (
        job_id TEXT PRIMARY KEY REFERENCES career_jobs(job_id),
        resident_id TEXT NOT NULL REFERENCES residents(resident_id),
        disposition TEXT NOT NULL CHECK(disposition IN ('fine','detention')),
        result_json TEXT NOT NULL CHECK(json_valid(result_json)),
        resolved_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_patrol_outbox (
        notice_id TEXT PRIMARY KEY,
        recipient_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        kind TEXT NOT NULL CHECK(kind IN ('patrol_day', 'patrol_theft', 'patrol_result')),
        fact_json TEXT NOT NULL CHECK(json_valid(fact_json)),
        created_at INTEGER NOT NULL,
        acknowledged_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS security_fines (
        violation_id TEXT PRIMARY KEY REFERENCES security_violations(violation_id) ON DELETE RESTRICT,
        amount_gold INTEGER NOT NULL CHECK (amount_gold > 0),
        duration_hours INTEGER NOT NULL CHECK (duration_hours IN (4, 12, 48, 72)),
        payment_receipt_id TEXT NOT NULL UNIQUE,
        paid_at INTEGER NOT NULL
      );
    `);
    const sql=database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='security_patrol_outbox'").get().sql;
    if (!sql.includes("'patrol_result'")) {
        database.exec("SAVEPOINT patrol_result_schema");
        try {
            database.exec(`CREATE TABLE security_patrol_outbox_result (
                notice_id TEXT PRIMARY KEY,
                recipient_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
                kind TEXT NOT NULL CHECK(kind IN ('patrol_day','patrol_theft','patrol_result')),
                fact_json TEXT NOT NULL CHECK(json_valid(fact_json)),
                created_at INTEGER NOT NULL, acknowledged_at INTEGER);
                INSERT INTO security_patrol_outbox_result SELECT * FROM security_patrol_outbox;
                DROP TABLE security_patrol_outbox;
                ALTER TABLE security_patrol_outbox_result RENAME TO security_patrol_outbox;
                RELEASE SAVEPOINT patrol_result_schema;`);
        } catch(error) {
            database.exec("ROLLBACK TO SAVEPOINT patrol_result_schema; RELEASE SAVEPOINT patrol_result_schema");
            throw error;
        }
    }
}

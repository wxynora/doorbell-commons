export const SECURITY_SCHEMA_VERSION = 1;

let transactionSequence = 0;

function runImmediate(database, operation) {
    const nested = database.isTransaction;
    const savepoint = `security_schema_${++transactionSequence}`;
    database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
        const result = operation();
        database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
        return result;
    }
    catch (error) {
        if (nested) {
            database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }
        else if (database.isTransaction) {
            database.exec("ROLLBACK");
        }
        throw error;
    }
}
export const SECURITY_SCHEMA_SQL = `
  CREATE TABLE security_schema_meta (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1)
  );
  INSERT INTO security_schema_meta (singleton_id, schema_version) VALUES (1, 1);

  CREATE TABLE security_patrol_days (
    beijing_date TEXT PRIMARY KEY,
    first_started_at INTEGER NOT NULL,
    first_ended_at INTEGER NOT NULL,
    second_started_at INTEGER NOT NULL,
    second_ended_at INTEGER NOT NULL,
    third_started_at INTEGER NOT NULL,
    third_ended_at INTEGER NOT NULL,
    generated_at INTEGER NOT NULL,
    CHECK (first_ended_at - first_started_at = 1800000),
    CHECK (second_ended_at - second_started_at = 1800000),
    CHECK (third_ended_at - third_started_at = 1800000),
    CHECK (first_started_at < second_started_at AND second_started_at < third_started_at)
  );

  CREATE TABLE security_violations (
    violation_id TEXT PRIMARY KEY,
    violation_code TEXT NOT NULL CHECK (
      violation_code IN ('farm_crop_theft', 'bank_system_loan_refusal')
    ),
    source_id TEXT NOT NULL,
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    occurred_at INTEGER NOT NULL,
    caught_at INTEGER NOT NULL,
    caught_by TEXT NOT NULL CHECK (caught_by IN ('npc_patrol', 'human_constable')),
    repetition_index INTEGER CHECK (repetition_index IS NULL OR repetition_index > 0),
    created_at INTEGER NOT NULL,
    UNIQUE (violation_code, source_id),
    CHECK (
      (violation_code = 'farm_crop_theft' AND repetition_index IS NOT NULL)
      OR (violation_code = 'bank_system_loan_refusal' AND repetition_index IS NULL)
    )
  );
  CREATE INDEX security_violations_resident_caught
    ON security_violations (resident_id, violation_code, caught_at, violation_id);

  CREATE TABLE security_detentions (
    detention_id TEXT PRIMARY KEY,
    violation_id TEXT NOT NULL UNIQUE REFERENCES security_violations(violation_id) ON DELETE RESTRICT,
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    started_at INTEGER NOT NULL,
    scheduled_release_at INTEGER NOT NULL,
    hourly_release_rate_gold INTEGER NOT NULL CHECK (hourly_release_rate_gold > 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'released')),
    released_at INTEGER,
    release_kind TEXT CHECK (release_kind IN ('natural', 'paid')),
    release_payment_receipt_id TEXT,
    early_release_amount_gold INTEGER CHECK (
      early_release_amount_gold IS NULL OR early_release_amount_gold > 0
    ),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (scheduled_release_at > started_at),
    CHECK (
      (status = 'active' AND released_at IS NULL AND release_kind IS NULL
        AND release_payment_receipt_id IS NULL AND early_release_amount_gold IS NULL)
      OR
      (status = 'released' AND released_at IS NOT NULL AND release_kind = 'natural'
        AND release_payment_receipt_id IS NULL AND early_release_amount_gold IS NULL)
      OR
      (status = 'released' AND released_at IS NOT NULL AND release_kind = 'paid'
        AND release_payment_receipt_id IS NOT NULL AND early_release_amount_gold IS NOT NULL)
    )
  );
  CREATE INDEX security_detentions_resident_started
    ON security_detentions (resident_id, started_at, detention_id);

  CREATE TABLE security_action_receipts (
    idempotency_key TEXT PRIMARY KEY,
    command_type TEXT NOT NULL CHECK (command_type = 'detention.early_release'),
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

export function installSecuritySchema(database) {
    const existing = database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'security_schema_meta'")
        .get();
    if (existing === undefined) {
        runImmediate(database, () => database.exec(SECURITY_SCHEMA_SQL));
        return;
    }
    const metadata = database
        .prepare("SELECT schema_version FROM security_schema_meta WHERE singleton_id = 1")
        .get();
    if (metadata?.schema_version !== SECURITY_SCHEMA_VERSION) {
        throw new Error(`Unsupported security schema version: ${metadata?.schema_version ?? "missing"}`);
    }
}

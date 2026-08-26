export const ECONOMY_SCHEMA_VERSION = 3;
function runImmediate(database, operation) {
    if (database.isTransaction) {
        return operation();
    }
    database.exec("BEGIN IMMEDIATE");
    try {
        const result = operation();
        database.exec("COMMIT");
        return result;
    }
    catch (error) {
        try {
            database.exec("ROLLBACK");
        }
        catch {
            // The original error remains authoritative.
        }
        throw error;
    }
}
const ECONOMY_SCHEMA_V2_ADDITIONS_SQL = `
  CREATE TABLE economy_system_gold_reservations (
    reservation_id TEXT PRIMARY KEY,
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    amount INTEGER NOT NULL CHECK (amount > 0),
    business_reference TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('reserved', 'settled', 'released')),
    reserve_journal_id TEXT NOT NULL UNIQUE REFERENCES economy_journals(journal_id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    settle_journal_id TEXT UNIQUE REFERENCES economy_journals(journal_id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    release_journal_id TEXT UNIQUE REFERENCES economy_journals(journal_id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    closed_at INTEGER,
    UNIQUE (resident_id, business_reference),
    CHECK (
      (state = 'reserved' AND settle_journal_id IS NULL AND release_journal_id IS NULL AND closed_at IS NULL)
      OR (state = 'settled' AND settle_journal_id IS NOT NULL AND release_journal_id IS NULL AND closed_at IS NOT NULL)
      OR (state = 'released' AND settle_journal_id IS NULL AND release_journal_id IS NOT NULL AND closed_at IS NOT NULL)
    )
  );

  CREATE INDEX economy_system_gold_reservations_resident_state
    ON economy_system_gold_reservations (resident_id, state, created_at);

  CREATE TABLE economy_financial_receipts (
    receipt_id TEXT PRIMARY KEY REFERENCES economy_journals(journal_id) ON DELETE RESTRICT,
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN (
      'system_gold_charge',
      'system_gold_credit',
      'system_gold_reserve',
      'system_gold_settle',
      'system_gold_release',
      'player_silver_settle'
    )),
    currency TEXT NOT NULL CHECK (currency IN ('gold', 'silver')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    business_reference TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    CHECK (
      (kind = 'player_silver_settle' AND currency = 'silver')
      OR (kind != 'player_silver_settle' AND currency = 'gold')
    )
  );

  CREATE INDEX economy_financial_receipts_business_reference
    ON economy_financial_receipts (business_reference, kind);

  CREATE TRIGGER economy_financial_receipts_no_update
    BEFORE UPDATE ON economy_financial_receipts BEGIN SELECT RAISE(ABORT, 'immutable economy financial receipt'); END;
  CREATE TRIGGER economy_financial_receipts_no_delete
    BEFORE DELETE ON economy_financial_receipts BEGIN SELECT RAISE(ABORT, 'immutable economy financial receipt'); END;
`;
const ECONOMY_SCHEMA_V3_MIGRATION_SQL = `
  ALTER TABLE economy_trades ADD COLUMN frozen_at INTEGER;
  UPDATE economy_trades SET frozen_at = updated_at WHERE state = 'frozen';
`;
const ECONOMY_SCHEMA_V3_META_SQL = `
  DROP TABLE economy_schema_meta;
  CREATE TABLE economy_schema_meta (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    schema_version INTEGER NOT NULL CHECK (schema_version = 3)
  );
  INSERT INTO economy_schema_meta (singleton_id, schema_version) VALUES (1, 3);
`;
export const ECONOMY_SCHEMA_SQL = `
  CREATE TABLE economy_schema_meta (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    schema_version INTEGER NOT NULL CHECK (schema_version = 3)
  );

  INSERT INTO economy_schema_meta (singleton_id, schema_version) VALUES (1, 3);

  CREATE TABLE economy_accounts (
    resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE RESTRICT,
    available_gold INTEGER NOT NULL CHECK (available_gold >= 0),
    available_silver INTEGER NOT NULL CHECK (available_silver >= 0),
    silver_agent_lock INTEGER NOT NULL DEFAULT 0 CHECK (
      silver_agent_lock >= 0 AND silver_agent_lock <= available_silver
    ),
    demand_gold INTEGER NOT NULL DEFAULT 0 CHECK (demand_gold >= 0),
    credit_points INTEGER NOT NULL DEFAULT 0 CHECK (credit_points >= 0),
    high_spend_restricted INTEGER NOT NULL DEFAULT 0 CHECK (high_spend_restricted IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE economy_journals (
    journal_id TEXT PRIMARY KEY,
    command_type TEXT NOT NULL,
    business_ref TEXT NOT NULL,
    payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE economy_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
    journal_id TEXT NOT NULL UNIQUE REFERENCES economy_journals(journal_id) ON DELETE RESTRICT,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE economy_ledger_entries (
    journal_id TEXT NOT NULL REFERENCES economy_journals(journal_id) ON DELETE RESTRICT,
    entry_index INTEGER NOT NULL CHECK (entry_index >= 0),
    resident_id TEXT REFERENCES residents(resident_id) ON DELETE RESTRICT,
    system_account TEXT,
    currency TEXT NOT NULL CHECK (currency IN ('gold', 'silver')),
    partition_name TEXT NOT NULL CHECK (
      partition_name IN ('available', 'frozen', 'demand_deposit', 'term_deposit', 'treasury')
    ),
    delta INTEGER NOT NULL CHECK (delta != 0),
    balance_after INTEGER CHECK (balance_after IS NULL OR balance_after >= 0),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (journal_id, entry_index),
    CHECK (
      (resident_id IS NOT NULL AND system_account IS NULL AND balance_after IS NOT NULL)
      OR (resident_id IS NULL AND system_account IS NOT NULL AND balance_after IS NULL)
    )
  );

  CREATE INDEX economy_ledger_resident_created
    ON economy_ledger_entries (resident_id, created_at, journal_id, entry_index);

  CREATE TABLE economy_contract_events (
    event_id TEXT PRIMARY KEY,
    journal_id TEXT NOT NULL REFERENCES economy_journals(journal_id) ON DELETE RESTRICT,
    contract_type TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX economy_contract_events_contract
    ON economy_contract_events (contract_type, contract_id, created_at, event_id);

  CREATE TABLE economy_silver_lock_events (
    event_id TEXT PRIMARY KEY,
    journal_id TEXT NOT NULL REFERENCES economy_journals(journal_id) ON DELETE RESTRICT,
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    previous_amount INTEGER NOT NULL CHECK (previous_amount >= 0),
    next_amount INTEGER NOT NULL CHECK (next_amount >= 0),
    actor TEXT NOT NULL CHECK (actor IN ('human', 'agent', 'system_clamp')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE economy_trades (
    trade_id TEXT PRIMARY KEY,
    payer_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    payee_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK (currency IN ('gold', 'silver')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    business_type TEXT NOT NULL,
    business_ref TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'frozen', 'settled', 'cancelled')),
    payer_confirmed_at INTEGER,
    payee_confirmed_at INTEGER,
    frozen_at INTEGER,
    frozen_amount INTEGER NOT NULL DEFAULT 0 CHECK (frozen_amount >= 0),
    settled_amount INTEGER NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
    refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (payer_resident_id != payee_resident_id),
    CHECK (frozen_amount <= amount AND settled_amount <= amount AND refunded_amount <= settled_amount)
  );

  CREATE TABLE economy_demand_deposit_days (
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    beijing_date TEXT NOT NULL,
    minimum_balance INTEGER NOT NULL CHECK (minimum_balance >= 0),
    interest_paid INTEGER CHECK (interest_paid IS NULL OR interest_paid >= 0),
    interest_journal_id TEXT UNIQUE REFERENCES economy_journals(journal_id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY (resident_id, beijing_date)
  );

  CREATE TABLE economy_term_deposits (
    deposit_id TEXT PRIMARY KEY,
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    principal INTEGER NOT NULL CHECK (principal >= 1000000),
    term_days INTEGER NOT NULL CHECK (term_days IN (14, 30, 60)),
    total_rate_ppm INTEGER NOT NULL CHECK (total_rate_ppm > 0),
    opened_day INTEGER NOT NULL,
    maturity_day INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'matured', 'terminated')),
    interest_paid INTEGER NOT NULL DEFAULT 0 CHECK (interest_paid >= 0),
    created_at INTEGER NOT NULL,
    ended_at INTEGER,
    CHECK (maturity_day = opened_day + term_days)
  );

  CREATE INDEX economy_term_deposits_resident_state
    ON economy_term_deposits (resident_id, state, maturity_day);

  CREATE TABLE economy_exchange_resident_months (
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    beijing_month TEXT NOT NULL,
    silver_issued INTEGER NOT NULL CHECK (silver_issued >= 0 AND silver_issued <= 1000),
    PRIMARY KEY (resident_id, beijing_month)
  );

  CREATE TABLE economy_exchange_global_months (
    beijing_month TEXT PRIMARY KEY,
    silver_issued INTEGER NOT NULL CHECK (silver_issued >= 0 AND silver_issued <= 10000)
  );

  CREATE TABLE economy_system_loans (
    loan_id TEXT PRIMARY KEY,
    borrower_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    principal_original INTEGER NOT NULL CHECK (principal_original > 0),
    principal_outstanding INTEGER NOT NULL CHECK (principal_outstanding >= 0),
    accrued_interest INTEGER NOT NULL DEFAULT 0 CHECK (accrued_interest >= 0),
    interest_remainder INTEGER NOT NULL DEFAULT 0 CHECK (interest_remainder >= 0),
    daily_rate_ppm INTEGER NOT NULL CHECK (daily_rate_ppm IN (1000, 800, 600)),
    term_days INTEGER NOT NULL CHECK (term_days IN (14, 30, 60)),
    originated_day INTEGER NOT NULL,
    accrued_through_day INTEGER NOT NULL,
    due_day INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'overdue', 'restricted', 'repaid')),
    entered_restriction INTEGER NOT NULL DEFAULT 0 CHECK (entered_restriction IN (0, 1)),
    created_at INTEGER NOT NULL,
    repaid_at INTEGER,
    CHECK (principal_outstanding <= principal_original),
    CHECK (due_day = originated_day + term_days - 1)
  );

  CREATE UNIQUE INDEX economy_one_open_system_loan
    ON economy_system_loans (borrower_resident_id)
    WHERE status != 'repaid';

  CREATE TABLE economy_player_loans (
    loan_id TEXT PRIMARY KEY,
    lender_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    borrower_resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    principal_original INTEGER NOT NULL CHECK (principal_original > 0),
    principal_outstanding INTEGER NOT NULL CHECK (principal_outstanding >= 0),
    accrued_interest INTEGER NOT NULL DEFAULT 0 CHECK (accrued_interest >= 0),
    interest_remainder INTEGER NOT NULL DEFAULT 0 CHECK (interest_remainder >= 0),
    total_rate_ppm INTEGER NOT NULL CHECK (total_rate_ppm >= 0 AND total_rate_ppm <= 200000),
    term_days INTEGER NOT NULL CHECK (term_days BETWEEN 1 AND 60),
    originated_day INTEGER,
    accrued_through_day INTEGER,
    due_day INTEGER,
    lender_confirmed_at INTEGER,
    borrower_confirmed_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'active', 'overdue', 'restricted', 'repaid', 'cancelled')),
    entered_restriction INTEGER NOT NULL DEFAULT 0 CHECK (entered_restriction IN (0, 1)),
    created_at INTEGER NOT NULL,
    repaid_at INTEGER,
    CHECK (lender_resident_id != borrower_resident_id),
    CHECK (principal_outstanding <= principal_original)
  );

  CREATE TABLE economy_restricted_daily_spend (
    resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
    beijing_date TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('gold', 'silver')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    PRIMARY KEY (resident_id, beijing_date, currency)
  );

  ${ECONOMY_SCHEMA_V2_ADDITIONS_SQL}

  CREATE TRIGGER economy_journals_no_update
    BEFORE UPDATE ON economy_journals BEGIN SELECT RAISE(ABORT, 'immutable economy journal'); END;
  CREATE TRIGGER economy_journals_no_delete
    BEFORE DELETE ON economy_journals BEGIN SELECT RAISE(ABORT, 'immutable economy journal'); END;
  CREATE TRIGGER economy_entries_no_update
    BEFORE UPDATE ON economy_ledger_entries BEGIN SELECT RAISE(ABORT, 'immutable economy entry'); END;
  CREATE TRIGGER economy_entries_no_delete
    BEFORE DELETE ON economy_ledger_entries BEGIN SELECT RAISE(ABORT, 'immutable economy entry'); END;
  CREATE TRIGGER economy_contract_events_no_update
    BEFORE UPDATE ON economy_contract_events BEGIN SELECT RAISE(ABORT, 'immutable economy contract event'); END;
  CREATE TRIGGER economy_contract_events_no_delete
    BEFORE DELETE ON economy_contract_events BEGIN SELECT RAISE(ABORT, 'immutable economy contract event'); END;
  CREATE TRIGGER economy_lock_events_no_update
    BEFORE UPDATE ON economy_silver_lock_events BEGIN SELECT RAISE(ABORT, 'immutable economy lock event'); END;
  CREATE TRIGGER economy_lock_events_no_delete
    BEFORE DELETE ON economy_silver_lock_events BEGIN SELECT RAISE(ABORT, 'immutable economy lock event'); END;
`;
export function installEconomySchema(database) {
    const hasMetaTable = database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'economy_schema_meta'")
        .get();
    if (hasMetaTable === undefined) {
        runImmediate(database, () => database.exec(ECONOMY_SCHEMA_SQL));
        return;
    }
    const existing = database
        .prepare("SELECT schema_version FROM economy_schema_meta WHERE singleton_id = 1")
        .get();
    if (existing !== undefined) {
        if (existing.schema_version === ECONOMY_SCHEMA_VERSION)
            return;
        if (existing.schema_version === 1) {
            runImmediate(database, () => database.exec(`
          ${ECONOMY_SCHEMA_V2_ADDITIONS_SQL}
          ${ECONOMY_SCHEMA_V3_MIGRATION_SQL}
          ${ECONOMY_SCHEMA_V3_META_SQL}
        `));
            return;
        }
        if (existing.schema_version === 2) {
            runImmediate(database, () => database.exec(`
          ${ECONOMY_SCHEMA_V3_MIGRATION_SQL}
          ${ECONOMY_SCHEMA_V3_META_SQL}
        `));
            return;
        }
        throw new Error(`Unsupported economy schema version: ${existing.schema_version}`);
    }
    throw new Error("Economy schema metadata is missing");
}

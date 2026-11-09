export const SNOW_RUNTIME_BATCH_SCHEMA = `
  CREATE TABLE snow_tournament_invalid_runtime (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, raw_text TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_command_batches (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, batch_key TEXT NOT NULL, position INTEGER NOT NULL,
    wait_ticks INTEGER, field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,batch_key),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_batch_actions (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, batch_key TEXT NOT NULL, position INTEGER NOT NULL,
    action_type TEXT, unit_type TEXT, lane INTEGER, cell INTEGER, unit_id TEXT, skill TEXT,
    field_presence TEXT NOT NULL, field_order TEXT NOT NULL,
    PRIMARY KEY(edition_id,match_id,batch_key,position),
    FOREIGN KEY(edition_id,match_id,batch_key) REFERENCES snow_tournament_command_batches(edition_id,match_id,batch_key) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_batch_receipts (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, batch_key TEXT NOT NULL, position INTEGER NOT NULL,
    receipt_id TEXT NOT NULL, PRIMARY KEY(edition_id,match_id,batch_key,position),
    FOREIGN KEY(edition_id,match_id,batch_key) REFERENCES snow_tournament_command_batches(edition_id,match_id,batch_key) ON DELETE CASCADE
  );
  CREATE TRIGGER snow_tournament_runtime_delete_values AFTER DELETE ON snow_tournament_match_runtime
  BEGIN
    DELETE FROM snow_tournament_receipt_values WHERE edition_id=OLD.edition_id AND receipt_kind IN (
      'battle-receipt:'||OLD.match_id,'battle-extra:'||OLD.match_id,'runtime-extra:'||OLD.match_id,'batch-receipt:'||OLD.match_id
    );
  END;
`;

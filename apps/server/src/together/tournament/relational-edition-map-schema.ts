export const SNOW_EDITION_MAP_SCHEMA = `
  CREATE TABLE snow_tournament_edition_map_entries (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    section TEXT NOT NULL, entry_key TEXT NOT NULL, position INTEGER NOT NULL, encoding TEXT,
    PRIMARY KEY(edition_id,section,entry_key)
  );
  CREATE TABLE snow_tournament_recovery_runtime_encoding (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE, recovery_key TEXT NOT NULL, position INTEGER NOT NULL,
    raw_text TEXT NOT NULL, PRIMARY KEY(edition_id,recovery_key,position)
  );
  CREATE TABLE snow_tournament_edition_child_masks (
    edition_id TEXT NOT NULL REFERENCES snow_tournament_editions(edition_id) ON DELETE CASCADE,
    child TEXT NOT NULL, field_presence TEXT NOT NULL, PRIMARY KEY(edition_id,child)
  );
`;

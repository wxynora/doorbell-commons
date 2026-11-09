export const SNOW_BATTLE_EXTRA_SCHEMA = `
  CREATE TABLE snow_tournament_battle_participant_sides (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, side TEXT NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY(edition_id,match_id,side),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_assignment_members (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, side TEXT NOT NULL, resident_id TEXT NOT NULL,
    position INTEGER NOT NULL, PRIMARY KEY(edition_id,match_id,side,resident_id),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  CREATE TABLE snow_tournament_battle_assignment_sides (
    edition_id TEXT NOT NULL, match_id TEXT NOT NULL, side TEXT NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY(edition_id,match_id,side),
    FOREIGN KEY(edition_id,match_id) REFERENCES snow_tournament_match_runtime(edition_id,match_id) ON DELETE CASCADE
  );
  ALTER TABLE snow_tournament_visual_frames ADD COLUMN field_presence TEXT NOT NULL DEFAULT '';
`;

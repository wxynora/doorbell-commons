export function installLingyeNpcDialogueSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS lingye_npc_dialogue_sessions (
        session_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        npc_id TEXT NOT NULL REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        catalog_version INTEGER NOT NULL,
        dialogue_id TEXT NOT NULL,
        context_dialogue_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('awaiting_choice', 'completed')),
        choice_id TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        affinity_json TEXT,
        gift_draw_id TEXT
      );
      CREATE INDEX IF NOT EXISTS lingye_npc_dialogue_resident_recent
        ON lingye_npc_dialogue_sessions(resident_id, npc_id, started_at, session_id);
      CREATE TABLE IF NOT EXISTS lingye_npc_gift_draws (
        draw_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        npc_id TEXT NOT NULL REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        beijing_day INTEGER NOT NULL,
        session_id TEXT NOT NULL REFERENCES lingye_npc_dialogue_sessions(session_id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK (status IN ('not_eligible', 'cooldown', 'miss', 'gifted')),
        gift_json TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE (resident_id, npc_id, beijing_day)
      );
      CREATE INDEX IF NOT EXISTS lingye_npc_gifts_resident_recent
        ON lingye_npc_gift_draws(resident_id, npc_id, status, beijing_day);
    `);
}

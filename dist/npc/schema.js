import { LINGYE_NPCS, LINGYE_NPC_REGISTRY_VERSION } from "./registry.js";

export const LINGYE_NPC_SCHEMA_VERSION = 2;

export function installLingyeNpcSchema(database, options = {}) {
    const bootstrapAt = options.bootstrapAt ?? Date.now();
    if (!Number.isSafeInteger(bootstrapAt) || bootstrapAt < 0)
        throw new TypeError("Lingye NPC bootstrap time must be a non-negative integer");
    database.exec(`
      CREATE TABLE IF NOT EXISTS lingye_npcs (
        npc_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        species TEXT NOT NULL,
        role TEXT NOT NULL,
        institution_id TEXT NOT NULL,
        home_location_id TEXT NOT NULL,
        registry_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS lingye_npc_world_states (
        npc_id TEXT PRIMARY KEY REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        location_id TEXT NOT NULL,
        work_status TEXT NOT NULL CHECK (work_status IN ('on_duty', 'off_duty', 'away')),
        revision INTEGER NOT NULL CHECK (revision >= 1),
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lingye_npc_world_events (
        event_id TEXT PRIMARY KEY,
        npc_id TEXT NOT NULL REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('registry', 'schedule', 'story', 'system')),
        source_reference TEXT NOT NULL,
        location_id TEXT NOT NULL,
        work_status TEXT NOT NULL CHECK (work_status IN ('on_duty', 'off_duty', 'away')),
        resulting_revision INTEGER NOT NULL CHECK (resulting_revision >= 1),
        occurred_at INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL,
        UNIQUE (npc_id, source_kind, source_reference)
      );
      CREATE INDEX IF NOT EXISTS lingye_npc_world_events_npc
        ON lingye_npc_world_events(npc_id, resulting_revision, event_id);
      CREATE INDEX IF NOT EXISTS lingye_npc_world_events_at
        ON lingye_npc_world_events(npc_id, occurred_at, resulting_revision);

      CREATE TABLE IF NOT EXISTS lingye_npc_affinity_projections (
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        npc_id TEXT NOT NULL REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        affinity_value INTEGER NOT NULL CHECK (affinity_value BETWEEN 0 AND 100),
        revision INTEGER NOT NULL CHECK (revision >= 1),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (resident_id, npc_id)
      );

      CREATE TABLE IF NOT EXISTS lingye_npc_affinity_events (
        event_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        npc_id TEXT NOT NULL REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('conversation', 'business', 'task', 'story', 'migration')),
        source_reference TEXT NOT NULL,
        requested_delta INTEGER NOT NULL CHECK (requested_delta > 0),
        applied_delta INTEGER NOT NULL CHECK (applied_delta >= 0),
        resulting_value INTEGER NOT NULL CHECK (resulting_value BETWEEN 0 AND 100),
        resulting_revision INTEGER NOT NULL CHECK (resulting_revision >= 1),
        occurred_at INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL,
        UNIQUE (resident_id, npc_id, source_kind, source_reference)
      );
      CREATE INDEX IF NOT EXISTS lingye_npc_affinity_events_resident
        ON lingye_npc_affinity_events(resident_id, npc_id, resulting_revision, event_id);
      CREATE INDEX IF NOT EXISTS lingye_npc_affinity_events_daily
        ON lingye_npc_affinity_events(resident_id, npc_id, source_kind, occurred_at);

      CREATE TABLE IF NOT EXISTS lingye_npc_schedules (
        npc_id TEXT PRIMARY KEY REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        schedule_date TEXT NOT NULL,
        schedule_version INTEGER NOT NULL,
        blocks_json TEXT NOT NULL CHECK (json_valid(blocks_json))
      );
      CREATE TABLE IF NOT EXISTS lingye_npc_schedule_clock (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        advanced_at INTEGER NOT NULL,
        next_transition_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lingye_npc_public_encounters (
        encounter_id TEXT PRIMARY KEY,
        npc_a TEXT NOT NULL REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        npc_b TEXT NOT NULL REFERENCES lingye_npcs(npc_id) ON DELETE RESTRICT,
        location_id TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        CHECK (npc_a < npc_b)
      );
      CREATE INDEX IF NOT EXISTS lingye_npc_public_encounters_a
        ON lingye_npc_public_encounters(npc_a, occurred_at);
      CREATE INDEX IF NOT EXISTS lingye_npc_public_encounters_b
        ON lingye_npc_public_encounters(npc_b, occurred_at);
    `);

    const readNpc = database.prepare("SELECT * FROM lingye_npcs WHERE npc_id = ?");
    const insertNpc = database.prepare(`
      INSERT INTO lingye_npcs (
        npc_id, name, species, role, institution_id, home_location_id,
        registry_version, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const insertState = database.prepare(`
      INSERT OR IGNORE INTO lingye_npc_world_states (
        npc_id, location_id, work_status, revision, updated_at
      ) VALUES (?, ?, ?, 1, ?)
    `);
    const insertBootstrapEvent = database.prepare(`
      INSERT OR IGNORE INTO lingye_npc_world_events (
        event_id, npc_id, source_kind, source_reference, location_id,
        work_status, resulting_revision, occurred_at, recorded_at
      ) VALUES (?, ?, 'registry', ?, ?, ?, 1, ?, ?)
    `);
    for (const npc of LINGYE_NPCS) {
        const existing = readNpc.get(npc.npcId);
        if (existing) {
            if (existing.name !== npc.name ||
                existing.species !== npc.species ||
                existing.role !== npc.role ||
                existing.institution_id !== npc.institutionId ||
                existing.home_location_id !== npc.homeLocationId ||
                existing.registry_version !== LINGYE_NPC_REGISTRY_VERSION ||
                existing.active !== 1) {
                throw new Error(`Lingye NPC registry conflict: ${npc.npcId}`);
            }
        }
        else {
            insertNpc.run(
                npc.npcId,
                npc.name,
                npc.species,
                npc.role,
                npc.institutionId,
                npc.homeLocationId,
                LINGYE_NPC_REGISTRY_VERSION,
            );
        }
        insertState.run(npc.npcId, npc.homeLocationId, npc.initialWorkStatus, bootstrapAt);
        insertBootstrapEvent.run(
            `npc-bootstrap-v1:${npc.npcId}`,
            npc.npcId,
            `registry-v${LINGYE_NPC_REGISTRY_VERSION}`,
            npc.homeLocationId,
            npc.initialWorkStatus,
            bootstrapAt,
            bootstrapAt,
        );
    }
}

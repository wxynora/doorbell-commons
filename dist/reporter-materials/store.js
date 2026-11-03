import { PENDING_REPORTER_MATERIALS } from "./observations.js";
import { installReporterFarmFactsSchema, pruneExpiredReporterFarmFacts } from "./farm-facts-store.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_MS = 48 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const REPORTING_DAY_END_MS = 5 * 60 * 60 * 1000;

// A source event belongs to the first 05:00 reporting boundary strictly after
// its occurrence, including events recorded exactly at 05:00.
export function reporterMaterialExpiresAt(occurredAt) {
    if (!Number.isSafeInteger(occurredAt)) throw new TypeError("Invalid reporter material time");
    const beijingTime = occurredAt + BEIJING_OFFSET_MS;
    const beijingDay = Math.floor(beijingTime / DAY_MS);
    const timeOfDay = beijingTime - beijingDay * DAY_MS;
    const issueWindowEnd = (beijingDay + (timeOfDay < REPORTING_DAY_END_MS ? 0 : 1)) * DAY_MS + REPORTING_DAY_END_MS - BEIJING_OFFSET_MS;
    return issueWindowEnd + TTL_MS;
}

export function installReporterMaterialsSchema(database, now = Date.now()) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS reporter_material_recording_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        recording_started_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reporter_material_events (
        event_id TEXT PRIMARY KEY,
        farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
        resident_id TEXT,
        farm_name TEXT,
        occurred_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('feeding', 'npc'))
      );
      CREATE TABLE IF NOT EXISTS reporter_material_feedings (
        event_id TEXT PRIMARY KEY REFERENCES reporter_material_events(event_id) ON DELETE CASCADE,
        variant_id TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        variant_type TEXT NOT NULL,
        base_kind_id TEXT NOT NULL,
        dish_recipe_id TEXT NOT NULL,
        dish_name TEXT NOT NULL,
        success INTEGER NOT NULL CHECK (success IN (0, 1)),
        pity_before INTEGER NOT NULL,
        guaranteed INTEGER NOT NULL CHECK (guaranteed IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS reporter_material_npc_settlements (
        event_id TEXT PRIMARY KEY REFERENCES reporter_material_events(event_id) ON DELETE CASCADE,
        entry_id TEXT NOT NULL,
        npc_name TEXT NOT NULL,
        event_name TEXT NOT NULL,
        option_id TEXT,
        option_label TEXT,
        outcome_index INTEGER,
        result_text TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reporter_material_effects (
        event_id TEXT NOT NULL REFERENCES reporter_material_events(event_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        kind TEXT NOT NULL,
        effect_id TEXT,
        effect_name TEXT,
        direction TEXT NOT NULL CHECK (direction IN ('gain', 'loss')),
        quantity REAL NOT NULL CHECK (quantity > 0),
        PRIMARY KEY (event_id, position)
      );
      CREATE TABLE IF NOT EXISTS reporter_material_unknown_effects (
        event_id TEXT NOT NULL REFERENCES reporter_material_events(event_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        effect TEXT NOT NULL,
        PRIMARY KEY (event_id, position)
      );
      CREATE INDEX IF NOT EXISTS reporter_material_events_window
        ON reporter_material_events(event_type, occurred_at, event_id);
      CREATE INDEX IF NOT EXISTS reporter_material_events_expiry
        ON reporter_material_events(expires_at, event_id);
    `);
    installReporterFarmFactsSchema(database);
    pruneExpiredReporterMaterialEvents(database, now);
}

export function pruneExpiredReporterMaterialEvents(database, now) {
    const events = Number(database.prepare("DELETE FROM reporter_material_events WHERE expires_at <= ?").run(now).changes ?? 0);
    return events + pruneExpiredReporterFarmFacts(database, now);
}

// Start only when the instrumented world coordinator actually commits.
export function markReporterMaterialsRecording(database, now) {
    database.prepare("INSERT OR IGNORE INTO reporter_material_recording_meta (singleton, recording_started_at) VALUES (1, ?)").run(now);
}

function insertFeeding(database, event) {
    database.prepare(`INSERT INTO reporter_material_feedings
        (event_id, variant_id, variant_name, variant_type, base_kind_id, dish_recipe_id, dish_name, success, pity_before, guaranteed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(event.id, event.variantId, event.variantName, event.variantType, event.baseKindId,
            event.dishRecipeId, event.dishName, Number(event.success), event.pityBefore, Number(event.guaranteed));
}

function insertNpcSettlement(database, event) {
    database.prepare(`INSERT INTO reporter_material_npc_settlements
        (event_id, entry_id, npc_name, event_name, option_id, option_label, outcome_index, result_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(event.id, event.entryId, event.npcName, event.eventName, event.option ?? null,
            event.optionLabel ?? null, event.outcomeIndex ?? null, event.resultText);
    const insertEffect = database.prepare(`INSERT INTO reporter_material_effects
        (event_id, position, kind, effect_id, effect_name, direction, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const [position, effect] of (event.effects ?? []).entries()) {
        insertEffect.run(event.id, position, effect.kind, effect.id ?? null, effect.name ?? null,
            effect.direction, effect.quantity);
    }
    const insertUnknown = database.prepare(`INSERT INTO reporter_material_unknown_effects
        (event_id, position, effect) VALUES (?, ?, ?)`);
    for (const [position, effect] of (event.unknownEffects ?? []).entries())
        insertUnknown.run(event.id, position, effect);
}

// Called only on the staged farm inside the world owner's SQLite transaction.
export function flushReporterMaterialEvents(database, farm, now = Date.now()) {
    const pending = farm[PENDING_REPORTER_MATERIALS];
    if (!pending?.length) return false;
    const insert = database.prepare(`INSERT INTO reporter_material_events
        (event_id, farm_id, resident_id, farm_name, occurred_at, expires_at, event_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING`);
    let inserted = false;
    for (const event of pending) {
        const expiresAt = reporterMaterialExpiresAt(event.at);
        if (expiresAt <= now) continue;
        const result = insert.run(event.id, event.farmId, event.residentId ?? null, event.farmName ?? null,
            event.at, expiresAt, event.type);
        if (!result.changes) continue;
        if (event.type === "feeding") insertFeeding(database, event);
        else if (event.type === "npc") insertNpcSettlement(database, event);
        else throw new TypeError("Invalid reporter material type");
        inserted = true;
    }
    delete farm[PENDING_REPORTER_MATERIALS];
    return inserted;
}

function readEffects(database, eventId) {
    return database.prepare(`SELECT kind, effect_id AS id, effect_name AS name, direction, quantity
        FROM reporter_material_effects WHERE event_id = ? ORDER BY position`).all(eventId);
}

function readUnknownEffects(database, eventId) {
    return database.prepare(`SELECT effect FROM reporter_material_unknown_effects
        WHERE event_id = ? ORDER BY position`).all(eventId).map(({ effect }) => effect);
}

export function readReporterMaterialEvents(database, type, startMs, endMs, now = Date.now()) {
    const rows = database.prepare(`SELECT event_id, farm_id, resident_id, farm_name, occurred_at, event_type
        FROM reporter_material_events
        WHERE event_type = ? AND occurred_at >= ? AND occurred_at < ? AND expires_at > ?
        ORDER BY occurred_at, event_id`).all(type, startMs, endMs, now);
    return rows.map((row) => {
        const event = { id: row.event_id, farmId: row.farm_id, residentId: row.resident_id,
            farmName: row.farm_name, at: row.occurred_at, type: row.event_type };
        if (row.event_type === "feeding") {
            const feeding = database.prepare(`SELECT variant_id, variant_name, variant_type, base_kind_id,
                dish_recipe_id, dish_name, success, pity_before, guaranteed
                FROM reporter_material_feedings WHERE event_id = ?`).get(row.event_id);
            if (!feeding) throw new Error("Reporter feeding detail is missing");
            return { ...event, variantId: feeding.variant_id, variantName: feeding.variant_name,
                variantType: feeding.variant_type, baseKindId: feeding.base_kind_id,
                dishRecipeId: feeding.dish_recipe_id, dishName: feeding.dish_name,
                success: Boolean(feeding.success), pityBefore: feeding.pity_before,
                guaranteed: Boolean(feeding.guaranteed) };
        }
        if (row.event_type === "npc") {
            const settlement = database.prepare(`SELECT entry_id, npc_name, event_name, option_id,
                option_label, outcome_index, result_text
                FROM reporter_material_npc_settlements WHERE event_id = ?`).get(row.event_id);
            if (!settlement) throw new Error("Reporter NPC detail is missing");
            return { ...event, entryId: settlement.entry_id, npcName: settlement.npc_name,
                eventName: settlement.event_name, option: settlement.option_id,
                optionLabel: settlement.option_label, outcomeIndex: settlement.outcome_index,
                resultText: settlement.result_text, effects: readEffects(database, row.event_id),
                unknownEffects: readUnknownEffects(database, row.event_id) };
        }
        throw new Error("Invalid reporter material type");
    });
}

export function reporterMaterialsRecordingStartedAt(database) {
    return database.prepare("SELECT recording_started_at FROM reporter_material_recording_meta WHERE singleton = 1").get()?.recording_started_at ?? null;
}

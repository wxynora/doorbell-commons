import { isLingyeNpcLocation, requireLingyeNpc } from "./registry.js";

const AFFINITY_SOURCE_KINDS = new Set(["conversation", "business", "task", "story", "migration"]);
const WORLD_SOURCE_KINDS = new Set(["registry", "schedule", "story", "system"]);
const WORK_STATUSES = new Set(["on_duty", "off_duty", "away"]);
let npcTransactionSequence = 0;

export class LingyeNpcError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "LingyeNpcError";
    }
}

export function runLingyeNpcTransaction(database, operation) {
    const nested = database.isTransaction;
    const savepoint = `lingye_npc_tx_${++npcTransactionSequence}`;
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

function nonEmpty(value, code) {
    const text = String(value ?? "").trim();
    if (!text)
        throw new LingyeNpcError(code, code);
    return text;
}

function safeTime(value, code) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new LingyeNpcError(code, code);
    return value;
}

function requireResident(database, residentId) {
    const normalized = nonEmpty(residentId, "lingye_npc_resident_required");
    const resident = database.prepare("SELECT resident_id FROM residents WHERE resident_id = ?").get(normalized);
    if (!resident)
        throw new LingyeNpcError("lingye_npc_resident_not_found", "Lingye resident not found");
    return normalized;
}

export function affinityStage(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100)
        throw new TypeError("Lingye NPC affinity must be an integer from 0 to 100");
    if (value >= 80)
        return "trusted";
    if (value >= 60)
        return "close";
    if (value >= 40)
        return "familiar";
    if (value >= 20)
        return "known";
    return "new";
}

function worldResult(row) {
    return {
        npcId: row.npc_id,
        locationId: row.location_id,
        workStatus: row.work_status,
        revision: row.resulting_revision,
        occurredAt: row.occurred_at,
    };
}

function affinityResult(row) {
    return {
        residentId: row.resident_id,
        npcId: row.npc_id,
        requestedDelta: row.requested_delta,
        appliedDelta: row.applied_delta,
        value: row.resulting_value,
        stage: affinityStage(row.resulting_value),
        revision: row.resulting_revision,
        occurredAt: row.occurred_at,
    };
}

export function listResidentLingyeNpcViews(database, residentId, options = {}) {
    const normalizedResidentId = requireResident(database, residentId);
    if (options.locationId !== undefined && !isLingyeNpcLocation(options.locationId))
        throw new LingyeNpcError("lingye_npc_location_invalid", "Unknown NPC public location");
    const rows = database.prepare(`
      SELECT npc.npc_id, npc.name, npc.species, npc.role, npc.institution_id,
             state.location_id, state.work_status, state.revision AS world_revision,
             COALESCE(affinity.affinity_value, 0) AS affinity_value,
             COALESCE(affinity.revision, 0) AS affinity_revision
      FROM lingye_npcs npc
      JOIN lingye_npc_world_states state ON state.npc_id = npc.npc_id
      LEFT JOIN lingye_npc_affinity_projections affinity
        ON affinity.npc_id = npc.npc_id AND affinity.resident_id = ?
      WHERE npc.active = 1 AND (? IS NULL OR state.location_id = ?)
      ORDER BY npc.npc_id
    `).all(normalizedResidentId, options.locationId ?? null, options.locationId ?? null);
    return rows.map((row) => ({
        npcId: row.npc_id,
        name: row.name,
        species: row.species,
        role: row.role,
        institutionId: row.institution_id,
        locationId: row.location_id,
        workStatus: row.work_status,
        worldRevision: row.world_revision,
        affinityStage: affinityStage(row.affinity_value),
        affinityRevision: row.affinity_revision,
    }));
}

export function getLingyeNpcWorldState(database, npcId) {
    const npc = requireLingyeNpc(npcId);
    const row = database.prepare(`
      SELECT state.* FROM lingye_npc_world_states state
      JOIN lingye_npcs npc ON npc.npc_id = state.npc_id
      WHERE state.npc_id = ? AND npc.active = 1
    `).get(npc.npcId);
    if (!row)
        throw new LingyeNpcError("lingye_npc_world_state_missing", "Lingye NPC world state missing");
    return {
        npcId: npc.npcId,
        locationId: row.location_id,
        workStatus: row.work_status,
        revision: row.revision,
        updatedAt: row.updated_at,
    };
}

export function getResidentLingyeNpcAffinity(database, residentId, npcId) {
    const normalizedResidentId = requireResident(database, residentId);
    const npc = requireLingyeNpc(npcId);
    const row = database.prepare(`
      SELECT affinity_value, revision, updated_at
      FROM lingye_npc_affinity_projections
      WHERE resident_id = ? AND npc_id = ?
    `).get(normalizedResidentId, npc.npcId);
    return {
        residentId: normalizedResidentId,
        npcId: npc.npcId,
        value: row?.affinity_value ?? 0,
        stage: affinityStage(row?.affinity_value ?? 0),
        revision: row?.revision ?? 0,
        updatedAt: row?.updated_at ?? null,
    };
}

export function recordLingyeNpcAffinityEvent(database, input) {
    const eventId = nonEmpty(input.eventId, "lingye_npc_event_id_required");
    const residentId = requireResident(database, input.residentId);
    const npc = requireLingyeNpc(input.npcId);
    const sourceKind = nonEmpty(input.sourceKind, "lingye_npc_source_kind_required");
    const sourceReference = nonEmpty(input.sourceReference, "lingye_npc_source_reference_required");
    if (!AFFINITY_SOURCE_KINDS.has(sourceKind))
        throw new LingyeNpcError("lingye_npc_source_kind_invalid", "Invalid Lingye NPC affinity source kind");
    if (!Number.isSafeInteger(input.delta) || input.delta <= 0)
        throw new LingyeNpcError("lingye_npc_affinity_delta_invalid", "Affinity delta must be a positive integer");
    if ((sourceKind === "conversation" && input.delta !== 1) ||
        (sourceKind === "business" && input.delta !== 2))
        throw new LingyeNpcError("lingye_npc_affinity_delta_invalid", "Daily affinity uses its fixed source amount");
    const occurredAt = safeTime(input.occurredAt, "lingye_npc_occurred_at_invalid");
    const recordedAt = safeTime(input.recordedAt ?? Date.now(), "lingye_npc_recorded_at_invalid");
    return runLingyeNpcTransaction(database, () => {
        const byEvent = database.prepare("SELECT * FROM lingye_npc_affinity_events WHERE event_id = ?").get(eventId);
        const bySource = database.prepare(`
          SELECT * FROM lingye_npc_affinity_events
          WHERE resident_id = ? AND npc_id = ? AND source_kind = ? AND source_reference = ?
        `).get(residentId, npc.npcId, sourceKind, sourceReference);
        const existing = byEvent ?? bySource;
        if (existing) {
            if (existing.resident_id !== residentId ||
                existing.npc_id !== npc.npcId ||
                existing.source_kind !== sourceKind ||
                existing.source_reference !== sourceReference ||
                existing.requested_delta !== input.delta ||
                existing.occurred_at !== occurredAt) {
                throw new LingyeNpcError("lingye_npc_affinity_event_conflict", "Lingye NPC affinity event conflict");
            }
            return affinityResult(existing);
        }
        const current = database.prepare(`
          SELECT affinity_value, revision, updated_at
          FROM lingye_npc_affinity_projections
          WHERE resident_id = ? AND npc_id = ?
        `).get(residentId, npc.npcId);
        const currentValue = current?.affinity_value ?? 0;
        let permittedDelta = input.delta;
        if (sourceKind === "conversation" || sourceKind === "business") {
            const dayStart = Math.floor((occurredAt + 8 * 3_600_000) / 86_400_000) * 86_400_000 - 8 * 3_600_000;
            const daily = database.prepare(`
              SELECT source_kind, COALESCE(SUM(applied_delta), 0) AS applied
              FROM lingye_npc_affinity_events
              WHERE resident_id = ? AND npc_id = ?
                AND source_kind IN ('conversation', 'business')
                AND occurred_at >= ? AND occurred_at < ?
              GROUP BY source_kind
            `).all(residentId, npc.npcId, dayStart, dayStart + 86_400_000);
            const sourceApplied = daily.find((row) => row.source_kind === sourceKind)?.applied ?? 0;
            const totalApplied = daily.reduce((total, row) => total + row.applied, 0);
            permittedDelta = Math.max(0, Math.min(input.delta - sourceApplied, 3 - totalApplied));
        }
        if (sourceKind === "migration") {
            const history = database.prepare(`
              SELECT COALESCE(SUM(applied_delta), 0) AS applied
              FROM lingye_npc_affinity_events
              WHERE resident_id = ? AND npc_id = ? AND source_kind = 'migration'
            `).get(residentId, npc.npcId);
            permittedDelta = Math.max(0, Math.min(permittedDelta, 20 - history.applied));
        }
        const resultingValue = Math.min(100, currentValue + permittedDelta);
        const appliedDelta = resultingValue - currentValue;
        const resultingRevision = (current?.revision ?? 0) + 1;
        const updatedAt = Math.max(current?.updated_at ?? 0, occurredAt);
        database.prepare(`
          INSERT INTO lingye_npc_affinity_events (
            event_id, resident_id, npc_id, source_kind, source_reference,
            requested_delta, applied_delta, resulting_value, resulting_revision,
            occurred_at, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            eventId,
            residentId,
            npc.npcId,
            sourceKind,
            sourceReference,
            input.delta,
            appliedDelta,
            resultingValue,
            resultingRevision,
            occurredAt,
            recordedAt,
        );
        database.prepare(`
          INSERT INTO lingye_npc_affinity_projections (
            resident_id, npc_id, affinity_value, revision, updated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(resident_id, npc_id) DO UPDATE SET
            affinity_value = excluded.affinity_value,
            revision = excluded.revision,
            updated_at = excluded.updated_at
        `).run(residentId, npc.npcId, resultingValue, resultingRevision, updatedAt);
        return {
            residentId,
            npcId: npc.npcId,
            requestedDelta: input.delta,
            appliedDelta,
            value: resultingValue,
            stage: affinityStage(resultingValue),
            revision: resultingRevision,
            occurredAt,
        };
    });
}

export function setLingyeNpcWorldState(database, input) {
    const eventId = nonEmpty(input.eventId, "lingye_npc_event_id_required");
    const npc = requireLingyeNpc(input.npcId);
    const sourceKind = nonEmpty(input.sourceKind, "lingye_npc_source_kind_required");
    const sourceReference = nonEmpty(input.sourceReference, "lingye_npc_source_reference_required");
    const locationId = nonEmpty(input.locationId, "lingye_npc_location_required");
    if (!isLingyeNpcLocation(locationId))
        throw new LingyeNpcError("lingye_npc_location_invalid", "Unknown NPC public location");
    const workStatus = nonEmpty(input.workStatus, "lingye_npc_work_status_required");
    if (!WORLD_SOURCE_KINDS.has(sourceKind))
        throw new LingyeNpcError("lingye_npc_source_kind_invalid", "Invalid Lingye NPC world source kind");
    if (!WORK_STATUSES.has(workStatus))
        throw new LingyeNpcError("lingye_npc_work_status_invalid", "Invalid Lingye NPC work status");
    const occurredAt = safeTime(input.occurredAt, "lingye_npc_occurred_at_invalid");
    const recordedAt = safeTime(input.recordedAt ?? Date.now(), "lingye_npc_recorded_at_invalid");
    return runLingyeNpcTransaction(database, () => {
        const byEvent = database.prepare("SELECT * FROM lingye_npc_world_events WHERE event_id = ?").get(eventId);
        const bySource = database.prepare(`
          SELECT * FROM lingye_npc_world_events
          WHERE npc_id = ? AND source_kind = ? AND source_reference = ?
        `).get(npc.npcId, sourceKind, sourceReference);
        const existing = byEvent ?? bySource;
        if (existing) {
            if (existing.npc_id !== npc.npcId ||
                existing.source_kind !== sourceKind ||
                existing.source_reference !== sourceReference ||
                existing.location_id !== locationId ||
                existing.work_status !== workStatus ||
                existing.occurred_at !== occurredAt) {
                throw new LingyeNpcError("lingye_npc_world_event_conflict", "Lingye NPC world event conflict");
            }
            return worldResult(existing);
        }
        const current = database.prepare("SELECT * FROM lingye_npc_world_states WHERE npc_id = ?").get(npc.npcId);
        if (!current)
            throw new LingyeNpcError("lingye_npc_world_state_missing", "Lingye NPC world state missing");
        if (occurredAt < current.updated_at)
            throw new LingyeNpcError("lingye_npc_world_event_out_of_order", "Lingye NPC world event is older than current state");
        const revision = current.revision + 1;
        database.prepare(`
          INSERT INTO lingye_npc_world_events (
            event_id, npc_id, source_kind, source_reference, location_id,
            work_status, resulting_revision, occurred_at, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            eventId,
            npc.npcId,
            sourceKind,
            sourceReference,
            locationId,
            workStatus,
            revision,
            occurredAt,
            recordedAt,
        );
        database.prepare(`
          UPDATE lingye_npc_world_states
          SET location_id = ?, work_status = ?, revision = ?, updated_at = ?
          WHERE npc_id = ?
        `).run(locationId, workStatus, revision, occurredAt, npc.npcId);
        return { npcId: npc.npcId, locationId, workStatus, revision, occurredAt };
    });
}

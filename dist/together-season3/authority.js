// Read-only bridges to existing Farm authorities. Nothing in this module awards
// money/experience, treats an object, collects a fish, or saves a farm.
import { plotAgronomyIssues } from "../career/p3-world.js";
import { normalizeTogetherSeason3State } from "./runtime.js";
import { collectSeason3HarvestReceipts } from "./harvest.js";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value) => typeof value === "string" && value.length > 0;
const at = (value) => Number.isFinite(value) && value >= 0;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class TogetherSeason3AuthorityError extends Error {
    constructor(code = "season3_authority_unavailable") {
        super(code);
        this.name = "TogetherSeason3AuthorityError";
        this.code = code;
    }
}

function requireValue(condition) {
    if (!condition) throw new TogetherSeason3AuthorityError();
}

function parse(value, fallback) {
    if (value == null) return fallback;
    return JSON.parse(value);
}

function inEpisode(state, occurredAt, now) {
    return at(occurredAt) && occurredAt >= state.startedAt && occurredAt <= now
        && (state.endedAt === null || occurredAt < state.endedAt);
}

function receipt(state, farm, kind, sourceId, occurredAt, now) {
    return { eventId: state.eventId, farmId: farm.id, kind, sourceId, occurredAt, successful: true, now };
}

function collectedFishReceipts(farm, state, now) {
    const event = farm.lingyeP4?.events?.[state.eventId];
    if (!event) return [];
    requireValue(record(event) && event.type === "flood" && Array.isArray(event.floodFish));
    const seen = new Set();
    const receipts = [];
    for (const fish of event.floodFish) {
        if (fish?.status !== "collected" || !inEpisode(state, fish.collectedAt, now)) continue;
        requireValue(identifier(fish.impactId));
        requireValue(!seen.has(fish.impactId));
        seen.add(fish.impactId);
        receipts.push(receipt(state, farm, "flood_fish", `flood-fish:${farm.id}:${fish.impactId}`, fish.collectedAt, now));
    }
    return receipts;
}

function targetSourceBelongsToEvent(database, row, state) {
    const source = database.prepare(`SELECT source_type,
        json_extract(fact_json, '$.farmDoorplate') AS farm_doorplate,
        json_extract(fact_json, '$.plotId') AS plot_id,
        json_extract(fact_json, '$.animalIndex') AS animal_index
      FROM career_commission_source_facts WHERE source_id = ?`).get(row.source_id);
    const sourceType = row.source_type.split(":transfer", 1)[0];
    if (!source || source.source_type !== sourceType || !identifier(source.farm_doorplate)) return false;
    const agronomy = row.career === "agronomist";
    const expectedType = agronomy ? "farm_plot_condition" : "animal_health_case";
    const expectedObjectType = agronomy ? "farm_plot" : "farm_animal";
    const objectIndex = agronomy ? source.plot_id : source.animal_index;
    if (sourceType !== expectedType || row.object_type !== expectedObjectType
        || !Number.isSafeInteger(objectIndex)
        || row.object_id !== `${source.farm_doorplate}:${agronomy ? "plot" : "animal"}:${objectIndex}`) return false;
    const target = database.prepare(`SELECT
        json_extract(state_json, '$.doorbellMcpMigration.migrationId') AS binding_reference,
        json_extract(state_json, '$.plots') AS plots_json,
        json_extract(state_json, '$.ranch.animals') AS animals_json,
        json_extract(state_json, '$.lingyeP3.history') AS history_json
      FROM farm_states WHERE farm_id = ?`).get(source.farm_doorplate);
    if (!target || !identifier(target.binding_reference)) return false;
    const owner = database.prepare("SELECT resident_id FROM residents WHERE binding_reference = ?").get(target.binding_reference);
    if (!owner || owner.resident_id !== row.owner_resident_id) return false;
    const sameSource = (entry) => entry?.sourceId === row.source_id && entry?.natureEventId === state.eventId;
    if (agronomy) {
        const plots = parse(target.plots_json, []);
        requireValue(Array.isArray(plots));
        const plot = plots.find((entry) => entry.id === source.plot_id);
        if (plot && plotAgronomyIssues(plot).some(sameSource)) return true;
    }
    else {
        const animals = parse(target.animals_json, []);
        requireValue(Array.isArray(animals));
        if (sameSource(animals[source.animal_index]?.lingyeHealth)) return true;
    }
    const history = parse(target.history_json, []);
    requireValue(Array.isArray(history));
    return history.some((entry) => sameSource(entry)
        && entry.type === (agronomy ? "agronomy_harvested" : "animal_recovered")
        && (agronomy ? entry.plotId === source.plot_id : entry.animalIndex === source.animal_index));
}

function careerReceipts(database, farm, state, now) {
    const migration = farm.doorbellMcpMigration;
    if (!identifier(migration?.migrationId)) return [];
    requireValue(database && typeof database.prepare === "function");
    const resident = database.prepare("SELECT resident_id FROM residents WHERE binding_reference = ?").get(migration.migrationId);
    if (!resident) return [];
    requireValue(migration.residentId === undefined || migration.residentId === resident.resident_id);
    const rows = database.prepare(`SELECT
        work.work_record_id, work.recorded_at, work.qualification_level,
        job.job_id, job.career, job.source_type, job.source_id,
        job.object_type, job.object_id, job.owner_resident_id, job.required_level,
        operation.world_result_json
      FROM career_work_records AS work
      JOIN career_jobs AS job ON job.job_id = work.job_id
        AND job.worker_resident_id = work.resident_id AND job.career = work.career
      JOIN lingye_cross_store_operations AS operation
        ON operation.action_key = job.world_result_reference
        AND operation.job_id = job.job_id
        AND operation.resident_id = work.resident_id AND operation.career = work.career
      WHERE work.resident_id = ? AND work.record_kind = 'completed'
        AND job.status = 'completed' AND job.career IN ('agronomist', 'veterinarian')
        AND operation.operation_kind = 'commission_treatment'
        AND operation.status = 'completed'
      ORDER BY work.recorded_at, work.work_record_id`).all(resident.resident_id);
    const receipts = [];
    for (const row of rows) {
        if (!inEpisode(state, row.recorded_at, now) || row.qualification_level < row.required_level) continue;
        const outcome = parse(row.world_result_json, null);
        if (outcome?.resolved !== true || outcome?.sourceId !== row.source_id) continue;
        if (!targetSourceBelongsToEvent(database, row, state)) continue;
        receipts.push(receipt(state, farm, row.career === "agronomist" ? "agronomy" : "veterinary",
            `career-work:${row.work_record_id}`, row.recorded_at, now));
    }
    return receipts;
}

export function collectSeason3AuthorityReceipts({ database, farm, state: raw, now = Date.now() }) {
    try {
        const state = normalizeTogetherSeason3State(raw);
        if (state === null) return [];
        requireValue(record(farm) && identifier(farm.id) && at(now));
        return [...collectedFishReceipts(farm, state, now), ...careerReceipts(database, farm, state, now),
            ...collectSeason3HarvestReceipts({farm,state,now})]
            .sort((left, right) => left.occurredAt - right.occurredAt || compare(left.sourceId, right.sourceId));
    }
    catch {
        // Never serialize SQLite diagnostics, source JSON, object state or keys.
        throw new TogetherSeason3AuthorityError();
    }
}

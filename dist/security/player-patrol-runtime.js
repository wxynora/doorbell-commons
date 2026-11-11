import { securityTrailSources } from "../career/p3-commission-runtime.js";
import { farmResidentId } from "../career/farm-benefits.js";
import { decodeStateRecords } from "../farm-state-records.js";
import { patrolDate } from "./player-patrol-service.js";

/** Called inside the existing world/ledger SQLite transaction before its durable write. */
export function captureCommittedPlayerPatrolThefts(database, backend, world, persistenceHints) {
    if (!database.isTransaction) throw new Error("security_patrol_commit_transaction_required");
    const changedFarms = new Set(persistenceHints?.farmIds);
    const created = [];
    for (const farm of world.farms) {
        if (!changedFarms.has(farm.id) || !farm.trail?.length) continue;
        const before = persistenceHints.farmBefore.get(farm.id);
        const previousTrail = before?.state?.trail ??
            (before?.records?.has("/trail") ? decodeStateRecords(before.records, "/trail") : []);
        const previousIds = new Set(previousTrail.map(entry => entry?.eventId));
        const thefts = farm.trail.filter(entry => entry?.kind === "stolen" &&
            typeof entry.eventId === "string" && entry.eventId.length > 0 && !previousIds.has(entry.eventId));
        if (thefts.length === 0) continue;
        const owner = farmResidentId(database, farm);
        if (!owner) continue;
        for (const source of securityTrailSources(database, farm, owner, thefts)) {
            if (source.excludedResidentIds.length === 0) continue;
            if (database.prepare("SELECT 1 FROM security_patrol_cases WHERE source_id=?").get(source.sourceId))
                continue;
            const day = database.prepare("SELECT windows_json FROM security_player_patrol_days WHERE beijing_date=?")
                .get(patrolDate(source.fact.event.t));
            if (!day || !JSON.parse(day.windows_json).some(window => source.fact.event.t >= window.startedAt && source.fact.event.t < window.endedAt)) continue;
            source.fact.victimName = farm.name;
            const result = backend.trustedSystemCommands.capturePlayerPatrolTheft(source);
            if (result) created.push({
                actorFarmId: source.fact.event.actorFarmId,
                sourceId: source.sourceId,
                occurredAt: source.fact.event.t,
            });
        }
    }
    return created;
}

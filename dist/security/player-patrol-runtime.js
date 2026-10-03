import { securityTrailSources } from "../career/p3-commission-runtime.js";
import { farmResidentId } from "../career/farm-benefits.js";
import { patrolDate } from "./player-patrol-service.js";

/** Called inside the existing world/ledger SQLite transaction before its durable write. */
export function captureCommittedPlayerPatrolThefts(database, backend, world) {
    if (!database.isTransaction) throw new Error("security_patrol_commit_transaction_required");
    for (const farm of world.farms) {
        const owner=farmResidentId(database,farm);
        if (!owner) continue;
        for (const source of securityTrailSources(database,farm,owner)) {
            if(source.excludedResidentIds.length===0) continue;
            const day=database.prepare("SELECT windows_json FROM security_player_patrol_days WHERE beijing_date=?")
                .get(patrolDate(source.fact.event.t));
            if (!day || !JSON.parse(day.windows_json).some(window=>source.fact.event.t>=window.startedAt && source.fact.event.t<window.endedAt)) continue;
            source.fact.victimName=farm.name;
            backend.trustedSystemCommands.capturePlayerPatrolTheft(source);
        }
    }
}

import { allFarms } from '../store.js';
import { agronomyIssuesForFarm } from './p3-world.js';
import { runLingyeWorldTransaction } from '../lingye-world-database.js';

export function expireNatureRecoveredCommissions(database, backend, releaseFund, now) {
    const recovered = new Set(allFarms().flatMap(farm => agronomyIssuesForFarm(farm)
        .filter(({ issue }) => issue.status === 'resolved' &&
            ['rain-recovery', 'natural-drainage'].includes(issue.natureResolution))
        .map(({ issue }) => issue.sourceId)));
    if (!recovered.size) return [];
    const rows = database.prepare(`SELECT * FROM career_jobs WHERE career = 'agronomist'
        AND status IN ('available', 'accepted', 'assigned', 'active')`).all();
    const ended = [];
    for (const row of rows) {
        if (!recovered.has(row.source_id)) continue;
        runLingyeWorldTransaction(database, () => {
            const job = backend.trustedQueries.getJob(row.job_id);
            const fund = database.prepare(`SELECT 1 FROM career_service_commission_funds
                WHERE current_job_id = ? AND state = 'reserved'`).get(row.job_id);
            if (fund) releaseFund(database, backend, job, `nature-recovery:${row.job_id}`, now);
            backend.trustedSystemCommands.expireJob(row.job_id, false);
        });
        ended.push(row.job_id);
    }
    return ended;
}

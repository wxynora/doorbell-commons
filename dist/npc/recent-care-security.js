const hasTable = (database, name) => !!database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

function careFacts(database, residentId, now, since) {
    if (!["farm_states", "career_jobs", "career_work_records", "career_commission_source_facts",
        "career_npc_service_settlements"].every(name => hasTable(database, name))) return [];
    // Both player doctors and the institution NPC persist a completed treatment.
    // That receipt proves treatment, never recovery: recovery is checked below.
    const treatments = database.prepare(`
      SELECT job.source_id, source.fact_json, job.ended_at AS treated_at
      FROM career_jobs job
      JOIN career_commission_source_facts source ON source.source_id = job.source_id
        AND source.source_type = 'animal_health_case'
      JOIN career_work_records work ON work.job_id = job.job_id
        AND work.resident_id = job.worker_resident_id AND work.record_kind = 'completed'
        AND work.career = 'veterinarian' AND work.recorded_at = job.ended_at
      WHERE job.owner_resident_id = ? AND job.career = 'veterinarian'
        AND job.status = 'completed' AND job.world_result_reference IS NOT NULL
        AND job.ended_at >= ? AND job.ended_at <= ?
      UNION ALL
      SELECT settlement.source_id, source.fact_json, settlement.completed_at AS treated_at
      FROM career_npc_service_settlements settlement
      JOIN career_commission_source_facts source ON source.source_id = settlement.source_id
        AND source.source_type = 'animal_health_case'
      WHERE settlement.owner_resident_id = ? AND settlement.career = 'veterinarian'
        AND settlement.completed_at >= ? AND settlement.completed_at <= ?
      ORDER BY treated_at DESC`).all(residentId, since, now, residentId, since, now);
    const binding = database.prepare("SELECT binding_reference FROM residents WHERE resident_id = ?").get(residentId);
    const farms = new Map();
    const facts = new Set();
    const day = Math.floor((now + 8 * 3_600_000) / 86_400_000);
    for (const treatment of treatments) {
        const source = JSON.parse(treatment.fact_json);
        if (typeof source.farmDoorplate !== "string" || !Number.isSafeInteger(source.animalIndex)) continue;
        if (!farms.has(source.farmDoorplate)) {
            const row = database.prepare("SELECT state_json FROM farm_states WHERE farm_id = ?").get(source.farmDoorplate);
            farms.set(source.farmDoorplate, row ? JSON.parse(row.state_json) : null);
        }
        const farm = farms.get(source.farmDoorplate);
        if (!binding || farm?.doorbellMcpMigration?.migrationId !== binding.binding_reference) continue;
        const animal = farm.ranch?.animals?.[source.animalIndex];
        if (!animal || animal.kindId !== source.animalKindId) continue;
        const health = animal.lingyeHealth;
        if (health?.sourceId === treatment.source_id && health.status === "recovering"
            && health.treatedAt >= since && health.treatedAt <= now && day < health.recoveryUntilDay) {
            facts.add("recent_animal_recovering");
        }
        // advanceRecoveries writes this history entry and removes lingyeHealth.
        // Merely reaching recoveryUntilDay, or completing the job, is not enough.
        if ((!health || health.status === "healthy") && (farm.lingyeP3?.history ?? []).some(event =>
            event.type === "animal_recovered" && event.sourceId === treatment.source_id
            && event.animalIndex === source.animalIndex && event.recordedAt >= treatment.treated_at
            && event.recordedAt <= now)) facts.add("recent_animal_recovered");
    }
    return [...facts];
}

function securityFacts(database, residentId, now, since) {
    const facts = [];
    if (hasTable(database, "security_detentions") && hasTable(database, "lingye_npc_dialogue_sessions")) {
        const detained = database.prepare(`SELECT 1 FROM security_detentions
          WHERE resident_id = ? AND status = 'active' AND started_at <= ? AND scheduled_release_at > ? LIMIT 1`)
            .get(residentId, now, now);
        const release = database.prepare(`SELECT released_at FROM security_detentions
          WHERE resident_id = ? AND status = 'released' AND released_at >= ? AND released_at <= ?
          ORDER BY released_at DESC LIMIT 1`).get(residentId, since, now);
        if (!detained && release) {
            const meeting = database.prepare(`SELECT 1 FROM lingye_npc_dialogue_sessions
              WHERE resident_id = ? AND npc_id = 'npc_beiheng' AND started_at >= ? AND started_at <= ? LIMIT 1`)
                .get(residentId, release.released_at, now);
            if (!meeting) facts.push("first_meeting_after_release");
        }
    }
    if (hasTable(database, "career_jobs") && hasTable(database, "career_commission_source_facts")) {
        const report = database.prepare(`SELECT 1 FROM career_jobs job
          JOIN career_commission_source_facts source ON source.source_id = job.source_id
            AND source.source_type = 'farm_interaction_complaint'
          WHERE job.owner_resident_id = ? AND job.career = 'constable'
            AND job.source_type = 'farm_interaction_complaint'
            AND job.status IN ('available', 'accepted', 'assigned', 'active')
            AND job.created_at <= ? AND json_extract(source.fact_json, '$.event.kind') = 'stolen'
          LIMIT 1`).get(residentId, now);
        if (report) facts.push("open_theft_report");
    }
    return facts;
}

/** Resident-scoped reads only; no clock advancement, settlement or new state. */
export function readRecentCareSecurityFacts(database, residentId, npcId, now, since) {
    if (npcId === "npc_pupu") return careFacts(database, residentId, now, since);
    if (npcId === "npc_beiheng") return securityFacts(database, residentId, now, since);
    return [];
}

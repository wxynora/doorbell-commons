/** Read actual NPC seed purchases and successful expansion time.
 * Land tier and the untimed farm log cannot establish a recent expansion. */
export function readRecentFarmFacts(database, residentId, npcId, now, since) {
    if (npcId !== "npc_atu") return [];
    const hasEconomy = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'economy_ledger_entries'").get();
    if (!hasEconomy) return [];
    const purchases = database.prepare(`SELECT event.event_id
      FROM lingye_npc_affinity_events event
      JOIN economy_commands command ON command.idempotency_key = event.source_reference
        AND command.command_type = 'farm.balance.apply'
      JOIN economy_journals journal ON journal.journal_id = command.journal_id
        AND journal.business_ref = event.source_reference AND journal.command_type = command.command_type
      WHERE event.resident_id = ? AND event.npc_id = 'npc_atu' AND event.source_kind = 'business'
        AND event.source_reference LIKE 'farm-balance:%'
        AND event.occurred_at >= ? AND event.occurred_at <= ?
        AND journal.created_at >= ? AND journal.created_at <= ?
        AND EXISTS (SELECT 1 FROM economy_ledger_entries entry WHERE entry.journal_id = journal.journal_id
          AND entry.resident_id = event.resident_id AND entry.currency = 'gold'
          AND entry.partition_name = 'available' AND entry.delta < 0)
      ORDER BY event.occurred_at DESC LIMIT 2`).all(residentId, since, now, since, now);
    const facts = purchases.length === 2 ? ["recent_seed_customer"] : [];
    const hasFarms = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'farm_states'").get();
    if (hasFarms) {
        const expansion = database.prepare(`SELECT 1 FROM farm_states farm
          JOIN residents resident ON resident.resident_id = ?
            AND json_extract(farm.state_json, '$.doorbellMcpMigration.residentId') = resident.resident_id
            AND json_extract(farm.state_json, '$.doorbellMcpMigration.migrationId') = resident.binding_reference
          WHERE json_type(farm.state_json, '$.lastLandExpandedAt') = 'integer'
            AND json_extract(farm.state_json, '$.lastLandExpandedAt') >= ?
            AND json_extract(farm.state_json, '$.lastLandExpandedAt') <= ? LIMIT 1`).get(residentId, since, now);
        if (expansion) facts.push('recent_land_expansion');
    }
    return facts;
}

import { readRecentFarmFacts } from './recent-farm.js';
import { readRecentCareSecurityFacts } from './recent-care-security.js';
import { readRecentInstitutionFacts } from './recent-institutions.js';

// User confirmed 2026-09-05: recent means the preceding seven days.
export const NPC_RECENT_WINDOW_MS = 7 * 86_400_000;
export function readRecentNpcFacts(database, residentId, npcId, now) {
    const since = Math.max(0, now - NPC_RECENT_WINDOW_MS);
    if (npcId === 'npc_atu') return readRecentFarmFacts(database, residentId, npcId, now, since);
    if (npcId === 'npc_pupu' || npcId === 'npc_beiheng')
        return readRecentCareSecurityFacts(database, residentId, npcId, now, since);
    return readRecentInstitutionFacts(database, residentId, npcId, now, since);
}

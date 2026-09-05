const DAY = 86_400_000;
const DAY_SHIFT_ANCHOR = Date.parse("2026-09-06T00:00:00+08:00");

export const ROTATING_SHIFT_NPCS = Object.freeze(["npc_pupu", "npc_beiheng"]);

export function lingyeNpcScheduleVersion(npcId) {
    return ROTATING_SHIFT_NPCS.includes(npcId) ? 2 : 1;
}

export function lingyeNpcRotatingDuty(npcId, dayStart) {
    if (!ROTATING_SHIFT_NPCS.includes(npcId)) return null;
    const dayShift = Math.floor((dayStart - DAY_SHIFT_ANCHOR) / DAY) % 2 === 0;
    return dayShift ? [[8, 16]] : [[16, 24]];
}

export function isLingyeNpcChatAvailable(npcId, workStatus) {
    return ROTATING_SHIFT_NPCS.includes(npcId) ? workStatus === "on_duty" : workStatus !== "away";
}

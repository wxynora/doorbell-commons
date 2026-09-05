import { createHash } from "node:crypto";
import { LINGYE_NPCS, requireLingyeNpc } from "./registry.js";
import { lingyeNpcRotatingDuty, lingyeNpcScheduleVersion } from "./shift-policy.js";
import { getLingyeNpcWorldState, LingyeNpcError, runLingyeNpcTransaction, setLingyeNpcWorldState } from "./service.js";

export const LINGYE_NPC_SCHEDULE_VERSION = 1;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OFFSET = 8 * HOUR;
const DUTY_PERIODS = Object.freeze({
    npc_atu: [[5, 18]], npc_pupu: [[0, 2], [8, 12], [20, 24]], npc_modian: [[5, 16]],
    npc_liyuan: [[8, 18]], npc_songmo: [[14, 23]], npc_beiheng: [[0, 2], [16, 24]],
});
const REST_PERIODS = Object.freeze({
    npc_atu: [[0, 5], [23, 24]], npc_pupu: [[2, 8]], npc_modian: [[0, 5], [23, 24]],
    npc_liyuan: [[0, 5], [23, 24]], npc_songmo: [[4, 12]], npc_beiheng: [[2, 10]],
});
const LEISURE_LOCATIONS = Object.freeze({
    npc_atu: ["farm-ranch", "commercial-street", "doorbell-community"],
    npc_pupu: ["moonlight-pond", "doorbell-community", "farm-ranch"],
    npc_modian: ["commercial-street", "doorbell-community", "moonlight-pond"],
    npc_liyuan: ["doorbell-community", "moonlight-pond", "commercial-street"],
    npc_songmo: ["doorbell-community", "farm-ranch", "moonlight-pond"],
    npc_beiheng: ["moonlight-pond", "farm-ranch", "doorbell-community"],
});

function assertTime(now) {
    if (!Number.isSafeInteger(now) || now < 0)
        throw new LingyeNpcError("lingye_npc_time_invalid", "NPC time must be a non-negative integer");
}

export function lingyeNpcBeijingDay(now) {
    assertTime(now);
    const start = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
    return { date: new Date(start + OFFSET).toISOString().slice(0, 10), start, end: start + DAY };
}

function createDailySchedule(npc, day) {
    const dutyPeriods = lingyeNpcRotatingDuty(npc.npcId, day.start) ?? DUTY_PERIODS[npc.npcId];
    const restPeriods = REST_PERIODS[npc.npcId];
    const hours = [...new Set([0, 5, 8, 11, 14, 18, 23, 24, ...dutyPeriods.flat(), ...restPeriods.flat()])].sort((a, b) => a - b);
    const blocks = [];
    for (let i = 0; i < hours.length - 1; i++) {
        const startHour = hours[i];
        const onDuty = dutyPeriods.some(([start, end]) => startHour >= start && startHour < end);
        const resting = restPeriods.some(([start, end]) => startHour >= start && startHour < end);
        const choices = LEISURE_LOCATIONS[npc.npcId];
        const seed = createHash("sha256").update(`${LINGYE_NPC_SCHEDULE_VERSION}:${day.date}:${npc.npcId}:${startHour}`).digest().readUInt32BE(0);
        blocks.push({
            startsAt: day.start + startHour * HOUR,
            endsAt: day.start + hours[i + 1] * HOUR,
            locationId: onDuty ? npc.homeLocationId : resting ? "doorbell-community" : choices[seed % choices.length],
            workStatus: onDuty ? "on_duty" : resting ? "away" : "off_duty",
        });
    }
    return blocks;
}

function dailySchedule(database, npc, day) {
    const saved = database.prepare("SELECT * FROM lingye_npc_schedules WHERE npc_id = ?").get(npc.npcId);
    if (saved?.schedule_date === day.date && saved.schedule_version === lingyeNpcScheduleVersion(npc.npcId))
        return JSON.parse(saved.blocks_json);
    const blocks = createDailySchedule(npc, day);
    database.prepare(`
      INSERT INTO lingye_npc_schedules (npc_id, schedule_date, schedule_version, blocks_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(npc_id) DO UPDATE SET schedule_date = excluded.schedule_date,
        schedule_version = excluded.schedule_version, blocks_json = excluded.blocks_json
    `).run(npc.npcId, day.date, lingyeNpcScheduleVersion(npc.npcId), JSON.stringify(blocks));
    return blocks;
}

/** Existing world scheduler calls this. Reads never select or advance an NPC. */
export function advanceLingyeNpcWorld(database, { now }) {
    assertTime(now);
    // Refresh only the two changed calendars on upgrade, even before the old clock expires.
    const needsShiftUpgrade = () => !!database.prepare(`
      SELECT 1 FROM lingye_npcs n LEFT JOIN lingye_npc_schedules s ON s.npc_id = n.npc_id
      WHERE n.npc_id IN ('npc_pupu', 'npc_beiheng') AND n.active = 1
        AND (s.schedule_version IS NULL OR s.schedule_version <> 2) LIMIT 1
    `).get();
    const savedClock = database.prepare("SELECT * FROM lingye_npc_schedule_clock WHERE singleton = 1").get();
    if (savedClock && now < savedClock.next_transition_at && !needsShiftUpgrade())
        return { advancedAt: savedClock.advanced_at, nextTransitionAt: savedClock.next_transition_at, moved: 0, encounters: 0 };
    return runLingyeNpcTransaction(database, () => {
        const clock = database.prepare("SELECT * FROM lingye_npc_schedule_clock WHERE singleton = 1").get();
        if (clock && now < clock.next_transition_at && !needsShiftUpgrade())
            return { advancedAt: clock.advanced_at, nextTransitionAt: clock.next_transition_at, moved: 0, encounters: 0 };
        const day = lingyeNpcBeijingDay(now);
        const current = [];
        let moved = 0;
        let nextTransitionAt = day.end;
        for (const npc of LINGYE_NPCS) {
            const active = database.prepare("SELECT active FROM lingye_npcs WHERE npc_id = ?").get(npc.npcId);
            if (active?.active !== 1)
                continue;
            const blocks = dailySchedule(database, npc, day);
            const block = blocks.find((entry) => now >= entry.startsAt && now < entry.endsAt);
            nextTransitionAt = Math.min(nextTransitionAt, block.endsAt);
            const before = getLingyeNpcWorldState(database, npc.npcId);
            // A delayed scheduler must not overwrite a newer authoritative story move.
            if (before.updatedAt > now)
                continue;
            const sourceReference = `v${lingyeNpcScheduleVersion(npc.npcId)}:${day.date}:${block.startsAt}`;
            const applied = database.prepare(`
              SELECT event_id FROM lingye_npc_world_events
              WHERE npc_id = ? AND source_kind = 'schedule' AND source_reference = ?
            `).get(npc.npcId, sourceReference);
            if (!applied) {
                setLingyeNpcWorldState(database, {
                    eventId: `npc-schedule:${npc.npcId}:${sourceReference}`,
                    npcId: npc.npcId, sourceKind: "schedule", sourceReference,
                    locationId: block.locationId, workStatus: block.workStatus,
                    occurredAt: now, recordedAt: now,
                });
                if (before.locationId !== block.locationId || before.workStatus !== block.workStatus)
                    moved++;
            }
            const state = getLingyeNpcWorldState(database, npc.npcId);
            current.push({ ...state, blockStartsAt: block.startsAt });
        }
        let encounters = 0;
        current.sort((a, b) => a.npcId.localeCompare(b.npcId));
        for (let i = 0; i < current.length; i++) {
            for (let j = i + 1; j < current.length; j++) {
                const a = current[i], b = current[j];
                if (a.workStatus === "away" || b.workStatus === "away" || a.locationId !== b.locationId)
                    continue;
                const encounterId = `npc-encounter:${a.npcId}:${b.npcId}:${a.revision}:${b.revision}`;
                const result = database.prepare(`
                  INSERT OR IGNORE INTO lingye_npc_public_encounters
                    (encounter_id, npc_a, npc_b, location_id, occurred_at)
                  VALUES (?, ?, ?, ?, ?)
                `).run(encounterId, a.npcId, b.npcId, a.locationId, now);
                encounters += Number(result.changes);
            }
        }
        database.prepare(`
          INSERT INTO lingye_npc_schedule_clock (singleton, advanced_at, next_transition_at) VALUES (1, ?, ?)
          ON CONFLICT(singleton) DO UPDATE SET advanced_at = excluded.advanced_at,
            next_transition_at = excluded.next_transition_at
        `).run(now, nextTransitionAt);
        return { advancedAt: now, nextTransitionAt, moved, encounters };
    });
}

export function nextLingyeNpcWorldTransitionAt(database) {
    return database.prepare("SELECT next_transition_at FROM lingye_npc_schedule_clock WHERE singleton = 1").get()?.next_transition_at ?? null;
}

/** Public co-presence only; deliberately contains no resident or private business fields. */
export function listLingyeNpcPublicEncounters(database, { npcId, since, until }) {
    const npc = requireLingyeNpc(npcId);
    assertTime(since);
    assertTime(until);
    if (until < since)
        throw new LingyeNpcError("lingye_npc_time_range_invalid", "Encounter time range is reversed");
    return database.prepare(`
      SELECT encounter_id, npc_a, npc_b, location_id, occurred_at
      FROM lingye_npc_public_encounters
      WHERE (npc_a = ? OR npc_b = ?) AND occurred_at >= ? AND occurred_at < ?
      ORDER BY occurred_at, encounter_id
    `).all(npc.npcId, npc.npcId, since, until).map((row) => ({
        encounterId: row.encounter_id,
        npcIds: [row.npc_a, row.npc_b],
        locationId: row.location_id,
        occurredAt: row.occurred_at,
    }));
}

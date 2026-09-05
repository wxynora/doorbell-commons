import { createHash, randomInt } from "node:crypto";
import { getLingyeNpcWorldState, getResidentLingyeNpcAffinity, recordLingyeNpcAffinityEvent, runLingyeNpcTransaction } from "./service.js";
import { requireLingyeNpc } from "./registry.js";
import { LINGYE_NPC_DIALOGUE_VERSION, availableLingyeNpcDialogues, getLingyeNpcDialogue } from "./dialogue-catalog.js";
import { drawLingyeNpcGift, npcBeijingDay, npcRandomFraction } from "./gift-service.js";
import { beijingDayIndex, ecologicalSeasonAt, plannedWeatherForDay } from "../nature.js";
import { readRecentNpcFacts } from './recent-context.js';

const randomFraction = () => randomInt(1_000_000) / 1_000_000;
const digest = (value) => createHash("sha256").update(value).digest("hex").slice(0, 32);

function requireText(value) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        throw new Error("lingye_npc_dialogue_reference_invalid");
    return value;
}

function residentNpc(database, residentId, npcId) {
    const resident = database.prepare("SELECT resident_id FROM residents WHERE resident_id = ?").get(requireText(residentId));
    if (!resident) throw new Error("lingye_npc_resident_not_found");
    return requireLingyeNpc(requireText(npcId));
}

export function getCurrentLingyeNpcInteractionReference(database, residentId, npcId, now = Date.now()) {
    residentNpc(database, residentId, npcId);
    const pending = database.prepare(`SELECT session_id FROM lingye_npc_dialogue_sessions
      WHERE resident_id = ? AND npc_id = ? AND status = 'awaiting_choice'
      ORDER BY started_at DESC, session_id DESC LIMIT 1`).get(residentId, npcId);
    if (pending) return pending.session_id;
    const last = database.prepare(`SELECT session_id, completed_at FROM lingye_npc_dialogue_sessions
      WHERE resident_id = ? AND npc_id = ? ORDER BY rowid DESC LIMIT 1`).get(residentId, npcId);
    if (last?.completed_at != null && npcBeijingDay(last.completed_at) === npcBeijingDay(now)) return null;
    return `npc-talk:${digest(JSON.stringify([residentId, npcId, last?.session_id ?? "first"]))}`;
}

/** A bounded resident-only reader. Historical lines are enabled only by facts
 * that the relevant business source can actually establish, not affinity alone. */
export function readLingyeNpcDialogueContext(database, residentId, npcId, now = Date.now()) {
    residentNpc(database, residentId, npcId);
    const world = getLingyeNpcWorldState(database, npcId);
    const context = { locationId: world.locationId, workStatus: world.workStatus,
        worldRevision: world.revision, hour: new Date(now + 8 * 3_600_000).getUTCHours(), facts: [] };
    const hasTable = (name) => !!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    if (hasTable("world_components")) {
        const nature = database.prepare("SELECT state_json FROM world_components WHERE component_key = 'nature'").get();
        if (nature) {
            const natureWorld = JSON.parse(nature.state_json);
            const season = ecologicalSeasonAt(natureWorld, now);
            context.season = season?.name;
            context.seasonId = season?.id;
            context.seasonDay = season?.day;
            context.weather = plannedWeatherForDay(natureWorld, beijingDayIndex(now));
        }
    }
    if (npcId === "npc_songmo" && hasTable("career_exam_attempts")) {
        const tomorrow = (npcBeijingDay(now) + 1) * 86_400_000 - 8 * 3_600_000;
        const exam = database.prepare(`SELECT 1 FROM career_exam_attempts
          WHERE resident_id = ? AND registration_status = 'registered' AND scheduled_at >= ? AND scheduled_at < ? LIMIT 1`)
            .get(residentId, tomorrow, tomorrow + 86_400_000);
        if (exam) context.facts.push("exam_tomorrow");
    }
    if (npcId === "npc_atu" && hasTable("economy_ledger_entries")) {
        // Only the verified vendor purchase hook creates these NPC business
        // sources. A generic farm coin change alone is never a seed purchase.
        const purchases = database.prepare(`SELECT event.event_id
          FROM lingye_npc_affinity_events event
          JOIN economy_commands command ON command.idempotency_key = event.source_reference
            AND command.command_type = 'farm.balance.apply'
          JOIN economy_journals journal ON journal.journal_id = command.journal_id
            AND journal.business_ref = event.source_reference AND journal.command_type = command.command_type
          WHERE event.resident_id = ? AND event.npc_id = 'npc_atu' AND event.source_kind = 'business'
            AND event.source_reference LIKE 'farm-balance:%' AND event.occurred_at < ?
            AND EXISTS (SELECT 1 FROM economy_ledger_entries entry WHERE entry.journal_id = journal.journal_id
              AND entry.resident_id = event.resident_id AND entry.currency = 'gold'
              AND entry.partition_name = 'available' AND entry.delta < 0)
          ORDER BY event.occurred_at DESC LIMIT 2`).all(residentId, now);
        if (purchases.length === 2) context.facts.push("repeat_seed_customer");
    }
    if (npcId === "npc_songmo" && hasTable("career_courses")) {
        const enrollments = database.prepare(`SELECT course.tuition_receipt_id
          FROM career_courses course
          JOIN economy_financial_receipts receipt ON receipt.receipt_id = course.tuition_receipt_id
            AND receipt.resident_id = course.resident_id AND receipt.kind = 'system_gold_charge'
            AND receipt.currency = 'gold' AND receipt.amount > 0
          WHERE course.resident_id = ? AND course.enrolled_at < ?
          ORDER BY course.enrolled_at DESC LIMIT 2`).all(residentId, now);
        if (enrollments.length === 2) context.facts.push("repeat_school_form");
    }
    if (npcId === "npc_pupu" && hasTable("career_jobs")) {
        const priorCase = database.prepare(`SELECT job.job_id
          FROM career_jobs job
          JOIN career_commission_source_facts source ON source.source_id = job.source_id
            AND source.source_type = 'animal_health_case'
          JOIN career_work_records work ON work.job_id = job.job_id
            AND work.resident_id = job.worker_resident_id AND work.record_kind = 'completed'
            AND work.career = 'veterinarian' AND work.recorded_at = job.ended_at
          WHERE job.owner_resident_id = ? AND job.career = 'veterinarian'
            AND job.status = 'completed' AND job.world_result_reference IS NOT NULL
            AND job.ended_at < ? AND json_type(source.fact_json, '$.observations') = 'array'
          ORDER BY job.ended_at DESC LIMIT 1`).get(residentId, now);
        if (priorCase) context.facts.push("returning_case_with_records");
    }
    if (npcId === "npc_liyuan" && hasTable("economy_accounts")) {
        const withdrawals = database.prepare(`SELECT entry.journal_id
          FROM economy_ledger_entries entry
          JOIN economy_journals journal ON journal.journal_id = entry.journal_id
            AND journal.command_type = 'bank.demand.withdraw'
          WHERE entry.resident_id = ? AND entry.partition_name = 'demand_deposit'
            AND entry.currency = 'gold' AND entry.delta < 0 AND entry.created_at < ?
          ORDER BY entry.created_at DESC LIMIT 2`).all(residentId, now);
        if (withdrawals.length === 2) context.facts.push("repeat_withdrawal_form_ready");
        const account = database.prepare("SELECT demand_gold FROM economy_accounts WHERE resident_id = ?").get(residentId);
        if (account) {
            const term = database.prepare(`SELECT COALESCE(SUM(principal), 0) AS amount FROM economy_term_deposits
              WHERE resident_id = ? AND state = 'active'`).get(residentId).amount;
            const loans = database.prepare(`SELECT COALESCE(SUM(principal_outstanding), 0) AS amount FROM economy_system_loans
              WHERE borrower_resident_id = ? AND status != 'repaid'`).get(residentId).amount;
            const localDate = new Date(now + 8 * 3_600_000);
            const monthStart = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), 1) - 8 * 3_600_000;
            const exchange = database.prepare(`SELECT COALESCE(SUM(-entry.delta), 0) AS amount
              FROM economy_ledger_entries entry JOIN economy_journals journal ON journal.journal_id = entry.journal_id
              WHERE entry.resident_id = ? AND entry.currency = 'gold' AND entry.partition_name = 'available'
                AND entry.delta < 0 AND entry.created_at >= ? AND entry.created_at <= ?
                AND journal.command_type = 'bank.exchange.gold_to_silver'`).get(residentId, monthStart, now).amount;
            context.customerScale = account.demand_gold + term + loans + exchange >= 1_000_000 ? "large" : "small";
        }
    }
    context.facts.push(...readRecentNpcFacts(database, residentId, npcId, now));
    return context;
}

function sessionRow(database, residentId, npcId, sessionId) {
    const row = database.prepare("SELECT * FROM lingye_npc_dialogue_sessions WHERE session_id = ?").get(requireText(sessionId));
    if (!row) return null;
    if (row.resident_id !== residentId || row.npc_id !== npcId)
        throw new Error("lingye_npc_dialogue_resident_mismatch");
    if (row.catalog_version !== LINGYE_NPC_DIALOGUE_VERSION)
        throw new Error("lingye_npc_dialogue_catalog_unavailable");
    return row;
}

function renderSession(database, row) {
    const dialogue = getLingyeNpcDialogue(row.npc_id, row.dialogue_id);
    const context = row.context_dialogue_id ? getLingyeNpcDialogue(row.npc_id, row.context_dialogue_id) : null;
    if (!dialogue) throw new Error("lingye_npc_dialogue_catalog_unavailable");
    const lines = [...dialogue.lines, ...(context?.lines ?? [])];
    if (row.choice_id) {
        const choice = dialogue.choices?.find((candidate) => candidate.choiceId === row.choice_id);
        if (!choice) throw new Error("lingye_npc_dialogue_choice_invalid");
        lines.push(...(Array.isArray(choice.response) ? choice.response : [choice.response]));
    }
    const draw = row.gift_draw_id ? database.prepare("SELECT gift_json FROM lingye_npc_gift_draws WHERE draw_id = ? AND session_id = ?")
        .get(row.gift_draw_id, row.session_id) : null;
    const gift = draw?.gift_json ? JSON.parse(draw.gift_json) : null;
    if (gift?.dialogueLine) lines.push(gift.dialogueLine);
    return {
        npcId: row.npc_id, sessionId: row.session_id, status: row.status, dialogueId: row.dialogue_id,
        lines, choices: row.status === "awaiting_choice"
            ? dialogue.choices.map(({ choiceId, label }) => ({ choiceId, label })) : [],
        affinity: row.affinity_json ? JSON.parse(row.affinity_json)
            : getResidentLingyeNpcAffinity(database, row.resident_id, row.npc_id),
        gift,
    };
}

export function createLingyeNpcDialogueService({ database, now = Date.now, random = randomFraction,
    readContext = readLingyeNpcDialogueContext, giftAdapter } = {}) {
    if (!database) throw new Error("lingye_npc_database_required");
    const clock = () => {
        const value = typeof now === "function" ? now() : now;
        if (!Number.isSafeInteger(value) || value < 0) throw new Error("lingye_npc_time_invalid");
        return value;
    };
    const complete = (row, timestamp) => {
        const affinity = recordLingyeNpcAffinityEvent(database, {
            eventId: `npc-conversation:${row.session_id}`, residentId: row.resident_id, npcId: row.npc_id,
            sourceKind: "conversation", sourceReference: row.session_id, delta: 1,
            occurredAt: timestamp, recordedAt: timestamp,
        });
        const draw = drawLingyeNpcGift(database, {
            residentId: row.resident_id, npcId: row.npc_id, sessionId: row.session_id,
            affinityValue: affinity.value, now: timestamp, random, giftAdapter,
        });
        database.prepare(`UPDATE lingye_npc_dialogue_sessions SET status = 'completed', completed_at = ?,
          affinity_json = ?, gift_draw_id = ? WHERE session_id = ?`).run(timestamp, JSON.stringify(affinity), draw.drawId, row.session_id);
        return draw.publish;
    };
    const durable = (operation) => {
        if (database.isTransaction) throw new Error("lingye_npc_dialogue_requires_transaction_boundary");
        let publish = null;
        const result = runLingyeNpcTransaction(database, () => operation((callback) => { publish = callback; }));
        if (publish) publish();
        return result;
    };
    return Object.freeze({
        prepare({ residentId, npcId }) {
            return getCurrentLingyeNpcInteractionReference(database, residentId, npcId, clock());
        },
        read({ residentId, npcId, sessionId }) {
            residentNpc(database, residentId, npcId);
            const row = sessionRow(database, residentId, npcId, sessionId);
            return row ? renderSession(database, row) : null;
        },
        open({ residentId, npcId, sessionId }) {
            residentNpc(database, residentId, npcId);
            const existing = sessionRow(database, residentId, npcId, sessionId);
            if (existing) return renderSession(database, existing);
            if (sessionId !== getCurrentLingyeNpcInteractionReference(database, residentId, npcId, clock()))
                throw new Error("lingye_npc_dialogue_reference_expired");
            const timestamp = clock();
            const context = readContext(database, residentId, npcId, timestamp);
            const world = getLingyeNpcWorldState(database, npcId);
            if (world.workStatus === "away" || context.locationId !== world.locationId)
                throw new Error("lingye_npc_not_present");
            const affinity = getResidentLingyeNpcAffinity(database, residentId, npcId);
            const available = availableLingyeNpcDialogues(npcId, context, affinity.value);
            const previous = database.prepare(`SELECT dialogue_id FROM lingye_npc_dialogue_sessions
              WHERE resident_id = ? AND npc_id = ? ORDER BY rowid DESC LIMIT 1`).get(residentId, npcId);
            let main = available.filter((candidate) => !candidate.context);
            if (main.length > 1) main = main.filter((candidate) => candidate.id !== previous?.dialogue_id);
            if (main.length === 0) throw new Error("lingye_npc_dialogue_unavailable");
            const selected = main[Math.floor(npcRandomFraction(random) * main.length)];
            const contextual = available.filter((candidate) => candidate.context);
            const extra = !selected.weather && contextual.length > 0
                ? contextual[Math.floor(npcRandomFraction(random) * contextual.length)] : null;
            return durable((setPublish) => {
                database.prepare(`INSERT INTO lingye_npc_dialogue_sessions
                  (session_id, resident_id, npc_id, catalog_version, dialogue_id, context_dialogue_id, status, started_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(sessionId, residentId, npcId, LINGYE_NPC_DIALOGUE_VERSION,
                    selected.id, extra?.id ?? null, selected.choices ? "awaiting_choice" : "completed", timestamp);
                const row = sessionRow(database, residentId, npcId, sessionId);
                if (!selected.choices) setPublish(complete(row, timestamp));
                return renderSession(database, sessionRow(database, residentId, npcId, sessionId));
            });
        },
        answer({ residentId, npcId, sessionId, choiceId }) {
            residentNpc(database, residentId, npcId);
            const row = sessionRow(database, residentId, npcId, sessionId);
            if (!row) throw new Error("lingye_npc_dialogue_not_found");
            const dialogue = getLingyeNpcDialogue(npcId, row.dialogue_id);
            if (!dialogue?.choices?.some((choice) => choice.choiceId === choiceId))
                throw new Error("lingye_npc_dialogue_choice_invalid");
            if (row.status === "completed") {
                if (row.choice_id !== choiceId) throw new Error("lingye_npc_dialogue_answer_conflict");
                return renderSession(database, row);
            }
            return durable((setPublish) => {
                database.prepare("UPDATE lingye_npc_dialogue_sessions SET choice_id = ? WHERE session_id = ?")
                    .run(choiceId, sessionId);
                setPublish(complete(row, clock()));
                return renderSession(database, sessionRow(database, residentId, npcId, sessionId));
            });
        },
    });
}

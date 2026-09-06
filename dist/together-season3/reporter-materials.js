import { isDeepStrictEqual } from "node:util";
import { buildInterviewReporterSource } from "./reporter-source.js";

const PRODUCER = "together:rain_not_yet:interviews";

export class TogetherInterviewMaterialError extends Error {
    constructor() {
        super("interview_material_source_invalid");
        this.code = "interview_material_source_invalid";
    }
}

function sourcePayload(row) {
    try {
        const fact = JSON.parse(row.fact_json);
        const payload = buildInterviewReporterSource({
            sourceId: row.source_id,
            kind: fact.kind,
            storyId: fact.storyId,
            eventId: fact.eventId,
            interviewId: fact.interviewId,
            reporterId: fact.reporterId,
            npc: fact.npc,
            startedAt: fact.startedAt,
            occurredAt: fact.occurredAt,
            phase: fact.phase,
            answers: fact.answers,
        });
        if (row.source_type !== payload.sourceType || row.producer_reference !== payload.producerReference
            || row.occurred_at !== payload.occurredAt || row.recorded_at !== payload.recordedAt
            || row.privacy_scope !== payload.privacyScope || row.public_subject !== payload.publicSubject
            || row.revision_reference !== payload.revisionReference || !isDeepStrictEqual(fact, payload.fact)
            || !isDeepStrictEqual(JSON.parse(row.allowed_numbers_json), payload.allowedNumbers))
            throw new TogetherInterviewMaterialError();
        return payload;
    }
    catch {
        throw new TogetherInterviewMaterialError();
    }
}

function materialFromRow(row) {
    const payload = sourcePayload(row);
    return {
        sourceId: payload.sourceId,
        category: "lingye_together",
        occurredAt: payload.occurredAt,
        title: `采访${payload.fact.npc.name}（${payload.fact.npc.species}）`,
        content: payload.fact.answers.map((answer) => {
            const metadata = JSON.stringify({ occurredAt: answer.occurredAt, phase: answer.phase });
            return `${metadata}\n${answer.question}\n${answer.answer}`;
        }).join("\n\n"),
    };
}

// The issue window is [start, end). A first issue needs no world-history cursor:
// individual answers already have their own immutable occurrence timestamp.
export function readInterviewReporterMaterials(database, { periodStart, periodEnd } = {}) {
    if (!Number.isSafeInteger(periodStart) || periodStart < 0 || !Number.isSafeInteger(periodEnd)
        || periodEnd <= periodStart)
        throw new TogetherInterviewMaterialError();
    return database.prepare(`SELECT * FROM career_reporter_source_facts
      WHERE producer_reference = ? AND source_type = 'public_event_fact'
        AND privacy_scope = 'public' AND occurred_at >= ? AND occurred_at < ?
      ORDER BY occurred_at, source_id`).all(PRODUCER, periodStart, periodEnd).map(materialFromRow);
}

// registerMaterials may retain this ID only when it is the exact projection of
// a previously registered authoritative interview, not a caller-selected alias.
export function assertRegisteredInterviewMaterial(database, material) {
    const row = database.prepare(`SELECT * FROM career_reporter_source_facts
      WHERE source_id = ? AND producer_reference = ?`).get(material.sourceId, PRODUCER);
    if (!row || !isDeepStrictEqual(materialFromRow(row), material))
        throw new TogetherInterviewMaterialError();
}

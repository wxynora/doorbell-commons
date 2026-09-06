import { isDeepStrictEqual } from "node:util";
import { listInterviewSources, validateInterviewSource } from "./interviews.js";

const SOURCE_TYPE = "public_event_fact";
const PRODUCER_REFERENCE = "together:rain_not_yet:interviews";
const FORWARDED_FAILURES = new Set([
    "reporter_source_conflict",
    "reporter_source_in_future",
    "reporter_source_recorded_before_occurrence",
]);

function invalidSource() {
    const error = new Error("interview_source_invalid");
    error.code = "interview_source_invalid";
    return error;
}

function verifySource(source) {
    try {
        return validateInterviewSource(source);
    }
    catch {
        throw invalidSource();
    }
}

// Each durable actual answer is the outbox fact. Its writer payload never uses
// a retry clock or future weather and never appends later answers to old facts.
export function buildInterviewReporterSource(source) {
    const verified = verifySource(source);
    return {
        sourceId: verified.sourceId,
        sourceType: SOURCE_TYPE,
        producerReference: PRODUCER_REFERENCE,
        occurredAt: verified.occurredAt,
        recordedAt: verified.occurredAt,
        publicSubject: verified.npc.name,
        privacyScope: "public",
        revisionReference: null,
        allowedNumbers: [],
        fact: {
            kind: verified.kind,
            storyId: verified.storyId,
            eventId: verified.eventId,
            interviewId: verified.interviewId,
            reporterId: verified.reporterId,
            npc: verified.npc,
            startedAt: verified.startedAt,
            occurredAt: verified.occurredAt,
            phase: verified.phase,
            answers: verified.answers,
        },
    };
}

function validReceipt(receipt, payload) {
    return receipt !== null && typeof receipt === "object"
        && Object.keys(payload).every((key) => isDeepStrictEqual(receipt[key], payload[key]));
}

// Call only after the interview's world commit succeeds. registerSource is the
// existing synchronous trusted writer. Persisting the returned acknowledgement
// is optional: a lost acknowledgement safely replays the same immutable fact.
export function syncInterviewReporterSources(interviewState, { registerSource, acknowledgedIds = [] } = {}) {
    if (typeof registerSource !== "function" || !Array.isArray(acknowledgedIds)
        || acknowledgedIds.some((id) => typeof id !== "string" || id.trim().length === 0))
        throw invalidSource();
    const acknowledged = new Set(acknowledgedIds);
    const registeredIds = [];
    const failures = [];
    for (const source of listInterviewSources(interviewState)) {
        if (acknowledged.has(source.sourceId))
            continue;
        try {
            const payload = buildInterviewReporterSource(source);
            const receipt = registerSource(payload);
            if (!validReceipt(receipt, payload)) {
                failures.push({ sourceId: source.sourceId, code: "interview_source_receipt_invalid" });
                continue;
            }
            acknowledged.add(source.sourceId);
            registeredIds.push(source.sourceId);
        }
        catch (error) {
            const code = FORWARDED_FAILURES.has(error?.code) ? error.code : "interview_source_sync_unavailable";
            failures.push({ sourceId: source.sourceId, code });
        }
    }
    return { acknowledgedIds: [...acknowledged], registeredIds, failures };
}

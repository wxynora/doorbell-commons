import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const content = JSON.parse(readFileSync(new URL("../../content/together-season3-interviews.json", import.meta.url), "utf8"));
const STORY_ID = "rain_not_yet";
const PHASES = new Map([["preparation", 0], ["flood", 1], ["recovery", 2], ["ended", 3]]);
const ENDINGS = new Set(["one_sign", "next_door", "public_kitchen"]);
const TEA_STATES = new Set(["open", "delivered", "closed"]);
const PREPARATION_DELIVERY = new Set(["both", "pancake_only", "rice_ball_only", "neither"]);
const WEATHER = new Set(["sunny", "cloudy", "light_rain", "heavy_rain", "thunderstorm", "fog", "hot", "dry_wind", "light_snow", "blizzard"]);
const REFERENCE_KINDS = new Set(["nature_event", "second_story", "delivery"]);
const CONTEXT_KEYS = new Set(["secondEnding", "teaStatus", "preparationDelivery", "weatherCondition", "publicFactReferences"]);
const npcById = new Map(content.npcs.map((npc) => [npc.id, npc]));
const clone = (value) => structuredClone(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const timestamp = (value) => Number.isSafeInteger(value) && value >= 0;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export class TogetherInterviewStateError extends Error {
    constructor() {
        super("interview_state_invalid");
        this.code = "interview_state_invalid";
    }
}

function failure(code, messageKey) {
    return { ok: false, changed: false, code, ...(messageKey ? { text: content.messages[messageKey] } : {}) };
}

function interviewId(eventId, npcId) {
    return `together-interview:${STORY_ID}:${encodeURIComponent(eventId)}:${npcId}`;
}

function questionSourceId(recordId, questionId) {
    return `${recordId}:question:${questionId}`;
}

function readState(state) {
    if (!object(state) || state.version !== 1 || state.storyId !== STORY_ID || !nonEmpty(state.eventId) || !Array.isArray(state.interviews))
        throw new TogetherInterviewStateError();
    const npcs = new Set();
    const counts = new Map();
    for (const record of state.interviews) {
        const npc = npcById.get(record?.npcId);
        if (!npc || npcs.has(record.npcId) || !nonEmpty(record.reporterId)
            || record.interviewId !== interviewId(state.eventId, record.npcId)
            || !timestamp(record.startedAt) || !PHASES.has(record.startedPhase)
            || record.startedPhase === "ended" || !Array.isArray(record.answers) || record.answers.length === 0)
            throw new TogetherInterviewStateError();
        npcs.add(record.npcId);
        counts.set(record.reporterId, (counts.get(record.reporterId) ?? 0) + 1);
        if (counts.get(record.reporterId) > 3)
            throw new TogetherInterviewStateError();
        const questions = new Set();
        for (const answer of record.answers) {
            const question = npc.questions.find((entry) => entry.id === answer?.questionId);
            if (!question || questions.has(answer.questionId) || !nonEmpty(answer.question) || !nonEmpty(answer.answer)
                || !timestamp(answer.occurredAt) || !PHASES.has(answer.phase) || answer.phase === "ended"
                || answer.sourceId !== questionSourceId(record.interviewId, question.id)
                || !readContext(answer.context) || (question.requires && !questions.has(question.requires)))
                throw new TogetherInterviewStateError();
            questions.add(answer.questionId);
        }
    }
    return state;
}

// This module never accepts a whole farm, patient record or arbitrary metadata.
// The caller derives this public-only context from the authoritative world.
function readContext(value) {
    if (!object(value) || Object.keys(value).some((key) => !CONTEXT_KEYS.has(key)))
        return null;
    if (value.secondEnding !== undefined && !ENDINGS.has(value.secondEnding))
        return null;
    if (value.teaStatus !== undefined && !TEA_STATES.has(value.teaStatus))
        return null;
    if (value.preparationDelivery !== undefined && !PREPARATION_DELIVERY.has(value.preparationDelivery))
        return null;
    if (value.weatherCondition !== undefined && !WEATHER.has(value.weatherCondition))
        return null;
    if (value.publicFactReferences !== undefined && (!Array.isArray(value.publicFactReferences)
        || value.publicFactReferences.some((reference) => !object(reference)
            || Object.keys(reference).some((key) => key !== "kind" && key !== "id")
            || !REFERENCE_KINDS.has(reference.kind) || !nonEmpty(reference.id))))
        return null;
    return clone(value);
}

export function createInterviewState({ eventId } = {}) {
    if (!nonEmpty(eventId))
        throw new TogetherInterviewStateError();
    return { version: 1, storyId: STORY_ID, eventId, interviews: [] };
}

function questionForPhase(question, phase) {
    return { ...question, ...question.phaseOverrides?.[phase] };
}

function answerText(question, context, phase) {
    return question.answer ?? question.answers?.variants[
        question.answers.by === "phase" ? phase : context[question.answers.by]
    ];
}

function questionOptions(npc, record, phase) {
    const asked = new Set(record?.answers.map((answer) => answer.questionId) ?? []);
    return npc.questions.filter((question) => !asked.has(question.id)
        && (!question.requires || asked.has(question.requires)))
        .map((question) => ({ questionId: question.id, text: questionForPhase(question, phase).text }));
}

function npcOption(npc, record, phase) {
    return {
        npcId: npc.id,
        name: npc.name,
        species: npc.species,
        questions: questionOptions(npc, record, phase),
        ...(record ? { interviewId: record.interviewId } : {}),
    };
}

export function interviewOpeningText(npcId, phase) {
    const npc = npcById.get(npcId);
    if (!npc || !nonEmpty(npc.opening))
        throw new TogetherInterviewStateError();
    return `${npc.name}：${npc.openingByPhase?.[phase] ?? npc.opening}`;
}

export function completedInterviewTaskMessage() {
    return content.messages.completed_by_other;
}

export function listInterviewNpcs(state, { phase, reporterId } = {}) {
    readState(state);
    if (!PHASES.has(phase) || !nonEmpty(reporterId))
        return failure("interview_input_invalid");
    const own = state.interviews.filter((record) => record.reporterId === reporterId);
    const remainingCapacity = 3 - own.length;
    const started = new Map(state.interviews.map((record) => [record.npcId, record]));
    const available = phase === "ended" || remainingCapacity === 0 ? [] : content.npcs
        .filter((npc) => PHASES.get(npc.phase) <= PHASES.get(phase) && !started.has(npc.id))
        .map((npc) => npcOption(npc, undefined, phase));
    const inProgress = phase === "ended" ? [] : own.filter((record) => questionOptions(npcById.get(record.npcId), record).length > 0)
        .map((record) => npcOption(npcById.get(record.npcId), record, phase));
    return { ok: true, available, inProgress, remainingCapacity, text: content.messages.select };
}

export function getInterviewRecord(state, { reporterId, npcId } = {}) {
    readState(state);
    if (!nonEmpty(reporterId) || !npcById.has(npcId))
        return null;
    const record = state.interviews.find((entry) => entry.npcId === npcId && entry.reporterId === reporterId);
    return record ? clone(record) : null;
}

export function listOwnInterviewRecords(state, { reporterId } = {}) {
    readState(state);
    if (!nonEmpty(reporterId))
        return [];
    return clone(state.interviews.filter((record) => record.reporterId === reporterId));
}

function sourceFor(state, record, answer) {
    const npc = npcById.get(record.npcId);
    return {
        sourceId: answer.sourceId,
        kind: "together_npc_interview",
        storyId: state.storyId,
        eventId: state.eventId,
        interviewId: record.interviewId,
        reporterId: record.reporterId,
        npc: { id: npc.id, name: npc.name, species: npc.species },
        startedAt: record.startedAt,
        occurredAt: answer.occurredAt,
        phase: answer.phase,
        answers: [clone(answer)],
    };
}

// Each actual answer is independently immutable and available immediately.
// Validate the whole authoritative record first, including follow-up order;
// never synthesize a missing prerequisite while projecting an individual source.
export function listInterviewSources(state) {
    readState(state);
    return state.interviews.flatMap((record) => record.answers.map((answer) => sourceFor(state, record, answer)));
}

// This validates one already-produced source, not permission to ask a question.
// Asking and its prerequisites are checked against the full record above.
export function validateInterviewSource(source) {
    const npc = npcById.get(source?.npc?.id);
    const answer = source?.answers?.[0];
    const question = npc?.questions.find((entry) => entry.id === answer?.questionId);
    const context = readContext(answer?.context);
    const expectedId = nonEmpty(source?.eventId) && npc ? interviewId(source.eventId, npc.id) : null;
    if (!question || !context || !Array.isArray(source.answers) || source.answers.length !== 1
        || source.storyId !== STORY_ID || !nonEmpty(source.reporterId) || source.interviewId !== expectedId
        || !timestamp(source.startedAt) || !timestamp(answer.occurredAt) || source.startedAt > answer.occurredAt
        || !PHASES.has(answer.phase) || answer.phase === "ended"
        || PHASES.get(npc.phase) > PHASES.get(answer.phase)
        || answer.sourceId !== questionSourceId(expectedId, question.id)
        // Previously saved approved copy remains valid, but new copy must match
        // both the question and answer for its recorded phase as one pair.
        || ![question, questionForPhase(question, answer.phase)].some((approved) =>
            answer.question === approved.text && answer.answer === answerText(approved, context, answer.phase)))
        throw new TogetherInterviewStateError();
    const expectedAnswer = { questionId: question.id, question: answer.question, answer: answer.answer,
        occurredAt: answer.occurredAt, phase: answer.phase, context, sourceId: answer.sourceId };
    if (!isDeepStrictEqual(answer, expectedAnswer)) throw new TogetherInterviewStateError();
    const expected = sourceFor({ storyId: STORY_ID, eventId: source.eventId },
        { interviewId: expectedId, npcId: npc.id, reporterId: source.reporterId, startedAt: source.startedAt }, expectedAnswer);
    if (!isDeepStrictEqual(expected, source)) throw new TogetherInterviewStateError();
    return expected;
}

export function answerInterviewQuestion(state, input = {}) {
    readState(state);
    const { reporterId, npcId, questionId, phase, occurredAt } = input;
    const npc = npcById.get(npcId);
    const question = npc?.questions.find((entry) => entry.id === questionId);
    if (!nonEmpty(reporterId) || !question)
        return failure("interview_input_invalid");
    const current = state.interviews.find((record) => record.npcId === npcId);
    if (current && current.reporterId !== reporterId) {
        const inProgress = questionOptions(npc, current).length > 0;
        return failure(inProgress ? "interview_in_progress" : "interview_completed",
            inProgress ? "in_progress_by_other" : "completed_by_other");
    }
    const previous = current?.answers.find((answer) => answer.questionId === questionId);
    if (previous)
        return { ok: true, changed: false, replayed: true, record: clone(current), answer: clone(previous), text: content.messages.replay };
    if (!PHASES.has(phase) || !timestamp(occurredAt))
        return failure("interview_input_invalid");
    if (phase === "ended")
        return failure("interview_closed");
    if (PHASES.get(npc.phase) > PHASES.get(phase))
        return failure("interview_not_open");
    if (current && (occurredAt < current.answers.at(-1).occurredAt
        || PHASES.get(phase) < PHASES.get(current.answers.at(-1).phase)))
        return failure("interview_context_invalid");
    if (!current && state.interviews.filter((record) => record.reporterId === reporterId).length >= 3)
        return failure("interview_limit_reached", "limit_reached");
    if (question.requires && !current?.answers.some((answer) => answer.questionId === question.requires))
        return failure("interview_question_unavailable");
    const context = readContext(input.context ?? {});
    if (!context)
        return failure("interview_context_invalid");
    const selectedQuestion = questionForPhase(question, phase);
    const answer = answerText(selectedQuestion, context, phase);
    if (!nonEmpty(answer))
        return failure("interview_context_unavailable");
    const next = current ? clone(current) : {
        interviewId: interviewId(state.eventId, npcId),
        npcId,
        reporterId,
        startedAt: occurredAt,
        startedPhase: phase,
        answers: [],
    };
    const answered = { questionId, question: selectedQuestion.text, answer, occurredAt, phase, context,
        sourceId: questionSourceId(next.interviewId, questionId) };
    next.answers.push(answered);
    // One synchronous assignment after all validation. The outer store must
    // serialize this mutation with its single world commit before publishing it.
    state.interviews = current ? state.interviews.map((record) => record === current ? next : record) : [...state.interviews, next];
    return { ok: true, changed: true, replayed: false, record: clone(next), answer: clone(answered),
        ...(questionOptions(npc, next).length === 0 ? { text: content.messages.finished } : {}) };
}

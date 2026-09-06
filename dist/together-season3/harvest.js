// An event-linked receipt for the existing harvest counter. This module
// never harvests, reveals a crop, grants rewards, or writes storage itself.
import { createHash } from "node:crypto";
import { normalizeTogetherSeason3State } from "./runtime.js";

const LEDGER = "togetherSeason3HarvestReceipts";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value) => typeof value === "string" && value.length > 0;
const isTime = (value) => Number.isFinite(value) && value >= 0;
const clone = (value) => structuredClone(value);
const stableId = (...values) => `season3-harvest:${createHash("sha256").update(JSON.stringify(values)).digest("hex")}`;

export class TogetherSeason3HarvestError extends Error {
    constructor(code) {
        super(code);
        this.name = "TogetherSeason3HarvestError";
        this.code = code;
    }
}

function requireValue(condition, code = "season3_harvest_contract_unavailable") {
    if (!condition) throw new TogetherSeason3HarvestError(code);
}

function harvestCount(farm) {
    requireValue(isRecord(farm) && isId(farm.id));
    const count = farm.harvested ?? 0;
    requireValue(Number.isSafeInteger(count) && count >= 0);
    return count;
}

function readReceipts(farm) {
    const ledger = farm[LEDGER];
    if (ledger === undefined) return [];
    requireValue(isRecord(ledger));
    return Object.entries(ledger).map(([key, value]) => {
        requireValue(isRecord(value) && value.version === 1 && value.sourceId === key
            && isId(value.farmId) && isId(value.eventId)
            && Number.isSafeInteger(value.fromCount) && value.fromCount >= 0
            && Number.isSafeInteger(value.toCount) && value.toCount > value.fromCount
            && isTime(value.capturedAt) && isTime(value.occurredAt) && value.occurredAt >= value.capturedAt);
        requireValue(key === stableId(value.eventId, value.farmId, value.fromCount, value.toCount));
        return value;
    });
}

export function captureSeason3Harvest({ farm, state: raw, now = Date.now() }) {
    const state = normalizeTogetherSeason3State(raw);
    if (state === null || state.phase === "ended") return null;
    requireValue(isTime(now) && now >= state.startedAt);
    const beforeHarvested = harvestCount(farm);
    return { farmId: farm.id, eventId: state.eventId, beforeHarvested, at: now };
}

function sourceInput(entry, now) {
    return {
        eventId: entry.eventId, farmId: entry.farmId, kind: "harvest", sourceId: entry.sourceId,
        occurredAt: entry.occurredAt, successful: true, now,
    };
}

function unchanged(farm, reason = null) {
    return { ok: true, changed: false, replayed: false, farm: clone(farm), receipt: null, source: null,
        ...(reason === null ? {} : { reason }) };
}

export function recordSeason3Harvest({ farm, state: raw, capture, now = Date.now() }) {
    try {
        if (capture === null || capture === undefined) return unchanged(farm);
        const state = normalizeTogetherSeason3State(raw);
        requireValue(isRecord(capture) && isId(capture.farmId) && isId(capture.eventId)
            && Number.isSafeInteger(capture.beforeHarvested)
            && capture.beforeHarvested >= 0 && isTime(capture.at) && isTime(now) && now >= capture.at);
        const afterHarvested = harvestCount(farm);
        requireValue(farm.id === capture.farmId, "season3_harvest_farm_mismatch");
        if (state === null || state.eventId !== capture.eventId) return unchanged(farm, "episode_not_current");
        requireValue(capture.at >= state.startedAt);
        const saved = readReceipts(farm);
        const prior = saved.find((entry) => entry.eventId === capture.eventId && entry.farmId === farm.id
            && entry.fromCount === capture.beforeHarvested
            && entry.capturedAt === capture.at);
        if (prior) {
            requireValue(afterHarvested >= prior.toCount, "season3_harvest_counter_regressed");
            return { ok: true, changed: false, replayed: true, farm: clone(farm), receipt: clone(prior), source: sourceInput(prior, now) };
        }
        if (state.phase === "ended") return unchanged(farm, "episode_ended");
        requireValue(afterHarvested >= capture.beforeHarvested, "season3_harvest_counter_regressed");
        if (afterHarvested === capture.beforeHarvested) return unchanged(farm);
        // Captures bracket one authoritative action. A stale or nested capture
        // must not claim an overlapping range that was already attributed.
        requireValue(!saved.some((entry) => entry.eventId === capture.eventId && entry.farmId === farm.id
            && entry.fromCount < afterHarvested && capture.beforeHarvested < entry.toCount), "season3_harvest_overlap");
        const sourceId = stableId(capture.eventId, farm.id, capture.beforeHarvested, afterHarvested);
        const receipt = {
            version: 1, sourceId, eventId: capture.eventId, farmId: farm.id,
            fromCount: capture.beforeHarvested, toCount: afterHarvested,
            capturedAt: capture.at, occurredAt: now,
        };
        const staged = clone(farm);
        staged[LEDGER] = { ...(staged[LEDGER] ?? {}), [sourceId]: receipt };
        return { ok: true, changed: true, replayed: false, farm: staged, receipt: clone(receipt), source: sourceInput(receipt, now) };
    }
    catch (error) {
        return { ok: false, changed: false, replayed: false, farm: clone(farm), receipt: null, source: null,
            code: error instanceof TogetherSeason3HarvestError ? error.code : "season3_harvest_contract_unavailable" };
    }
}

export function collectSeason3HarvestReceipts({ farm, state: raw, now = Date.now() }) {
    const state = normalizeTogetherSeason3State(raw);
    if (state === null) return [];
    requireValue(isTime(now) && isRecord(farm) && isId(farm.id));
    const currentCount = harvestCount(farm);
    return readReceipts(farm).filter((entry) => entry.farmId === farm.id && entry.eventId === state.eventId
        && entry.occurredAt >= state.startedAt && entry.occurredAt <= now
        && (state.endedAt === null || entry.occurredAt < state.endedAt)
        && entry.toCount <= currentCount && entry.capturedAt >= state.startedAt)
        .sort((left, right) => left.occurredAt - right.occurredAt || left.fromCount - right.fromCount)
        .map((entry) => sourceInput(entry, now));
}

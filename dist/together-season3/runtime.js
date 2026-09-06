// Season 3 stores facts only. The parent adapter owns text, authentication,
// nature advancement, and the single durable commit of this state and farms.
import { createHash } from "node:crypto";

export const TOGETHER_SEASON3_STORY_ID = "rain_not_yet";
export const TOGETHER_SEASON3_VERSION = 1;
const PHASES = ["preparation", "flood", "recovery", "ended"];
const NATURE_PHASE = { forecast: "preparation", active: "flood", recovery: "recovery", settled: "ended" };
const PREVIOUS_ENDINGS = new Set(["one_sign", "next_door", "public_kitchen"]);
const SOURCE_KINDS = new Set(["harvest", "flood_fish", "agronomy", "veterinary", "interview"]);
const DISH_NEEDS = [
    { id: "preparation_pancake", phase: "preparation", recipeId: "scallion_pancake", dishName: "葱油饼" },
    { id: "preparation_rice_ball", phase: "preparation", recipeId: "fish_rice_ball", dishName: "鱼肉饭团" },
    { id: "flood_tea", phase: "flood", recipeId: "honey_tea", dishName: "蜂蜜茶" },
];
const copy = (value) => value == null ? value : structuredClone(value);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) => typeof value === "string" && value.trim().length > 0;
const timestamp = (value) => Number.isFinite(value) && value >= 0;
const stableId = (...parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const dayStart = (day) => day * 86_400_000 - 8 * 3_600_000;

export class TogetherSeason3RuntimeError extends Error {
    constructor(code) {
        super(code);
        this.name = "TogetherSeason3RuntimeError";
        this.code = code;
    }
}

function requireValue(condition, code) {
    if (!condition) throw new TogetherSeason3RuntimeError(code);
}

function failed(state, code, farm) {
    return { ok: false, changed: false, replayed: false, state: copy(state), ...(farm === undefined ? {} : { farm: copy(farm) }), code };
}

function changed(before, after) {
    return JSON.stringify(before) !== JSON.stringify(after);
}

function attempt(state, farm, operation) {
    try {
        return operation();
    }
    catch (error) {
        if (!(error instanceof TogetherSeason3RuntimeError)) throw error;
        return failed(state, error.code, farm);
    }
}

export function normalizeTogetherSeason3State(raw) {
    if (raw == null) return null;
    requireValue(object(raw) && raw.version === TOGETHER_SEASON3_VERSION && raw.storyId === TOGETHER_SEASON3_STORY_ID,
        "invalid_season3_state");
    requireValue(id(raw.eventId) && PHASES.includes(raw.phase) && timestamp(raw.startedAt), "invalid_season3_state");
    requireValue(object(raw.previousStory) && raw.previousStory.storyId === "same_kitchen"
        && PREVIOUS_ENDINGS.has(raw.previousStory.endingId) && timestamp(raw.previousStory.endedAt), "invalid_season3_state");
    requireValue(raw.phase === "ended" ? timestamp(raw.endedAt) : raw.endedAt === null, "invalid_season3_state");
    for (const key of ["deliveries", "contributions", "receipts", "history"])
        requireValue(Array.isArray(raw[key]), "invalid_season3_state");
    requireValue(raw.deliveries.every((entry) => object(entry) && id(entry.deliveryId) && id(entry.farmId)
        && DISH_NEEDS.some((need) => need.id === entry.needId) && timestamp(entry.deliveredAt)), "invalid_season3_state");
    requireValue(raw.contributions.every((entry) => object(entry) && id(entry.contributionId) && id(entry.farmId)
        && id(entry.kind) && id(entry.sourceId) && timestamp(entry.occurredAt)), "invalid_season3_state");
    requireValue(raw.receipts.every((entry) => object(entry) && id(entry.farmId) && id(entry.requestId)
        && id(entry.fingerprint) && id(entry.resultId) && entry.kind === "delivery"), "invalid_season3_state");
    requireValue(raw.history.every((entry) => object(entry) && id(entry.historyId) && id(entry.kind)
        && timestamp(entry.observedAt)), "invalid_season3_state");
    // Additional independently owned state (notably interviews) survives intact.
    return copy(raw);
}

function eventFromNature(nature, eventId, activating = false) {
    requireValue(object(nature) && nature.status === "active", "nature_authority_unavailable");
    const candidates = [nature.currentEvent, nature.storyEvent, ...(Array.isArray(nature.settledEvents) ? nature.settledEvents : [])]
        .filter((event) => object(event) && event.eventId === eventId);
    requireValue(candidates.length === 1, "nature_event_unavailable");
    const event = candidates[0];
    requireValue(event.type === "flood" && id(event.eventId) && NATURE_PHASE[event.phase], "nature_event_unavailable");
    requireValue(!activating || ([nature.currentEvent, nature.storyEvent].includes(event) && event.phase !== "settled"), "nature_event_unavailable");
    const authorityDay = event.phase === "forecast" ? event.forecastedAtDay
        : event.phase === "active" ? event.activatedAtDay
        : event.phase === "recovery" ? event.recoveryAtDay : event.settledAtDay;
    requireValue(Number.isSafeInteger(authorityDay), "nature_authority_unavailable");
    return { event, phase: NATURE_PHASE[event.phase], authorityAt: dayStart(authorityDay) };
}

function addPhaseHistory(state, fact, now) {
    state.history.push({
        historyId: stableId(state.storyId, state.eventId, "phase", fact.phase),
        kind: "phase", phase: fact.phase, authorityPhase: fact.event.phase,
        authorityAt: fact.authorityAt, observedAt: now,
    });
}

function advanceOrThrow(raw, nature, now) {
    const state = normalizeTogetherSeason3State(raw);
    requireValue(state !== null, "season3_not_active");
    requireValue(timestamp(now) && now >= state.startedAt, "invalid_season3_time");
    if (state.phase === "ended") return state;
    const fact = eventFromNature(nature, state.eventId);
    requireValue(fact.authorityAt <= now, "nature_authority_unavailable");
    requireValue(PHASES.indexOf(fact.phase) >= PHASES.indexOf(state.phase), "nature_phase_regressed");
    if (fact.phase === state.phase) return state;
    state.phase = fact.phase;
    // Nature records settlement at Beijing-day precision. Keep that day in the
    // history, but do not backdate the story ending to midnight and discard real
    // contributions that occurred earlier on the same settlement day.
    if (fact.phase === "ended") state.endedAt = now;
    // An offline interval creates only the newly observed phase, never fabricated
    // preparations, actions, or intermediate story attendance.
    addPhaseHistory(state, fact, now);
    return state;
}

export function activateTogetherSeason3({ enabled = false, state = null, previousStory, nature, now = Date.now() } = {}) {
    return attempt(state, undefined, () => {
        requireValue(enabled === true, "season3_not_enabled");
        if (state !== null) {
            const next = advanceOrThrow(state, nature, now);
            return { ok: true, changed: changed(state, next), replayed: true, state: next };
        }
        requireValue(object(previousStory) && previousStory.storyId === "same_kitchen"
            && ["ended", "vote", "closed"].includes(previousStory.phase)
            && PREVIOUS_ENDINGS.has(previousStory.endingId) && timestamp(previousStory.endedAt), "previous_story_not_completed");
        requireValue(timestamp(now) && now >= previousStory.endedAt, "invalid_season3_time");
        const event = nature?.storyEvent ?? nature?.currentEvent;
        requireValue(id(event?.eventId), "nature_event_unavailable");
        const fact = eventFromNature(nature, event.eventId, true);
        requireValue(fact.authorityAt <= now, "nature_authority_unavailable");
        const next = {
            version: TOGETHER_SEASON3_VERSION, storyId: TOGETHER_SEASON3_STORY_ID,
            eventId: fact.event.eventId, phase: fact.phase, startedAt: now, endedAt: null,
            previousStory: { storyId: previousStory.storyId, endingId: previousStory.endingId, endedAt: previousStory.endedAt },
            deliveries: [], contributions: [], receipts: [], history: [],
        };
        addPhaseHistory(next, fact, now);
        return { ok: true, changed: true, replayed: false, state: next };
    });
}

export function advanceTogetherSeason3(state, nature, now = Date.now()) {
    return attempt(state, undefined, () => {
        const next = advanceOrThrow(state, nature, now);
        return { ok: true, changed: changed(state, next), replayed: false, state: next };
    });
}

export function togetherSeason3DishNeeds(raw, farmId = null) {
    const state = normalizeTogetherSeason3State(raw);
    if (state === null) return [];
    return DISH_NEEDS.map((need) => {
        const deliveries = state.deliveries.filter((entry) => entry.needId === need.id);
        const sharedMeal = need.id === "preparation_pancake";
        const ownDelivery = sharedMeal && farmId !== null
            ? deliveries.find((entry) => entry.farmId === farmId) : null;
        const delivery = ownDelivery ?? deliveries[0];
        const status = sharedMeal
            ? ownDelivery ? "delivered" : state.phase === "ended" ? "closed" : "open"
            : delivery ? "delivered"
            : PHASES.indexOf(state.phase) > PHASES.indexOf(need.phase) ? "closed"
            : state.phase !== need.phase ? "not_open" : "open";
        return { ...need, quantity: 1, status, delivery: copy(delivery ?? null), deliveries: copy(deliveries) };
    });
}

function receipt(state, farmId, requestId, fingerprint) {
    requireValue(id(farmId) && id(requestId), "invalid_season3_request");
    const prior = state.receipts.find((entry) => entry.farmId === farmId && entry.requestId === requestId);
    if (prior) requireValue(prior.fingerprint === fingerprint, "season3_idempotency_conflict");
    return prior;
}

function appendContribution(state, { farmId, kind, sourceId, occurredAt }) {
    const contributionId = stableId(state.storyId, state.eventId, kind, sourceId);
    const prior = state.contributions.find((entry) => entry.contributionId === contributionId);
    if (prior) {
        requireValue(prior.farmId === farmId && prior.occurredAt === occurredAt, "season3_source_conflict");
        return { contribution: prior, replayed: true };
    }
    const contribution = { contributionId, eventId: state.eventId, farmId, kind, sourceId, occurredAt };
    state.contributions.push(contribution);
    return { contribution, replayed: false };
}

export function deliverTogetherSeason3Dish(raw, farm, { needId, dishSelector, requestId, now = Date.now() }, nature) {
    return attempt(raw, farm, () => {
        const state = advanceOrThrow(raw, nature, now);
        requireValue(object(farm) && id(farm.id) && id(needId) && id(dishSelector), "invalid_season3_request");
        const fingerprint = stableId("delivery", farm.id, needId, dishSelector);
        const prior = receipt(state, farm.id, requestId, fingerprint);
        if (prior) {
            const delivery = state.deliveries.find((entry) => entry.deliveryId === prior.resultId);
            requireValue(prior.kind === "delivery" && delivery, "invalid_season3_state");
            return { ok: true, changed: changed(raw, state), replayed: true, state, farm: copy(farm), delivery: copy(delivery) };
        }
        const need = togetherSeason3DishNeeds(state, farm.id).find((entry) => entry.id === needId);
        requireValue(need, "season3_dish_need_not_found");
        requireValue(need.status !== "delivered", "season3_dish_already_delivered");
        requireValue(need.status !== "closed", "season3_dish_window_closed");
        requireValue(need.status === "open", "season3_dish_not_open");
        const dishes = farm.ranch?.kitchen?.dishes;
        requireValue(Array.isArray(dishes), "season3_dish_not_found");
        const query = dishSelector.trim();
        const index = dishes.findIndex((dish) => object(dish) && dish.recipeId === need.recipeId
            && dish.name === need.dishName && [dish.id, dish.recipeId, dish.name].includes(query));
        requireValue(index >= 0 && id(dishes[index].id), "season3_dish_not_found");
        const nextFarm = copy(farm);
        const [dish] = nextFarm.ranch.kitchen.dishes.splice(index, 1);
        const deliveryId = needId === "preparation_pancake"
            ? stableId(state.storyId, state.eventId, "delivery", needId, farm.id)
            : stableId(state.storyId, state.eventId, "delivery", needId);
        const delivery = {
            deliveryId, eventId: state.eventId, needId, farmId: farm.id, dishId: dish.id,
            recipeId: need.recipeId, phase: state.phase, deliveredAt: now,
        };
        state.deliveries.push(delivery);
        state.receipts.push({ kind: "delivery", farmId: farm.id, requestId, fingerprint, resultId: deliveryId });
        appendContribution(state, { farmId: farm.id, kind: "dish", sourceId: deliveryId, occurredAt: now });
        state.history.push({ historyId: deliveryId, kind: "delivery", referenceId: deliveryId, observedAt: now });
        return { ok: true, changed: true, replayed: false, state, farm: nextFarm, delivery: copy(delivery) };
    });
}

// This is a server-only receipt boundary, never a parser for a player request.
// The parent proves the original authority outcome and actor before calling it.
// No money, work experience, health state, or article is generated here.
export function recordTogetherSeason3Source(raw, { eventId, farmId, kind, sourceId, occurredAt, successful, now = Date.now() }, nature) {
    return attempt(raw, undefined, () => {
        const state = advanceOrThrow(raw, nature, now);
        requireValue(eventId === state.eventId && id(farmId) && SOURCE_KINDS.has(kind) && id(sourceId), "invalid_season3_source");
        requireValue(successful === true, "season3_source_not_successful");
        requireValue(timestamp(occurredAt) && occurredAt <= now && occurredAt >= state.startedAt, "invalid_season3_source");
        const prior = state.contributions.find((entry) => entry.contributionId === stableId(state.storyId, state.eventId, kind, sourceId));
        if (!prior) {
            // A durable pre-ending receipt may reconcile after a restart; a real
            // action occurring after the ending never reopens episode rewards.
            requireValue(state.endedAt === null || occurredAt < state.endedAt, "season3_ended");
        }
        const { contribution, replayed } = appendContribution(state, { farmId, kind, sourceId, occurredAt });
        if (!replayed)
            state.history.push({ historyId: contribution.contributionId, kind: "source", referenceId: contribution.contributionId, observedAt: now });
        return { ok: true, changed: changed(raw, state), replayed, state, contribution: copy(contribution) };
    });
}

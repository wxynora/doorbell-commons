import {cloneFarmForMutation} from "./farm-mutation-scope.js";
// P4 正式玩法接线：部署激活、北京时间日界推进、P3 地块/病例、钓鱼与恢复结算。
import { createHash } from "node:crypto";
import { advancePlotRecovery } from './nature/recovery.js';
import { advanceFarmGrowth } from './domain/field/progression.js';
import { advanceWeatherForFarm } from './domain/nature/day-transition.js';
import { initializeFarmWeather } from './domain/nature/initialize-farm-weather.js';
import { neighborhoodWeatherTerrain } from './domain/nature/neighborhood.js';
import { advanceWinterAnimalCases, advanceWinterEvent, finishWinterEvent } from './domain/nature/winter-event.js';
import { reconcileWinterFarmImpacts, reconcileWinterFarmsImpacts } from './domain/nature/winter-impacts.js';
import { advanceFloodWaterline } from './domain/nature/flood-waterline.js';
import { floodedPlotIds } from './domain/nature/weather-upgrade.js';
import { recordWinterNoticeFacts, snapshotWinterNoticeState } from './domain/nature/notification-facts.js';
import { preflightP3WeatherEnable } from './domain/nature/p3-enable-preflight.js';
import { fishingFish } from "./content.js";
import { FLOOD_FISH_COLLECTED_TEXT, grantFloodFish } from "./fishing.js";
import {
    NatureContractError,
    activateNatureWorld,
    advanceNatureWorld,
    beijingDayIndex,
    beijingDayStart,
    ecologicalSeasonForDay,
    enableWeatherGeneration,
    plannedWeatherForDay,
    markNatureEventReadyForSettlement,
    normalizeNatureWorld,
    ongoingNatureEvents,
    findNatureEvent,
    registerNatureImpact,
    resolveNatureImpact,
} from "./nature.js";
import {
    commitNatureWorld,
    getNatureWorld,
    readNatureWorld,
    getPublicExpeditionWorld,
    readPublicExpeditionWorld,
    playerFarms,
    replaceFarmsAndNatureAtomic,
} from "./store.js";
import {
    addNatureAgronomyIssue,
    addNatureAnimalCase,
    advanceP3Farm,
    generateP3AnimalAfterWeather,
    agronomyIssuesForFarm,
    currentP3Sources,
} from "./career/p3-world.js";

const DAY_MS = 86_400_000;
const P4_STATE_VERSION = 1;
export const NATURE_GAMEPLAY_ADAPTER_VERSION = 1;
const SEASON_ID_BY_NAME = Object.freeze({ "春": "spring", "夏": "summer", "秋": "autumn", "冬": "winter" });

export const NATURE_ACTIVATION_DATE_ENV = "AIFARM_NATURE_ACTIVATION_DATE";
export const NATURE_SEED_ENV = "AIFARM_NATURE_SEED";
export const P4_ANIMAL_EVENT_CHANCES = Object.freeze({
    floodWithUndrainedPlots: 0.20,
    floodAfterManualDrainage: 0.05,
    droughtAfterTwoDays: 0.10,
});
const FIRST_TOGETHER_FLOOD_ANIMAL_CHANCE = 0.20;

function stableInteger(...parts) {
    return createHash("sha256").update(parts.join(":"), "utf8").digest().readUInt32BE(0);
}

function stableChance(probability, ...parts) {
    return stableInteger(...parts) / 0x1_0000_0000 < probability;
}

function timestampForBeijingDate(value) {
    const text = String(value ?? "").trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match)
        throw new NatureContractError("invalid_nature_activation_date", "nature activation date must use YYYY-MM-DD");
    const timestamp = Date.parse(`${text}T00:00:00+08:00`);
    const roundTrip = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(timestamp));
    if (!Number.isFinite(timestamp) || roundTrip !== text)
        throw new NatureContractError("invalid_nature_activation_date", "nature activation date is not a real Beijing date");
    return timestamp;
}

export function readNatureRuntimeConfig(env = process.env) {
    const activationDate = String(env[NATURE_ACTIVATION_DATE_ENV] ?? "").trim();
    const seed = String(env[NATURE_SEED_ENV] ?? "").trim();
    if (!activationDate && !seed)
        return null;
    if (!activationDate || !seed)
        throw new NatureContractError("incomplete_nature_configuration", "nature activation requires both date and seed");
    if (seed.length > 128)
        throw new NatureContractError("invalid_nature_seed", "nature seed must contain 1 to 128 characters");
    const activationAt = timestampForBeijingDate(activationDate);
    return Object.freeze({ activationDate, activationAt, activationDay: beijingDayIndex(activationAt), seed });
}

export function natureRuntimeReadiness(env = process.env, rawWorld = getNatureWorld()) {
    let config;
    try {
        config = readNatureRuntimeConfig(env);
    }
    catch (error) {
        return Object.freeze({
            adapterVersion: NATURE_GAMEPLAY_ADAPTER_VERSION,
            configured: false,
            ready: false,
            status: "invalid_configuration",
            errorCode: error?.code ?? "invalid_nature_configuration",
        });
    }
    const world = normalizeNatureWorld(rawWorld);
    if (!config) {
        return Object.freeze({
            adapterVersion: NATURE_GAMEPLAY_ADAPTER_VERSION,
            configured: false,
            ready: false,
            status: "not_configured",
            persistedStatus: world.status,
        });
    }
    const matches = world.status === "inactive" ||
        (world.activationDay === config.activationDay && world.seed === config.seed);
    return Object.freeze({
        adapterVersion: NATURE_GAMEPLAY_ADAPTER_VERSION,
        configured: true,
        ready: matches,
        status: matches ? "ready" : "configuration_mismatch",
        activationDate: config.activationDate,
        activationDay: config.activationDay,
        persistedStatus: world.status,
    });
}

function p4State(farm) {
    const existing = farm.lingyeP4;
    if (existing?.version === P4_STATE_VERSION && existing.events && typeof existing.events === "object")
        return existing;
    const next = { version: P4_STATE_VERSION, events: {} };
    farm.lingyeP4 = next;
    return next;
}

function eventState(farm, event) {
    const state = p4State(farm);
    return state.events[event.eventId] ??= {
        type: event.type,
        initialApplied: false,
        activeDaysApplied: [],
        floodFish: [],
        floodAnimalChecked: false,
        droughtAnimalChecked: false,
        recoveryProcessedDays: [],
    };
}

function farmExistedWhenEventStarted(farm, event) {
    const createdAt = Number(farm.createdAt);
    return !Number.isFinite(createdAt) || createdAt < beijingDayStart(event.activeFromDay + 1);
}

function growingPlots(farm) {
    return (farm.plots ?? []).filter((plot) => plot.crop && !plot.crop.ripe);
}

function occupiedPlots(farm) {
    return (farm.plots ?? []).filter((plot) => plot.crop);
}

function issueForImpact(farm, impactId) {
    return agronomyIssuesForFarm(farm).find(({ issue }) => issue.natureImpactId === impactId) ?? null;
}

function issuesForImpact(farm, impactId) {
    return agronomyIssuesForFarm(farm).filter(({ issue }) => issue.natureImpactId === impactId);
}

function issueForSource(farm, sourceId) {
    return agronomyIssuesForFarm(farm).find(({ issue }) => issue.sourceId === sourceId) ?? null;
}

function installPlotImpact(world, farm, event, plot, condition, day, now, extra = {}) {
    const registered = registerNatureImpact(world, {
        eventId: event.eventId,
        farmId: farm.id,
        objectId: `plot:${plot.id}`,
        kind: extra.kind ?? (event.type === "flood" ? "plot_flooded" : event.type === "drought" ? "plot_drought" : "plot_pest"),
        now,
    });
    const sourceId = extra.sourceId ?? `p4:agronomy:${event.eventId}:${farm.id}:${plot.id}:${day}`;
    addNatureAgronomyIssue(farm, {
        eventId: event.eventId,
        impactId: registered.impact.impactId,
        plotId: plot.id,
        condition,
        sourceId,
        generatedDay: day,
        now,
        requiredTreatment: extra.requiredTreatment,
        spreadFromSourceId: extra.spreadFromSourceId,
        lastSpreadDay: extra.lastSpreadDay,
    });
    return registered.world;
}

function floodFishPool(world, event) {
    const season = ecologicalSeasonForDay(world, event.activeFromDay);
    const seasonId = season?.id ?? SEASON_ID_BY_NAME[season?.name];
    return fishingFish.filter((fish) =>
        ["common", "uncommon"].includes(fish.rarity) &&
        (fish.seasons.includes("all") || fish.seasons.includes(seasonId)) &&
        (fish.tags ?? []).some((tag) => tag === "freshwater" || tag === "brackish"));
}

function generateFloodFish(world, farm, event, state, now) {
    if (state.floodFishGenerated)
        return world;
    state.floodFishGenerated = true;
    const pool = floodFishPool(world, event);
    if (pool.length === 0)
        throw new Error("flood_fish_pool_empty");
    const count = 1 + stableInteger(event.eventId, farm.id, "flood-fish-count") % 3;
    for (let index = 0; index < count; index += 1) {
        const fish = pool[stableInteger(event.eventId, farm.id, index, "flood-fish") % pool.length];
        const size = fish.size_min + stableInteger(event.eventId, farm.id, index, "flood-fish-size") %
            (fish.size_max - fish.size_min + 1);
        const registered = registerNatureImpact(world, {
            eventId: event.eventId,
            farmId: farm.id,
            objectId: `flood-fish:${index + 1}`,
            kind: "flood_fish",
            now,
        });
        world = registered.world;
        state.floodFish.push({
            impactId: registered.impact.impactId,
            fishId: fish.id,
            size,
            status: "pending",
            generatedAtDay: beijingDayIndex(now),
        });
    }
    return world;
}

function isFirstTogetherFlood(publicExpedition, event) {
    return publicExpedition?.storyId === "rain_not_yet" && publicExpedition.eventId === event?.eventId &&
        event?.type === "flood";
}

function applyFlood(world, farm, event, day, now, firstTogetherFlood = false, floodPolicy) {
    const state = eventState(farm, event);
    const terrain = farm.lingyeWeatherUpgrade?.terrain;
    const reached = !event.floodWaterline || floodedPlotIds(event,
        { eventId: event.eventId, height: event.floodWaterline.height }, terrain, [{ id: 0 }]).length > 0;
    if (!state.initialApplied && reached) {
        state.initialApplied = true;
        if (!farmExistedWhenEventStarted(farm, event))
            return world;
        if (event.floodWaterline) state.floodExposed = true;
        const plots = occupiedPlots(farm);
        if (firstTogetherFlood) {
            if (plots.length > 0) {
                const plot = plots[stableInteger(event.eventId, farm.id, "first-flood-plot") % plots.length];
                world = installPlotImpact(world, farm, event, plot, "local_pest", day, now, { kind: "plot_pest" });
            }
        }
        else {
            for (const plot of plots)
                world = installPlotImpact(world, farm, event, plot, "waterlogging", day, now);
        }
        world = generateFloodFish(world, farm, event, state, now);
    }
    if (event.floodWaterline && !reached && floodPolicy?.fishForUnflooded === true &&
        farmExistedWhenEventStarted(farm, event))
        world = generateFloodFish(world, farm, event, state, now);
    if (firstTogetherFlood && !state.firstTogetherAnimalChanceChecked && farmExistedWhenEventStarted(farm, event)) {
        // Reuse the original stable roll at the approved threshold, once per household.
        // An old case remains authoritative even after treatment or transfer.
        state.firstTogetherAnimalChanceChecked = true;
        state.floodAnimalChecked = true;
        const alreadyCreated = event.impacts.some(impact => impact.farmId === farm.id &&
            impact.kind === "animal_indigestion");
        if (!alreadyCreated) {
            world = maybeCreateAnimalImpact(world, farm, event, "indigestion", "animal_indigestion",
                FIRST_TOGETHER_FLOOD_ANIMAL_CHANCE, day, now);
        }
    }
    return world;
}

function applyDrought(world, farm, event, day, now, weatherUpgrade) {
    const state = eventState(farm, event);
    if (state.activeDaysApplied.includes(day))
        return world;
    state.activeDaysApplied.push(day);
    for (const plot of growingPlots(farm)) {
        if (weatherUpgrade?.plot?.moisture?.protectDrought === true &&
            Number(plot.lingyeWeatherUpgrade?.moisture) > 0) continue;
        const protectedIssue = agronomyIssuesForFarm(farm).find(({ plot: candidate, issue }) =>
            candidate.id === plot.id && issue.natureEventId === event.eventId && issue.protectedForEvent);
        if (protectedIssue)
            continue;
        world = installPlotImpact(world, farm, event, plot, "drought", day, now);
    }
    if (!state.droughtAnimalChecked && day >= event.activeFromDay + 1) {
        state.droughtAnimalChecked = true;
        world = maybeCreateAnimalImpact(world, farm, event, "dehydration", "animal_dehydration", P4_ANIMAL_EVENT_CHANCES.droughtAfterTwoDays, day, now);
    }
    return world;
}

function adjacentGrowingPlots(farm, plotId) {
    return growingPlots(farm).filter((plot) => Math.abs(Number(plot.id) - Number(plotId)) === 1);
}

function applyPest(world, farm, event, day, now) {
    const state = eventState(farm, event);
    if (!state.initialApplied) {
        state.initialApplied = true;
        if (farmExistedWhenEventStarted(farm, event)) {
            const plots = growingPlots(farm);
            if (plots.length > 0) {
                const plot = plots[stableInteger(event.eventId, farm.id, "pest-initial") % plots.length];
                world = installPlotImpact(world, farm, event, plot, "local_pest", day, now, { lastSpreadDay: day });
            }
        }
        return world;
    }
    for (const { plot, issue } of agronomyIssuesForFarm(farm)) {
        if (issue.natureEventId !== event.eventId || issue.condition !== "local_pest" ||
            issue.status === "resolved" || issue.lastSpreadDay === day || day <= issue.generatedDay)
            continue;
        issue.lastSpreadDay = day;
        const candidates = adjacentGrowingPlots(farm, plot.id).filter((candidate) =>
            !agronomyIssuesForFarm(farm).some(({ plot: existingPlot, issue: existingIssue }) =>
                existingPlot.id === candidate.id && existingIssue.natureEventId === event.eventId));
        if (candidates.length === 0)
            continue;
        const target = candidates[stableInteger(event.eventId, farm.id, issue.sourceId, day, "pest-spread") % candidates.length];
        world = installPlotImpact(world, farm, event, target, "local_pest", day, now, {
            requiredTreatment: "pest-net",
            spreadFromSourceId: issue.sourceId,
            lastSpreadDay: day,
        });
    }
    return world;
}

function maybeCreateAnimalImpact(world, farm, event, condition, kind, chance, day, now) {
    const animals = farm.ranch?.animals ?? [];
    if (animals.length === 0 || currentP3Sources(farm).animal ||
        !stableChance(chance, event.eventId, farm.id, condition))
        return world;
    const animalIndex = stableInteger(event.eventId, farm.id, condition, "animal") % animals.length;
    const registered = registerNatureImpact(world, {
        eventId: event.eventId,
        farmId: farm.id,
        objectId: `animal:${animalIndex}`,
        kind,
        now,
    });
    const sourceId = `p4:animal:${event.eventId}:${farm.id}:${animalIndex}:${condition}`;
    const created = addNatureAnimalCase(farm, {
        eventId: event.eventId,
        impactId: registered.impact.impactId,
        animalIndex,
        condition,
        sourceId,
        generatedDay: day,
        now,
    });
    if (!created)
        return world;
    return resolveNatureImpact(registered.world, {
        eventId: event.eventId,
        impactId: registered.impact.impactId,
        resolutionKind: "transferred",
        resolutionRef: sourceId,
        now,
    }).world;
}

function applyActiveEvent(world, farm, event, day, now, publicExpedition, weatherUpgrade) {
    if (event.type === "flood")
        return applyFlood(world, farm, event, day, now, isFirstTogetherFlood(publicExpedition, event), weatherUpgrade?.flood);
    if (event.type === "drought")
        return applyDrought(world, farm, event, day, now, weatherUpgrade);
    return applyPest(world, farm, event, day, now);
}

function resolveImpact(world, event, impactId, resolutionKind, resolutionRef, now) {
    const impact = event.impacts.find((entry) => entry.impactId === impactId);
    if (!impact || impact.resolvedAtDay != null)
        return world;
    return resolveNatureImpact(world, {
        eventId: event.eventId,
        impactId,
        resolutionKind,
        resolutionRef,
        now,
    }).world;
}

function reconcileFarmResolutions(world, farm, event, now) {
    for (const { issue } of agronomyIssuesForFarm(farm)) {
        if (issue.natureEventId !== event.eventId || issue.status !== "resolved")
            continue;
        if (issue.condition === "drought" && !issue.protectedForEvent)
            continue;
        world = resolveImpact(world, event, issue.natureImpactId, "career", issue.sourceId, now);
    }
    for (const history of farm.lingyeP3?.history ?? []) {
        if (history.natureEventId !== event.eventId || !history.natureImpactId)
            continue;
        if (history.type !== "agronomy_harvested")
            world = resolveImpact(world, event, history.natureImpactId, "transferred", history.sourceId, now);
    }
    return world;
}

function markIssueResolved(entry, now, reason) {
    if (!entry)
        return;
    entry.issue.status = "resolved";
    entry.issue.resolvedAt = now;
    entry.issue.natureResolution = reason;
    entry.issue.natureRecoveryNoticeEligible = true;
}

function recoverFlood(world, farm, event, day, now, firstTogetherFlood = false, floodPolicy) {
    const state = eventState(farm, event);
    if (!state.floodAnimalChecked) {
        state.floodAnimalChecked = true;
        if (!(event.floodWaterline && floodPolicy?.animalCasesRequireFloodExposure === true && !state.floodExposed)) {
            const stillFlooded = event.impacts.some((impact) => impact.farmId === farm.id &&
                impact.kind === "plot_flooded" && impact.resolvedAtDay == null);
            world = maybeCreateAnimalImpact(world, farm, event, "wet_cold", "animal_wet_cold",
                stillFlooded ? P4_ANIMAL_EVENT_CHANCES.floodWithUndrainedPlots : P4_ANIMAL_EVENT_CHANCES.floodAfterManualDrainage,
                day, now);
        }
    }
    const weather = plannedWeatherForDay(world, day)?.condition;
    for (const impact of event.impacts.filter((entry) => entry.farmId === farm.id &&
        (entry.kind === "plot_flooded" || (firstTogetherFlood && entry.kind === "plot_pest")) &&
        entry.resolvedAtDay == null)) {
        const entries = issuesForImpact(farm, impact.impactId);
        // The approved first Together flood keeps its original pest recovery.
        if (impact.kind === 'plot_pest' ? day < event.recoveryAtDay + 1
            : !advancePlotRecovery(entries, 'flood', weather, day)) continue;
        for (const issue of entries)
            markIssueResolved(issue, now, "natural-drainage");
        world = resolveImpact(world, event, impact.impactId, "natural", `flood-drainage:${event.eventId}:${farm.id}`, now);
    }
    for (const fish of state.floodFish.filter((entry) => entry.status === "pending" && day >= event.recoveryAtDay + 1)) {
        fish.status = "expired";
        fish.resolvedAtDay = day;
        world = resolveImpact(world, event, fish.impactId, "natural", `flood-fish-expired:${event.eventId}:${farm.id}`, now);
    }
    return world;
}

function recoverDrought(world, farm, event, day, now) {
    for (const impact of event.impacts.filter((entry) => entry.farmId === farm.id &&
        entry.kind === "plot_drought" && entry.resolvedAtDay == null)) {
        const entries = issuesForImpact(farm, impact.impactId);
        if (!advancePlotRecovery(entries, 'drought', plannedWeatherForDay(world, day)?.condition, day)) continue;
        for (const issue of entries)
            markIssueResolved(issue, now, "rain-recovery");
        world = resolveImpact(world, event, impact.impactId, "natural", `drought-rain:${event.eventId}:${farm.id}`, now);
    }
    return world;
}

function recoverPest(world, farm, event, day, now) {
    if (day < event.recoveryAtDay + 2)
        return world;
    for (const impact of event.impacts.filter((entry) => entry.farmId === farm.id &&
        entry.kind === "plot_pest" && entry.resolvedAtDay == null)) {
        const source = issueForImpact(farm, impact.impactId)?.issue?.sourceId ?? `p3-local-pest:${impact.impactId}`;
        world = resolveImpact(world, event, impact.impactId, "transferred", source, now);
    }
    return world;
}

function applyRecovery(world, farm, event, day, now, publicExpedition, weatherUpgrade) {
    const state = eventState(farm, event);
    if (!state.recoveryProcessedDays.includes(day))
        state.recoveryProcessedDays.push(day);
    if (event.type === "flood")
        return recoverFlood(world, farm, event, day, now, isFirstTogetherFlood(publicExpedition, event), weatherUpgrade?.flood);
    if (event.type === "drought")
        return recoverDrought(world, farm, event, day, now);
    return recoverPest(world, farm, event, day, now);
}

function eventCanBeReady(event, day) {
    if (event.phase !== "recovery")
        return false;
    if (event.type === "flood")
        return day >= event.recoveryAtDay + 1;
    if (event.type === "pest")
        return day >= event.recoveryAtDay + 2;
    return day >= event.recoveryAtDay;
}

function finalizeEvent(world, day, now, eventId = world.currentEvent?.eventId) {
    const event = findNatureEvent(world, eventId);
    if (!event || !eventCanBeReady(event, day) || event.impacts.some((impact) => impact.resolvedAtDay == null))
        return world;
    world = markNatureEventReadyForSettlement(world, { eventId: event.eventId, now });
    return advanceNatureWorld(world, now);
}

function commitWorldAndFarms(world, farms) {
    if (farms.length === 0)
        return { farms: [], nature: commitNatureWorld(world) };
    return replaceFarmsAndNatureAtomic({
        replacements: farms.map((farm) => ({ id: farm.id, farm })),
        nextNatureWorld: world,
    });
}

function activateConfiguredWorld(world, config, now) {
    if (world.status === "active") {
        if (config && (world.activationDay !== config.activationDay || world.seed !== config.seed))
            throw new NatureContractError("nature_configuration_mismatch", "persisted nature authority does not match deployment configuration");
        return world;
    }
    if (!config || now < config.activationAt)
        return world;
    return activateNatureWorld(world, { now: config.activationAt, seed: config.seed });
}

// A server checks before startup writes; a standalone scheduler checks at its
// own first activation. The one-use result avoids repeating the whole scan.
const checkedWeatherPreflights = new WeakSet();
export function preflightNatureWeatherActivation({ now, config, world = readNatureWorld(), getFarms = playerFarms }) {
    if (!Number.isSafeInteger(now) || typeof getFarms !== "function") throw new TypeError("weather preflight context required");
    const runtimeConfig = config === undefined ? readNatureRuntimeConfig() : config;
    const candidate = activateConfiguredWorld(normalizeNatureWorld(world), runtimeConfig, now);
    if (candidate.status !== "active") return { canEnable: false, deferred: true };
    const result = preflightP3WeatherEnable({ world: candidate, farms: getFarms(), now });
    if (!result.canEnable) {
        const error = new NatureContractError("p3_weather_enable_blocked", "P3 weather enable preflight did not pass");
        error.report = result;
        throw error;
    }
    checkedWeatherPreflights.add(result);
    return result;
}

export function advanceNatureGameplay(now = Date.now(), options = {}) {
    const config = options.config === undefined ? readNatureRuntimeConfig() : options.config;
    let world = activateConfiguredWorld(normalizeNatureWorld(options.world ?? getNatureWorld()), config, now);
    if (world.status !== "active")
        return { active: false, nature: world, farms: [] };
    if (options.weatherUpgrade?.forecast)
        world = enableWeatherGeneration(world, { ...options.weatherUpgrade.forecast, now });
    const today = beijingDayIndex(now);
    const firstDay = Math.max(world.activationDay, world.lastAdvancedDay + 1);
    const processDays = firstDay <= today ? Array.from({ length: today - firstDay + 1 }, (_, index) => firstDay + index) : [today];
    let committedFarms = [];
    const publicExpedition = options.publicExpedition === undefined ? getPublicExpeditionWorld() : options.publicExpedition;
    let sourceFarms = options.farms ? options.farms.map((farm) => cloneFarmForMutation(farm)) : null;
    for (const day of processDays) {
        const dayNow = beijingDayStart(day) + (options.weatherUpgrade ? 0 : 12 * 3_600_000);
        const farms = (sourceFarms ?? playerFarms()).map((farm) => cloneFarmForMutation(farm));
        for (const farm of farms) advanceFarmGrowth(farm, beijingDayStart(day));
        const firstTogetherFlood = ongoingNatureEvents(world).some(event => isFirstTogetherFlood(publicExpedition, event));
        const deferredAnimals = new Set();
        for (const farm of farms) {
            if (farm.doorbellMcpMigration?.migrationId) {
                // The first together flood suppresses case generation, so the
                // deferred-day list cannot establish cursor alignment there.
                if (options.weatherUpgrade && (!Number.isSafeInteger(farm.lingyeP3?.lastAdvancedDay) ||
                    farm.lingyeP3.lastAdvancedDay < day - 1 || farm.lingyeP3.lastAdvancedDay > day))
                    throw new Error("p3_weather_history_not_aligned");
                const advanced = advanceP3Farm(farm, dayNow, { generateNewCases: !firstTogetherFlood,
                    deferAnimalCases: options.weatherUpgrade != null, natureCoordinator: true });
                if (advanced.deferredAnimalDays?.some(deferredDay => deferredDay !== day))
                    throw new Error("p3_weather_history_not_aligned");
                if (advanced.deferredAnimalDays?.includes(day)) deferredAnimals.add(farm.id);
            }
        }
        world = advanceNatureWorld(world, dayNow);
        if (world.currentEvent?.floodWaterline && !options.weatherUpgrade?.flood)
            throw new NatureContractError("flood_waterline_policy_unavailable", "existing flood waterline requires its configured policy");
        if (options.weatherUpgrade?.flood) world = advanceFloodWaterline(world, day, options.weatherUpgrade.flood);
        if (!options.weatherUpgrade && (world.winterEvent || farms.some(farm => farm.lingyeWeatherUpgrade)))
            throw new NatureContractError("weather_upgrade_policy_unavailable", "existing weather state requires its configured policy");
        if (world.winterEvent && !options.weatherUpgrade?.winterEvent)
            throw new NatureContractError("winter_event_policy_unavailable", "existing winter event requires its configured policy");
        if (options.weatherUpgrade?.winterEvent)
            world = advanceWinterEvent(world, day, options.weatherUpgrade.winterEvent);
        // Finish the preceding exposure at the actual day boundary before
        // today's weather can thaw or dry the source. P3 recovery above has
        // already resolved any case that ends at this boundary.
        if (options.weatherUpgrade?.winterEvent?.exposures)
            world = advanceWinterAnimalCases(world, farms, day, dayNow,
                options.weatherUpgrade.winterEvent.exposures, { beforeWeather: true }).world;
        if (options.weatherUpgrade) {
            const weather = world.weatherPlan.find(entry => entry.dayIndex === day);
            if (!weather) throw new NatureContractError("weather_upgrade_forecast_unavailable", "authoritative weather day is unavailable");
            const advancedFarms = [];
            for (const farm of farms) {
                if (!farm.lingyeWeatherUpgrade) continue;
                const before = snapshotWinterNoticeState(farm);
                if (!advanceWeatherForFarm(farm, weather, options.weatherUpgrade)) continue;
                recordWinterNoticeFacts(farm, world.winterEvent, day, before, world.weatherPlan);
                advancedFarms.push(farm);
            }
            world = reconcileWinterFarmsImpacts(world, advancedFarms, dayNow);
            if (world.winterEvent && ["active", "recovery"].includes(world.winterEvent.phase))
                world.winterEvent.impactTrackingComplete = true;
            if (options.weatherUpgrade.winterEvent?.exposures)
                world = advanceWinterAnimalCases(world, farms, day, dayNow,
                    options.weatherUpgrade.winterEvent.exposures).world;
        }
        for (const { eventId } of ongoingNatureEvents(world)) {
            if (findNatureEvent(world, eventId)?.type === "winter") continue;
            if (findNatureEvent(world, eventId)?.phase === "active") {
                for (const farm of farms)
                    world = applyActiveEvent(world, farm, findNatureEvent(world, eventId), day, dayNow, publicExpedition, options.weatherUpgrade);
            }
            for (const farm of farms)
                world = reconcileFarmResolutions(world, farm, findNatureEvent(world, eventId), dayNow);
            if (findNatureEvent(world, eventId)?.phase === "recovery") {
                for (const farm of farms)
                    world = applyRecovery(world, farm, findNatureEvent(world, eventId), day, dayNow, publicExpedition, options.weatherUpgrade);
                world = finalizeEvent(world, day, dayNow, eventId);
            }
        }
        for (const farm of farms)
            if (deferredAnimals.has(farm.id)) generateP3AnimalAfterWeather(farm, dayNow);
        if (options.weatherUpgrade?.winterEvent) world = finishWinterEvent(world, farms, dayNow);
        if (options.commit === false) {
            world = normalizeNatureWorld(world);
            committedFarms = farms;
        }
        else {
            const committed = commitWorldAndFarms(world, farms);
            world = committed.nature;
            committedFarms = committed.farms;
        }
        sourceFarms = committedFarms;
    }
    return { active: true, nature: world, farms: committedFarms };
}

// A new resident can bind after the scheduled day has already run. Coordinate
// only that farm against today's saved event; the caller commits the returned
// farm and nature facts together with the binding transaction.
export function prepareP3ForNewBinding(farm, now, weatherUpgrade) {
    const worldAtStart = normalizeNatureWorld(readNatureWorld());
    if (!weatherUpgrade || worldAtStart.status !== "active") return null;
    const day = beijingDayIndex(now);
    if (worldAtStart.lastAdvancedDay !== day) throw new Error("p3_nature_day_pending");
    const lastP3Day = farm.lingyeP3?.lastAdvancedDay;
    if (lastP3Day !== undefined && (!Number.isSafeInteger(lastP3Day) || lastP3Day < day - 1 || lastP3Day > day))
        throw new Error("p3_weather_history_not_aligned");
    let world = worldAtStart;
    let staged = cloneFarmForMutation(farm);
    if (staged.lingyeWeatherUpgrade == null && weatherUpgrade.plot?.snow && weatherUpgrade.ranch) {
        const weather = world.weatherPlan.find(entry => entry.dayIndex === day);
        initializeFarmWeather(staged, weather, neighborhoodWeatherTerrain(staged.id), weatherUpgrade, now);
        world = reconcileWinterFarmImpacts(world, staged, now);
    }
    const publicExpedition = readPublicExpeditionWorld();
    const firstTogetherFlood = ongoingNatureEvents(world).some(event => isFirstTogetherFlood(publicExpedition, event));
    const p3 = advanceP3Farm(staged, now, { generateNewCases: !firstTogetherFlood,
        deferAnimalCases: true, natureCoordinator: true });
    if (p3.deferredAnimalDays.some(candidate => candidate !== day)) throw new Error("p3_weather_history_not_aligned");
    if (weatherUpgrade.winterEvent?.exposures) {
        const result = advanceWinterAnimalCases(world, [staged], day, now, weatherUpgrade.winterEvent.exposures);
        world = result.world;
        staged = result.farms[0];
    }
    for (const { eventId } of ongoingNatureEvents(world)) {
        const event = findNatureEvent(world, eventId);
        if (event?.type === "winter") continue;
        if (event?.phase === "active")
            world = applyActiveEvent(world, staged, event, day, now, publicExpedition, weatherUpgrade);
        if (findNatureEvent(world, eventId)?.phase === "recovery")
            world = applyRecovery(world, staged, findNatureEvent(world, eventId), day, now, publicExpedition, weatherUpgrade);
    }
    if (p3.deferredAnimalDays.includes(day)) generateP3AnimalAfterWeather(staged, now);
    return { farm: staged, nature: world };
}

function nextBeijingDayBoundary(now) {
    return beijingDayStart(beijingDayIndex(now) + 1);
}

export function startNatureRuntimeScheduler(options = {}) {
    const now = options.now ?? Date.now;
    const setTimer = options.setTimer ?? setTimeout;
    const clearTimer = options.clearTimer ?? clearTimeout;
    const config = options.config === undefined ? readNatureRuntimeConfig() : options.config;
    let preflightComplete = checkedWeatherPreflights.delete(options.weatherEnablePreflight);
    const advance = at => {
        if (options.weatherUpgrade && !preflightComplete) {
            const report = preflightNatureWeatherActivation({ now: at, config });
            if (report.canEnable) {
                checkedWeatherPreflights.delete(report);
                preflightComplete = true;
            }
        }
        return advanceNatureGameplay(at, { config, weatherUpgrade: options.weatherUpgrade });
    };
    advance(now());
    let stopped = false;
    let timer;
    let pending;
    let failed = null;
    const schedule = () => {
        if (stopped)
            return;
        const current = now();
        let resolvePending, rejectPending;
        const promise = new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; });
        promise.catch(() => {});
        pending = { promise, resolve: resolvePending, reject: rejectPending };
        timer = setTimer(() => {
            if (stopped)
                return;
            try {
                advance(now());
                failed = null;
                pending.resolve();
            }
            catch (error) {
                failed = error;
                pending.reject(error);
                console.error("[lingye-nature] daily world advancement failed", error);
            }
            finally {
                schedule();
            }
        }, Math.max(0, nextBeijingDayBoundary(current) - current));
        timer?.unref?.();
    };
    schedule();
    const stop = () => {
        stopped = true;
        pending?.reject(new Error("nature_scheduler_stopped"));
        if (timer)
            clearTimer(timer);
    };
    stop.whenCurrent = async (at = now()) => {
        const world = readNatureWorld();
        if (world.status !== "active") {
            if (failed && options.weatherUpgrade && config && at >= config.activationAt) throw failed;
            return;
        }
        if (world.lastAdvancedDay >= beijingDayIndex(at)) return;
        if (failed) throw failed;
        await pending.promise;
        const advanced = readNatureWorld();
        if (advanced.status === "active" && advanced.lastAdvancedDay < beijingDayIndex(at))
            throw new Error("nature_day_not_current");
    };
    return stop;
}

export function applyDroughtWatering(farm, plotIds, now = Date.now(), rawWorld = getNatureWorld()) {
    const event = rawWorld.currentEvent;
    if (!event || event.type !== "drought" || !['active', 'recovery'].includes(event.phase))
        return false;
    const day = beijingDayIndex(now);
    const ids = new Set((plotIds ?? []).map(Number));
    let changed = false;
    for (const { plot, issue } of agronomyIssuesForFarm(farm)) {
        if (issue.natureEventId !== event.eventId || issue.condition !== "drought" ||
            (event.phase === 'active' && issue.generatedDay !== day) || issue.status === "resolved" || !ids.has(plot.id))
            continue;
        if (event.phase === 'recovery') {
            issue.natureRecoveryWateredDay = day;
            changed = true;
            continue;
        }
        issue.status = "resolved";
        issue.resolvedAt = now;
        issue.resolvedByWaterDay = day;
        changed = true;
    }
    return changed;
}

export function reconcileNatureTreatment(world, farm, sourceId, result, now = Date.now()) {
    if (result?.resolved !== true)
        return world;
    const agronomy = issueForSource(farm, sourceId)?.issue;
    const event = ongoingNatureEvents(world).find(event => event.eventId === agronomy?.natureEventId);
    if (!event) return world;
    if (!agronomy?.natureImpactId || agronomy.natureEventId !== event.eventId)
        return world;
    if (agronomy.condition === "drought" && !agronomy.protectedForEvent)
        return world;
    return resolveImpact(world, event, agronomy.natureImpactId, "career", sourceId, now);
}

export function commitNatureFarmReconciliation(farm, now = Date.now()) {
    const world = getNatureWorld();
    if (ongoingNatureEvents(world).length === 0)
        return false;
    const stagedFarm = cloneFarmForMutation(farm);
    let nextWorld = structuredClone(world);
    for (const {eventId} of ongoingNatureEvents(world))
        nextWorld = reconcileFarmResolutions(nextWorld, stagedFarm, findNatureEvent(nextWorld, eventId), now);
    if (JSON.stringify(nextWorld) === JSON.stringify(world))
        return false;
    const committed = replaceFarmsAndNatureAtomic({
        replacements: [{ id: stagedFarm.id, farm: stagedFarm }],
        nextNatureWorld: nextWorld,
    });
    Object.assign(farm, cloneFarmForMutation(committed.farms[0]));
    return true;
}

export function commitNatureRemovedPlot(farm, _plotId, _resolutionKind, _resolutionRef, now = Date.now()) {
    // Harvesting or stealing only removes the crop.  Plot-level agronomy
    // issues remain authoritative until career treatment or an existing
    // nature-event recovery contract resolves them.
    return commitNatureFarmReconciliation(farm, now);
}

export function collectFloodFishForFarm(farm, now = Date.now()) {
    const world = getNatureWorld();
    const collected = collectFloodFishInPlace(cloneFarmForMutation(farm), structuredClone(world), now);
    if (collected.collected === 0)
        return collected;
    const committed = replaceFarmsAndNatureAtomic({
        replacements: [{ id: collected.farm.id, farm: collected.farm }],
        nextNatureWorld: collected.world,
    });
    Object.assign(farm, cloneFarmForMutation(committed.farms[0]));
    return { collected: collected.collected, names: collected.names, text: collected.text };
}

export function collectFloodFishInPlace(farm, world, now = Date.now()) {
    const event = ongoingNatureEvents(world).find(event => event.type === "flood" && ["active", "recovery"].includes(event.phase));
    if (!event || event.type !== "flood" || !["active", "recovery"].includes(event.phase))
        return { collected: 0, text: "", farm, world };
    const state = eventState(farm, event);
    const pending = state.floodFish.filter((entry) => entry.status === "pending");
    if (pending.length === 0)
        return { collected: 0, text: "", farm, world };
    let nextWorld = world;
    const names = [];
    for (const entry of pending) {
        const caught = grantFloodFish(farm, entry.fishId, entry.size);
        names.push(caught.name);
        entry.status = "collected";
        entry.collectedAt = now;
        nextWorld = resolveImpact(nextWorld, findNatureEvent(nextWorld, event.eventId), entry.impactId, "owner", `farm.run:${farm.id}:${event.eventId}`, now);
    }
    nextWorld = reconcileFarmResolutions(nextWorld, farm, findNatureEvent(nextWorld, event.eventId), now);
    nextWorld = finalizeEvent(nextWorld, beijingDayIndex(now), now, event.eventId);
    return { collected: pending.length, names, text: FLOOD_FISH_COLLECTED_TEXT(names), farm, world: nextWorld };
}

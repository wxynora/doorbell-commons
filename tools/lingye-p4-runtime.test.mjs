import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-p4-runtime-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const nature = await import("../dist/nature.js");
const runtime = await import("../dist/nature-runtime.js");
const fishingModule = await import("../dist/fishing.js");
const { makeFarm } = await import("../dist/game.js");
const { harvest, P4_WINTER_BASE_YIELD_MULTIPLIER } = await import("../dist/engine.js");
const { crops } = await import("../dist/content.js");
const { commitNatureWorld } = await import("../dist/store.js");
const {
    P4_SEASONAL_BASELINES,
    checkAgronomyIssue,
    treatAgronomyIssue,
} = await import("../dist/career/p3-world.js");

const ACTIVATION_DATE = "2026-09-01";
const ACTIVATION_AT = Date.parse(`${ACTIVATION_DATE}T00:00:00+08:00`);
const ACTIVATION_DAY = nature.beijingDayIndex(ACTIVATION_AT);
const atDay = (day, hour = 12) => nature.beijingDayStart(day) + hour * 3_600_000;

function config(seed) {
    return runtime.readNatureRuntimeConfig({
        AIFARM_NATURE_ACTIVATION_DATE: ACTIVATION_DATE,
        AIFARM_NATURE_SEED: seed,
    });
}

function activeWorld(seed) {
    return nature.activateNatureWorld(null, { now: ACTIVATION_AT, seed });
}

function findEvent(type, startOffset = 0) {
    const allowed = type === "flood"
        ? new Set(["heavy_rain", "thunderstorm"])
        : type === "drought"
            ? new Set(["sunny", "hot", "dry_wind"])
            : new Set(["sunny", "cloudy", "light_rain", "heavy_rain", "thunderstorm", "fog", "hot"]);
    const moist = new Set(["light_rain", "cloudy", "fog"]);
    const width = type === "flood" ? 2 : type === "drought" ? 4 : 3;
    for (let attempt = 0; attempt < 20_000; attempt += 1) {
        const seed = `p4-${type}-${attempt}`;
        const world = activeWorld(seed);
        for (let offset = Math.max(startOffset, width - 1); offset < startOffset + 40; offset += 1) {
            const activeFromDay = ACTIVATION_DAY + offset;
            const facts = Array.from({ length: width }, (_, index) =>
                nature.plannedWeatherForDay(world, activeFromDay - width + 1 + index));
            if (!facts.every((fact) => allowed.has(fact.condition)))
                continue;
            if (type === "drought" && facts.some((fact) => !["春", "夏", "秋"].includes(fact.season)))
                continue;
            if (type === "pest" && (facts.some((fact) => !["春", "夏"].includes(fact.season)) ||
                facts.filter((fact) => moist.has(fact.condition)).length < 2))
                continue;
            const isolated = structuredClone(world);
            isolated.lastAdvancedDay = activeFromDay - 2;
            const isolatedForecast = nature.advanceNatureWorld(isolated, atDay(activeFromDay - 1));
            const isolatedTimeline = nature.advanceNatureWorld(isolatedForecast, atDay(activeFromDay));
            if (type === "drought" && isolatedTimeline.currentEvent?.type === type &&
                isolatedTimeline.currentEvent.activeFromDay === activeFromDay &&
                isolatedTimeline.currentEvent.phase === "active") {
                return { seed, activeFromDay, world, timeline: isolatedTimeline };
            }
            const timeline = nature.advanceNatureWorld(world, atDay(activeFromDay));
            if (timeline.currentEvent?.type === type &&
                timeline.currentEvent.activeFromDay === activeFromDay &&
                timeline.currentEvent.phase === "active") {
                return { seed, activeFromDay, world };
            }
        }
    }
    throw new Error(`event seed not found: ${type}`);
}

function farmFixture(id = "P4FARM") {
    const farm = makeFarm("P4 runtime", 1937);
    farm.id = id;
    farm.createdAt = ACTIVATION_AT - 1;
    farm.doorbellMcpMigration = { migrationId: `migration:${id}` };
    farm.lastTickAt = ACTIVATION_AT;
    for (let index = 0; index < 3; index += 1) {
        farm.plots[index].crop = {
            seedType: "common",
            progress: 0,
            growTicks: 10,
            waterCount: 0,
            ripe: false,
        };
    }
    farm.ranch = {
        animals: [{ kindId: "chicken", ticksSinceProduce: 0, pending: 0 }],
        coins: 0,
        raids: [],
        raidDebts: [],
        pets: [],
    };
    return farm;
}

test("P4 deployment configuration is explicit, fail-closed, and readiness never exposes the seed", () => {
    assert.equal(runtime.readNatureRuntimeConfig({}), null);
    assert.throws(
        () => runtime.readNatureRuntimeConfig({ AIFARM_NATURE_ACTIVATION_DATE: ACTIVATION_DATE }),
        (error) => error.code === "incomplete_nature_configuration",
    );
    assert.throws(
        () => runtime.readNatureRuntimeConfig({
            AIFARM_NATURE_ACTIVATION_DATE: "2026-02-30",
            AIFARM_NATURE_SEED: "seed",
        }),
        (error) => error.code === "invalid_nature_activation_date",
    );
    const ready = runtime.natureRuntimeReadiness({
        AIFARM_NATURE_ACTIVATION_DATE: ACTIVATION_DATE,
        AIFARM_NATURE_SEED: "authority-seed",
    }, nature.normalizeNatureWorld(null));
    assert.equal(ready.ready, true);
    assert.equal(ready.activationDay, ACTIVATION_DAY);
    assert.equal(Object.hasOwn(ready, "seed"), false);
    assert.deepEqual(runtime.P4_ANIMAL_EVENT_CHANCES, {
        floodWithUndrainedPlots: 0.20,
        floodAfterManualDrainage: 0.05,
        droughtAfterTwoDays: 0.10,
    });
});

test("weather fishing modifiers are exact and severe weather rejects before consuming anything", () => {
    assert.equal(fishingModule.fishingWeatherTagMultiplier("cloudy", ["nocturnal", "nocturnal"]), 1.2);
    assert.equal(fishingModule.fishingWeatherTagMultiplier("light_rain", ["freshwater", "fire"]), 1);
    assert.equal(fishingModule.fishingWeatherTagMultiplier("light_snow", ["deepsea", "crystal"]), 1.5625);

    let severe;
    for (let attempt = 0; attempt < 10_000 && !severe; attempt += 1) {
        const candidate = nature.advanceNatureWorld(activeWorld(`severe-${attempt}`), atDay(ACTIVATION_DAY));
        if (["heavy_rain", "thunderstorm", "blizzard"].includes(nature.natureSnapshot(candidate, atDay(ACTIVATION_DAY)).weather.condition))
            severe = candidate;
    }
    assert.ok(severe);
    commitNatureWorld(severe);
    const farm = farmFixture("P4FISH");
    fishingModule.ensureFishing(farm);
    const before = structuredClone(farm.fishing);
    const result = fishingModule.runFishing(farm, { times: 1 }, atDay(ACTIVATION_DAY), [farm]);
    assert.equal(result.ok, false);
    assert.ok(result.text.includes(fishingModule.FISHING_BAD_WEATHER_TEXT));
    assert.deepEqual(farm.fishing.baitInventory, before.baitInventory);
    assert.equal(farm.fishing.dailyCasts.count, 0);
    assert.equal(farm.fishing.activeUntil, 0);
    assert.equal(farm.fishing.rngState, before.rngState);
    assert.equal(farm.fishing.rngCalls, before.rngCalls);
});

test("flood atomically creates all plot impacts and one stable 1-3 fish pool, then restart replay is idempotent", () => {
    const found = findEvent("flood", 14);
    const farm = farmFixture("P4FLOOD");
    const now = atDay(found.activeFromDay);
    const first = runtime.advanceNatureGameplay(now, {
        config: config(found.seed),
        world: nature.normalizeNatureWorld(null),
        farms: [farm],
        commit: false,
    });
    assert.equal(first.nature.currentEvent.type, "flood");
    assert.equal(first.nature.currentEvent.phase, "active");
    assert.equal(first.nature.currentEvent.impacts.filter((impact) => impact.kind === "plot_flooded").length, 3);
    const fish = first.farms[0].lingyeP4.events[first.nature.currentEvent.eventId].floodFish;
    assert.ok(fish.length >= 1 && fish.length <= 3);
    assert.equal(first.nature.currentEvent.impacts.filter((impact) => impact.kind === "flood_fish").length, fish.length);
    assert.ok(first.farms[0].plots.slice(0, 3).every((plot) =>
        plot.crop.lingyeNatureAgronomy.some((issue) => issue.condition === "waterlogging")));

    const replay = runtime.advanceNatureGameplay(now, {
        config: config(found.seed),
        world: first.nature,
        farms: first.farms,
        commit: false,
    });
    assert.equal(replay.nature.currentEvent.impacts.length, first.nature.currentEvent.impacts.length);
    assert.deepEqual(replay.farms[0].lingyeP4.events[first.nature.currentEvent.eventId].floodFish, fish);

    const collected = runtime.collectFloodFishInPlace(replay.farms[0], replay.nature, now);
    assert.equal(collected.collected, fish.length);
    assert.equal(collected.farm.fishing.catchInventory.length, fish.length);
    assert.equal(collected.farm.fishing.dailyCasts.count, 0);
    assert.ok(collected.world.currentEvent.impacts.filter((impact) => impact.kind === "flood_fish")
        .every((impact) => impact.resolvedAtDay !== null));
});

test("pest uses one initial plot, spreads to at most one adjacent plot per source/day, and requires the approved net", () => {
    const found = findEvent("pest", 0);
    const farm = farmFixture("P4PEST");
    const active = runtime.advanceNatureGameplay(atDay(found.activeFromDay), {
        config: config(found.seed), world: nature.normalizeNatureWorld(null), farms: [farm], commit: false,
    });
    assert.equal(active.nature.currentEvent.impacts.filter((impact) => impact.kind === "plot_pest").length, 1);
    const next = runtime.advanceNatureGameplay(atDay(found.activeFromDay + 1), {
        config: config(found.seed), world: active.nature, farms: active.farms, commit: false,
    });
    const pestIssues = next.farms[0].plots.flatMap((plot) => plot.crop?.lingyeNatureAgronomy ?? [])
        .filter((issue) => issue.natureEventId === next.nature.currentEvent.eventId);
    assert.ok(pestIssues.length >= 1 && pestIssues.length <= 2);
    if (pestIssues.length === 2) {
        const spread = pestIssues.find((issue) => issue.spreadFromSourceId);
        assert.equal(spread.requiredTreatment, "pest-net");
        checkAgronomyIssue(next.farms[0], spread.sourceId, "pest-trace");
        assert.equal(treatAgronomyIssue(next.farms[0], spread.sourceId, "insect-trap", 2, atDay(found.activeFromDay + 1)).resolved, false);
        const treated = treatAgronomyIssue(next.farms[0], spread.sourceId, "pest-net", 2, atDay(found.activeFromDay + 1));
        assert.equal(treated.resolved, true);
        const resolved = runtime.reconcileNatureTreatment(next.nature, next.farms[0], spread.sourceId, treated, atDay(found.activeFromDay + 1));
        assert.notEqual(resolved.currentEvent.impacts.find((impact) => impact.impactId === spread.natureImpactId).resolvedAtDay, null);
    }
});

test("drought watering clears only the current daily source while cover treatment resolves the event impact", () => {
    const found = findEvent("drought", 28);
    const farm = farmFixture("P4DROUGHT");
    const now = atDay(found.activeFromDay);
    const active = runtime.advanceNatureGameplay(now, {
        config: config(found.seed), world: found.timeline, farms: [farm], commit: false,
    });
    const event = active.nature.currentEvent;
    const staged = active.farms[0];
    const issue = staged.plots[0].crop.lingyeNatureAgronomy.find((entry) => entry.natureEventId === event.eventId);
    assert.equal(runtime.applyDroughtWatering(staged, [1], now, active.nature), true);
    assert.equal(issue.status, "resolved");
    assert.equal(event.impacts.find((impact) => impact.impactId === issue.natureImpactId).resolvedAtDay, null);

    issue.status = "resolved";
    issue.protectedForEvent = true;
    const resolved = runtime.reconcileNatureTreatment(active.nature, staged, issue.sourceId, { resolved: true }, now);
    assert.notEqual(resolved.currentEvent.impacts.find((impact) => impact.impactId === issue.natureImpactId).resolvedAtDay, null);
});

test("recovery expires flood fish, drains fields, fences disease into P3, and can settle without deleting the case", () => {
    const found = findEvent("flood", 14);
    const farm = farmFixture("P4RECOVERY");
    let result = runtime.advanceNatureGameplay(atDay(found.activeFromDay), {
        config: config(found.seed), world: nature.normalizeNatureWorld(null), farms: [farm], commit: false,
    });
    let recoveryDay = found.activeFromDay + 1;
    while (["heavy_rain", "thunderstorm"].includes(nature.plannedWeatherForDay(result.nature, recoveryDay).condition))
        recoveryDay += 1;
    result = runtime.advanceNatureGameplay(atDay(recoveryDay + 1), {
        config: config(found.seed), world: result.nature, farms: result.farms, commit: false,
    });
    assert.equal(result.nature.currentEvent, null);
    assert.equal(result.nature.settledEvents.at(-1).type, "flood");
    assert.ok(result.farms[0].plots.slice(0, 3).every((plot) =>
        plot.crop.lingyeNatureAgronomy.every((issue) => issue.status === "resolved")));
    assert.ok(result.farms[0].lingyeP4.events[result.nature.settledEvents.at(-1).eventId].floodFish
        .every((fish) => fish.status === "expired"));
    const health = result.farms[0].ranch.animals[0].lingyeHealth;
    if (health)
        assert.equal(health.condition, "wet_cold");
});

test("winter base farm yield is reduced while autumn's stable baseline lowers disease pressure without minting currency", () => {
    const winterSeed = "winter-baseline";
    const winterNow = atDay(ACTIVATION_DAY + 42);
    commitNatureWorld(nature.advanceNatureWorld(activeWorld(winterSeed), winterNow));
    const crop = crops.find((entry) => entry.category === "limited" && entry.rarity !== "SP");
    assert.ok(crop);
    const winterFarm = farmFixture("P4WINTER");
    winterFarm.plots[0].crop = {
        seedType: "limited", limitedId: crop.id, growTicks: crop.growTicks, progress: crop.growTicks, ripe: true, waterCount: 0,
    };
    const control = structuredClone(winterFarm);
    const winterResult = harvest(winterFarm, 1, winterNow, null);
    commitNatureWorld(nature.normalizeNatureWorld(null));
    const controlResult = harvest(control, 1, winterNow, null);
    assert.equal(winterResult.ok, true);
    assert.equal(winterResult.value, Math.max(1, Math.round(controlResult.value * P4_WINTER_BASE_YIELD_MULTIPLIER)));
    assert.ok(P4_SEASONAL_BASELINES.autumn.agronomyChance < P4_SEASONAL_BASELINES.summer.agronomyChance);
    assert.ok(P4_SEASONAL_BASELINES.autumn.animalChance < P4_SEASONAL_BASELINES.summer.animalChance);
});

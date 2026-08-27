import assert from "node:assert/strict";
import test from "node:test";

import { TICK_MS } from "../dist/config.js";
import { advance, harvest } from "../dist/engine.js";
import { makeFarm } from "../dist/game.js";
import { advanceRanch } from "../dist/domain/ranch/progression.js";
import {
    advanceP3Farm,
    beijingDay,
    checkAgronomyIssue,
    checkAnimalCase,
    currentP3Sources,
    treatAgronomyIssue,
    treatAnimalCase,
} from "../dist/career/p3-world.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const BASE = Date.parse("2026-09-01T08:00:00+08:00");

function plantedFarm(id = "P3FARM") {
    const farm = makeFarm("P3 test", 9137);
    farm.id = id;
    farm.lastTickAt = BASE;
    farm.plots[0].crop = {
        seedType: "common",
        progress: 0,
        growTicks: 10,
        waterCount: 0,
        ripe: false,
    };
    return farm;
}

function findGenerated(kind, createFarm) {
    for (let offset = 0; offset < 10_000; offset += 1) {
        const farm = createFarm(offset);
        const now = BASE + offset * DAY_MS;
        const generated = advanceP3Farm(farm, now).generated.find((entry) => entry.type === kind);
        if (generated)
            return { farm, generated, now };
    }
    throw new Error(`Unable to find deterministic ${kind} fixture`);
}

test("P3 agronomy generation is stable, persists its source, and changes real field progression", () => {
    const fixture = findGenerated("agronomy", (offset) => plantedFarm(`P3AG${offset}`));
    const source = currentP3Sources(fixture.farm).agronomy;
    assert.equal(source.sourceId, fixture.generated.sourceId);
    assert.equal(advanceP3Farm(fixture.farm, fixture.now).generated.length, 0);

    const crop = fixture.farm.plots[0].crop;
    crop.lingyeAgronomy.condition = "drought";
    advance(fixture.farm, fixture.farm.lastTickAt + 5 * TICK_MS);
    assert.equal(crop.progress, 0);

    assert.deepEqual(checkAgronomyIssue(fixture.farm, source.sourceId, "soil"), {
        condition: "drought",
        check: "soil",
        sourceId: source.sourceId,
    });
    assert.equal(treatAgronomyIssue(fixture.farm, source.sourceId, "water-retaining-cover", 1, fixture.now).status, "resolved");
    advance(fixture.farm, fixture.farm.lastTickAt + 5 * TICK_MS);
    assert.equal(crop.progress, 5);
});

test("an unresolved agronomy issue lowers harvest quality exactly once", () => {
    const affected = plantedFarm("P3PENALTY");
    affected.plots[0].crop.progress = 10;
    affected.plots[0].crop.ripe = true;
    affected.plots[0].crop.lingyeAgronomy = {
        sourceId: "p3:agronomy:P3PENALTY:1:1",
        condition: "local_pest",
        status: "open",
        generatedDay: 1,
        generatedAt: BASE,
        checks: [],
        treatments: [],
        qualityPenalty: true,
    };
    const control = structuredClone(affected);
    delete control.plots[0].crop.lingyeAgronomy;
    const affectedResult = harvest(affected, 1, BASE, null);
    const controlResult = harvest(control, 1, BASE, null);
    assert.equal(affectedResult.ok, true);
    assert.equal(controlResult.ok, true);
    assert.equal(affectedResult.quality.tier, Math.max(1, controlResult.quality.tier - 1));
    assert.equal(affected.lingyeP3.history.length, 1);
    assert.equal(affected.lingyeP3.history[0].qualityPenalty, true);
});

test("P3 animal cases pause production through treatment and recovery, then resume", () => {
    const fixture = findGenerated("animal", (offset) => {
        const farm = plantedFarm(`P3AN${offset}`);
        farm.ranch = {
            animals: [{ kindId: "chicken", ticksSinceProduce: 0, pending: 0 }],
            coins: 0,
            raids: [],
            raidDebts: [],
            pets: [],
        };
        return farm;
    });
    const source = currentP3Sources(fixture.farm).animal;
    const animal = fixture.farm.ranch.animals[0];
    const before = animal.ticksSinceProduce;
    advanceRanch(fixture.farm, 5);
    assert.equal(animal.ticksSinceProduce, before);

    const checkByCondition = {
        indigestion: "feed-history",
        minor_injury: "injury",
        wet_cold: "temperature",
        dehydration: "water-intake",
        respiratory_infection: "temperature",
        compound_fever: "temperature",
    };
    const materialsByCondition = {
        indigestion: ["stomach-powder"],
        minor_injury: ["wound-cleanser", "bandage"],
        wet_cold: ["dry-bedding", "warm-compress"],
        dehydration: ["rehydration-salt"],
        respiratory_infection: ["respiratory-medicine"],
        compound_fever: ["antipyretic", "rehydration-salt", "respiratory-medicine"],
    };
    checkAnimalCase(fixture.farm, source.sourceId, checkByCondition[source.condition]);
    const treatment = treatAnimalCase(fixture.farm, source.sourceId, materialsByCondition[source.condition], 4, fixture.now);
    assert.equal(treatment.status, "recovering");
    advanceRanch(fixture.farm, 5);
    assert.equal(animal.ticksSinceProduce, before);

    const recoveryAt = (treatment.recoveryUntilDay - beijingDay(BASE)) * DAY_MS + BASE;
    advanceP3Farm(fixture.farm, recoveryAt);
    advanceRanch(fixture.farm, 5);
    assert.equal(animal.pending, 1);
    assert.equal(currentP3Sources(fixture.farm).animal, null);
});

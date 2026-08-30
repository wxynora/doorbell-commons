import test from "node:test";
import assert from "node:assert/strict";

import { crops } from "../dist/content.js";
import { usePotionPlots } from "../dist/engine.js";
import { dispatch, HELP, makeFarm } from "../dist/game.js";
import { glimmerTracks, glimmerView, runGlimmer } from "../dist/glimmer.js";
import { FARM_TOOL } from "../dist/mcp.js";

const NOW = Date.parse("2026-08-22T20:30:00+08:00");

function growingCrop() {
    return { seedType: "common", growTicks: 6, progress: 0, ripe: false, waterCount: 0 };
}

function farmWithGrowingPlots(ids, potions = 6) {
    const farm = makeFarm("简化调用测试农场", 20260822);
    farm.lastTickAt = NOW;
    farm.items.speed_potion = potions;
    for (const id of ids)
        farm.plots.find((plot) => plot.id === id).crop = growingCrop();
    return farm;
}

test("ripen atomically consumes one potion for each explicitly selected plot", () => {
    const farm = farmWithGrowingPlots([1, 3, 5], 5);
    const result = usePotionPlots(farm, [1, 3, 5]);

    assert.deepEqual(result, { ok: true, plotIds: [1, 3, 5], count: 3, left: 2 });
    assert.equal(farm.items.speed_potion, 2);
    assert.equal(farm.plots.find((plot) => plot.id === 1).crop.ripe, true);
    assert.equal(farm.plots.find((plot) => plot.id === 3).crop.ripe, true);
    assert.equal(farm.plots.find((plot) => plot.id === 5).crop.ripe, true);
});

test("ripen rejects the whole set before mutation when any target is invalid", () => {
    for (const [plots, potions] of [
        [[1, 2], 2],
        [[1, 1], 2],
        [[1, 3], 1],
    ]) {
        const farm = farmWithGrowingPlots([1, 3], potions);
        const before = structuredClone(farm);
        const result = usePotionPlots(farm, plots);

        assert.equal(result.ok, false);
        assert.deepEqual(farm, before);
    }
});

test("legacy farm publishes precise and automatic ripen while hidden use and run potion compatibility still execute", () => {
    const ripenFarm = farmWithGrowingPlots([1, 3], 4);
    const ripen = dispatch(ripenFarm, { action: "ripen", plots: [1, 3] }, NOW);
    assert.equal(ripen.ok, true);
    assert.match(ripen.text, /催熟了 1、3 号地/);

    const autoFarm = farmWithGrowingPlots([1, 3], 0);
    autoFarm.coins = 10_000;
    const coinsBefore = autoFarm.coins;
    const auto = dispatch(autoFarm, { action: "ripen", auto: true }, NOW);
    assert.equal(auto.ok, true);
    assert.match(auto.text, /自动加速.*买 2 瓶/);
    assert.equal(autoFarm.plots.find((plot) => plot.id === 1).crop.ripe, true);
    assert.equal(autoFarm.plots.find((plot) => plot.id === 3).crop.ripe, true);
    assert.ok(autoFarm.coins < coinsBefore);

    assert.equal(dispatch(ripenFarm, { action: "ripen", auto: true, plots: [1] }, NOW).ok, false);
    assert.equal(dispatch(ripenFarm, { action: "ripen", auto: false }, NOW).ok, false);
    assert.equal(dispatch(ripenFarm, { action: "ripen" }, NOW).ok, false);

    const useFarm = farmWithGrowingPlots([1], 1);
    const oldUse = dispatch(useFarm, { action: "use", item: "speed_potion", plotId: 1 }, NOW);
    assert.equal(oldUse.ok, true);
    assert.equal(useFarm.plots[0].crop.ripe, true);

    const runFarm = farmWithGrowingPlots([1], 1);
    const oldRun = dispatch(runFarm, {
        action: "run",
        potion: 1,
        water: false,
        harvest: false,
    }, NOW);
    assert.equal(oldRun.ok, true);
    assert.equal(runFarm.plots[0].crop.ripe, true);

    assert.match(HELP, /doorbell\(\{"op":"farm\.ripen","args":\{"plots":\[1,3,5\]\}\}\)/);
    assert.match(HELP, /doorbell\(\{"op":"farm\.ripen","args":\{"auto":true\}\}\)/);
    assert.doesNotMatch(HELP, /use \{"item":"speed_potion"/);
    assert.doesNotMatch(HELP, /"potion":"auto"/);
    assert.match(FARM_TOOL.description, /\{action:"ripen",plots:\[1,3\]\}/);
    assert.match(FARM_TOOL.description, /\{action:"ripen",auto:true\}/);
    assert.doesNotMatch(FARM_TOOL.description, /\{action:"use"/);
    assert.match(FARM_TOOL.inputSchema.properties.action.description, /ripen/);
    assert.doesNotMatch(FARM_TOOL.inputSchema.properties.action.description, /\/use\//);

    const statusFarm = farmWithGrowingPlots([1], 1);
    const status = dispatch(statusFarm, { action: "status" }, NOW);
    assert.match(status.text, /doorbell\(\{"op":"farm\.ripen","args":\{"auto":true\}\}\)/);
});

test("glimmer displays today's numeric codes and accepts either the code or animal name", () => {
    const farm = makeFarm("流光代号测试农场", 20260822);
    farm.coins = 1000;
    farm.codex = Object.fromEntries(crops.map((crop) => [crop.id, { count: 1 }]));
    const world = {};
    const ticket = runGlimmer(farm, world, { op: "ticket" }, NOW);
    assert.equal(ticket.ok, true);

    const tracks = glimmerTracks(NOW, world);
    assert.equal(tracks.length, 3);
    const view = glimmerView(farm, world, NOW);
    tracks.forEach((track, index) => assert.match(view, new RegExp(`${index + 1}\\.${track.name}`)));

    const byCode = runGlimmer(farm, world, { op: "catch", animal: 1, dish: "不存在的料理" }, NOW);
    const byName = runGlimmer(
        farm,
        world,
        { op: "catch", animal: tracks[0].name, dish: "不存在的料理" },
        NOW,
    );
    assert.equal(byCode.ok, false);
    assert.equal(byCode.text, byName.text);
    assert.match(byCode.text, /料理柜里没有这份正常料理/);

    const outsideToday = runGlimmer(
        farm,
        world,
        { op: "catch", animal: tracks.length + 1, dish: "不存在的料理" },
        NOW,
    );
    assert.equal(outsideToday.ok, false);
    assert.match(outsideToday.text, /今日踪迹里没有/);
});

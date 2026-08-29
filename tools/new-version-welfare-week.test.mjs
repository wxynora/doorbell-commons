import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatch, makeFarm } from "../dist/game.js";
import { runGlimmer } from "../dist/glimmer.js";
import { onTaskEvent } from "../dist/tasks.js";
import {
    normalizeWelfareWeekFarm,
    recordWelfareWeekProgress,
    welfareWeekText,
    welfareWeekView,
} from "../dist/welfare-week.js";

const START_DATE = "2026-09-01";
const START_AT = Date.parse(`${START_DATE}T00:00:00+08:00`);
const DAY_MS = 24 * 60 * 60 * 1_000;
const dayAt = (day, hour = 12) => START_AT + (day - 1) * DAY_MS + hour * 60 * 60 * 1_000;
const ORIGINAL_START_DATE = process.env.AIFARM_WELFARE_WEEK_START_DATE;

test.after(() => {
    if (ORIGINAL_START_DATE === undefined)
        delete process.env.AIFARM_WELFARE_WEEK_START_DATE;
    else
        process.env.AIFARM_WELFARE_WEEK_START_DATE = ORIGINAL_START_DATE;
});

function welfareFarm(name = "福利测试农场") {
    const farm = makeFarm(name, 20260829, { aiName: "小机", humanName: "人类" });
    farm.coins = 100_000;
    return farm;
}

test("welfare week stays disabled without an explicit release start date", () => {
    const previous = process.env.AIFARM_WELFARE_WEEK_START_DATE;
    delete process.env.AIFARM_WELFARE_WEEK_START_DATE;
    try {
        const farm = welfareFarm();
        assert.deepEqual(recordWelfareWeekProgress(farm, "plant", 3, dayAt(1)), {
            active: false,
            changed: false,
            completed: false,
        });
        assert.equal(farm.welfareWeekV1, undefined);
        assert.equal(welfareWeekText(farm, dayAt(1)), "");
    }
    finally {
        if (previous === undefined)
            delete process.env.AIFARM_WELFARE_WEEK_START_DATE;
        else
            process.env.AIFARM_WELFARE_WEEK_START_DATE = previous;
    }
});

test("successful field actions drive day one and failed actions do not count", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const farm = welfareFarm();
    const now = dayAt(1);

    assert.equal(dispatch(farm, { action: "water", plotId: 1 }, now).ok, false);
    assert.equal(dispatch(farm, { action: "harvest", plotId: 1 }, now).ok, false);
    assert.equal(welfareWeekView(farm, now).tasks.every((task) => task.progress === 0), true);

    assert.equal(dispatch(farm, { action: "plant", common: 3 }, now).ok, true);
    assert.match(dispatch(farm, { action: "status" }, now).text, /🎉 新版本七日福利（第 1\/7 天）/);
    const planted = welfareWeekView(farm, now);
    assert.equal(planted.tasks.find((task) => task.kind === "plant").progress, 3);
    assert.equal(planted.completed, false);

    const watered = dispatch(farm, { action: "water" }, now);
    assert.equal(watered.ok, true);
    assert.match(
        watered.text,
        /🎁 新版本七日福利：第 1 天任务完成，获得 20,000 金、30 银。/,
    );
    assert.equal(welfareWeekView(farm, now).completed, true);
    assert.deepEqual(farm.welfareWeekV1.days[1].reward, {
        coins: 20_000,
        seeds: [],
        silver: 30,
    });

    const balance = { coins: farm.coins, silver: farm.silver };
    dispatch(farm, { action: "water", plotId: 1 }, now);
    assert.deepEqual({ coins: farm.coins, silver: farm.silver }, balance);
});

test("all seven days expose the approved task counts in their approved order", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const expected = [
        [["plant", 3], ["water", 3]],
        [["harvest", 3], ["plant", 3]],
        [["water", 5], ["glimmer_ticket", 1]],
        [["harvest", 5], ["daily_task", 1]],
        [["plant", 5], ["water", 5], ["harvest", 5]],
        [["plant", 6], ["water", 6], ["harvest", 6]],
        [["plant", 7], ["water", 7], ["harvest", 7]],
    ];
    const farm = welfareFarm();
    for (let day = 1; day <= 7; day += 1) {
        assert.deepEqual(
            welfareWeekView(farm, dayAt(day)).tasks.map((task) => [task.kind, task.target]),
            expected[day - 1],
        );
    }
});

test("days one through six each grant exactly 20,000 gold and 30 silver once", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const taskKinds = [
        ["plant", "water"],
        ["harvest", "plant"],
        ["water", "glimmer_ticket"],
        ["harvest", "daily_task"],
        ["plant", "water", "harvest"],
        ["plant", "water", "harvest"],
    ];
    const farm = welfareFarm();
    const startingGold = farm.coins;
    for (let day = 1; day <= 6; day += 1) {
        const now = dayAt(day);
        const view = welfareWeekView(farm, now);
        for (const kind of taskKinds[day - 1]) {
            const target = view.tasks.find((task) => task.kind === kind).target;
            recordWelfareWeekProgress(farm, kind, target, now);
        }
        assert.deepEqual(farm.welfareWeekV1.days[day].reward, {
            coins: 20_000,
            seeds: [],
            silver: 30,
        });
    }
    assert.equal(farm.coins, startingGold + 120_000);
    assert.equal(farm.silver, 180);
});

test("buying the daily Glimmer ticket completes participation without exploration", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const farm = welfareFarm();
    const now = dayAt(3, 20);
    farm.plots[0].crop = {
        growTicks: 10,
        progress: 0,
        ripe: false,
        seedType: "common",
        waterCount: 0,
    };
    for (let count = 0; count < 5; count += 1)
        assert.equal(dispatch(farm, { action: "water", plotId: 1 }, now).ok, true);

    const world = {};
    const result = runGlimmer(farm, world, { op: "ticket" }, now);
    assert.equal(result.ok, true);
    assert.match(result.text, /🎫 买下「流光原野」今日通票，-500 金。/);
    assert.match(
        result.text,
        /🎁 新版本七日福利：第 3 天任务完成，获得 20,000 金、30 银。/,
    );
    assert.equal(farm.glimmer.daily.explores, 0);
    assert.equal(farm.glimmer.daily.captures, 0);
    assert.equal(welfareWeekView(farm, now).completed, true);

    const balance = { coins: farm.coins, silver: farm.silver };
    assert.equal(runGlimmer(farm, world, { op: "ticket" }, now).ok, true);
    assert.deepEqual({ coins: farm.coins, silver: farm.silver }, balance);
});

test("an already purchased current-day Glimmer ticket still reconciles participation once", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const farm = welfareFarm();
    const now = dayAt(3, 20);
    farm.plots[0].crop = {
        growTicks: 10,
        progress: 0,
        ripe: false,
        seedType: "common",
        waterCount: 0,
    };
    for (let count = 0; count < 5; count += 1)
        dispatch(farm, { action: "water", plotId: 1 }, now);
    farm.glimmer = {
        ticketDay: Math.floor((now + 8 * 60 * 60 * 1_000) / DAY_MS),
    };

    const before = farm.coins;
    const result = runGlimmer(farm, {}, { op: "ticket" }, now);
    assert.equal(result.ok, true);
    assert.match(result.text, /今天的通票已经买过了，不会重复扣款/);
    assert.equal(farm.coins, before + 20_000);
    assert.equal(welfareWeekView(farm, now).completed, true);
});

test("one completed ordinary task satisfies the day four task exactly once", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const farm = welfareFarm();
    const now = dayAt(4);
    recordWelfareWeekProgress(farm, "harvest", 5, now);
    farm.task = {
        accepted: true,
        currency: "coin",
        kind: "harvest_n",
        offeredAt: now,
        progress: 0,
        reward: 40,
        seq: 1,
        target: 1,
    };
    assert.equal(onTaskEvent(farm, "harvest", now, { isNew: false, isUgc: false, rarity: "N" }), true);
    assert.equal(welfareWeekView(farm, now).completed, true);
    const balance = { coins: farm.coins, silver: farm.silver };
    assert.equal(onTaskEvent(farm, "harvest", now, { isNew: false, isUgc: false, rarity: "N" }), false);
    assert.deepEqual({ coins: farm.coins, silver: farm.silver }, balance);
});

test("day seven grants stable unique SP and SSR seeds and survives restart replay", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const farm = welfareFarm();
    farm.id = "WELFAR";
    const now = dayAt(7);
    recordWelfareWeekProgress(farm, "plant", 7, now);
    recordWelfareWeekProgress(farm, "water", 7, now);
    const result = recordWelfareWeekProgress(farm, "harvest", 7, now);
    assert.equal(result.completed, true);
    assert.equal(result.reward.coins, 30_000);
    assert.equal(result.reward.silver, 60);
    assert.equal(result.reward.seeds.filter((seed) => seed.rarity === "SP").length, 2);
    assert.equal(result.reward.seeds.filter((seed) => seed.rarity === "SSR").length, 4);
    assert.equal(new Set(result.reward.seeds.map((seed) => seed.id)).size, 6);
    assert.equal(
        result.reward.seeds.every((seed) => farm.seeds[seed.id] === 1),
        true,
    );
    assert.equal(
        farm.welfareWeekV1.days[7].pendingNotice,
        "🎁 新版本七日福利：第 7 天任务完成，获得 30,000 金、60 银、随机 SP 种子 ×2、随机 SSR 种子 ×4。",
    );

    const sameIdentity = welfareFarm();
    sameIdentity.id = farm.id;
    recordWelfareWeekProgress(sameIdentity, "plant", 7, now);
    recordWelfareWeekProgress(sameIdentity, "water", 7, now);
    const repeatedSelection = recordWelfareWeekProgress(sameIdentity, "harvest", 7, now);
    assert.deepEqual(
        repeatedSelection.reward.seeds.map((seed) => seed.id),
        result.reward.seeds.map((seed) => seed.id),
    );

    const restored = JSON.parse(JSON.stringify(farm));
    normalizeWelfareWeekFarm(restored);
    const beforeReplay = {
        coins: restored.coins,
        seeds: structuredClone(restored.seeds),
        silver: restored.silver,
    };
    recordWelfareWeekProgress(restored, "harvest", 7, now);
    assert.deepEqual(
        { coins: restored.coins, seeds: restored.seeds, silver: restored.silver },
        beforeReplay,
    );
    assert.match(
        welfareWeekText(restored, now),
        /🎉 新版本七日福利（第 7\/7 天）[\s\S]*种下任意种子（7\/7）[\s\S]*给地块浇水（7\/7）[\s\S]*收获作物（7\/7）/,
    );
    assert.equal(welfareWeekText(restored, dayAt(8)), "");
});

test("missed days are not backfilled when a later day starts", () => {
    process.env.AIFARM_WELFARE_WEEK_START_DATE = START_DATE;
    const farm = welfareFarm();
    recordWelfareWeekProgress(farm, "plant", 5, dayAt(5));
    assert.equal(farm.welfareWeekV1.days[1], undefined);
    assert.equal(farm.welfareWeekV1.days[2], undefined);
    assert.equal(farm.welfareWeekV1.days[3], undefined);
    assert.equal(farm.welfareWeekV1.days[4], undefined);
    assert.equal(farm.welfareWeekV1.days[5].progress.plant, 5);
});

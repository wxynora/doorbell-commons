import assert from "node:assert/strict";
import test from "node:test";

import { RANCH_RAID_COINS_PER_HOUR } from "../dist/config.js";
import { makeFarm } from "../dist/game.js";
import {
    RANCH_RAID_DAILY_CAP,
    catchRanchRaid,
    dispatchRanchRaid,
    settleRanchRaids,
} from "../dist/domain/ranch/raids.js";
import { ensureRanch } from "../dist/domain/ranch/state.js";
import { ranchAnimalCurrentProduceValue } from "../dist/domain/ranch/value.js";

const HOUR_MS = 60 * 60 * 1_000;
const BASE = Date.parse("2026-09-01T08:00:00+08:00");

test("ranch raids use one thousand coins per hour and a ten-thousand daily cap", () => {
    assert.equal(RANCH_RAID_COINS_PER_HOUR, 1000);
    assert.equal(RANCH_RAID_DAILY_CAP, 10000);
});

test("catching a one-hour dispatch pays the full one-thousand coin reservation", () => {
    const owner = makeFarm("派遣方", 1001);
    owner.id = "CAUGHT_ATTACKER";
    const target = makeFarm("守卫方", 2002);
    target.id = "CAUGHT_DEFENDER";
    const ownerRanch = ensureRanch(owner);
    ownerRanch.coins = 5000;
    ownerRanch.animals = [{ kindId: "chicken", level: 1, pending: 0, ticksSinceProduce: 0 }];
    const targetRanch = ensureRanch(target);
    targetRanch.coins = 0;

    const dispatched = dispatchRanchRaid(owner, target, 0, 1, BASE);
    assert.equal(dispatched.ok, true);
    assert.equal(dispatched.raid.reservedCoins, 1000);

    const caught = catchRanchRaid(target, [owner], dispatched.raid.id, BASE + 6 * 60 * 1000);
    assert.equal(caught.ok, true);
    assert.equal(caught.compensation, 1000);
    assert.equal(ownerRanch.coins, 4000);
    assert.equal(targetRanch.coins, 1000);
});

function settledFixture(targetSeed) {
    const owner = makeFarm("派遣方", 1001);
    owner.id = "GOOSE_ATTACKER";
    owner.aiName = "派遣小机";
    const target = makeFarm("守卫方", 2002);
    target.id = "GOOSE_DEFENDER";
    target.aiName = "守卫小机";
    target.rngState = targetSeed;

    const animal = { kindId: "chicken", level: 1, pending: 0, ticksSinceProduce: 0 };
    const ownerRanch = ensureRanch(owner);
    ownerRanch.coins = 5000;
    ownerRanch.animals = [animal];
    const targetRanch = ensureRanch(target);
    targetRanch.coins = 0;
    targetRanch.patrolGoose = { boughtAt: BASE };

    const dispatched = dispatchRanchRaid(owner, target, 0, 1, BASE);
    assert.equal(dispatched.ok, true);
    const currentProduceValue = ranchAnimalCurrentProduceValue(animal, BASE + HOUR_MS);
    const settlement = settleRanchRaids([owner, target], BASE + HOUR_MS);
    return { currentProduceValue, owner, ownerRanch, settlement, target, targetRanch };
}

test("patrol-goose interception rewards seventy-five percent of current produce value", () => {
    let caught = null;
    for (let seed = 1; seed <= 100 && !caught; seed += 1) {
        const fixture = settledFixture(seed);
        if (fixture.settlement.gooseCaught === 1)
            caught = fixture;
    }
    assert.ok(caught);

    const expectedReward = Math.round(caught.currentProduceValue * 0.75);
    assert.equal(caught.currentProduceValue, 25);
    assert.equal(expectedReward, 19);
    assert.equal(caught.targetRanch.coins, expectedReward);
    assert.equal(caught.ownerRanch.coins, 5000);
    assert.equal(caught.ownerRanch.raidIncome, undefined);
    assert.equal(caught.targetRanch.raidLoss, undefined);

    const history = caught.ownerRanch.raidHistory.entries[0];
    assert.equal(history.status, "goose-caught");
    assert.equal(history.coins, 0);
    assert.equal(history.rewardCoins, expectedReward);
    assert.match(caught.owner.inbox.at(-1).text, /保证金已全额退回，没有罚款或新增欠款/);
    assert.match(caught.target.inbox.at(-1).text, new RegExp(`折算 ${expectedReward} 金`));
});

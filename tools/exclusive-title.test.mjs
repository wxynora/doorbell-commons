import assert from "node:assert/strict";
import { titles } from "../dist/content.js";
import { makeFarm } from "../dist/game.js";
import { applyNazhiExclusiveTitleGrant } from "../dist/store.js";
import { checkTitles, equipTitle, isUnlocked, titlePrefix } from "../dist/titles.js";

const TITLE_ID = "nazhi_wangwang_delivery";
const target = makeFarm("目标农场", 123456, { aiName: "目标小机", humanName: "测试伴侣" });
target.id = "4ZSDR3";
const other = makeFarm("其他农场", 123456);
other.id = "OTHER1";

const definition = titles.find((title) => title.id === TITLE_ID);
assert.deepEqual(
    { name: definition?.name, manual: definition?.manual, color: definition?.color },
    { name: "汪汪送餐员", manual: true, color: undefined },
);
assert.deepEqual(checkTitles(target), []);
assert.equal(isUnlocked(target, TITLE_ID), false);
assert.equal((other.titles ?? []).includes(TITLE_ID), false);
assert.deepEqual(applyNazhiExclusiveTitleGrant([other]), { applied: false, count: 0, missing: true });

const first = applyNazhiExclusiveTitleGrant([target, other]);
assert.deepEqual(first, { applied: true, count: 1, missing: false });
assert.equal(target.titles.filter((id) => id === TITLE_ID).length, 1);
assert.equal((other.titles ?? []).includes(TITLE_ID), false);
assert.equal(isUnlocked(target, TITLE_ID), true);
assert.equal(target.log.filter((line) => line.includes("解锁称号「汪汪送餐员」")).length, 1);
assert.deepEqual(equipTitle(target, TITLE_ID), {
    ok: true,
    text: "🎖️ 已佩戴称号「汪汪送餐员」——串门和排行榜上会显示在名字前。",
});
assert.equal(titlePrefix(target), "✧汪汪送餐员✧");

const second = applyNazhiExclusiveTitleGrant([target, other]);
assert.deepEqual(second, { applied: false, count: 0, missing: false });
assert.equal(target.titles.filter((id) => id === TITLE_ID).length, 1);
assert.equal(target.log.filter((line) => line.includes("解锁称号「汪汪送餐员」")).length, 1);

console.log("exclusive title tests passed");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qixi2026, cropById, titles } from "../dist/content.js";
import { makeFarm, buyFromMarket, dispatch, listForSale } from "../dist/game.js";
import { ensureKitchen, harvest, humanBarterAccept, humanBarterList, kitchenCook, limitedShopPool, plant } from "../dist/engine.js";
import { metricValue, checkTitles, titlePrefix } from "../dist/titles.js";
import { uiCooking, uiHome } from "../dist/web.js";
import {
    buyAllQixi2026Seeds,
    buyQixi2026Seed,
    isQixi2026Active,
    normalizeQixi2026Farm,
    qixi2026CollectionComplete,
    qixi2026CompletionText,
    qixi2026CropUnlocked,
    qixi2026FishText,
    qixi2026HarvestSilver,
    qixi2026ShopRows,
    qixi2026TaskView,
    recordQixi2026Harvest,
    recordQixi2026Progress,
    recordQixi2026StealAttempt,
    settleQixi2026QuietTask,
    submitQixi2026Fish,
} from "../dist/qixi-2026.js";

const ACTIVE = Date.parse("2026-08-17T12:00:00+08:00");
const ENDED = Date.parse("2026-08-20T00:00:00+08:00");
const task = (kind) => qixi2026.tasks.find((item) => item.kind === kind);
const freshFarm = (name = "测试农场") => {
    const farm = makeFarm(name, 123456);
    farm.coins = 100000;
    farm.silver = 100000;
    normalizeQixi2026Farm(farm, ACTIVE);
    return farm;
};

assert.equal(isQixi2026Active(Date.parse("2026-08-14T00:00:00+08:00")), true);
assert.equal(isQixi2026Active(Date.parse("2026-08-19T23:59:59+08:00")), true);
assert.equal(isQixi2026Active(ENDED), false);
assert.equal(qixi2026.tasks.length, 7);
assert.equal(new Set(qixi2026.tasks.map((item) => item.id)).size, 7);
assert.equal(new Set(qixi2026.tasks.map((item) => item.cropId)).size, 7);
for (const item of qixi2026.tasks)
    assert.ok(cropById.has(item.cropId), `missing crop ${item.cropId}`);

const rarityCounts = qixi2026.tasks.reduce((out, item) => {
    const rarity = cropById.get(item.cropId).rarity;
    out[rarity] = (out[rarity] ?? 0) + 1;
    return out;
}, {});
assert.deepEqual(rarityCounts, { SR: 4, SSR: 3 });
for (const item of qixi2026.tasks) {
    const crop = cropById.get(item.cropId);
    assert.equal(crop.seedPrice, crop.rarity === "SSR" ? 600 : 300);
    assert.equal(crop.qixiSilverBase, crop.rarity === "SSR" ? 12 : 7);
}

// 一次完成只解锁一颗起步种子，重复事件不重复发。
{
    const farm = freshFarm();
    const water = task("water");
    assert.equal(qixi2026CropUnlocked(farm, water.cropId, ACTIVE), false);
    const done = recordQixi2026Progress(farm, "water", water.target, ACTIVE);
    assert.equal(done.completed, true);
    assert.equal(farm.seeds[water.cropId], 1);
    assert.match(qixi2026CompletionText(done), /已解锁「鹊桥藤」，并获得种子 ×1/);
    assert.equal(recordQixi2026Progress(farm, "water", 1, ACTIVE), null);
    assert.equal(farm.seeds[water.cropId], 1);
    assert.equal(qixi2026CropUnlocked(farm, water.cropId, ACTIVE), true);
    assert.equal(qixi2026TaskView(farm, ACTIVE).tasks.some((item) => item.id === water.id), false);
    assert.equal(qixi2026TaskView(farm, ACTIVE).tasks.length, 6);
}

// 48 小时任务按已鉴权偷菜发起重置，满时只结算一次。
{
    const farm = freshFarm();
    const quiet = task("quiet");
    const state = normalizeQixi2026Farm(farm, ACTIVE);
    state.startedAt = ACTIVE - quiet.target;
    state.quietSince = ACTIVE - quiet.target;
    assert.equal(recordQixi2026StealAttempt(farm, ACTIVE), true);
    assert.equal(settleQixi2026QuietTask(farm, ACTIVE + quiet.target - 1), null);
    const done = settleQixi2026QuietTask(farm, ACTIVE + quiet.target);
    assert.equal(done.completed, true);
    assert.equal(farm.seeds[quiet.cropId], 1);
    assert.equal(settleQixi2026QuietTask(farm, ACTIVE + quiet.target + 1), null);
}

// 银鲦只扣当次新实例、只扣到任务所需数量；完成后多出的鱼留在鱼篓。
{
    const farm = freshFarm();
    const state = {
        catchInventory: [
            { id: "old", fishId: "silver_dace" },
            { id: "new-1", fishId: "silver_dace" },
            { id: "new-2", fishId: "silver_dace" },
            { id: "new-3", fishId: "silver_dace" },
            { id: "other", fishId: "carp" },
        ],
    };
    const result = submitQixi2026Fish(farm, state, ["new-1", "new-2", "new-3", "other"], ACTIVE);
    assert.equal(result.submitted, 3);
    assert.equal(result.completed, true);
    assert.deepEqual(state.catchInventory.map((item) => item.id), ["old", "other"]);
    assert.match(qixi2026FishText(result), /^🎋 七夕任务：银鲦 ×3 已自动提交（3\/3）。/);
    state.catchInventory.push({ id: "after", fishId: "silver_dace" });
    assert.equal(submitQixi2026Fish(farm, state, ["after"], ACTIVE), null);
    assert.ok(state.catchInventory.some((item) => item.id === "after"));
    const endedFarm = freshFarm("结束后钓鱼");
    const endedState = { catchInventory: [{ id: "ended", fishId: "silver_dace" }] };
    assert.equal(submitQixi2026Fish(endedFarm, endedState, ["ended"], ENDED), null);
    assert.equal(endedState.catchInventory.length, 1);
}

// 黄油曲奇刚出锅即提交；完成后和活动结束后都正常进入料理柜。
{
    const farm = freshFarm();
    const kitchen = ensureKitchen(farm);
    Object.assign(kitchen.ingredients, { flour: 3, butter: 3, sugar: 3 });
    const first = kitchenCook(farm, ["flour", "butter", "sugar"], ACTIVE);
    assert.equal(first.qixi.completed, true);
    assert.equal(first.dish.recipeId, "butter_cookie");
    assert.equal(kitchen.dishes.some((dish) => dish.id === first.dish.id), false);
    const second = kitchenCook(farm, ["flour", "butter", "sugar"], ACTIVE);
    assert.equal(second.qixi, null);
    assert.ok(kitchen.dishes.some((dish) => dish.id === second.dish.id));

    const after = freshFarm("结束后");
    const afterKitchen = ensureKitchen(after);
    Object.assign(afterKitchen.ingredients, { flour: 1, butter: 1, sugar: 1 });
    const ended = kitchenCook(after, ["flour", "butter", "sugar"], ENDED);
    assert.equal(ended.qixi, null);
    assert.ok(afterKitchen.dishes.some((dish) => dish.id === ended.dish.id));
}

// 活动货架只列已解锁品种；单种可批量买到当日剩余额度。
{
    const farm = freshFarm();
    const quiet = task("quiet");
    const state = normalizeQixi2026Farm(farm, ACTIVE);
    state.startedAt = ACTIVE - quiet.target;
    state.quietSince = ACTIVE - quiet.target;
    settleQixi2026QuietTask(farm, ACTIVE);
    assert.deepEqual(qixi2026ShopRows(farm, ACTIVE).map((item) => item.id), [quiet.cropId]);
    const bought = buyQixi2026Seed(farm, quiet.cropId, ACTIVE, 5);
    assert.equal(bought.ok, true);
    assert.equal(bought.qty, 5);
    assert.equal(bought.cost, cropById.get(quiet.cropId).seedPrice * 5);
    assert.equal(buyQixi2026Seed(farm, quiet.cropId, ACTIVE).ok, false);
    assert.equal(qixi2026ShopRows(farm, ACTIVE)[0].left, 0);
    assert.deepEqual(qixi2026ShopRows(farm, ENDED), []);
}

// allin 原子买满所有已解锁品种；余额不足、未解锁和已经买满都不产生部分购买。
{
    const farm = freshFarm("全部买满");
    const water = task("water");
    const craft = task("craft");
    recordQixi2026Progress(farm, "water", water.target, ACTIVE);
    recordQixi2026Progress(farm, "craft", craft.target, ACTIVE);
    const first = buyQixi2026Seed(farm, water.cropId, ACTIVE, 2);
    assert.equal(first.ok, true);
    const beforeCoins = farm.coins;
    const all = buyAllQixi2026Seeds(farm, ACTIVE);
    assert.equal(all.ok, true);
    assert.deepEqual(all.items.map((item) => [item.id, item.qty]), [[water.cropId, 3], [craft.cropId, 5]]);
    assert.equal(farm.coins, beforeCoins - all.cost);
    assert.equal(qixi2026ShopRows(farm, ACTIVE).every((item) => item.left === 0), true);
    assert.match(buyAllQixi2026Seeds(farm, ACTIVE).error, /今天已经/);

    const poor = freshFarm("金币不足");
    recordQixi2026Progress(poor, "water", water.target, ACTIVE);
    recordQixi2026Progress(poor, "craft", craft.target, ACTIVE);
    poor.coins = 1;
    qixi2026ShopRows(poor, ACTIVE);
    const poorSeeds = structuredClone(poor.seeds);
    const poorBuys = structuredClone(poor.qixi2026.seedBuys);
    const rejected = buyAllQixi2026Seeds(poor, ACTIVE);
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /本次没有购买/);
    assert.equal(poor.coins, 1);
    assert.deepEqual(poor.seeds, poorSeeds);
    assert.deepEqual(poor.qixi2026.seedBuys, poorBuys);

    const locked = freshFarm("尚未解锁");
    assert.match(buyAllQixi2026Seeds(locked, ACTIVE).error, /还没有已解锁/);
    assert.match(buyAllQixi2026Seeds(locked, ENDED).error, /已经下架/);
}

// 参数只挂在原 buy-seed；完整商店提示 allin，状态摘要和 Human 首页不展示。
{
    const farm = freshFarm("购买入口");
    const water = task("water");
    recordQixi2026Progress(farm, "water", water.target, ACTIVE);
    const shop = dispatch(farm, { action: "shop" }, ACTIVE).text;
    assert.match(shop, /buy-seed \{"id":"作物名","qty":5\}/);
    assert.match(shop, /\{"allin":true\}，一次买满所有已解锁七夕种子的今日剩余额度/);
    assert.doesNotMatch(dispatch(farm, { action: "status" }, ACTIVE).text, /allin/);
    assert.doesNotMatch(uiHome(farm, ACTIVE, "human-key"), /allin/);
    const bought = dispatch(farm, { action: "buy-seed", id: water.cropId, qty: 2 }, ACTIVE);
    assert.equal(bought.ok, true);
    assert.match(bought.text, /鹊桥藤」×2/);
    const all = dispatch(farm, { action: "buy-seed", allin: true }, ACTIVE);
    assert.equal(all.ok, true);
    assert.ok(all.text.startsWith(`🛒 七夕限定种子已全部买满：鹊桥藤×3，共花费 ${cropById.get(water.cropId).seedPrice * 3} 金。`));
}

// 七夕作物不进入旧随机限定池；活动中不能绕过解锁直接种或从市场购买。
{
    const locked = freshFarm("未解锁");
    const cropId = task("water").cropId;
    locked.seeds[cropId] = 1;
    assert.equal(limitedShopPool(locked, ACTIVE, true).some((crop) => crop.id === cropId), false);
    assert.equal(plant(locked, 1, "limited", cropId, ACTIVE).ok, false);
    assert.equal(locked.seeds[cropId], 1);
    assert.equal(plant(locked, 1, "limited", cropId, ENDED).ok, true);

    const seller = freshFarm("卖家");
    recordQixi2026Progress(seller, "water", task("water").target, ACTIVE);
    seller.seeds[cropId] = 1;
    assert.equal(listForSale(seller, "seed", cropId, 1, ACTIVE).ok, true);
    const buyer = freshFarm("买家");
    assert.equal(buyFromMarket(seller, buyer, "seed", cropId, 1, ACTIVE).ok, false);
    recordQixi2026Progress(buyer, "water", task("water").target, ACTIVE);
    assert.equal(buyFromMarket(seller, buyer, "seed", cropId, 1, ACTIVE).ok, true);

    seller.seeds[cropId] = 1;
    const listing = humanBarterList(seller, "seed", cropId, 1, "material", "ordinary_stone", 1, ACTIVE);
    assert.equal(listing.ok, true);
    const lockedBarterBuyer = freshFarm("换物买家");
    lockedBarterBuyer.materials.ordinary_stone = 1;
    assert.equal(humanBarterAccept(seller, lockedBarterBuyer, listing.listing.id, ACTIVE).ok, false);
    recordQixi2026Progress(lockedBarterBuyer, "water", task("water").target, ACTIVE);
    assert.equal(humanBarterAccept(seller, lockedBarterBuyer, listing.listing.id, ACTIVE).ok, true);
}

// 七夕作物本体只结算银币，品相倍率生效；图鉴奖励和额外事件金币仍单列。
{
    const farm = freshFarm();
    const cropId = task("quiet").cropId;
    farm.plots[0].crop = { seedType: "limited", limitedId: cropId, growTicks: 12, progress: 12, ripe: true, waterCount: 0 };
    const beforeCoins = farm.coins;
    const beforeSilver = farm.silver;
    const result = harvest(farm, 1, ACTIVE);
    assert.equal(result.ok, true);
    assert.equal(result.currency, "silver");
    assert.equal(result.value, qixi2026HarvestSilver(result.crop, result.quality));
    assert.equal(farm.silver - beforeSilver, result.value);
    assert.equal(farm.coins - beforeCoins, result.codexReward + (result.bonus?.extraCoins ?? 0));

    const normal = freshFarm("普通限定");
    normal.plots[0].crop = { seedType: "limited", limitedId: "star_tide_coral_grass", growTicks: 15, progress: 15, ripe: true, waterCount: 0 };
    const normalCoins = normal.coins;
    const normalResult = harvest(normal, 1, ACTIVE);
    assert.equal(normalResult.currency, "gold");
    assert.equal(normal.coins - normalCoins, normalResult.value + normalResult.codexReward + (normalResult.bonus?.extraCoins ?? 0));
}

// 称号只看本人实际收获记录，不看普通图鉴；七种齐全后保持粉色定义。
{
    const farm = freshFarm();
    for (const item of qixi2026.tasks)
        farm.codex[item.cropId] = { count: 1, bestQuality: 2, firstAt: ACTIVE };
    assert.equal(qixi2026CollectionComplete(farm), false);
    assert.equal(metricValue(farm, "qixi2026Collection"), 0);
    for (const item of qixi2026.tasks)
        recordQixi2026Harvest(farm, cropById.get(item.cropId), "limited", ACTIVE);
    assert.equal(metricValue(farm, "qixi2026Collection"), 1);
    checkTitles(farm);
    assert.ok(farm.titles.includes(qixi2026.titleId));
    assert.equal(titles.find((title) => title.id === qixi2026.titleId).color, "#E86AA6");
    farm.titleEquipped = qixi2026.titleId;
    assert.equal(titlePrefix(farm), "✧缘来是小机✧");
    assert.match(uiHome(farm, ACTIVE, "human-key"), /color:#E86AA6[^>]*>✧缘来是小机✧/);
}

// 七项完成后任务区整体消失；活动结束后任务与货架都不再出现，永久成果保留。
{
    const farm = freshFarm();
    const quiet = task("quiet");
    const state = normalizeQixi2026Farm(farm, ACTIVE);
    state.startedAt = ACTIVE - quiet.target;
    state.quietSince = ACTIVE - quiet.target;
    settleQixi2026QuietTask(farm, ACTIVE);
    recordQixi2026Progress(farm, "water", task("water").target, ACTIVE);
    const fishState = { catchInventory: Array.from({ length: 3 }, (_, i) => ({ id: `f${i}`, fishId: "silver_dace" })) };
    submitQixi2026Fish(farm, fishState, fishState.catchInventory.map((item) => item.id), ACTIVE);
    recordQixi2026Progress(farm, "dish", 1, ACTIVE);
    recordQixi2026Progress(farm, "harvest_common", 21, ACTIVE);
    recordQixi2026Progress(farm, "harvest_fantasy", 7, ACTIVE);
    recordQixi2026Progress(farm, "craft", 1, ACTIVE);
    assert.equal(qixi2026TaskView(farm, ACTIVE).allComplete, true);
    const seeds = structuredClone(farm.seeds);
    assert.equal(qixi2026TaskView(farm, ENDED), null);
    assert.deepEqual(qixi2026ShopRows(farm, ENDED), []);
    assert.deepEqual(farm.seeds, seeds);
    assert.doesNotMatch(uiHome(farm, ACTIVE, "human-key"), /七夕限定任务/);
    assert.doesNotMatch(uiHome(farm, ENDED, "human-key"), /七夕限定任务/);
}

{
    const farm = freshFarm("任务卡");
    const html = uiHome(farm, ACTIVE, "human-key");
    const aiStatus = dispatch(farm, { action: "status" }, ACTIVE).text;
    assert.match(html, /七夕限定任务/);
    for (const item of qixi2026.tasks) {
        assert.match(html, new RegExp(item.label));
        assert.match(aiStatus, new RegExp(item.label));
    }
    assert.doesNotMatch(uiHome(farm, ENDED, "human-key"), /七夕限定任务/);

    const cooking = uiCooking(farm, ACTIVE, "human-key", undefined, JSON.stringify({
        name: "黄油曲奇", recipeId: "butter_cookie", rarity: "R", image: "butter_cookie.webp",
        qixi: { progress: 1, target: 1, completed: true, cropName: "巧果穗" },
    }));
    assert.match(cooking, /id="cookResultTitle">已自动提交</);
    assert.match(cooking, /黄油曲奇 ×1 已提交至七夕任务。/);
    assert.match(cooking, /已解锁「巧果穗」，并获得种子 ×1/);
    assert.match(cooking, />知道了<\/button>/);
}

const webSource = readFileSync(new URL("../dist/web.js", import.meta.url), "utf8");
assert.match(webSource, /已自动提交/);
assert.match(webSource, /黄油曲奇 ×1 已提交至七夕任务。/);
assert.match(webSource, /知道了/);
assert.match(webSource, /#E86AA6|titleColor/);

console.log("qixi-2026 targeted tests passed");

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, afterEach } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-game-refactor-"));
process.env.AIFARM_DATA_DIR = dataDirectory;
after(() => rmSync(dataDirectory, { recursive: true, force: true }));

const game = await import("../dist/game.js");
const { MESSAGES_MAX, NPC_ID, NPC_NAME, REPORT_THRESHOLD } = await import("../dist/config.js");
const { crops, materials, titles } = await import("../dist/content.js");
const { loadUgc } = await import("../dist/ugc.js");

afterEach(() => loadUgc([]));

const NOW = Date.parse("2026-08-26T14:00:00+08:00");
const EXPECTED_EXPORTS = [
  "HELP",
  "advance",
  "buyFromMarket",
  "buyNpcSeed",
  "dispatch",
  "farmView",
  "genCode",
  "hasDamagedPublicName",
  "listForSale",
  "makeFarm",
  "makeNpcFarm",
  "potionTargetLine",
  "ranchAgentSection",
  "ranchShopSection",
  "randomTip",
  "refPrice",
  "reportUgc",
  "shopBrief",
  "statusFooter",
  "tendNpc",
  "unlistItem",
  "viewBag",
  "viewEncyclopedia",
  "viewHot",
  "viewKitchen",
  "viewLedger",
  "viewMarket",
  "viewNpc",
  "viewShop",
  "visitView",
].sort();

function farm(name, id, seed = 1) {
  const value = game.makeFarm(name, seed, {
    aiName: `${name}小机`,
    humanName: `${name}伴侣`,
  });
  value.id = id;
  value.lastTickAt = NOW;
  value.shop.refreshAt = NOW;
  return value;
}

function ugc(id, name, buyers = [], extra = {}) {
  return {
    id,
    name,
    latin: `Testus ${id}`,
    desc: `${name}的描述`,
    category: "ugc",
    rarity: "SP",
    designer: `${name}设计者`,
    designerId: `${id}-designer`,
    buyers: [...buyers],
    ...extra,
  };
}

test("game facade keeps the exact 30-name public export set", () => {
  assert.equal(EXPECTED_EXPORTS.length, 30);
  assert.deepEqual(Object.keys(game).sort(), EXPECTED_EXPORTS);
});

test("NPC factory and tending preserve A-tu's fixed public farm shape", () => {
  const npc = game.makeNpcFarm();

  assert.equal(npc.id, NPC_ID);
  assert.equal(npc.name, NPC_NAME);
  assert.equal(npc.silver, 1_000_000);
  assert.match(npc.welcome, /杂货郎阿土的铺子/);
  assert.equal(npc.plots.length, 8);
  assert.deepEqual(
    npc.plots.slice(0, 6).map((plot) => [plot.crop.seedType, plot.crop.ripe]),
    [
      ["common", true],
      ["common", true],
      ["common", true],
      ["fantasy", true],
      ["fantasy", true],
      ["fantasy", true],
    ],
  );
  assert.deepEqual(
    npc.plots.slice(6).map((plot) => [plot.crop.seedType, plot.crop.progress, plot.crop.ripe]),
    [
      ["common", 1, false],
      ["fantasy", 1, false],
    ],
  );
  assert.deepEqual(npc.market, []);

  npc.welcome = "旧欢迎语";
  npc.market.push({ kind: "material", id: materials[0].id, qty: 2, price: 5 });
  npc.plots = [];
  npc.shop.refreshAt = NOW;
  game.tendNpc(npc, NOW);

  assert.match(npc.welcome, /杂货郎阿土的铺子/);
  assert.equal(npc.plots.length, 8);
  assert.equal(npc.plots.filter((plot) => plot.crop?.ripe).length, 6);
  assert.equal(npc.plots.filter((plot) => plot.crop && !plot.crop.ripe).length, 2);
  assert.deepEqual(npc.market, []);
});

test("NPC shop view and seed purchase keep stock, currency, inventory, and daily limit behavior", () => {
  const limited = crops.find((crop) => crop.category === "limited");
  assert.ok(limited, "expected at least one limited crop");
  const npc = game.makeNpcFarm();
  const buyer = farm("买种农场", "BUY-SEED", 17);
  buyer.coins = limited.seedPrice + 50;
  npc.shop.refreshAt = NOW;
  npc.shop.npcSeed = { id: limited.id, price: limited.seedPrice };

  const view = game.viewNpc(npc, "NPC-PUBLIC");
  assert.match(view, new RegExp(NPC_NAME));
  assert.match(view, new RegExp(limited.name));
  assert.match(view, /buy \{"to":"NPC-PUBLIC"/);

  const bought = game.buyNpcSeed(npc, buyer, limited.id, NOW);
  assert.deepEqual(bought, {
    ok: true,
    name: limited.name,
    qty: 1,
    cost: limited.seedPrice,
  });
  assert.equal(buyer.coins, 50);
  assert.equal(buyer.seeds[limited.id], 1);
  assert.ok(buyer.limitedSeedBuys.ids.includes(limited.id));
  assert.deepEqual(npc.shop.npcSeed, { id: limited.id, price: limited.seedPrice });

  const duplicate = game.buyNpcSeed(npc, buyer, limited.id, NOW);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /今天已经买过 1 颗/);
  assert.equal(buyer.coins, 50);
  assert.equal(buyer.seeds[limited.id], 1);
});

test("visit view selects the NPC storefront or a regular farm stall without leaking private state", () => {
  const limited = crops.find((crop) => crop.category === "limited");
  const npc = game.makeNpcFarm();
  npc.shop.refreshAt = NOW;
  npc.shop.npcSeed = { id: limited.id, price: limited.seedPrice };

  const npcVisit = game.visitView(npc, NOW, "VISITOR", "NPC-REF");
  assert.match(npcVisit, new RegExp(`${NPC_NAME}的铺子`));
  assert.match(npcVisit, /buy \{"to":"NPC-REF"/);
  assert.doesNotMatch(npcVisit, /「杂货郎阿土」的摊位/);
  assert.doesNotMatch(npcVisit, new RegExp(npc.token));
  assert.doesNotMatch(npcVisit, new RegExp(npc.humanKey));

  const regular = farm("邻居农场", "REGULAR-FARM", 23);
  const material = materials[0];
  regular.market = [{ kind: "material", id: material.id, qty: 2, price: 9 }];
  const regularVisit = game.visitView(regular, NOW, "VISITOR", "PUBLIC-42");
  assert.match(regularVisit, /「邻居农场」的摊位/);
  assert.match(regularVisit, new RegExp(material.name));
  assert.match(regularVisit, /buy \{"to":"PUBLIC-42"/);
  assert.doesNotMatch(regularVisit, new RegExp(`${NPC_NAME}的铺子`));
  assert.doesNotMatch(regularVisit, new RegExp(regular.token));
  assert.doesNotMatch(regularVisit, new RegExp(regular.humanKey));
});

test("visit messages honor the closed board and render only the configured newest messages", () => {
  const target = farm("留言农场", "MESSAGE-FARM", 31);
  target.messages = Array.from({ length: MESSAGES_MAX + 2 }, (_, index) => ({
    id: `message-${index + 1}`,
    by: `visitor-${index + 1}`,
    name: `访客${index + 1}`,
    text: `留言${index + 1}`,
  }));

  const open = game.visitView(target, NOW, "VIEWER", "MESSAGE-PUBLIC");
  assert.match(open, new RegExp(`留言板（${MESSAGES_MAX}）`));
  assert.doesNotMatch(open, /message-1\]/);
  assert.doesNotMatch(open, /message-2\]/);
  assert.match(open, /message-3\]/);
  assert.match(open, new RegExp(`message-${MESSAGES_MAX + 2}\\]`));
  assert.match(open, /message \{"to":"MESSAGE-PUBLIC","text":"\.\.\."\}/);

  target.guestbook = false;
  const closed = game.visitView(target, NOW, "VIEWER", "MESSAGE-PUBLIC");
  assert.match(closed, /留言板：主人已关闭/);
  assert.doesNotMatch(closed, /message-3\]/);
  assert.doesNotMatch(closed, /想留一句话/);
});

test("controlled tips and footer notices silently seed old saves then announce each later unlock once", () => {
  const subject = farm("提示农场", "TIP-FARM", 41);
  subject.humanName = "小渡";
  subject.coins = 50;
  const originalRandom = Math.random;

  try {
    Math.random = () => 0;
    assert.match(game.randomTip(subject), /出门给邻居家浇水/);

    Math.random = () => 0.999999;
    assert.match(game.randomTip(subject), /小渡可以给你回寄金币/);

    const official = crops.filter((crop) => crop.category !== "ugc");
    subject.codex = Object.fromEntries(official.slice(0, 5).map((crop) => [crop.id, {}]));
    delete subject.announcedUnlocks;

    const seeded = game.dispatch(subject, { action: "rename", name: "提示农场一号" }, NOW);
    assert.equal(seeded.ok, true);
    assert.doesNotMatch(seeded.text, /已上架商店/);
    assert.ok(subject.announcedUnlocks.includes("chicken"));
    assert.ok(subject.announcedUnlocks.includes("duck"));
    assert.ok(subject.announcedUnlocks.includes("cat"));
    assert.ok(subject.announcedUnlocks.includes("dog"));
    assert.equal(subject.announcedUnlocks.includes("quail"), false);

    subject.codex[official[5].id] = {};
    const unlocked = game.dispatch(subject, { action: "rename", name: "提示农场二号" }, NOW);
    assert.equal(unlocked.ok, true);
    assert.match(unlocked.text, /鹌鹑已上架商店/);
    assert.equal(subject.announcedUnlocks.filter((id) => id === "quail").length, 1);

    const repeated = game.dispatch(subject, { action: "rename", name: "提示农场三号" }, NOW);
    assert.equal(repeated.ok, true);
    assert.doesNotMatch(repeated.text, /鹌鹑已上架商店/);
    assert.equal(subject.announcedUnlocks.filter((id) => id === "quail").length, 1);
  } finally {
    Math.random = originalRandom;
  }
});

test("UGC reports are deduplicated, ban at the threshold, and hot view sorts unbanned crops by unique buyers", () => {
  const reported = ugc("ugc-reported", "待举报花", ["buyer-a"]);
  const hot = ugc("ugc-hot", "三人花", ["buyer-a", "buyer-b", "buyer-c"]);
  const warm = ugc("ugc-warm", "二人花", ["buyer-a", "buyer-b"]);
  const cool = ugc("ugc-cool", "一人花", ["buyer-a"]);
  const alreadyBanned = ugc("ugc-banned", "下架花", ["a", "b", "c", "d"], { banned: true });
  loadUgc([reported, warm, cool, hot, alreadyBanned]);

  const first = game.reportUgc(reported.id, "reporter-1");
  assert.deepEqual(first, {
    ok: true,
    name: reported.name,
    count: 1,
    banned: false,
  });
  const duplicate = game.reportUgc(reported.id, "reporter-1");
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /已经举报过/);
  assert.equal(reported.reportedBy.length, 1);

  for (let index = 2; index <= REPORT_THRESHOLD; index += 1) {
    const result = game.reportUgc(reported.id, `reporter-${index}`);
    assert.equal(result.ok, true);
    assert.equal(result.count, index);
    assert.equal(result.banned, index >= REPORT_THRESHOLD);
  }
  assert.equal(reported.banned, true);

  const ranking = game.viewHot();
  assert.ok(ranking.indexOf("三人花") < ranking.indexOf("二人花"));
  assert.ok(ranking.indexOf("二人花") < ranking.indexOf("一人花"));
  assert.doesNotMatch(ranking, /待举报花/);
  assert.doesNotMatch(ranking, /下架花/);
});

test("dispatch preserves representative handler shapes, aliases, and single-farm rejections", () => {
  const subject = farm("分发农场", "DISPATCH-FARM", 53);

  for (const action of ["shop", "bag", "kitchen", "market", "npc", "hot", "ledger"]) {
    const result = game.dispatch(subject, { action }, NOW);
    assert.deepEqual(Object.keys(result).sort(), ["ok", "text"]);
    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.text, "string");
  }

  const expeditionFarm = structuredClone(subject);
  const expFarm = structuredClone(subject);
  assert.deepEqual(
    game.dispatch(expeditionFarm, { action: "expedition" }, NOW),
    game.dispatch(expFarm, { action: "exp" }, NOW),
  );

  const exploreFarm = structuredClone(subject);
  const adventureFarm = structuredClone(subject);
  const explored = game.dispatch(exploreFarm, { action: "explore", charges: 1 }, NOW);
  const adventured = game.dispatch(adventureFarm, { action: "adventure", charges: 1 }, NOW);
  assert.deepEqual(explored, adventured);
  assert.deepEqual(exploreFarm.expedition, adventureFarm.expedition);
  assert.deepEqual(exploreFarm.expDaily, adventureFarm.expDaily);

  const socialText = game.dispatch(subject, { action: "wander" }, NOW).text;
  for (const action of ["wander", "steal", "visit"]) {
    assert.deepEqual(game.dispatch(subject, { action }, NOW), { ok: false, text: socialText });
  }
  assert.match(socialText, /联网社交功能/);
  assert.match(socialText, /单机 CLI 无其他农场/);

  const leaderboard = game.dispatch(subject, { action: "leaderboard" }, NOW);
  const ranking = game.dispatch(subject, { action: "ranking" }, NOW);
  assert.deepEqual(leaderboard, ranking);
  assert.equal(leaderboard.ok, false);
  assert.match(leaderboard.text, /排行榜是全服功能/);
  assert.match(leaderboard.text, /单机 CLI 只有你这一座农场/);

  const unknown = game.dispatch(subject, { action: "definitely-unknown" }, NOW);
  assert.deepEqual(unknown, { ok: false, text: "没有这个动作：definitely-unknown" });
});

test("failed and unknown dispatches still run the shared title backfill", () => {
  const coinTitle = titles.find((title) => title.field === "coins" && !title.manual);
  assert.ok(coinTitle, "expected a coin title");

  for (const [action, body, text] of [
    ["known failure", { action: "rename", name: "" }, /要给个新名字/],
    ["unknown", { action: "missing-handler" }, /没有这个动作/],
  ]) {
    const subject = farm(`${action}农场`, `${action}-FARM`, 67);
    subject.coins = coinTitle.min;
    subject.titles = [];

    const result = game.dispatch(subject, body, NOW);

    assert.equal(result.ok, false, action);
    assert.match(result.text, text, action);
    assert.ok(subject.titles.includes(coinTitle.id), action);
    assert.match(subject.log.at(-1), new RegExp(`解锁称号「${coinTitle.name}」`), action);
  }
});

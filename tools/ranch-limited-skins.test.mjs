import assert from "node:assert/strict";
import test from "node:test";

import { ranchSkinById, ranchSkins } from "../dist/content.js";
import { petBuffs } from "../dist/domain/ranch/residents.js";
import { buyRanchSkinItem, ranchSkinShop } from "../dist/domain/ranch/skins.js";
import { handleCommerceAction } from "../dist/game/actions/commerce.js";
import { ranchShopSection } from "../dist/game/presentation/shop.js";
import { glimmerAnimalVariantMultiplier, setGlimmerVariant } from "../dist/glimmer.js";
import { projectHumanRanch } from "../dist/server/ranch-structured.js";
import { ranchSprite } from "../dist/web/shell.js";

const SALE_START = Date.parse("2026-08-29T16:00:00.000Z");
const SALE_END = Date.parse("2026-09-29T16:00:00.000Z");

function makeFarm() {
    return {
        id: "ABC234",
        name: "限定测试农场",
        aiName: "小机",
        humanName: "人类",
        coins: 1_000_000,
        silver: 0,
        codex: {},
        ledger: [],
        log: [],
        ranch: {
            coins: 0,
            skins: [],
            animals: [
                { kindId: "rabbit", level: 1, pending: 0, pendingMeat: 0 },
                { kindId: "cloud_sheep", level: 1, pending: 0, pendingMeat: 0 },
            ],
            pets: [{ kindId: "cat" }, { kindId: "dog" }],
            raids: [],
            raidDebts: [],
            wardrobe: [],
            decor: [],
            decorStore: [],
        },
    };
}

test("limited ranch skins have one authoritative one-month sale window", () => {
    assert.equal(ranchSkins.length, 4);
    assert.deepEqual(
        ranchSkins.map((skin) => [skin.id, skin.price, skin.startsAt, skin.endsAt]),
        [
            ["pompompurin", 100_000, "2026-08-29T16:00:00.000Z", "2026-09-29T16:00:00.000Z"],
            ["hachiware", 100_000, "2026-08-29T16:00:00.000Z", "2026-09-29T16:00:00.000Z"],
            ["usagi", 100_000, "2026-08-29T16:00:00.000Z", "2026-09-29T16:00:00.000Z"],
            ["mysweetpiano", 100_000, "2026-08-29T16:00:00.000Z", "2026-09-29T16:00:00.000Z"],
        ],
    );
    assert.equal(ranchSkinShop(makeFarm(), SALE_START - 1).length, 0);
    assert.equal(ranchSkinShop(makeFarm(), SALE_START).length, 4);
    assert.equal(ranchSkinShop(makeFarm(), SALE_END - 1).length, 4);
    assert.equal(ranchSkinShop(makeFarm(), SALE_END).length, 0);
});

test("existing item purchase path buys each skin once with farm gold", () => {
    const farm = makeFarm();
    const purchase = buyRanchSkinItem(farm, "布丁狗", SALE_START);
    assert.deepEqual(purchase, {
        handled: true,
        ok: true,
        name: "布丁狗",
        qty: 1,
        left: 1,
        cost: 100_000,
    });
    assert.equal(farm.coins, 900_000);
    assert.deepEqual(farm.ranch.skins, ["pompompurin"]);
    assert.equal(buyRanchSkinItem(farm, "布丁狗", SALE_START).error, "「布丁狗」已经拥有，不需要重复购买。");
    assert.equal(buyRanchSkinItem(makeFarm(), "布丁狗", SALE_END).error, "「布丁狗」当前不在售。");
    assert.equal(buyRanchSkinItem(makeFarm(), "普通不存在物品", SALE_START).handled, false);
});

test("the existing buy-item commerce action purchases a skin without a new tool action", () => {
    const farm = makeFarm();
    Object.assign(farm, {
        items: {},
        seeds: {},
        materials: {},
        plots: [],
        shop: { refreshAt: 0, recipe: null, potionSet: null },
        market: [],
    });
    const result = handleCommerceAction("buy-item", farm, { item: "布丁狗" }, SALE_START);
    assert.equal(result.ok, true);
    assert.match(result.text, /^买下 1 个布丁狗，-100000金。（现有 1 个）/u);
    assert.deepEqual(farm.ranch.skins, ["pompompurin"]);
});

test("owned skins reuse variant switching and apply only while equipped", () => {
    const farm = makeFarm();
    farm.ranch.skins = ranchSkins.map((skin) => skin.id);

    assert.equal(setGlimmerVariant(farm, "pet", "cat", "hachiware").ok, true);
    assert.equal(setGlimmerVariant(farm, "pet", "dog", "pompompurin").ok, true);
    let buffs = petBuffs(farm);
    assert.ok(Math.abs(buffs.luck - 0.17) < Number.EPSILON);
    assert.ok(Math.abs(buffs.dropMult - 1.3) < Number.EPSILON);
    assert.ok(Math.abs(buffs.foil - 0.4) < Number.EPSILON);

    assert.equal(setGlimmerVariant(farm, "pet", "cat", "base").ok, true);
    assert.equal(setGlimmerVariant(farm, "pet", "dog", "base").ok, true);
    buffs = petBuffs(farm);
    assert.equal(buffs.luck, 0.12);
    assert.equal(buffs.dropMult, 1.25);
    assert.equal(buffs.foil, 0.35);

    assert.equal(setGlimmerVariant(farm, "animal", "rabbit", "usagi").ok, true);
    assert.equal(setGlimmerVariant(farm, "animal", "cloud_sheep", "mysweetpiano").ok, true);
    assert.equal(glimmerAnimalVariantMultiplier(farm.ranch.animals[0]), 1.3);
    assert.equal(glimmerAnimalVariantMultiplier(farm.ranch.animals[1]), 1.3);
    assert.equal(setGlimmerVariant(farm, "animal", "rabbit", "base").ok, true);
    assert.equal(glimmerAnimalVariantMultiplier(farm.ranch.animals[0]), 1);
});

test("strict ranch read projects the shop and named owned variants without mutation", () => {
    const farm = makeFarm();
    farm.ranch.skins = ["hachiware"];
    farm.ranch.pets[0].variantId = "hachiware";
    const before = structuredClone(farm);
    const read = projectHumanRanch(farm, SALE_START);
    assert.deepEqual(farm, before);
    assert.equal(read.data.shop.skins.status, "available");
    assert.equal(read.data.shop.skins.items.length, 4);
    assert.equal(read.data.shop.skins.items.find((item) => item.skin_id === "hachiware")?.owned, true);
    assert.deepEqual(read.data.residents.pets[0].variants.available_variants, [
        {
            variant_id: "base",
            name: "原始外观",
            atlas: null,
            set: null,
            sprite_index: null,
        },
        {
            variant_id: "hachiware",
            name: "小八",
            atlas: null,
            set: null,
            sprite_index: null,
        },
    ]);
});

test("farm shop output lists approved limited skin copy only during sale", () => {
    const farm = makeFarm();
    const during = ranchShopSection(farm, SALE_START);
    assert.match(during, /🎨 限定皮肤（08月30日—09月29日）/u);
    for (const skin of ranchSkins) assert.match(during, new RegExp(`· ${skin.name}（100000金）`, "u"));
    assert.doesNotMatch(ranchShopSection(farm, SALE_END), /限定皮肤/u);
    assert.equal(ranchSkinById.get("usagi")?.targetKindId, "rabbit");
    assert.match(ranchSprite(3, "乌萨奇", "", "usagi"), /assets\/ranch\/limited-skins\/usagi\.png/u);
});

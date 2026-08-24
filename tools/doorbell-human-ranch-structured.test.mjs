import assert from "node:assert/strict";
import test from "node:test";

const NOW = Date.parse("2026-08-24T04:00:00.000Z");

const { makeFarm } = await import("../dist/game.js");
const { projectHumanRanch } = await import("../dist/server/ranch-structured.js");

function ranchFarm() {
  const farm = makeFarm("牧场结构化测试农场");
  farm.id = "ABC234";
  farm.humanKey = "private-ranch-human-key";
  farm.coins = 1234;
  farm.codex = {
    carrot: { starred: true },
    wheat: { starred: false },
    tomato: { starred: true },
    potato: { starred: false },
    strawberry: { starred: true },
  };
  farm.ranch = {
    coins: 321,
    animals: [
      {
        kindId: "chicken",
        name: "小鸡",
        level: 2,
        pending: 1,
        pendingMeat: 1,
        pendingBoost: true,
        acc: ["cap", "missing-accessory"],
      },
      {
        kindId: "missing-animal",
        name: "不应被猜出的动物",
        level: 9,
        pending: 2,
      },
    ],
    pets: [
      { kindId: "cat", name: "小猫", acc: ["scarf", "missing-pet-accessory"] },
    ],
    patrolGoose: { name: "鹅队长", acc: ["straw_hat"] },
    pinned: ["chicken", "patrol_goose", "missing-animal"],
    wardrobe: ["flower_crown", "missing-wardrobe-item"],
    decor: ["flowerbed", "missing-placed-decoration"],
    decorStore: ["pond"],
    raidDebts: [{ creditorFarmId: "OTHER-PRIVATE-FARM", coins: 47 }],
    raids: [
      {
        id: "0f0f0f0f-0000-4000-8000-000000000001",
        animalKindId: "chicken",
        targetFarmId: "OTHER-PRIVATE-FARM",
        startedAt: NOW - 30 * 60 * 1000,
        endsAt: NOW + 30 * 60 * 1000,
        reservedCoins: 100,
      },
      {
        id: "bad-raid-id",
        animalKindId: "missing-animal",
        targetFarmId: "OTHER-PRIVATE-FARM",
        startedAt: "damaged",
        endsAt: NOW + 60 * 60 * 1000,
        reservedCoins: -1,
      },
    ],
    shop: {
      day: 2060,
      acc: ["cap", "missing-shop-accessory"],
      decor: ["pond", "missing-shop-decoration"],
    },
  };
  return farm;
}

test("Human ranch projection is pure, strict-shaped, and does not leak private farm identity", () => {
  const farm = ranchFarm();
  const before = structuredClone(farm);
  const result = projectHumanRanch(farm, NOW);

  assert.deepEqual(farm, before);
  assert.deepEqual(Object.keys(result).sort(), ["data", "revision", "server_time"]);
  assert.equal(result.data.farm.farm_doorplate, "ABC234");
  assert.equal(result.data.balance.ranch_coins, 321);
  assert.equal(result.data.balance.debt_coins, 47);
  assert.equal(result.data.residents.animals.length, 2);
  assert.equal(result.data.residents.pets.length, 1);
  assert.equal(result.data.residents.patrol_goose.identity.kind_id, "patrol_goose");
  assert.equal(result.data.residents.animals[0].produce.item.pending_count, 1);
  assert.equal(result.data.dispatch.active.length, 2);
  assert.equal(result.data.dispatch.active[0].target_farm_doorplate, undefined);
  assert.equal(result.data.shop.accessories.shop_day, 2060);
  assert.match(result.revision, /^ranch-v1:[0-9a-f]{64}$/);
  assert.equal(result.server_time, new Date(NOW).toISOString());

  const encoded = JSON.stringify(result);
  assert.equal(encoded.includes("humanKey"), false);
  assert.equal(encoded.includes("private-ranch-human-key"), false);
  assert.equal(encoded.includes("OTHER-PRIVATE-FARM"), false);
  assert.equal(encoded.includes("targetFarmId"), false);
});

test("Unknown or damaged Ranch IDs stay neutral unavailable instead of being guessed", () => {
  const result = projectHumanRanch(ranchFarm(), NOW);
  const [knownAnimal, unavailableAnimal] = result.data.residents.animals;
  assert.equal(knownAnimal.identity.status, "known");
  assert.equal(unavailableAnimal.identity.status, "unavailable");
  assert.equal(unavailableAnimal.identity.kind_id, null);
  assert.equal(unavailableAnimal.identity.name, null);
  assert.equal(result.data.residents.animals[0].accessories.items[1].status, "unavailable");
  assert.equal(result.data.wardrobe.items[1].status, "unavailable");
  assert.equal(result.data.decorations.placed[1].status, "unavailable");
  assert.equal(result.data.shop.accessories.items[1].status, "unavailable");
  assert.equal(result.data.shop.decorations.items[1].status, "unavailable");
  assert.equal(result.data.dispatch.active[1].status, "unavailable");
  assert.equal(result.data.dispatch.active[1].animal_kind_id, null);
});

test("A farm without an initialized ranch does not synthesize a shop or residents", () => {
  const farm = makeFarm("没有牧场");
  farm.id = "DEF567";
  farm.humanKey = "unavailable-ranch-human-key";
  const before = structuredClone(farm);
  const result = projectHumanRanch(farm, NOW);

  assert.deepEqual(farm, before);
  assert.equal(result.data.balance.status, "unavailable");
  assert.equal(result.data.residents.status, "unavailable");
  assert.equal(result.data.shop.animals.status, "unavailable");
  assert.equal(result.data.shop.accessories.status, "unavailable");
  assert.deepEqual(result.data.residents.animals, []);
  assert.deepEqual(result.data.residents.pets, []);
  assert.equal(result.data.residents.patrol_goose, null);
});

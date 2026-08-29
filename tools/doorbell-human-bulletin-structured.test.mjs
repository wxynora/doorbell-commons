import assert from "node:assert/strict";
import test from "node:test";

const NOW = Date.parse("2026-08-25T04:00:00.000Z");

const { TICK_MS } = await import("../dist/config.js");
const { makeFarm } = await import("../dist/game.js");
const { projectHumanField } = await import("../dist/server/human-structured.js");
const {
  projectHumanBulletin,
  projectHumanBulletinSource,
} = await import("../dist/server/bulletin-structured.js");

function fixtureFarm() {
  const farm = makeFarm("叮咚测试农场");
  farm.id = "ABC234";
  farm.humanKey = "must-not-leak-human-key";
  farm.token = "must-not-leak-token";
  farm.lastTickAt = NOW - 2 * TICK_MS;
  farm.plots = [
    { id: 2, crop: { seedType: "fantasy", growTicks: 3, progress: 1, ripe: false, waterCount: 2, hidden: "no" } },
    { id: 1, crop: { seedType: "common", growTicks: 3, progress: 3, ripe: true, waterCount: 1 } },
    { id: 3, crop: { seedType: "limited", growTicks: 9, progress: 1, ripe: false, waterCount: 0 } },
  ];
  farm.task = {
    seq: 7,
    kind: "craft",
    target: 1,
    progress: 0,
    reward: 60,
    currency: "coin",
    accepted: true,
    offeredAt: NOW - 60_000,
    privateTaskField: "must-not-leak",
  };
  farm.messages = [
    { id: "old", by: "ABC234", name: "旧访客", text: "旧留言", at: NOW - 180_000, private: true },
    { id: "bad-author", by: "not-a-doorplate", text: "门牌损坏的留言", at: NOW - 120_000 },
    { id: "new", by: "DEF567", name: "新访客", text: "新留言", at: NOW - 60_000 },
  ];
  farm.ranch = {
    animals: [],
    notices: [
      { at: NOW - 120_000, text: "旧牧场通知", section: "ranch", private: true },
      { at: NOW - 30_000, text: "新牧场通知", section: "ranch" },
    ],
    privateRanchField: "must-not-leak",
  };
  return farm;
}

test("Human bulletin is a pure read with real ordered entries and filtered fields", () => {
  const farm = fixtureFarm();
  const before = structuredClone(farm);
  const result = projectHumanBulletin(farm, NOW);

  assert.deepEqual(farm, before);
  assert.deepEqual(Object.keys(result).sort(), ["data", "revision", "server_time", "subject"]);
  assert.deepEqual(result.subject, { farm_doorplate: "ABC234" });
  assert.match(result.revision, /^farm-bulletin-v1:[0-9a-f]{64}$/);
  assert.equal(result.server_time, new Date(NOW).toISOString());
  assert.deepEqual(Object.keys(result.data.unavailable), []);
  assert.deepEqual(result.data.available.tasks, [
    {
      kind: "craft",
      description: "熔炼 1 次",
      progress: 0,
      target: 1,
      reward: 60,
      currency: "coin",
    },
  ]);
  assert.deepEqual(result.data.available.mature_plots, [
    { plot_id: 1, seed_type: "common", watered: 1 },
    { plot_id: 2, seed_type: "fantasy", watered: 2 },
  ]);
  const field = projectHumanField(farm, NOW);
  assert.deepEqual(
    result.data.available.mature_plots.map((plot) => plot.plot_id),
    field.data.plots.filter((plot) => plot.state === "ripe").map((plot) => plot.plot_id),
  );
  assert.deepEqual(result.data.available.messages, [
    {
      id: "new",
      author_farm_doorplate: "DEF567",
      author_name: "新访客",
      text: "新留言",
      at: "2026-08-25T03:59:00.000Z",
    },
    {
      id: "bad-author",
      author_farm_doorplate: null,
      author_name: null,
      text: "门牌损坏的留言",
      at: "2026-08-25T03:58:00.000Z",
    },
    {
      id: "old",
      author_farm_doorplate: "ABC234",
      author_name: "旧访客",
      text: "旧留言",
      at: "2026-08-25T03:57:00.000Z",
    },
  ]);
  assert.deepEqual(result.data.available.ranch_notifications, [
    { text: "新牧场通知", at: "2026-08-25T03:59:30.000Z", section: "ranch" },
    { text: "旧牧场通知", at: "2026-08-25T03:58:00.000Z", section: "ranch" },
  ]);
  const encoded = JSON.stringify(result);
  assert.equal(encoded.includes("must-not-leak-human-key"), false);
  assert.equal(encoded.includes("must-not-leak-token"), false);
  assert.equal(encoded.includes("must-not-leak"), false);
  assert.equal(encoded.includes("farm-bulletin-reminder-v1"), false);
});

test("acknowledged stable reminder keys are filtered without mutating their source facts", () => {
  const farm = fixtureFarm();
  const source = projectHumanBulletinSource(farm, NOW);
  const acknowledged = Object.values(source.data.available)
    .flat()
    .map((entry) => entry.reminder_key);
  for (const reminderKey of acknowledged) {
    assert.match(reminderKey, /^farm-bulletin-reminder-v1:[0-9a-f]{64}$/);
  }
  farm.doorbellHumanBulletinReadState = {
    acknowledged_reminder_keys: acknowledged,
    receipts: {},
  };
  const sourcesBefore = structuredClone({
    task: farm.task,
    plots: farm.plots,
    messages: farm.messages,
    ranchNotices: farm.ranch.notices,
  });

  const consumed = projectHumanBulletin(farm, NOW);
  assert.deepEqual(consumed.data.available, {
    tasks: [],
    mature_plots: [],
    messages: [],
    ranch_notifications: [],
  });
  assert.deepEqual(
    { task: farm.task, plots: farm.plots, messages: farm.messages, ranchNotices: farm.ranch.notices },
    sourcesBefore,
  );

  farm.messages.push({ id: "newer", by: "DEF567", name: "新访客", text: "又来一条", at: NOW });
  farm.task.progress = 1;
  farm.ranch.notices.push({ at: NOW, text: "通知发生变化", section: "ranch" });
  farm.harvested = 1;
  const changed = projectHumanBulletin(farm, NOW);
  assert.deepEqual(changed.data.available.messages.map((entry) => entry.id), ["newer"]);
  assert.deepEqual(changed.data.available.tasks.map((entry) => entry.progress), [1]);
  assert.deepEqual(changed.data.available.ranch_notifications.map((entry) => entry.text), [
    "通知发生变化",
  ]);
  assert.deepEqual(changed.data.available.mature_plots.map((entry) => entry.plot_id), [1, 2]);
});

test("uninitialized bulletin sources stay in the unavailable partition", () => {
  const farm = makeFarm("空白叮咚测试农场");
  farm.id = "DEF567";
  delete farm.task;
  delete farm.plots;
  delete farm.messages;
  delete farm.ranch;

  const result = projectHumanBulletin(farm, NOW);
  assert.deepEqual(Object.keys(result.data.available), []);
  assert.deepEqual(Object.keys(result.data.unavailable).sort(), [
    "mature_plots",
    "messages",
    "ranch_notifications",
    "tasks",
  ]);
  for (const section of Object.values(result.data.unavailable)) {
    assert.equal(section.reason, "not_initialized");
    assert.equal(typeof section.message, "string");
  }
});

test("unknown or inconsistent persisted task identity stays unavailable", () => {
  const farm = makeFarm("未知任务叮咚测试农场");
  farm.id = "GHJ789";
  farm.task = {
    kind: "task_from_future",
    target: 1,
    progress: 0,
    reward: 1,
    currency: "coin",
    accepted: true,
  };

  const before = structuredClone(farm);
  const result = projectHumanBulletin(farm, NOW);
  assert.deepEqual(farm, before);
  assert.equal(result.data.available.tasks, undefined);
  assert.equal(result.data.unavailable.tasks.reason, "invalid_persisted_state");
  assert.equal(JSON.stringify(result).includes("task_from_future"), false);
});

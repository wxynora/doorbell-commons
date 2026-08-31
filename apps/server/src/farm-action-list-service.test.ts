import assert from "node:assert/strict";
import { test } from "node:test";
import { CommunityDatabase } from "./community-database.js";
import type { FarmActionListAuthorityReader } from "./farm-action-list-preflight.js";
import { FarmActionListService } from "./farm-action-list-service.js";

const MANUAL_KEY = "00000000-0000-4000-8000-000000000101";
const HARVEST_ID = "00000000-0000-4000-8000-000000000201";
const NOTE_ID = "00000000-0000-4000-8000-000000000202";
const LIST_ID = "00000000-0000-4000-8000-000000000301";
const SECOND_LIST_ID = "00000000-0000-4000-8000-000000000302";

function harness() {
  const database = new CommunityDatabase(":memory:", {
    generateAccountId: () => "account-1",
    generateHomeId: () => "home-1",
    generateResidentId: () => "resident-1",
    generateSessionToken: () => "session-1",
  });
  database.createHumanSession("10001", 1_000, {
    farmDoorplate: "ABC234",
    farmHumanKey: "human-key-1",
    homeName: "小屋",
    residentName: "辛玥 & 小机",
  });
  let now = 10_000;
  let notificationIndex = 0;
  let wakeIndex = 0;
  let listIndex = 0;
  const authority: FarmActionListAuthorityReader = {
    readField: async () => ({
      maturePlotCount: 0,
      emptyPlotCount: 2,
      commonSeeds: 2,
      fantasySeeds: 0,
      limitedSeeds: {},
    }),
    readSteal: async () => ({ targets: [] }),
    readFish: async () => ({ remainingAttempts: 0, availableBaits: [] }),
    readExplore: async () => ({ remainingCharges: 0, activeJourney: false }),
    resolveCook: async () => ({
      actionable: false,
      displayText: "做饭",
      reason: "当前食材不足",
      call: null,
    }),
    resolveActivity: async () => ({
      actionable: false,
      displayText: "参加活动",
      reason: "当前活动已完成",
      call: null,
    }),
    readActivities: async () => [],
  };
  const context = {
    humanName: "辛玥",
    profile: {
      residentId: "resident-1",
      homeId: "home-1",
      farmDoorplate: "ABC234",
      farmHumanKey: "human-key-1",
    },
  };
  const service = new FarmActionListService({
    database,
    authority,
    now: () => now,
    generateListId: () => [LIST_ID, SECOND_LIST_ID][listIndex++] ?? SECOND_LIST_ID,
    generateNotificationId: () => `notification-${++notificationIndex}`,
    generateWakeId: () => `wake-${++wakeIndex}`,
    profileResolver: { resolve: async () => context },
  });
  return {
    context,
    database,
    service,
    setNow(value: number) {
      now = value;
    },
  };
}

test("one Human profile can keep multiple independent action-list cards", () => {
  const { database, service } = harness();
  try {
    service.create("resident-1", {
      name: "每日活跃",
      enabled: true,
      schedule: {
        kind: "daily_window",
        start_time: "09:00",
        end_time: "21:00",
        interval_minutes: 120,
      },
      items: [{ item_id: HARVEST_ID, kind: "harvest" }],
    });
    service.create("resident-1", {
      name: "睡前收尾",
      enabled: false,
      schedule: null,
      items: [{ item_id: NOTE_ID, kind: "note", text: "看看今天的农场" }],
    });
    assert.deepEqual(
      service.readAll("resident-1").map((list) => [list.list_id, list.name, list.enabled]),
      [
        [LIST_ID, "每日活跃", true],
        [SECOND_LIST_ID, "睡前收尾", false],
      ],
    );
  } finally {
    database.close();
  }
});

test("a Human action list persists, crosses completed actions, and sends only remaining items", async () => {
  const { context, database, service } = harness();
  try {
    const saved = service.create("resident-1", {
      name: "每日活跃",
      enabled: false,
      schedule: null,
      items: [
        { item_id: HARVEST_ID, kind: "harvest" },
        { item_id: NOTE_ID, kind: "note", text: "给翘翘带一句晚安" },
      ],
    });
    assert.equal(saved.revision, 1);

    const result = await service.notifyManual(context, LIST_ID, MANUAL_KEY);
    assert.equal(result.notificationStatus, "sent");
    assert.equal(result.list.items[0]?.status, "crossed");
    assert.equal(result.list.items[0]?.reason, "当前没有成熟作物");
    assert.equal(result.list.items[1]?.status, "active");
    assert.deepEqual(
      database.listPendingBellWakes("resident-1").map((wake) => ({
        reason: wake.reason,
        text: wake.payload?.text,
      })),
      [
        {
          reason: "farm_action_list",
          text: "【📢来自铃野的通知】\n你的人类辛玥给你留了这次要做的事：\n1. 给翘翘带一句晚安",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("an all-crossed one-time list creates no Bell wake and disables itself", async () => {
  const { database, service, setNow } = harness();
  try {
    const triggerAt = 20_000;
    service.create("resident-1", {
      name: "收菜提醒",
      enabled: true,
      schedule: { kind: "once", trigger_at: new Date(triggerAt).toISOString() },
      items: [{ item_id: HARVEST_ID, kind: "harvest" }],
    });
    setNow(triggerAt);
    await service.sendScheduled(LIST_ID, "resident-1", triggerAt);
    const current = service.readAll("resident-1")[0];
    assert.ok(current);
    assert.equal(current.enabled, false);
    assert.equal(current.next_trigger_at, null);
    assert.equal(current.last_notification?.status, "all_crossed");
    assert.equal(database.listPendingBellWakes("resident-1").length, 0);
  } finally {
    database.close();
  }
});

test("action-list Bell wakes use the normal ack lifecycle", async () => {
  const { context, database, service } = harness();
  try {
    service.create("resident-1", {
      name: "晚间提醒",
      enabled: false,
      schedule: null,
      items: [{ item_id: NOTE_ID, kind: "note", text: "看看今天的农场" }],
    });
    await service.notifyManual(context, LIST_ID, MANUAL_KEY);
    const wake = database.listPendingBellWakes("resident-1")[0];
    assert.ok(wake);
    assert.equal(database.acknowledgeBellWake("resident-1", wake.wakeId, 12_000), "acked");
    assert.equal(database.listPendingBellWakes("resident-1").length, 0);
  } finally {
    database.close();
  }
});

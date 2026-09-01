import assert from "node:assert/strict";
import { test } from "node:test";
import type { FarmActionListItem } from "@doorbell/protocol";
import {
  buildFarmActionListNotificationText,
  FarmActionListInvalidExampleError,
} from "./farm-action-list-message.js";
import {
  type FarmActionListAuthorityReader,
  preflightFarmActionList,
} from "./farm-action-list-preflight.js";
import { nextFarmActionListTriggerAt } from "./farm-action-list-time.js";

const profile = {
  residentId: "resident-1",
  homeId: "home-1",
  farmDoorplate: "6",
  farmHumanKey: "server-only",
};

test("action-list notification ends at the last task and adds examples only when needed", () => {
  const text = buildFarmActionListNotificationText("辛玥", [
    { text: "收菜", toolCalls: [{ op: "farm.harvest", args: {} }] },
    { text: "种菜", toolCalls: [{ op: "farm.plant", args: {} }] },
  ]);
  assert.equal(
    text,
    [
      "【📢来自铃野的通知】",
      "你的人类辛玥给你留了这次要做的事：",
      "1. 收菜",
      '   工具示例：{"op":"farm.harvest","args":{}}',
      "2. 种菜",
    ].join("\n"),
  );
  assert.throws(
    () =>
      buildFarmActionListNotificationText("辛玥", [
        { text: "坏例子", toolCalls: [{ op: "farm.harvest", args: { plotId: 0 } }] },
      ]),
    FarmActionListInvalidExampleError,
  );
});

test("preflight crosses completed facts and leaves authority failures visible", async () => {
  const items: FarmActionListItem[] = [
    { item_id: "00000000-0000-4000-8000-000000000001", kind: "harvest" },
    { item_id: "00000000-0000-4000-8000-000000000002", kind: "explore" },
    {
      item_id: "00000000-0000-4000-8000-000000000003",
      kind: "note",
      text: "看看留言",
    },
    {
      item_id: "00000000-0000-4000-8000-000000000004",
      kind: "fish",
    },
    {
      item_id: "00000000-0000-4000-8000-000000000005",
      kind: "activity",
      activity_id: "glimmer",
    },
    {
      item_id: "00000000-0000-4000-8000-000000000006",
      kind: "water",
    },
  ];
  const authority: FarmActionListAuthorityReader = {
    readField: async () => ({
      maturePlotCount: 0,
      emptyPlotCount: 1,
      commonSeeds: 1,
      fantasySeeds: 0,
      limitedSeeds: {},
    }),
    readSteal: async () => ({ targets: [] }),
    readWater: async () => ({
      targets: [{ target: "4" }],
      visitedTargets: [{ target: "1" }, { target: "3" }],
    }),
    readFish: async () => {
      throw new Error("unavailable");
    },
    readExplore: async () => ({ remainingCharges: 0, activeJourney: false }),
    resolveCook: async () => ({
      actionable: false,
      displayText: "做饭",
      reason: "缺少材料",
      call: null,
    }),
    resolveActivity: async () => ({
      actionable: false,
      displayText: "参加活动：流光原野",
      reason: "今天已经参加过",
      call: { op: "farm.glimmer.status", args: {} },
    }),
    readActivities: async () => [],
  };
  const checked = await preflightFarmActionList(profile, items, authority);
  assert.deepEqual(
    checked.map((entry) => ({ status: entry.view.status, reason: entry.view.reason })),
    [
      { status: "crossed", reason: "当前没有成熟作物" },
      { status: "crossed", reason: "今日探险次数已用完" },
      { status: "active", reason: null },
      { status: "authority_unavailable", reason: "权威状态暂时无法核对" },
      { status: "crossed", reason: "今天已经参加过" },
      { status: "active", reason: null },
    ],
  );
  assert.deepEqual(
    checked.flatMap((entry) => (entry.messageItem ? [entry.messageItem.text] : [])),
    ["看看留言", "钓鱼", "帮邻居浇水（今天已浇：1、3）"],
  );
  assert.deepEqual(checked[5]?.messageItem?.toolCalls, []);

  const [allVisited] = await preflightFarmActionList(
    profile,
    [{ item_id: "00000000-0000-4000-8000-000000000006", kind: "water" }],
    {
      ...authority,
      readWater: async () => ({ targets: [], visitedTargets: [{ target: "1" }] }),
    },
  );
  assert.equal(allVisited?.view.status, "crossed");
  assert.equal(allVisited?.view.reason, "今天可浇的邻居都已经去过");
  assert.equal(allVisited?.messageItem, null);
});

test("daily list scheduling uses the next Beijing occurrence", () => {
  const beforeNine = Date.parse("2026-08-31T00:30:00.000Z");
  const afterNine = Date.parse("2026-08-31T01:30:00.000Z");
  assert.equal(
    nextFarmActionListTriggerAt(
      { kind: "daily_window", start_time: "09:00", end_time: "21:00", interval_minutes: 60 },
      true,
      beforeNine,
    ),
    Date.parse("2026-08-31T01:00:00.000Z"),
  );
  assert.equal(
    nextFarmActionListTriggerAt(
      { kind: "daily_window", start_time: "09:00", end_time: "21:00", interval_minutes: 60 },
      true,
      afterNine,
    ),
    Date.parse("2026-08-31T02:00:00.000Z"),
  );
});

/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  loadLingyeAfterOpen,
  loadSharedMemesAfterOpen,
  preferencePatchForCandidateAction,
} from "./app";

test("candidate preference actions map to one exact settings field", () => {
  const cases = [
    [
      {
        type: "notification-preference-save",
        field: "pauseAllWakeups",
        value: true,
      },
      { notification_preferences: { pause_all_wakeups: true } },
    ],
    [
      {
        type: "notification-preference-save",
        field: "visitRequestsAndInvitationsEnabled",
        value: false,
      },
      { notification_preferences: { visit_requests_and_invitations_enabled: false } },
    ],
    [
      {
        type: "notification-preference-save",
        field: "activityInvitationsEnabled",
        value: false,
      },
      { notification_preferences: { activity_invitations_enabled: false } },
    ],
    [
      {
        type: "notification-preference-save",
        field: "importantSystemNotificationsEnabled",
        value: false,
      },
      { notification_preferences: { important_system_notifications_enabled: false } },
    ],
    [
      {
        type: "community-connection-preference-save",
        field: "defaultConnectionDurationMinutes",
        value: 15,
      },
      { community_connection_preferences: { default_connection_duration_minutes: 15 } },
    ],
    [
      {
        type: "community-connection-preference-save",
        field: "initialRecentActivityCount",
        value: null,
      },
      { community_connection_preferences: { initial_recent_activity_count: null } },
    ],
    [
      {
        type: "community-connection-preference-save",
        field: "chatMode",
        value: "listening",
      },
      { community_connection_preferences: { chat_mode: "listening" } },
    ],
    [
      {
        type: "community-connection-preference-save",
        field: "allowActivityRoomWarmup",
        value: false,
      },
      { community_connection_preferences: { allow_activity_room_warmup: false } },
    ],
  ] as const;

  for (const [action, expected] of cases) {
    assert.deepEqual(preferencePatchForCandidateAction(action), expected);
  }
  assert.equal(
    preferencePatchForCandidateAction({
      type: "home-settings-save",
      field: "homeName",
      value: "渡的小屋",
    }),
    null,
  );
});

test("shared meme View loading reaches ready only after the real list loader resolves", async () => {
  const events: string[] = [];
  const data = {
    library: {
      checksum_sha256: "a".repeat(64),
      entry_count: 1,
      library_version: 2,
      published_at: "2026-08-14T00:00:00.000Z",
      size_bytes: 1024,
      snapshot_schema_version: 1 as const,
    },
    memes: [
      {
        aliases: [],
        categories: [],
        category: null,
        examples: [],
        keywords: [],
        meaning: null,
        meme_id: 1,
        normalized_term: "测试梗",
        notes: null,
        origin: null,
        term: "测试梗",
        type: null,
        types: [],
        usage: null,
      },
    ],
  };

  const result = await loadSharedMemesAfterOpen(
    (state) => events.push(state.stage),
    async () => {
      events.push("request");
      return { ok: true, data };
    },
  );
  events.push(result.stage);

  assert.deepEqual(events, ["loading", "request", "ready"]);
  assert.deepEqual(result, { stage: "ready", data });
});

test("Lingye entry loading stays click-driven and reaches ready, empty, or error", async () => {
  const events: string[] = [];
  const ready = await loadLingyeAfterOpen(
    (state) => events.push(state.stage),
    async () => {
      events.push("request");
      return { ok: true as const, data: { story: "live" } };
    },
  );
  assert.deepEqual(ready, { stage: "ready", data: { story: "live" } });
  assert.deepEqual(events, ["loading", "request"]);

  const empty = await loadLingyeAfterOpen(
    () => undefined,
    async () => ({ ok: true as const, data: null }),
  );
  assert.deepEqual(empty, { stage: "empty" });

  const error = await loadLingyeAfterOpen(
    () => undefined,
    async () => ({
      ok: false as const,
      issue: { code: "network_unavailable", serverMessage: null },
    }),
  );
  assert.deepEqual(error, {
    stage: "error",
    message: "现在连不上铃野，请稍后再试。",
  });
});

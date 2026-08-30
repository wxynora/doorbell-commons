import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  climateTypeValues,
  currentHumanSessionSuccessSchema,
  humanSettingsErrorSchema,
  humanSettingsSuccessSchema,
} from "@doorbell/protocol";
import type { ActivityReminderService } from "./activity-reminder-service.js";
import { buildApp } from "./app.js";
import type { BellService, BellSettingsStatus } from "./bell-service.js";
import { BrowserPushService } from "./browser-push-service.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);
const FARM_HUMAN_KEY = "private-settings-farm-key";

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();
  unavailable = false;

  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    if (this.unavailable) {
      throw new OneBotUnavailableError("fake OneBot unavailable");
    }
    return this.members.has(qqNumber);
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  calls = 0;

  async lookupFarm(_farmDoorplate: string): Promise<FarmDirectoryEntry> {
    this.calls += 1;
    throw new Error("Settings must not query the farm");
  }

  async lookupFarmByHumanKey(_farmHumanKey: string): Promise<FarmDirectoryEntry> {
    this.calls += 1;
    throw new Error("Settings must not query the farm");
  }

  async readFarmOverview(_farmDoorplate: string): Promise<BoundFarmOverview> {
    this.calls += 1;
    throw new Error("Settings must not query the farm");
  }

  async readFarmHumanPage(
    _farmHumanKey: string,
    _pagePath: string,
    _query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    this.calls += 1;
    throw new Error("Settings must not query the farm");
  }

  async submitFarmHumanAction(
    _farmHumanKey: string,
    _actionPath: string,
    _form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    this.calls += 1;
    throw new Error("Settings must not query the farm");
  }
}

function openHarness(
  databasePath: string,
  sessionTokens: string[],
  bellService?: BellService,
  browserPushConfigured = false,
  activityReminderService?: Pick<ActivityReminderService, "cancelResident" | "refreshEligibility">,
) {
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => sessionTokens.shift() ?? "unexpected-settings-session-token",
  });
  const membership = new FakeGroupMembership();
  const farmDirectory = new UnusedFarmDirectory();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory,
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => NOW,
  });
  const browserPushService = browserPushConfigured
    ? new BrowserPushService({
        config: {
          publicKey: "AQID",
          privateKey: "private-test-key",
          subject: "https://example.test",
          ttlSeconds: 60,
        },
        database,
        registrationAuth,
        requestTimeoutMs: 5_000,
        sender: { send: async () => undefined },
      })
    : undefined;
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    ...(bellService ? { bellService } : {}),
    ...(browserPushService ? { browserPushService } : {}),
    ...(activityReminderService ? { activityReminderService } : {}),
    secureCookies: false,
    logger: false,
  });
  return {
    app,
    database,
    farmDirectory,
    membership,
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

function fakeBellService(status: BellSettingsStatus) {
  const residentIds: string[] = [];
  const refreshedHomeIds: string[] = [];
  const service = {
    getSettingsStatus(residentId: string) {
      residentIds.push(residentId);
      return status;
    },
    refreshHome(homeId: string) {
      refreshedHomeIds.push(homeId);
    },
    close() {},
  } as unknown as BellService;
  return { service, residentIds, refreshedHomeIds };
}

function createRegisteredSession(
  database: CommunityDatabase,
  qqNumber: string,
  residentName: string,
  homeName: string,
  farmDoorplate: string,
) {
  return database.createHumanSession(qqNumber, NOW, {
    residentName,
    homeName,
    farmDoorplate,
    farmHumanKey: `${FARM_HUMAN_KEY}-${qqNumber}`,
  });
}

function cookie(token: string): string {
  return `doorbell_session=${token}`;
}

test("settings expose honest integration state and persist supported fields across restart", async () => {
  assert.deepEqual(climateTypeValues, [
    "tropical_rainforest",
    "tropical_savanna",
    "tropical_monsoon",
    "hot_desert",
    "humid_subtropical",
    "mediterranean",
    "oceanic",
    "temperate_monsoon",
    "continental",
    "subarctic",
    "tundra",
    "ice_cap",
    "highland",
  ]);
  const directory = mkdtempSync(join(tmpdir(), "doorbell-human-settings-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  let harness = openHarness(databasePath, ["settings-session-token"]);
  try {
    const unauthenticated = await harness.app.inject({ method: "GET", url: "/api/settings" });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      humanSettingsErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    const created = createRegisteredSession(
      harness.database,
      "10001",
      "小一",
      "纸灯小屋",
      "ABC234",
    );
    harness.membership.members.add("10001");
    const sessionCookie = cookie(created.token);

    const initial = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.equal(initial.statusCode, 200);
    assert.deepEqual(humanSettingsSuccessSchema.parse(initial.json()), {
      active_profile_id: created.activeProfileId,
      profiles: [
        {
          profile_id: created.activeProfileId,
          resident_name: "小一",
          home_name: "纸灯小屋",
          farm_doorplate: "ABC234",
        },
      ],
      connection_status: {
        wake_bridge: { status: "not_configured", last_connected_at: null },
      },
      home: {
        home_name: "纸灯小屋",
        environment_description: null,
        climate_type: null,
        weather_state: null,
      },
      notification_preferences: {
        pause_all_wakeups: null,
        visit_requests_and_invitations_enabled: null,
        activity_invitations_enabled: null,
        important_system_notifications_enabled: null,
      },
      community_connection_preferences: {
        default_connection_duration_minutes: 5,
        initial_recent_activity_count: null,
        chat_mode: null,
        allow_activity_room_warmup: null,
      },
      shared_data_preferences: {
        shared_meme_update_signals_enabled: true,
      },
      browser_notification_preferences: {
        application_server_key: null,
        browser_notifications_available: false,
        browser_notifications_enabled: false,
        activity_reminders_enabled: false,
      },
    });
    assert.doesNotMatch(initial.body, new RegExp(FARM_HUMAN_KEY));

    const updatePayload = {
      home: {
        home_name: " 雨檐小屋 ",
        environment_description: "  门前有一棵会听雨的树。  ",
        climate_type: "temperate_monsoon",
      },
      notification_preferences: {
        pause_all_wakeups: false,
        visit_requests_and_invitations_enabled: true,
        activity_invitations_enabled: false,
        important_system_notifications_enabled: true,
      },
      community_connection_preferences: {
        default_connection_duration_minutes: 17,
        initial_recent_activity_count: 0,
        chat_mode: "listening",
        allow_activity_room_warmup: false,
      },
      shared_data_preferences: {
        shared_meme_update_signals_enabled: false,
      },
      browser_notification_preferences: {
        browser_notifications_enabled: true,
        activity_reminders_enabled: true,
      },
    };
    const updated = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: updatePayload,
    });
    assert.equal(updated.statusCode, 200);
    const updatedBody = humanSettingsSuccessSchema.parse(updated.json());
    assert.deepEqual(updatedBody.home, {
      home_name: " 雨檐小屋 ",
      environment_description: "  门前有一棵会听雨的树。  ",
      climate_type: "temperate_monsoon",
      weather_state: {
        weather_revision: 1,
        season_phase: null,
        condition: null,
        state_started_at: null,
        next_transition_at: null,
      },
    });
    assert.deepEqual(updatedBody.notification_preferences, updatePayload.notification_preferences);
    assert.deepEqual(
      updatedBody.community_connection_preferences,
      updatePayload.community_connection_preferences,
    );
    assert.deepEqual(updatedBody.shared_data_preferences, updatePayload.shared_data_preferences);
    assert.deepEqual(updatedBody.browser_notification_preferences, {
      application_server_key: null,
      browser_notifications_available: false,
      ...updatePayload.browser_notification_preferences,
    });
    assert.doesNotMatch(updated.body, new RegExp(FARM_HUMAN_KEY));

    const currentSession = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: sessionCookie },
    });
    assert.equal(
      currentHumanSessionSuccessSchema.parse(currentSession.json()).home.home_name,
      " 雨檐小屋 ",
    );

    const invalidBodies = [
      {},
      { home: { climate_type: "mild" } },
      { home: { home_name: " \n\t " } },
      { community_connection_preferences: { default_connection_duration_minutes: 0 } },
      { retired_bridge_credential: "must-not-be-accepted" },
    ];
    for (const payload of invalidBodies) {
      const invalid = await harness.app.inject({
        method: "PATCH",
        url: "/api/settings",
        headers: { cookie: sessionCookie },
        payload,
      });
      assert.equal(invalid.statusCode, 400);
      assert.equal(humanSettingsErrorSchema.parse(invalid.json()).error.code, "invalid_request");
      assert.doesNotMatch(invalid.body, new RegExp(FARM_HUMAN_KEY));
    }
    assert.equal(harness.farmDirectory.calls, 0);

    const initializedWeather = harness.database.updateHomeWeatherState(
      created.community.home.homeId,
      NOW,
      {
        climateType: "temperate_monsoon",
        expectedWeatherRevision: 1,
        seasonPhase: "summer",
        condition: "rain",
        stateStartedAt: null,
        nextTransitionAt: null,
      },
    );
    assert.deepEqual(initializedWeather, {
      climateType: "temperate_monsoon",
      weatherRevision: 2,
      seasonPhase: "summer",
      condition: "rain",
      stateStartedAt: null,
      nextTransitionAt: null,
      updatedAt: NOW,
    });
    assert.equal(
      harness.database.updateHomeWeatherState(created.community.home.homeId, NOW, {
        climateType: "temperate_monsoon",
        expectedWeatherRevision: 1,
        seasonPhase: "winter",
        condition: "snow",
        stateStartedAt: null,
        nextTransitionAt: null,
      }),
      undefined,
    );
    assert.deepEqual(
      harness.database.getHumanSettings(created.community.home.homeId).weatherState,
      initializedWeather,
    );

    await harness.close();
    harness = openHarness(databasePath, []);
    harness.membership.members.add("10001");
    const afterRestart = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.equal(afterRestart.statusCode, 200);
    const restartedBody = humanSettingsSuccessSchema.parse(afterRestart.json());
    assert.deepEqual(restartedBody, {
      ...updatedBody,
      home: {
        ...updatedBody.home,
        weather_state: {
          weather_revision: 2,
          season_phase: "summer",
          condition: "rain",
          state_started_at: null,
          next_transition_at: null,
        },
      },
    });

    const unchangedClimate = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: { home: { climate_type: "temperate_monsoon" } },
    });
    assert.equal(unchangedClimate.statusCode, 200);
    assert.deepEqual(humanSettingsSuccessSchema.parse(unchangedClimate.json()), restartedBody);

    const changedClimate = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: { home: { climate_type: "oceanic" } },
    });
    assert.equal(changedClimate.statusCode, 200);
    assert.deepEqual(humanSettingsSuccessSchema.parse(changedClimate.json()).home, {
      home_name: " 雨檐小屋 ",
      environment_description: "  门前有一棵会听雨的树。  ",
      climate_type: "oceanic",
      weather_state: {
        weather_revision: 3,
        season_phase: null,
        condition: null,
        state_started_at: null,
        next_transition_at: null,
      },
    });
    assert.equal(
      harness.database.updateHomeWeatherState(created.community.home.homeId, NOW, {
        climateType: "temperate_monsoon",
        expectedWeatherRevision: 2,
        seasonPhase: "winter",
        condition: "snow",
        stateStartedAt: null,
        nextTransitionAt: null,
      }),
      undefined,
    );
    assert.deepEqual(
      harness.database.getHumanSettings(created.community.home.homeId).weatherState,
      {
        climateType: "oceanic",
        weatherRevision: 3,
        seasonPhase: null,
        condition: null,
        stateStartedAt: null,
        nextTransitionAt: null,
        updatedAt: NOW,
      },
    );
    assert.equal(harness.farmDirectory.calls, 0);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("browser notification setup exposes a real public key and persists an authenticated subscription", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-browser-settings-test-"));
  const harness = openHarness(
    join(directory, "doorbell.sqlite"),
    ["browser-settings-token"],
    undefined,
    true,
  );
  try {
    const created = createRegisteredSession(
      harness.database,
      "10001",
      "小一",
      "纸灯小屋",
      "ABC234",
    );
    harness.membership.members.add("10001");
    const sessionCookie = cookie(created.token);
    const settings = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.deepEqual(settings.json().browser_notification_preferences, {
      application_server_key: "AQID",
      browser_notifications_available: true,
      browser_notifications_enabled: false,
      activity_reminders_enabled: false,
    });

    const status = () =>
      harness.app.inject({
        method: "POST",
        url: "/api/browser-notifications/subscription/status",
        headers: { cookie: sessionCookie },
        payload: { endpoint: "https://push.example.test/subscription" },
      });
    const beforeSubscription = await status();
    assert.equal(beforeSubscription.statusCode, 200);
    assert.deepEqual(beforeSubscription.json(), { subscribed: false });

    const subscribed = await harness.app.inject({
      method: "POST",
      url: "/api/browser-notifications/subscription",
      headers: { cookie: sessionCookie },
      payload: {
        endpoint: "https://push.example.test/subscription",
        expiration_time: null,
        keys: { auth: "auth", p256dh: "p256dh" },
      },
    });
    assert.equal(subscribed.statusCode, 200);
    assert.deepEqual(subscribed.json(), { subscribed: true });
    assert.equal(
      harness.database.listBrowserPushSubscriptions(created.community.resident.residentId).length,
      1,
    );
    assert.deepEqual((await status()).json(), { subscribed: true });

    const removed = await harness.app.inject({
      method: "DELETE",
      url: "/api/browser-notifications/subscription",
      headers: { cookie: sessionCookie },
      payload: { endpoint: "https://push.example.test/subscription" },
    });
    assert.equal(removed.statusCode, 200);
    assert.deepEqual(removed.json(), {
      subscribed: false,
      unsubscribe_endpoint: true,
    });
    assert.equal(
      harness.database.listBrowserPushSubscriptions(created.community.resident.residentId).length,
      0,
    );
    assert.deepEqual((await status()).json(), { subscribed: false });
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("subscription removal asks the browser to unsubscribe only after the last Profile", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-browser-shared-profile-endpoint-"));
  const harness = openHarness(
    join(directory, "doorbell.sqlite"),
    ["shared-profile-session"],
    undefined,
    true,
  );
  try {
    const first = createRegisteredSession(harness.database, "10001", "小一", "第一座家", "ABC234");
    harness.membership.members.add("10001");
    const sessionCookie = cookie(first.token);
    const endpoint = "https://push.example.test/shared-profile-endpoint";
    const subscribe = () =>
      harness.app.inject({
        method: "POST",
        url: "/api/browser-notifications/subscription",
        headers: { cookie: sessionCookie },
        payload: {
          endpoint,
          expiration_time: null,
          keys: { auth: "auth", p256dh: "p256dh" },
        },
      });
    assert.equal((await subscribe()).statusCode, 200);

    const second = harness.database.createHumanProfileForSession(first.token, NOW + 1, {
      residentName: "小二",
      homeName: "第二座家",
      farmDoorplate: "DEF567",
      farmHumanKey: `${FARM_HUMAN_KEY}-second`,
    });
    assert.equal((await subscribe()).statusCode, 200);

    const remove = () =>
      harness.app.inject({
        method: "DELETE",
        url: "/api/browser-notifications/subscription",
        headers: { cookie: sessionCookie },
        payload: { endpoint },
      });
    const removedSecond = await remove();
    assert.deepEqual(removedSecond.json(), {
      subscribed: false,
      unsubscribe_endpoint: false,
    });
    assert.equal(
      harness.database.listBrowserPushSubscriptions(first.community.resident.residentId).length,
      1,
    );
    assert.equal(
      harness.database.listBrowserPushSubscriptions(second.community.resident.residentId).length,
      0,
    );

    harness.database.switchActiveHumanSessionProfile(first.token, first.activeProfileId);
    const removedFirst = await remove();
    assert.deepEqual(removedFirst.json(), {
      subscribed: false,
      unsubscribe_endpoint: true,
    });
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("activity reminder side effects stay fail-soft after settings and subscription commits", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-activity-settings-fail-soft-"));
  const calls: string[] = [];
  const activityReminderService = {
    cancelResident() {
      calls.push("cancel");
      throw new Error("reminder database unavailable");
    },
    refreshEligibility() {
      calls.push("refresh");
      throw new Error("reminder database unavailable");
    },
  };
  const harness = openHarness(
    join(directory, "doorbell.sqlite"),
    ["activity-settings-token"],
    undefined,
    true,
    activityReminderService,
  );
  try {
    const created = createRegisteredSession(
      harness.database,
      "10001",
      "小一",
      "纸灯小屋",
      "ABC234",
    );
    harness.membership.members.add("10001");
    const sessionCookie = cookie(created.token);

    const disabled = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: { home: { environment_description: "门前有一盏灯。" } },
    });
    assert.equal(disabled.statusCode, 200);

    const enabled = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: {
        browser_notification_preferences: {
          browser_notifications_enabled: true,
          activity_reminders_enabled: true,
        },
      },
    });
    assert.equal(enabled.statusCode, 200);

    const subscribed = await harness.app.inject({
      method: "POST",
      url: "/api/browser-notifications/subscription",
      headers: { cookie: sessionCookie },
      payload: {
        endpoint: "https://push.example.test/fail-soft",
        expiration_time: null,
        keys: { auth: "auth", p256dh: "p256dh" },
      },
    });
    assert.equal(subscribed.statusCode, 200);
    assert.deepEqual(calls, ["cancel", "refresh", "refresh"]);
    assert.equal(
      harness.database.getHumanSettings(created.community.home.homeId).activityRemindersEnabled,
      true,
    );
    assert.equal(
      harness.database.listBrowserPushSubscriptions(created.community.resident.residentId).length,
      1,
    );
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("settings expose the resident Bell runtime status on read and update", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-human-settings-bell-test-"));
  const bell = fakeBellService({
    status: "online",
    last_connected_at: "2026-08-14T12:34:56.000Z",
  });
  const harness = openHarness(
    join(directory, "doorbell.sqlite"),
    ["bell-settings-token"],
    bell.service,
  );
  try {
    const created = createRegisteredSession(
      harness.database,
      "10001",
      "小一",
      "纸灯小屋",
      "ABC234",
    );
    harness.membership.members.add("10001");
    const sessionCookie = cookie(created.token);

    const read = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.equal(read.statusCode, 200);
    assert.deepEqual(read.json().connection_status.wake_bridge, {
      status: "online",
      last_connected_at: "2026-08-14T12:34:56.000Z",
    });

    const updated = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: { home: { environment_description: "门前有一盏灯。" } },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(updated.json().connection_status.wake_bridge, {
      status: "online",
      last_connected_at: "2026-08-14T12:34:56.000Z",
    });
    assert.deepEqual(bell.residentIds, [
      created.community.resident.residentId,
      created.community.resident.residentId,
    ]);
    assert.deepEqual(bell.refreshedHomeIds, [created.community.home.homeId]);
    assert.doesNotMatch(read.body, /dbb_/u);
    assert.doesNotMatch(updated.body, /dbb_/u);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("settings remain isolated by session and cannot target another home", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-human-settings-isolation-test-"));
  const harness = openHarness(join(directory, "doorbell.sqlite"), ["first-token", "second-token"]);
  try {
    const first = createRegisteredSession(harness.database, "10001", "小一", "第一座家", "ABC234");
    const second = createRegisteredSession(harness.database, "10002", "小二", "第二座家", "DEF567");
    harness.membership.members.add("10001");
    harness.membership.members.add("10002");

    const updateFirst = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: cookie(first.token) },
      payload: {
        home: {
          environment_description: "只属于第一座家",
          climate_type: climateTypeValues[0],
        },
        community_connection_preferences: { chat_mode: "proactive" },
      },
    });
    assert.equal(updateFirst.statusCode, 200);

    const readSecond = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: cookie(second.token) },
    });
    const secondSettings = humanSettingsSuccessSchema.parse(readSecond.json());
    assert.equal(secondSettings.home.home_name, "第二座家");
    assert.equal(secondSettings.home.environment_description, null);
    assert.equal(secondSettings.home.climate_type, null);
    assert.equal(secondSettings.home.weather_state, null);
    assert.equal(secondSettings.community_connection_preferences.chat_mode, null);
    assert.equal(harness.farmDirectory.calls, 0);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("settings recheck QQ membership and never mutate on outage or confirmed departure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-human-settings-membership-test-"));
  const harness = openHarness(join(directory, "doorbell.sqlite"), ["membership-token"]);
  try {
    const created = createRegisteredSession(
      harness.database,
      "10001",
      "小一",
      "纸灯小屋",
      "ABC234",
    );
    const sessionCookie = cookie(created.token);
    harness.membership.members.add("10001");

    harness.membership.unavailable = true;
    const unavailable = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: {
        home: {
          environment_description: "不应保存",
          climate_type: "highland",
        },
      },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      humanSettingsErrorSchema.parse(unavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(
      harness.database.getHumanSettings(created.community.home.homeId).environmentDescription,
      null,
    );
    assert.equal(
      harness.database.getHumanSettings(created.community.home.homeId).climateType,
      null,
    );

    harness.membership.unavailable = false;
    const afterOutage = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.equal(afterOutage.statusCode, 200);

    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: { home: { environment_description: "也不应保存" } },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(humanSettingsErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
    assert.equal(
      harness.database.getHumanSettings(created.community.home.homeId).environmentDescription,
      null,
    );

    harness.membership.members.add("10001");
    const revoked = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.equal(revoked.statusCode, 401);
    assert.equal(
      humanSettingsErrorSchema.parse(revoked.json()).error.code,
      "authentication_required",
    );
    assert.equal(harness.farmDirectory.calls, 0);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { humanSettingsSuccessSchema } from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { HomeWeatherEngine, weatherSeasonForClimate } from "./home-weather-engine.js";
import type { QqGroupMembershipReader } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const FARM_HUMAN_KEY = "private-weather-farm-key";

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();

  async isCurrentMember(_groupId: string, qqNumber: string): Promise<boolean> {
    return this.members.has(qqNumber);
  }
}

class UnusedFarmDirectory implements FarmDirectoryReader {
  async lookupFarm(_farmDoorplate: string): Promise<FarmDirectoryEntry> {
    throw new Error("Weather must not query the farm");
  }

  async lookupFarmByHumanKey(_farmHumanKey: string): Promise<FarmDirectoryEntry> {
    throw new Error("Weather must not query the farm");
  }

  async readFarmOverview(_farmDoorplate: string): Promise<BoundFarmOverview> {
    throw new Error("Weather must not query the farm");
  }

  async readFarmHumanPage(
    _farmHumanKey: string,
    _pagePath: string,
    _query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    throw new Error("Weather must not query the farm");
  }

  async submitFarmHumanAction(
    _farmHumanKey: string,
    _actionPath: string,
    _form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    throw new Error("Weather must not query the farm");
  }
}

interface MutableClock {
  now: number;
}

function openHarness(databasePath: string, clock: MutableClock, sessionTokens: string[]) {
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => sessionTokens.shift() ?? "unexpected-weather-session-token",
  });
  const membership = new FakeGroupMembership();
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory: new UnusedFarmDirectory(),
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => clock.now,
  });
  const weatherEngine = new HomeWeatherEngine({
    database,
    now: () => clock.now,
    sample: (key) => (key.endsWith(":extreme") ? 0.5 : 0),
  });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    weatherEngine,
    secureCookies: false,
    logger: false,
  });
  return {
    app,
    database,
    membership,
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

function createSession(database: CommunityDatabase, qqNumber: string, now: number) {
  return database.createHumanSession(qqNumber, now, {
    residentName: `居民-${qqNumber}`,
    homeName: `家园-${qqNumber}`,
    farmDoorplate: `F${qqNumber}`,
    farmHumanKey: `${FARM_HUMAN_KEY}-${qqNumber}`,
  });
}

function cookie(token: string): string {
  return `doorbell_session=${token}`;
}

test("weather seasons follow the Beijing northern-hemisphere calendar without per-home geography", () => {
  assert.equal(weatherSeasonForClimate("temperate_monsoon", 4), "spring");
  assert.equal(weatherSeasonForClimate("temperate_monsoon", 8), "summer");
  assert.equal(weatherSeasonForClimate("temperate_monsoon", 10), "autumn");
  assert.equal(weatherSeasonForClimate("temperate_monsoon", 1), "winter");
  assert.equal(weatherSeasonForClimate("tropical_monsoon", 8), "wet_season");
  assert.equal(weatherSeasonForClimate("tropical_monsoon", 1), "dry_season");
  assert.equal(weatherSeasonForClimate("subarctic", 7), "warm_season");
  assert.equal(weatherSeasonForClimate("subarctic", 2), "cold_season");
  assert.equal(weatherSeasonForClimate("tundra", 7), "thaw_period");
  assert.equal(weatherSeasonForClimate("tundra", 2), "freeze_period");
  assert.equal(weatherSeasonForClimate("ice_cap", 7), "freeze_period");
  assert.equal(weatherSeasonForClimate("highland", 8), "summer");
});

test("settings lazily establish one Beijing-day weather state and skip downtime history", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-weather-engine-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const clock = { now: Date.UTC(2026, 7, 13, 4, 0, 0) };
  let harness = openHarness(databasePath, clock, ["weather-session-token"]);
  try {
    const created = createSession(harness.database, "10001", clock.now);
    harness.membership.members.add("10001");
    const sessionCookie = cookie(created.token);

    const selected = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: { home: { climate_type: "temperate_monsoon" } },
    });
    assert.equal(selected.statusCode, 200);
    const first = humanSettingsSuccessSchema.parse(selected.json()).home.weather_state;
    assert.deepEqual(first, {
      weather_revision: 2,
      season_phase: "summer",
      condition: "partly_cloudy",
      state_started_at: "2026-08-12T16:00:00.000Z",
      next_transition_at: "2026-08-13T16:00:00.000Z",
    });

    const sameDay = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.deepEqual(humanSettingsSuccessSchema.parse(sameDay.json()).home.weather_state, first);

    clock.now = Date.UTC(2026, 7, 18, 4, 0, 0);
    const afterDowntime = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    const advanced = humanSettingsSuccessSchema.parse(afterDowntime.json()).home.weather_state;
    assert.deepEqual(advanced, {
      weather_revision: 3,
      season_phase: "summer",
      condition: "partly_cloudy",
      state_started_at: "2026-08-17T16:00:00.000Z",
      next_transition_at: "2026-08-18T16:00:00.000Z",
    });

    await harness.close();
    harness = openHarness(databasePath, clock, []);
    harness.membership.members.add("10001");
    const afterRestart = await harness.app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
    });
    assert.deepEqual(
      humanSettingsSuccessSchema.parse(afterRestart.json()).home.weather_state,
      advanced,
    );

    const changedClimate = await harness.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie },
      payload: { home: { climate_type: "ice_cap" } },
    });
    assert.deepEqual(humanSettingsSuccessSchema.parse(changedClimate.json()).home.weather_state, {
      weather_revision: 5,
      season_phase: "freeze_period",
      condition: "clear",
      state_started_at: "2026-08-17T16:00:00.000Z",
      next_transition_at: "2026-08-18T16:00:00.000Z",
    });
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("weather state remains home-scoped and rare extremes stay climate-appropriate", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-weather-extreme-test-"));
  const database = new CommunityDatabase(join(directory, "doorbell.sqlite"));
  try {
    const now = Date.UTC(2026, 7, 13, 4, 0, 0);
    const desert = createSession(database, "20001", now);
    const ice = createSession(database, "20002", now);
    const ordinaryDesert = createSession(database, "20003", now);
    database.updateHumanSettings(desert.community.home.homeId, now, {
      climateType: "hot_desert",
    });
    database.updateHumanSettings(ice.community.home.homeId, now, { climateType: "ice_cap" });
    database.updateHumanSettings(ordinaryDesert.community.home.homeId, now, {
      climateType: "hot_desert",
    });
    const engine = new HomeWeatherEngine({
      database,
      now: () => now,
      sample: () => 0,
    });

    const desertWeather = engine.ensureCurrent(
      database.getHumanSettings(desert.community.home.homeId),
    ).weatherState;
    const iceWeather = engine.ensureCurrent(
      database.getHumanSettings(ice.community.home.homeId),
    ).weatherState;
    assert.equal(desertWeather?.condition, "dust");
    assert.equal(desertWeather?.seasonPhase, "warm_season");
    assert.equal(iceWeather?.condition, "heavy_snow");
    assert.equal(iceWeather?.seasonPhase, "freeze_period");
    assert.notEqual(desert.community.home.homeId, ice.community.home.homeId);
    assert.equal(
      database.getHumanSettings(desert.community.home.homeId).weatherState?.condition,
      "dust",
    );
    assert.equal(
      database.getHumanSettings(ice.community.home.homeId).weatherState?.condition,
      "heavy_snow",
    );

    const ordinaryEngine = new HomeWeatherEngine({
      database,
      now: () => now,
      sample: (key) => (key.endsWith(":extreme") ? 0.01 : 0),
    });
    const ordinaryWeather = ordinaryEngine.ensureCurrent(
      database.getHumanSettings(ordinaryDesert.community.home.homeId),
    ).weatherState;
    assert.equal(ordinaryWeather?.condition, "clear");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

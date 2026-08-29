/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { HumanSettingsSuccess } from "@doorbell/protocol";
import { homeSettingsView } from "./app";
import {
  buildCandidateTwoRuntimeHtml,
  parseCandidateTwoAction,
} from "./preview/candidate-two-preview";

const FIRST_PROFILE = {
  profile_id: "11111111-1111-4111-8111-111111111111",
  resident_name: "辛玥 & 一号机",
  home_name: "第一座家",
  farm_doorplate: "ABC234",
};

const SETTINGS: HumanSettingsSuccess = {
  active_profile_id: FIRST_PROFILE.profile_id,
  profiles: [FIRST_PROFILE],
  connection_status: {
    wake_bridge: { status: "not_configured", last_connected_at: null },
  },
  home: {
    home_name: FIRST_PROFILE.home_name,
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
  shared_data_preferences: { shared_meme_update_signals_enabled: true },
  browser_notification_preferences: {
    application_server_key: null,
    browser_notifications_available: false,
    browser_notifications_enabled: false,
    activity_reminders_enabled: false,
  },
};

test("settings hide a single profile and expose only the server list when multiple profiles exist", () => {
  const single = homeSettingsView({ stage: "ready", data: SETTINGS });
  assert.equal(single.stage, "ready");
  if (single.stage !== "ready") return;
  assert.equal(single.profileSwitcher, null);

  const second = {
    profile_id: "22222222-2222-4222-8222-222222222222",
    resident_name: "辛玥 & 二号机",
    home_name: "第二座家",
    farm_doorplate: "DEF567",
  };
  const multiple = homeSettingsView({
    stage: "ready",
    data: { ...SETTINGS, profiles: [FIRST_PROFILE, second] },
  });
  assert.equal(multiple.stage, "ready");
  if (multiple.stage !== "ready") return;
  assert.deepEqual(multiple.profileSwitcher, {
    activeProfileId: FIRST_PROFILE.profile_id,
    profiles: [
      {
        profileId: FIRST_PROFILE.profile_id,
        residentName: FIRST_PROFILE.resident_name,
        homeName: FIRST_PROFILE.home_name,
        farmDoorplate: FIRST_PROFILE.farm_doorplate,
      },
      {
        profileId: second.profile_id,
        residentName: second.resident_name,
        homeName: second.home_name,
        farmDoorplate: second.farm_doorplate,
      },
    ],
  });
});

test("additional registration clearly separates existing and new farms without asking for a password", () => {
  const source = readFileSync(
    new URL("./components/additional-profile-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /绑定现有农场/);
  assert.match(source, /创建新农场/);
  assert.match(source, /这份档案会拥有自己独立的家园与农场/);
  assert.doesNotMatch(source, /type="password"|登录密码/iu);
});

test("candidate settings bridge accepts only exact profile actions and keeps switcher hidden by default", () => {
  const html = buildCandidateTwoRuntimeHtml();
  assert.match(html, /candidate2-settings-profiles" hidden/);
  assert.match(html, /class="settings-profile-select"/);
  assert.match(html, /settings-add-profile/);
  assert.match(
    html,
    /sendAction\(\{ type: 'profile-switch', profileId: settingsProfileSelect\.value \}\)/,
  );
  assert.deepEqual(
    parseCandidateTwoAction({ type: "profile-switch", profileId: FIRST_PROFILE.profile_id }),
    {
      type: "profile-switch",
      profileId: FIRST_PROFILE.profile_id,
    },
  );
  assert.equal(
    parseCandidateTwoAction({
      type: "profile-switch",
      profileId: FIRST_PROFILE.profile_id,
      residentId: "forbidden",
    }),
    null,
  );
  const appSource = readFileSync(new URL("./app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /homeSettings\.data\.profiles\.length > 1/);
  assert.match(appSource, /profiles\.some\([\s\S]*profile\.profile_id === action\.profileId/);
  assert.match(
    appSource,
    /action\.type === "profile-switch"[\s\S]*lingyeControllersRef\.current\.glimmer\?\.abort\(\)[\s\S]*authenticatedState\(switched\.identity\)/,
  );
});

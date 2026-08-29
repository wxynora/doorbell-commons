import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  farmHumanFieldReadSuccessSchema,
  farmHumanGlimmerReadSuccessSchema,
} from "@doorbell/protocol";
import {
  ActivityReminderService,
  CROP_MATURED_NOTIFICATION_BODY,
  CROP_MATURED_NOTIFICATION_TITLE,
  GLIMMER_READY_NOTIFICATION_BODY,
  GLIMMER_READY_NOTIFICATION_TITLE,
} from "./activity-reminder-service.js";
import type { ActivityReminderPush } from "./browser-push-service.js";
import { CommunityDatabase } from "./community-database.js";

const START = Date.UTC(2026, 7, 29, 8, 0, 0);
const CROP_READY_AT = START + 5 * 60 * 1000;
const GLIMMER_READY_AT = START + 10 * 60 * 1000;

function fieldResult(farmDoorplate: string, state: "growing" | "ripe") {
  return farmHumanFieldReadSuccessSchema.parse({
    data: {
      farm: {
        farm_doorplate: farmDoorplate,
        farm_name: `${farmDoorplate} 农场`,
        welcome_message: null,
        equipped_title: null,
      },
      balance: { farm_coins: 1_000 },
      season: { id: "summer", name: "夏" },
      weather: { condition: "sunny" },
      land: { tier: 1, name: "小田" },
      plots: [
        {
          plot_id: 1,
          state,
          seed_type: "common",
          watered: 1,
          progress: { current: state === "ripe" ? 3 : 2, total: 3 },
          matures_at: state === "growing" ? new Date(CROP_READY_AT).toISOString() : null,
          identity_state: "hidden",
          crop_identity: null,
        },
      ],
      harvest_assist: {
        daily_limit: 3,
        remaining: 3,
        mature_plot_count: state === "ripe" ? 1 : 0,
        can_assist: state === "ripe",
        reset_at: new Date(START + 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    revision: `field:${state}`,
    server_time: new Date(START).toISOString(),
  });
}

function glimmerResult(farmDoorplate: string, coolingDown: boolean) {
  return farmHumanGlimmerReadSuccessSchema.parse({
    subject: { farm_doorplate: farmDoorplate },
    data: {
      open: true,
      status: "流光原野开放中",
      season: "夏",
      capture_cooldown: coolingDown ? { ready_at: new Date(GLIMMER_READY_AT).toISOString() } : null,
      tracks: [],
      cooperation: null,
      events: [],
      variants: [],
      encounters: [],
      summary: { encounters: 0, variants: 0, cooperations: 0 },
      achievements: [],
    },
    server_time: new Date(START).toISOString(),
  });
}

function createProfile(database: CommunityDatabase, qqNumber: string, farmDoorplate: string) {
  const created = database.createHumanSession(qqNumber, START, {
    residentName: `小机 ${qqNumber}`,
    homeName: `小屋 ${qqNumber}`,
    farmDoorplate,
    farmHumanKey: `human-key-${qqNumber}`,
  });
  const profile = {
    residentId: created.community.resident.residentId,
    homeId: created.community.home.homeId,
    farmDoorplate,
  };
  database.updateHumanSettings(profile.homeId, START, {
    browserNotificationsEnabled: true,
    activityRemindersEnabled: true,
  });
  database.upsertBrowserPushSubscription({
    residentId: profile.residentId,
    homeId: profile.homeId,
    endpoint: `https://push.example.test/${qqNumber}`,
    p256dh: "p256dh",
    auth: "auth",
    now: START,
  });
  return profile;
}

test("activity reminders reconcile authoritative crop and Glimmer facts once per profile", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-activity-reminder-"));
  const database = new CommunityDatabase(join(directory, "doorbell.sqlite"));
  try {
    const profile = createProfile(database, "10001", "ABC234");
    const now = { value: START };
    let cropState: "growing" | "ripe" = "growing";
    const coolingDown = true;
    const pushes: ActivityReminderPush[] = [];
    const memberships: string[] = [];
    const errors: unknown[] = [];
    const service = new ActivityReminderService({
      database,
      registrationAuth: {
        confirmCurrentResidentMembership: async (residentId) => {
          memberships.push(residentId);
        },
      },
      farmFieldReader: {
        readField: async () => fieldResult(profile.farmDoorplate, cropState),
      },
      farmLingyeReader: {
        readGlimmer: async () => glimmerResult(profile.farmDoorplate, coolingDown),
      },
      browserPushService: {
        sendActivityReminder: async (input) => {
          pushes.push(structuredClone(input));
          return true;
        },
      },
      now: () => now.value,
      onError: (error) => errors.push(error),
      autoStart: false,
    });

    await Promise.all([service.processAll(), service.processAll()]);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      database.listScheduledActivityReminders(profile).map((reminder) => ({
        farmDoorplate: reminder.farmDoorplate,
        kind: reminder.kind,
        readyAt: reminder.readyAt,
      })),
      [
        { farmDoorplate: "ABC234", kind: "crop_matured", readyAt: CROP_READY_AT },
        {
          farmDoorplate: "ABC234",
          kind: "glimmer_capture_ready",
          readyAt: GLIMMER_READY_AT,
        },
      ],
    );
    assert.deepEqual(pushes, []);

    now.value = CROP_READY_AT + 1;
    cropState = "ripe";
    await Promise.all([service.processAll(), service.processAll()]);
    assert.deepEqual(pushes, [
      {
        residentId: profile.residentId,
        homeId: profile.homeId,
        title: CROP_MATURED_NOTIFICATION_TITLE,
        body: CROP_MATURED_NOTIFICATION_BODY,
        url: "/",
        tag: `farm-crops:${profile.farmDoorplate}:${CROP_READY_AT}`,
        createdAt: now.value,
      },
    ]);

    now.value = GLIMMER_READY_AT + 1;
    await service.processAll();
    await service.processAll();
    assert.deepEqual(pushes[1], {
      residentId: profile.residentId,
      homeId: profile.homeId,
      title: GLIMMER_READY_NOTIFICATION_TITLE,
      body: GLIMMER_READY_NOTIFICATION_BODY,
      url: "/",
      tag: `glimmer-ready:${profile.farmDoorplate}:${GLIMMER_READY_AT}`,
      createdAt: now.value,
    });
    assert.equal(pushes.length, 2);
    assert.deepEqual(database.listScheduledActivityReminders(profile), []);
    assert.deepEqual(database.listPendingBellWakes(profile.residentId), []);
    assert.equal(database.listMailboxLetters(profile.homeId, "human", 1, 10).totalItems, 0);
    assert.equal(memberships.length, 4);
    service.close();
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("activity reminder reads fail soft and a restarted service resumes persisted reminders", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-activity-restart-"));
  const databasePath = join(directory, "doorbell.sqlite");
  let database = new CommunityDatabase(databasePath);
  try {
    const profile = createProfile(database, "10001", "ABC234");
    const now = { value: START };
    let upstreamFails = false;
    const pushes: string[] = [];
    const errors: unknown[] = [];
    const createService = () =>
      new ActivityReminderService({
        database,
        registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
        farmFieldReader: {
          readField: async () => {
            if (upstreamFails) throw new Error("field unavailable");
            return fieldResult(
              profile.farmDoorplate,
              now.value >= CROP_READY_AT ? "ripe" : "growing",
            );
          },
        },
        farmLingyeReader: {
          readGlimmer: async () => {
            if (upstreamFails) throw new Error("Glimmer unavailable");
            return glimmerResult(profile.farmDoorplate, now.value < GLIMMER_READY_AT);
          },
        },
        browserPushService: {
          sendActivityReminder: async (input) => {
            pushes.push(input.title);
            return true;
          },
        },
        now: () => now.value,
        onError: (error) => errors.push(error),
        autoStart: false,
      });

    let service = createService();
    await service.processAll();
    now.value = GLIMMER_READY_AT + 1;
    upstreamFails = true;
    await service.processAll();
    assert.equal(database.listScheduledActivityReminders(profile).length, 2);
    assert.deepEqual(pushes, []);
    assert.equal(errors.length, 2);

    service.close();
    database.close();
    database = new CommunityDatabase(databasePath);
    upstreamFails = false;
    service = createService();
    await service.processAll();
    assert.deepEqual(pushes.sort(), [
      CROP_MATURED_NOTIFICATION_TITLE,
      GLIMMER_READY_NOTIFICATION_TITLE,
    ]);
    assert.deepEqual(database.listScheduledActivityReminders(profile), []);
    service.close();
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("activity reminder switches cancel without upstream reads and can schedule future facts again", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-activity-switch-"));
  const database = new CommunityDatabase(join(directory, "doorbell.sqlite"));
  try {
    const profile = createProfile(database, "10001", "ABC234");
    let reads = 0;
    const service = new ActivityReminderService({
      database,
      registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
      farmFieldReader: {
        readField: async () => {
          reads += 1;
          return fieldResult(profile.farmDoorplate, "growing");
        },
      },
      farmLingyeReader: {
        readGlimmer: async () => {
          reads += 1;
          return glimmerResult(profile.farmDoorplate, true);
        },
      },
      browserPushService: { sendActivityReminder: async () => true },
      now: () => START,
      autoStart: false,
    });
    await service.processAll();
    assert.equal(reads, 2);
    assert.equal(database.listScheduledActivityReminders(profile).length, 2);

    database.updateHumanSettings(profile.homeId, START + 1, {
      activityRemindersEnabled: false,
    });
    service.refreshEligibility(profile.residentId);
    assert.equal(reads, 2);
    assert.deepEqual(database.listScheduledActivityReminders(profile), []);

    database.updateHumanSettings(profile.homeId, START + 2, {
      activityRemindersEnabled: true,
    });
    await service.processAll();
    assert.equal(database.listScheduledActivityReminders(profile).length, 2);
    service.close();
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("activity reminder persistence isolates identical source keys by full profile", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-activity-profile-"));
  const database = new CommunityDatabase(join(directory, "doorbell.sqlite"));
  try {
    const first = createProfile(database, "10001", "ABC234");
    const second = createProfile(database, "10002", "DEF567");
    for (const profile of [first, second]) {
      database.scheduleActivityReminder({
        ...profile,
        kind: "crop_matured",
        sourceKey: "plot/1/shared-time",
        readyAt: CROP_READY_AT,
        createdAt: START,
      });
    }
    assert.equal(database.listScheduledActivityReminders(first).length, 1);
    assert.equal(database.listScheduledActivityReminders(second).length, 1);
    database.deliverActivityReminder(first, "crop_matured", "plot/1/shared-time", CROP_READY_AT);
    assert.deepEqual(database.listScheduledActivityReminders(first), []);
    assert.equal(database.listScheduledActivityReminders(second).length, 1);
    assert.throws(
      () =>
        database.scheduleActivityReminder({
          ...first,
          farmDoorplate: second.farmDoorplate,
          kind: "crop_matured",
          sourceKey: "plot/2/mismatch",
          readyAt: CROP_READY_AT,
          createdAt: START,
        }),
      /profile does not match the bound farm/u,
    );
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

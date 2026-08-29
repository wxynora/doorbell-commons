import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BrowserPushService } from "./browser-push-service.js";
import { CommunityDatabase } from "./community-database.js";

test("browser activity pushes require both switches and remove an expired subscription", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-browser-push-"));
  const database = new CommunityDatabase(join(directory, "doorbell.sqlite"));
  try {
    const created = database.createHumanSession("10001", 1, {
      residentName: "小机",
      homeName: "小屋",
      farmDoorplate: "FARM-1",
      farmHumanKey: "private-human-key",
    });
    const residentId = created.community.resident.residentId;
    const homeId = created.community.home.homeId;
    const sends: Array<Record<string, unknown>> = [];
    let expired = false;
    const memberships: string[] = [];
    const service = new BrowserPushService({
      config: {
        publicKey: "public-key",
        privateKey: "private-key",
        subject: "https://example.test",
        ttlSeconds: 60,
      },
      database,
      registrationAuth: {
        confirmCurrentResidentMembership: async (currentResidentId) => {
          memberships.push(currentResidentId);
        },
      },
      requestTimeoutMs: 5_000,
      sender: {
        send: async (_subscription, payload) => {
          sends.push(structuredClone(payload));
          if (expired) throw Object.assign(new Error("expired"), { statusCode: 410 });
        },
      },
    });
    service.subscribe({
      residentId,
      homeId,
      endpoint: "https://push.example.test/subscription",
      p256dh: "p256dh",
      auth: "auth",
      now: 2,
    });

    assert.equal(
      await service.sendActivityReminder({
        residentId,
        homeId,
        title: "提醒",
        body: "正文",
        url: "/",
        tag: "activity-1",
        createdAt: 3,
      }),
      false,
    );
    assert.deepEqual(sends, []);
    assert.deepEqual(memberships, []);

    database.updateHumanSettings(homeId, 4, {
      browserNotificationsEnabled: true,
      activityRemindersEnabled: true,
    });
    assert.equal(
      await service.sendActivityReminder({
        residentId,
        homeId,
        title: "提醒",
        body: "正文",
        url: "/",
        tag: "activity-1",
        createdAt: 5,
      }),
      true,
    );
    assert.equal(sends.length, 1);
    assert.deepEqual(memberships, [residentId]);
    assert.deepEqual(sends[0], {
      version: 1,
      kind: "activity_reminder",
      title: "提醒",
      body: "正文",
      url: "/",
      tag: "activity-1",
      created_at: "1970-01-01T00:00:00.005Z",
    });

    expired = true;
    assert.equal(
      await service.sendActivityReminder({
        residentId,
        homeId,
        title: "提醒",
        body: "正文",
        url: "/",
        tag: "activity-2",
        createdAt: 6,
      }),
      false,
    );
    assert.equal(database.listBrowserPushSubscriptions(residentId).length, 0);
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("browser activity pushes stay inside the exact resident and home profile", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-browser-profile-push-"));
  const database = new CommunityDatabase(join(directory, "doorbell.sqlite"));
  try {
    const first = database.createHumanSession("10001", 1, {
      residentName: "小一",
      homeName: "第一座家",
      farmDoorplate: "FARM-1",
      farmHumanKey: "first-human-key",
    }).community;
    const second = database.createHumanSession("10002", 1, {
      residentName: "小二",
      homeName: "第二座家",
      farmDoorplate: "FARM-2",
      farmHumanKey: "second-human-key",
    }).community;
    for (const community of [first, second]) {
      database.updateHumanSettings(community.home.homeId, 2, {
        browserNotificationsEnabled: true,
        activityRemindersEnabled: true,
      });
      database.upsertBrowserPushSubscription({
        residentId: community.resident.residentId,
        homeId: community.home.homeId,
        endpoint: `https://push.example.test/${community.home.homeId}`,
        p256dh: "p256dh",
        auth: "auth",
        now: 2,
      });
    }
    const endpoints: string[] = [];
    const service = new BrowserPushService({
      config: {
        publicKey: "public-key",
        privateKey: "private-key",
        subject: "https://example.test",
        ttlSeconds: 60,
      },
      database,
      registrationAuth: { confirmCurrentResidentMembership: async () => undefined },
      requestTimeoutMs: 5_000,
      sender: {
        send: async (subscription) => {
          endpoints.push(subscription.endpoint);
        },
      },
    });

    assert.equal(
      await service.sendActivityReminder({
        residentId: first.resident.residentId,
        homeId: first.home.homeId,
        title: "提醒",
        body: "正文",
        url: "/",
        tag: "first-profile",
        createdAt: 3,
      }),
      true,
    );
    assert.deepEqual(endpoints, [`https://push.example.test/${first.home.homeId}`]);
    assert.equal(
      await service.sendActivityReminder({
        residentId: first.resident.residentId,
        homeId: second.home.homeId,
        title: "提醒",
        body: "正文",
        url: "/",
        tag: "mismatched-profile",
        createdAt: 4,
      }),
      false,
    );
    assert.equal(endpoints.length, 1);
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

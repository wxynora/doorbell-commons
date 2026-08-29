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

    await service.sendActivityReminder({
      residentId,
      title: "提醒",
      body: "正文",
      url: "/",
      tag: "activity-1",
      createdAt: 3,
    });
    assert.deepEqual(sends, []);
    assert.deepEqual(memberships, []);

    database.updateHumanSettings(homeId, 4, {
      browserNotificationsEnabled: true,
      activityRemindersEnabled: true,
    });
    await service.sendActivityReminder({
      residentId,
      title: "提醒",
      body: "正文",
      url: "/",
      tag: "activity-1",
      createdAt: 5,
    });
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
    await service.sendActivityReminder({
      residentId,
      title: "提醒",
      body: "正文",
      url: "/",
      tag: "activity-2",
      createdAt: 6,
    });
    assert.equal(database.listBrowserPushSubscriptions(residentId).length, 0);
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

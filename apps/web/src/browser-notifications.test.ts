import assert from "node:assert/strict";
import test from "node:test";
import {
  type BrowserNotificationRuntime,
  disableBrowserNotifications,
  enableBrowserNotifications,
} from "./browser-notifications.js";

function runtime(options: {
  permission?: NotificationPermission;
  requestPermission?: NotificationPermission;
  existing?: PushSubscription | null;
  created?: PushSubscription;
}): BrowserNotificationRuntime {
  const pushManager = {
    getSubscription: async () => options.existing ?? null,
    subscribe: async () => options.created as PushSubscription,
  } as unknown as PushManager;
  return {
    notification: {
      permission: options.permission ?? "default",
      requestPermission: async () => options.requestPermission ?? "granted",
    },
    serviceWorker: {
      ready: Promise.resolve({ pushManager } as ServiceWorkerRegistration),
    } as ServiceWorkerContainer,
  };
}

function subscription(): PushSubscription {
  return {
    endpoint: "https://push.example.test/subscription",
    toJSON: () => ({
      endpoint: "https://push.example.test/subscription",
      expirationTime: null,
      keys: { auth: "auth", p256dh: "p256dh" },
    }),
    unsubscribe: async () => true,
  } as unknown as PushSubscription;
}

test("enabling browser notifications requires permission and registers the real subscription", async () => {
  const deniedRequests: Array<{ input: string; init: RequestInit | undefined }> = [];
  const denied = await enableBrowserNotifications({
    applicationServerKey: "AQID",
    runtime: runtime({ permission: "denied" }),
    fetcher: async (input, init) => {
      deniedRequests.push({ input, init });
      throw new Error("must not fetch");
    },
  });
  assert.deepEqual(denied, {
    ok: false,
    issue: { code: "browser_notifications_permission_denied", serverMessage: null },
  });
  assert.deepEqual(deniedRequests, []);

  const requests: Array<{ input: string; init: RequestInit | undefined }> = [];
  const enabled = await enableBrowserNotifications({
    applicationServerKey: "AQID",
    runtime: runtime({ permission: "granted", created: subscription() }),
    fetcher: async (input, init) => {
      requests.push({ input, init });
      return new Response(JSON.stringify({ subscribed: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    },
  });
  assert.deepEqual(enabled, { ok: true });
  assert.equal(requests[0]?.input, "/api/browser-notifications/subscription");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    endpoint: "https://push.example.test/subscription",
    expiration_time: null,
    keys: { auth: "auth", p256dh: "p256dh" },
  });
});

test("disabling browser notifications removes the persisted subscription before local unsubscribe", async () => {
  let unsubscribed = false;
  const active = {
    ...subscription(),
    unsubscribe: async () => {
      unsubscribed = true;
      return true;
    },
  } as PushSubscription;
  const requests: Array<{ input: string; init: RequestInit | undefined }> = [];
  await disableBrowserNotifications({
    runtime: runtime({ permission: "granted", existing: active }),
    fetcher: async (input, init) => {
      requests.push({ input, init });
      return new Response(JSON.stringify({ subscribed: false }), { status: 200 });
    },
  });
  assert.equal(requests[0]?.init?.method, "DELETE");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    endpoint: active.endpoint,
  });
  assert.equal(unsubscribed, true);
});

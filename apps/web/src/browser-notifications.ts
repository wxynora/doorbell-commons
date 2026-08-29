import { browserPushErrorSchema, browserPushSubscriptionSuccessSchema } from "@doorbell/protocol";
import type { AuthIssue, FrontendFetcher } from "./auth/auth-client";

export interface BrowserNotificationRuntime {
  notification: Pick<typeof Notification, "permission" | "requestPermission">;
  serviceWorker: ServiceWorkerContainer;
}

function issue(code: AuthIssue["code"], serverMessage: string | null = null): AuthIssue {
  return { code, serverMessage };
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const bytes = atob(padded.replace(/-/gu, "+").replace(/_/gu, "/"));
  const result = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) {
    result[index] = bytes.charCodeAt(index);
  }
  return result;
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function runtimeFromWindow(): BrowserNotificationRuntime | null {
  if (
    typeof Notification === "undefined" ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return null;
  }
  return { notification: Notification, serviceWorker: navigator.serviceWorker };
}

export async function enableBrowserNotifications(options: {
  applicationServerKey: string | null;
  fetcher?: FrontendFetcher;
  runtime?: BrowserNotificationRuntime | null;
}): Promise<{ ok: true } | { ok: false; issue: AuthIssue }> {
  if (!options.applicationServerKey) {
    return { ok: false, issue: issue("browser_notifications_unavailable") };
  }
  const runtime = options.runtime === undefined ? runtimeFromWindow() : options.runtime;
  if (!runtime) {
    return { ok: false, issue: issue("browser_notifications_unavailable") };
  }
  let permission = runtime.notification.permission;
  if (permission === "default") {
    permission = await runtime.notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, issue: issue("browser_notifications_permission_denied") };
  }
  try {
    const registration = await runtime.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        applicationServerKey: applicationServerKey(options.applicationServerKey),
        userVisibleOnly: true,
      }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      return { ok: false, issue: issue("unexpected_response") };
    }
    const response = await (options.fetcher ?? fetch)("/api/browser-notifications/subscription", {
      body: JSON.stringify({
        endpoint: json.endpoint,
        expiration_time: json.expirationTime ?? null,
        keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
      }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      const parsed = browserPushErrorSchema.safeParse(payload);
      return {
        ok: false,
        issue: parsed.success
          ? issue(parsed.data.error.code, parsed.data.error.message)
          : issue("unexpected_response"),
      };
    }
    return browserPushSubscriptionSuccessSchema.safeParse(payload).success
      ? { ok: true }
      : { ok: false, issue: issue("unexpected_response") };
  } catch {
    return { ok: false, issue: issue("network_unavailable") };
  }
}

export async function disableBrowserNotifications(
  options: { fetcher?: FrontendFetcher; runtime?: BrowserNotificationRuntime | null } = {},
): Promise<void> {
  const runtime = options.runtime === undefined ? runtimeFromWindow() : options.runtime;
  if (!runtime) return;
  try {
    const registration = await runtime.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await (options.fetcher ?? fetch)("/api/browser-notifications/subscription", {
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });
    await subscription.unsubscribe();
  } catch {
    // The saved server-side off switch remains authoritative even if local cleanup fails.
  }
}

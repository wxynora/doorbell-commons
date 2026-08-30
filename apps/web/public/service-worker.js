const CACHE_PREFIX = "doorbell-community-pwa-";

async function clearDoorbellCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([clearDoorbellCaches(), self.clients.claim()]));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (
    payload?.version !== 1 ||
    payload.kind !== "activity_reminder" ||
    typeof payload.title !== "string" ||
    typeof payload.body !== "string" ||
    typeof payload.url !== "string" ||
    !payload.url.startsWith("/") ||
    typeof payload.tag !== "string"
  ) {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      icon: "/community-icon.v2-192.png",
      tag: payload.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    typeof event.notification.data?.url === "string" && event.notification.data.url.startsWith("/")
      ? event.notification.data.url
      : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const openClient = clients.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (openClient) {
        return openClient.navigate(target).then(() => openClient.focus());
      }
      return self.clients.openWindow(target);
    }),
  );
});

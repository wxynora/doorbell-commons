const CACHE_PREFIX = "doorbell-community-pwa-";
const APP_SHELL_CACHE = `${CACHE_PREFIX}shell-v3`;
const STATIC_CACHE = `${CACHE_PREFIX}static-v4`;
const VITE_HASHED_ASSET_RE =
  /\/[^/]+-[a-z0-9_-]{8,}\.(?:avif|css|gif|jpe?g|js|png|svg|ttf|webp|woff2?)$/i;
const PUBLIC_ASSET_RE = /\.(?:avif|css|gif|jpe?g|png|svg|ttf|webmanifest|webp|woff2?)$/i;
const PUBLIC_VERSION_MARKER_RE = /(?:^|[._-])(?:v\d+|[a-f0-9]{8,})(?:[._-]|$)/i;

function isApiRequest(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

function isVersionedPublicAsset(url) {
  if (url.pathname === "/manifest.webmanifest") return url.searchParams.has("v");
  if (!PUBLIC_ASSET_RE.test(url.pathname)) return false;

  const filename = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  const withoutExtension = filename.replace(PUBLIC_ASSET_RE, "");
  return PUBLIC_VERSION_MARKER_RE.test(withoutExtension);
}

function isCacheFirstStaticRequest(request, url) {
  return (
    request.method === "GET" &&
    (VITE_HASHED_ASSET_RE.test(url.pathname) || isVersionedPublicAsset(url))
  );
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(APP_SHELL_CACHE);
    const fallback = await cache.match("/");
    if (fallback) return fallback;
    throw error;
  }
}

function hasExpectedHashedAssetContentType(url, response) {
  if (!VITE_HASHED_ASSET_RE.test(url.pathname)) return true;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (url.pathname.endsWith(".js")) return contentType.includes("javascript");
  if (url.pathname.endsWith(".css")) return contentType.includes("text/css");
  if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)) {
    return contentType.startsWith("image/");
  }
  if (/\.(?:ttf|woff2?)$/i.test(url.pathname)) {
    return (
      contentType.startsWith("font/") ||
      contentType.includes("application/font") ||
      contentType.includes("application/octet-stream")
    );
  }
  return false;
}

async function cacheFirstStatic(request, url) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && hasExpectedHashedAssetContentType(url, response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function clearOldCaches() {
  const currentCaches = new Set([APP_SHELL_CACHE, STATIC_CACHE]);
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && !currentCaches.has(name))
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([clearOldCaches(), self.clients.claim()]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheFirstStaticRequest(request, url)) {
    event.respondWith(cacheFirstStatic(request, url));
  }
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

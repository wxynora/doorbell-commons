const CACHE_PREFIX = "doorbell-community-pwa-";
const APP_SHELL_CACHE = `${CACHE_PREFIX}shell-v4`;
const STATIC_CACHE = `${CACHE_PREFIX}static-v5`;
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
  return PUBLIC_VERSION_MARKER_RE.test(filename.replace(PUBLIC_ASSET_RE, ""));
}

function isCacheFirstStaticRequest(request, url) {
  return (
    request.method === "GET" &&
    (VITE_HASHED_ASSET_RE.test(url.pathname) || isVersionedPublicAsset(url))
  );
}

function hasExpectedStaticContentType(url, response) {
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

function deferredLifetime() {
  let finish;
  const promise = new Promise((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

function cacheFirstStatic(request, url) {
  const lifetime = deferredLifetime();
  const response = (async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        lifetime.finish();
        return cached;
      }
      const networkResponse = await fetch(request);
      if (networkResponse.ok && hasExpectedStaticContentType(url, networkResponse)) {
        lifetime.finish(cache.put(request, networkResponse.clone()).catch(() => undefined));
      } else {
        lifetime.finish();
      }
      return networkResponse;
    } catch (error) {
      lifetime.finish();
      throw error;
    }
  })();
  return { response, lifetime: lifetime.promise };
}

function networkFirstNavigation(request) {
  const lifetime = deferredLifetime();
  const response = (async () => {
    try {
      const networkResponse = await fetch(request);
      if (
        networkResponse.ok &&
        networkResponse.headers.get("content-type")?.includes("text/html")
      ) {
        const cache = await caches.open(APP_SHELL_CACHE);
        lifetime.finish(cache.put("/", networkResponse.clone()).catch(() => undefined));
      } else {
        lifetime.finish();
      }
      return networkResponse;
    } catch (error) {
      try {
        const cache = await caches.open(APP_SHELL_CACHE);
        const fallback = await cache.match("/");
        lifetime.finish();
        if (fallback) return fallback;
      } catch {
        lifetime.finish();
      }
      throw error;
    }
  })();
  return { response, lifetime: lifetime.promise };
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
    const strategy = networkFirstNavigation(request);
    event.respondWith(strategy.response);
    event.waitUntil(strategy.lifetime);
    return;
  }

  if (isCacheFirstStaticRequest(request, url)) {
    const strategy = cacheFirstStatic(request, url);
    event.respondWith(strategy.response);
    event.waitUntil(strategy.lifetime);
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

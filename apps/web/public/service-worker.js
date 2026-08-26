const CACHE_PREFIX = "doorbell-community-pwa-";
const APP_SHELL_CACHE = `${CACHE_PREFIX}shell-v1`;
const STATIC_CACHE = `${CACHE_PREFIX}static-v1`;
const VITE_HASHED_ASSET_RE = /\/[^/]+-[a-z0-9_-]{8,}\.(?:js|css)$/i;
const PUBLIC_ASSET_RE = /\.(?:avif|gif|jpe?g|png|svg|webmanifest|webp|woff2?)$/i;
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

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
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
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clearOldCaches());
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
    event.respondWith(cacheFirstStatic(request));
  }
});

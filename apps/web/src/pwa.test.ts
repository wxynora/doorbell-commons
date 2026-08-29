/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyCommunityRequest, shouldRegisterCommunityServiceWorker } from "./pwa";

const serviceWorkerSource = readFileSync(
  new URL("../public/service-worker.js", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const iconSource = readFileSync(
  new URL("../public/community-icon.v1.svg", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
) as Record<string, unknown>;

test("community request classification keeps API authority outside Cache Storage", () => {
  assert.equal(classifyCommunityRequest("/api/farm/field", "navigate"), "api-network-only");
  assert.equal(classifyCommunityRequest("/api/farm/field?refresh=1"), "api-network-only");
  assert.equal(classifyCommunityRequest("/lingye/farm", "navigate"), "navigation-network-first");
  assert.equal(classifyCommunityRequest("/assets/index-AbCd1234.js"), "hashed-static-cache-first");
  assert.equal(classifyCommunityRequest("/community-icon.v1.svg"), "hashed-static-cache-first");
  assert.equal(classifyCommunityRequest("/manifest.webmanifest?v=1"), "hashed-static-cache-first");
  assert.equal(
    classifyCommunityRequest("/assets/index-AbCd1234.js", "same-origin", "POST"),
    "network-only",
  );
  assert.equal(classifyCommunityRequest("/assets/index.js"), "network-only");
  assert.equal(classifyCommunityRequest("/farm/field.png"), "network-only");
});

test("service worker registration is explicitly production-only and singular", () => {
  assert.equal(shouldRegisterCommunityServiceWorker(true, true), true);
  assert.equal(shouldRegisterCommunityServiceWorker(false, true), false);
  assert.equal(shouldRegisterCommunityServiceWorker(true, false), false);
  assert.match(mainSource, /import\.meta\.env\.PROD/);
  assert.match(mainSource, /registerCommunityServiceWorker/);
  assert.doesNotMatch(mainSource, /navigator\.serviceWorker\.register/);
  assert.equal((mainSource.match(/registerCommunityServiceWorker/g) ?? []).length, 2);
});

test("manifest is a Chinese standalone community entry with the existing surface color", () => {
  assert.equal(manifest.name, "门铃社区");
  assert.equal(manifest.short_name, "门铃社区");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#eee7d5");
  assert.equal(manifest.background_color, "#eee7d5");
  assert.deepEqual(manifest.icons, [
    {
      src: "/community-icon.v1.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
  ]);
  assert.match(iconSource.trim(), /^<svg[\s\S]*门铃社区[\s\S]*<\/svg>$/);
  assert.doesNotMatch(iconSource, /farm/i);
  assert.match(indexSource, /<link rel="manifest" href="\/manifest\.webmanifest\?v=1" \/>/);
});

test("service worker has bounded strategies without precaching or background writes", () => {
  assert.match(serviceWorkerSource, /request\.mode === "navigate"/);
  assert.match(serviceWorkerSource, /event\.respondWith\(fetch\(request\)\)/);
  assert.match(serviceWorkerSource, /cacheFirstStatic/);
  assert.match(serviceWorkerSource, /APP_SHELL_CACHE/);
  assert.match(serviceWorkerSource, /cache\.match\("\/"\)/);
  assert.match(serviceWorkerSource, /name\.startsWith\(CACHE_PREFIX\)/);
  const installBlock = serviceWorkerSource.slice(
    serviceWorkerSource.indexOf('addEventListener("install"'),
    serviceWorkerSource.indexOf('addEventListener("activate"'),
  );
  assert.doesNotMatch(installBlock, /caches\.open|cache\.put|cache\.add/);
  assert.doesNotMatch(serviceWorkerSource, /cache\.addAll/);
  assert.doesNotMatch(serviceWorkerSource, /background.?sync|addEventListener\("sync"/i);
  assert.doesNotMatch(serviceWorkerSource, /queue|replay/i);
  assert.match(serviceWorkerSource, /addEventListener\("push"/);
  assert.match(serviceWorkerSource, /registration\.showNotification/);
  assert.match(serviceWorkerSource, /addEventListener\("notificationclick"/);
  assert.match(
    serviceWorkerSource,
    /if \(isApiRequest\(url\)\) \{[\s\S]*?event\.respondWith\(fetch\(request\)\);[\s\S]*?return;/,
  );
});

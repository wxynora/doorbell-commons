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
const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
) as Record<string, unknown>;

function readPngDimensions(filename: string): [number, number] {
  const source = readFileSync(new URL(`../public/${filename}`, import.meta.url));
  assert.equal(source.toString("ascii", 1, 4), "PNG");
  return [source.readUInt32BE(16), source.readUInt32BE(20)];
}

test("community request classification keeps API authority outside Cache Storage", () => {
  assert.equal(classifyCommunityRequest("/api/farm/field", "navigate"), "api-network-only");
  assert.equal(classifyCommunityRequest("/api/farm/field?refresh=1"), "api-network-only");
  assert.equal(classifyCommunityRequest("/lingye/farm", "navigate"), "navigation-network-first");
  assert.equal(classifyCommunityRequest("/assets/index-AbCd1234.js"), "hashed-static-cache-first");
  assert.equal(
    classifyCommunityRequest("/community-icon.v2-192.png"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/community-icon.v2-512-maskable.png"),
    "hashed-static-cache-first",
  );
  assert.equal(classifyCommunityRequest("/manifest.webmanifest?v=2"), "hashed-static-cache-first");
  assert.equal(
    classifyCommunityRequest("/lingye/together/same-kitchen-opening-v1.jpg"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/lingye/together/river-opening-v1.webp"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/fonts/doorbell-fonts.v1.css"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/fonts/gaegu-latin-400.v1.woff2"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/fonts/gaegu-latin-700.v1.woff2"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/fonts/zcool-kuaile-regular.v1.ttf"),
    "hashed-static-cache-first",
  );
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
      src: "/community-icon.v2-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/community-icon.v2-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/community-icon.v2-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ]);
  assert.deepEqual(readPngDimensions("community-icon.v2-180.png"), [180, 180]);
  assert.deepEqual(readPngDimensions("community-icon.v2-192.png"), [192, 192]);
  assert.deepEqual(readPngDimensions("community-icon.v2-512.png"), [512, 512]);
  assert.deepEqual(readPngDimensions("community-icon.v2-512-maskable.png"), [512, 512]);
  assert.match(indexSource, /<link rel="manifest" href="\/manifest\.webmanifest\?v=2" \/>/);
  assert.match(
    indexSource,
    /<link rel="apple-touch-icon" href="\/community-icon\.v2-180\.png" \/>/,
  );
});

test("service worker has bounded strategies without precaching or background writes", () => {
  assert.match(serviceWorkerSource, /shell-v2/);
  assert.match(serviceWorkerSource, /static-v2/);
  assert.doesNotMatch(serviceWorkerSource, /shell-v1|static-v1/);
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
  assert.match(serviceWorkerSource, /icon: "\/community-icon\.v2-192\.png"/);
  assert.match(serviceWorkerSource, /addEventListener\("notificationclick"/);
  assert.match(
    serviceWorkerSource,
    /if \(isApiRequest\(url\)\) \{[\s\S]*?event\.respondWith\(fetch\(request\)\);[\s\S]*?return;/,
  );
});

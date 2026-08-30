/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyCommunityRequest,
  registerCommunityServiceWorker,
  shouldRegisterCommunityServiceWorker,
} from "./pwa";

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
    classifyCommunityRequest("/assets/field-background-CSRs5hGr.png"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/assets/ranch-rain-DzCaMAu7.webp"),
    "hashed-static-cache-first",
  );
  assert.equal(
    classifyCommunityRequest("/assets/zcool-kuaile-regular-XyZp1234.woff2"),
    "hashed-static-cache-first",
  );
  assert.equal(classifyCommunityRequest("/community-icon.v2-192.png"), "hashed-static-cache-first");
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
    classifyCommunityRequest("/fonts/doorbell-fonts.v2.css"),
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
    classifyCommunityRequest("/fonts/noto-serif-sc-ui-400.v2.woff2"),
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

test("an existing PWA checks for updates and reloads once when the new worker takes control", async () => {
  let updateCount = 0;
  let reloadCount = 0;
  let visibilityState: DocumentVisibilityState = "hidden";
  let controllerChange: (() => void) | undefined;
  let visibilityChange: (() => void) | undefined;

  const registration = {
    async update() {
      updateCount += 1;
    },
  } as unknown as ServiceWorkerRegistration;
  const container = {
    controller: {} as ServiceWorker,
    async register(url: string | URL, options?: RegistrationOptions) {
      assert.equal(url, "/service-worker.js");
      assert.deepEqual(options, { scope: "/" });
      return registration;
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "controllerchange" && typeof listener === "function") {
        controllerChange = () => listener(new Event("controllerchange"));
      }
    },
  } as unknown as ServiceWorkerContainer;
  const pageLifecycle = {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "visibilitychange" && typeof listener === "function") {
        visibilityChange = () => listener(new Event("visibilitychange"));
      }
    },
  } as unknown as Document;

  const result = await registerCommunityServiceWorker(container, pageLifecycle, {
    reload() {
      reloadCount += 1;
    },
  });

  assert.equal(result, registration);
  assert.equal(updateCount, 1);

  visibilityState = "visible";
  visibilityChange?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updateCount, 2);

  controllerChange?.();
  controllerChange?.();
  assert.equal(reloadCount, 1);
});

test("the first PWA install takes control without reloading the initial page", async () => {
  let reloadCount = 0;
  let controllerListenerCount = 0;
  const registration = {
    update: async () => undefined,
  } as unknown as ServiceWorkerRegistration;
  const container = {
    controller: null,
    register: async () => registration,
    addEventListener(type: string) {
      if (type === "controllerchange") controllerListenerCount += 1;
    },
  } as unknown as ServiceWorkerContainer;

  const result = await registerCommunityServiceWorker(container, null, {
    reload() {
      reloadCount += 1;
    },
  });

  assert.equal(result, registration);
  assert.equal(controllerListenerCount, 0);
  assert.equal(reloadCount, 0);
});

test("a failed update does not stop the already loaded PWA", async () => {
  const registration = {
    async update() {
      throw new Error("offline");
    },
  } as unknown as ServiceWorkerRegistration;
  const container = {
    controller: {} as ServiceWorker,
    register: async () => registration,
    addEventListener: () => undefined,
  } as unknown as ServiceWorkerContainer;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    assert.equal(await registerCommunityServiceWorker(container, null, null), registration);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("a failed registration does not stop the page", async () => {
  const container = {
    controller: null,
    async register() {
      throw new Error("registration unavailable");
    },
  } as unknown as ServiceWorkerContainer;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    assert.equal(await registerCommunityServiceWorker(container, null, null), null);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
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
  assert.deepEqual(readPngDimensions("apple-touch-icon.png"), [180, 180]);
  assert.deepEqual(readPngDimensions("community-icon.v2-192.png"), [192, 192]);
  assert.deepEqual(readPngDimensions("community-icon.v2-512.png"), [512, 512]);
  assert.deepEqual(readPngDimensions("community-icon.v2-512-maskable.png"), [512, 512]);
  assert.match(indexSource, /<link rel="manifest" href="\/manifest\.webmanifest\?v=2" \/>/);
  assert.match(
    indexSource,
    /<link rel="apple-touch-icon" sizes="180x180" href="\/community-icon\.v2-180\.png" \/>/,
  );
});

test("service worker has bounded strategies without precaching or background writes", () => {
  assert.match(serviceWorkerSource, /shell-v3/);
  assert.match(serviceWorkerSource, /static-v4/);
  assert.doesNotMatch(serviceWorkerSource, /shell-v1|shell-v2|static-v1|static-v2|static-v3/);
  assert.match(serviceWorkerSource, /request\.mode === "navigate"/);
  assert.match(serviceWorkerSource, /event\.respondWith\(fetch\(request\)\)/);
  assert.match(serviceWorkerSource, /cacheFirstStatic/);
  assert.match(serviceWorkerSource, /hasExpectedHashedAssetContentType/);
  assert.match(
    serviceWorkerSource,
    /endsWith\("\.js"\)[\s\S]*?contentType\.includes\("javascript"\)/,
  );
  assert.match(
    serviceWorkerSource,
    /endsWith\("\.css"\)[\s\S]*?contentType\.includes\("text\/css"\)/,
  );
  assert.match(serviceWorkerSource, /contentType\.startsWith\("image\/"\)/);
  assert.match(serviceWorkerSource, /contentType\.startsWith\("font\/"\)/);
  assert.match(
    serviceWorkerSource,
    /response\.ok && hasExpectedHashedAssetContentType\(url, response\)/,
  );
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
  assert.match(serviceWorkerSource, /event\.waitUntil\(self\.skipWaiting\(\)\)/);
  assert.match(serviceWorkerSource, /self\.clients\.claim\(\)/);
  assert.match(serviceWorkerSource, /addEventListener\("push"/);
  assert.match(serviceWorkerSource, /registration\.showNotification/);
  assert.match(serviceWorkerSource, /icon: "\/community-icon\.v2-192\.png"/);
  assert.match(serviceWorkerSource, /addEventListener\("notificationclick"/);
  assert.match(
    serviceWorkerSource,
    /if \(isApiRequest\(url\)\) \{[\s\S]*?event\.respondWith\(fetch\(request\)\);[\s\S]*?return;/,
  );
});

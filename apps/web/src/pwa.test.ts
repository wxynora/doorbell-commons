/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { registerCommunityServiceWorker, shouldRegisterCommunityServiceWorker } from "./pwa";

const serviceWorkerSource = readFileSync(
  new URL("../public/service-worker.js", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
) as Record<string, unknown>;

async function activateWorker(): Promise<string[]> {
  const listeners = new Map<
    string,
    (event: { waitUntil(value: Promise<unknown>): void }) => void
  >();
  const calls: string[] = [];
  runInNewContext(serviceWorkerSource, {
    URL,
    self: {
      addEventListener(
        type: string,
        listener: (event: { waitUntil(value: Promise<unknown>): void }) => void,
      ) {
        listeners.set(type, listener);
      },
      clients: {
        async claim() {
          calls.push("claim");
        },
        async matchAll() {
          return [];
        },
        async openWindow() {
          return undefined;
        },
      },
      registration: { showNotification: async () => undefined },
      skipWaiting: async () => undefined,
    },
  });
  const activate = listeners.get("activate");
  assert.ok(activate);
  let activation: Promise<unknown> | undefined;
  activate({ waitUntil: (value) => (activation = value) });
  assert.ok(activation);
  await activation;
  return calls;
}

function readPngDimensions(filename: string): [number, number] {
  const source = readFileSync(new URL(`../public/${filename}`, import.meta.url));
  assert.equal(source.toString("ascii", 1, 4), "PNG");
  return [source.readUInt32BE(16), source.readUInt32BE(20)];
}

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
  let controllerChange: (() => void) | undefined;

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
  const result = await registerCommunityServiceWorker(container, {
    reload() {
      reloadCount += 1;
    },
  });

  assert.equal(result, registration);
  assert.equal(updateCount, 1);

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

  const result = await registerCommunityServiceWorker(container, {
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
    assert.equal(await registerCommunityServiceWorker(container, null), registration);
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
    assert.equal(await registerCommunityServiceWorker(container, null), null);
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

test("service worker leaves page and asset loading to the browser and keeps only app lifecycle", () => {
  assert.match(serviceWorkerSource, /^\/\/ approved-pwa-release:auto$/mu);
  assert.equal((serviceWorkerSource.match(/approved-pwa-release:/gu) ?? []).length, 1);
  assert.doesNotMatch(serviceWorkerSource, /addEventListener\("fetch"/);
  assert.doesNotMatch(serviceWorkerSource, /\bcaches\b|Cache Storage|cacheFirst|networkFirst/u);
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
  const lifecycleBlock = serviceWorkerSource.slice(
    0,
    serviceWorkerSource.indexOf('addEventListener("push"'),
  );
  assert.doesNotMatch(lifecycleBlock, /matchAll|\.navigate\(|openWindow/);
  assert.match(serviceWorkerSource, /addEventListener\("push"/);
  assert.match(serviceWorkerSource, /registration\.showNotification/);
  assert.match(serviceWorkerSource, /icon: "\/community-icon\.v2-192\.png"/);
  assert.match(serviceWorkerSource, /addEventListener\("notificationclick"/);
});

test("approved activation claims once without navigating existing pages", async () => {
  assert.deepEqual(await activateWorker(), ["claim"]);
});

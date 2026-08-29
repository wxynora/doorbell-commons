/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  createPwaInstallController,
  isIosDevice,
  type PwaInstallPromptEvent,
  type PwaInstallRuntime,
} from "./pwa-install";

function createRuntime(
  navigator: PwaInstallRuntime["navigator"] = { userAgent: "Android" },
  standalone = false,
) {
  const listeners = new Map<string, Set<EventListener>>();
  const runtime: PwaInstallRuntime = {
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? new Set<EventListener>();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    matchesStandalone: () => standalone,
    navigator,
  };
  return {
    runtime,
    dispatch(type: string, event = new Event(type)) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

test("Android install entry captures the browser prompt and hides after acceptance", async () => {
  const harness = createRuntime();
  const controller = createPwaInstallController(harness.runtime);
  let promptCalls = 0;
  const promptEvent = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    async prompt() {
      promptCalls += 1;
    },
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  }) as PwaInstallPromptEvent;

  harness.dispatch("beforeinstallprompt", promptEvent);
  assert.equal(promptEvent.defaultPrevented, true);
  assert.equal(controller.getSnapshot().canPrompt, true);

  await controller.requestInstall();
  assert.equal(promptCalls, 1);
  assert.equal(controller.getSnapshot().hidden, true);
  controller.destroy();
});

test("iPhone and iPad fall back to the Add to Home Screen steps", async () => {
  assert.equal(isIosDevice({ userAgent: "iPhone" }), true);
  assert.equal(
    isIosDevice({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 }),
    true,
  );
  const harness = createRuntime({ userAgent: "iPhone" });
  const controller = createPwaInstallController(harness.runtime);

  await controller.requestInstall();
  assert.equal(controller.getSnapshot().guide, "ios");
  controller.destroy();
});

test("other browsers get their own menu instructions when no prompt is available", async () => {
  const harness = createRuntime({ userAgent: "Desktop Browser" });
  const controller = createPwaInstallController(harness.runtime);

  await controller.requestInstall();
  assert.equal(controller.getSnapshot().guide, "browser");
  controller.destroy();
});

test("standalone and appinstalled states hide the install entry", () => {
  const alreadyInstalled = createPwaInstallController(
    createRuntime({ userAgent: "Android" }, true).runtime,
  );
  assert.equal(alreadyInstalled.getSnapshot().hidden, true);
  alreadyInstalled.destroy();

  const harness = createRuntime();
  const controller = createPwaInstallController(harness.runtime);
  harness.dispatch("appinstalled");
  assert.equal(controller.getSnapshot().hidden, true);
  controller.destroy();
});

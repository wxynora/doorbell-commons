export type PwaInstallGuide = "ios" | "browser";

export interface PwaInstallSnapshot {
  hidden: boolean;
  canPrompt: boolean;
  busy: boolean;
  guide: PwaInstallGuide | null;
}

export interface PwaInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaInstallRuntime {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  matchesStandalone(): boolean;
  navigator: {
    userAgent: string;
    platform?: string;
    maxTouchPoints?: number;
    standalone?: boolean | undefined;
  };
}

export interface PwaInstallController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PwaInstallSnapshot;
  requestInstall(): Promise<void>;
  destroy(): void;
}

function isInstallPromptEvent(event: Event): event is PwaInstallPromptEvent {
  const candidate = event as Partial<PwaInstallPromptEvent>;
  return typeof candidate.prompt === "function" && candidate.userChoice instanceof Promise;
}

export function isIosDevice(runtime: PwaInstallRuntime["navigator"]): boolean {
  if (/iPad|iPhone|iPod/u.test(runtime.userAgent)) return true;
  return runtime.platform === "MacIntel" && (runtime.maxTouchPoints ?? 0) > 1;
}

export function createPwaInstallController(runtime: PwaInstallRuntime): PwaInstallController {
  let deferredPrompt: PwaInstallPromptEvent | null = null;
  let snapshot: PwaInstallSnapshot = {
    hidden: runtime.matchesStandalone() || runtime.navigator.standalone === true,
    canPrompt: false,
    busy: false,
    guide: null,
  };
  const listeners = new Set<() => void>();

  const update = (next: PwaInstallSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const showManualGuide = () => {
    update({
      hidden: false,
      canPrompt: false,
      busy: false,
      guide: isIosDevice(runtime.navigator) ? "ios" : "browser",
    });
  };

  const onBeforeInstallPrompt: EventListener = (event) => {
    if (!isInstallPromptEvent(event)) return;
    event.preventDefault();
    deferredPrompt = event;
    update({ hidden: false, canPrompt: true, busy: false, guide: null });
  };

  const onAppInstalled: EventListener = () => {
    deferredPrompt = null;
    update({ hidden: true, canPrompt: false, busy: false, guide: null });
  };

  runtime.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  runtime.addEventListener("appinstalled", onAppInstalled);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    async requestInstall() {
      if (snapshot.hidden || snapshot.busy) return;
      const prompt = deferredPrompt;
      if (!prompt) {
        showManualGuide();
        return;
      }

      deferredPrompt = null;
      update({ hidden: false, canPrompt: false, busy: true, guide: null });
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") {
          update({ hidden: true, canPrompt: false, busy: false, guide: null });
          return;
        }
      } catch {
        // Fall through to the browser-specific manual installation steps.
      }
      showManualGuide();
    },
    destroy() {
      runtime.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      runtime.removeEventListener("appinstalled", onAppInstalled);
      deferredPrompt = null;
      listeners.clear();
    },
  };
}

export function createBrowserPwaInstallController(): PwaInstallController {
  return createPwaInstallController({
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    matchesStandalone: () => window.matchMedia("(display-mode: standalone)").matches,
    navigator: {
      userAgent: window.navigator.userAgent,
      platform: window.navigator.platform,
      maxTouchPoints: window.navigator.maxTouchPoints,
      standalone: (window.navigator as Navigator & { standalone?: boolean }).standalone,
    },
  });
}

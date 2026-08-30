export const COMMUNITY_SERVICE_WORKER_URL = "/service-worker.js";
export const COMMUNITY_MANIFEST_URL = "/manifest.webmanifest?v=2";

export function shouldRegisterCommunityServiceWorker(
  isProduction: boolean,
  serviceWorkerSupported: boolean,
): boolean {
  return isProduction && serviceWorkerSupported;
}

type ServiceWorkerRegistrar = Pick<ServiceWorkerContainer, "register"> &
  Partial<Pick<ServiceWorkerContainer, "addEventListener" | "controller">>;

type PageLocation = Pick<Location, "reload">;

function warnAboutServiceWorkerFailure(message: string, error: unknown): void {
  console.warn(message, error);
}

export async function registerCommunityServiceWorker(
  container?: ServiceWorkerRegistrar | null,
  pageLocation: PageLocation | null = typeof window === "undefined" ? null : window.location,
): Promise<ServiceWorkerRegistration | null> {
  const target =
    container ??
    (typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker
      : null);

  if (!target) return null;

  const pageWasAlreadyControlled = target.controller !== null && target.controller !== undefined;
  let reloadStarted = false;

  if (pageWasAlreadyControlled && pageLocation && target.addEventListener) {
    target.addEventListener("controllerchange", () => {
      if (reloadStarted) return;
      reloadStarted = true;
      pageLocation.reload();
    });
  }

  try {
    const registration = await target.register(COMMUNITY_SERVICE_WORKER_URL, { scope: "/" });
    try {
      await registration.update();
    } catch (error) {
      warnAboutServiceWorkerFailure("Doorbell Commons Service Worker update failed", error);
    }
    return registration;
  } catch (error) {
    warnAboutServiceWorkerFailure("Doorbell Commons Service Worker registration failed", error);
    return null;
  }
}

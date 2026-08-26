export const COMMUNITY_SERVICE_WORKER_URL = "/service-worker.js";
export const COMMUNITY_MANIFEST_URL = "/manifest.webmanifest?v=1";

const COMMUNITY_ORIGIN = "https://doorbell.invalid";
const VITE_HASHED_ASSET_RE = /\/[^/]+-[a-z0-9_-]{8,}\.(?:js|css)$/i;
const PUBLIC_ASSET_RE = /\.(?:avif|gif|jpe?g|png|svg|webmanifest|webp|woff2?)$/i;
const PUBLIC_VERSION_MARKER_RE = /(?:^|[._-])(?:v\d+|[a-f0-9]{8,})(?:[._-]|$)/i;

export type CommunityRequestStrategy =
  | "api-network-only"
  | "navigation-network-first"
  | "hashed-static-cache-first"
  | "network-only";

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isContentHashedViteAssetPath(pathname: string): boolean {
  return VITE_HASHED_ASSET_RE.test(pathname);
}

export function isVersionedPublicAssetUrl(url: URL): boolean {
  if (url.pathname === "/manifest.webmanifest") {
    return url.searchParams.has("v");
  }

  if (!PUBLIC_ASSET_RE.test(url.pathname)) return false;
  const filename = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  const withoutExtension = filename.replace(PUBLIC_ASSET_RE, "");
  return PUBLIC_VERSION_MARKER_RE.test(withoutExtension);
}

export function classifyCommunityRequest(
  input: string | URL,
  mode: RequestMode = "same-origin",
  method = "GET",
): CommunityRequestStrategy {
  const url = typeof input === "string" ? new URL(input, COMMUNITY_ORIGIN) : input;
  const sameOrigin = url.origin === COMMUNITY_ORIGIN;

  if (isApiPath(url.pathname)) return "api-network-only";
  if (sameOrigin && mode === "navigate") return "navigation-network-first";
  if (
    sameOrigin &&
    method.toUpperCase() === "GET" &&
    (isContentHashedViteAssetPath(url.pathname) || isVersionedPublicAssetUrl(url))
  ) {
    return "hashed-static-cache-first";
  }
  return "network-only";
}

export function shouldRegisterCommunityServiceWorker(
  isProduction: boolean,
  serviceWorkerSupported: boolean,
): boolean {
  return isProduction && serviceWorkerSupported;
}

type ServiceWorkerRegistrar = Pick<ServiceWorkerContainer, "register">;

export function registerCommunityServiceWorker(
  container?: ServiceWorkerRegistrar | null,
): Promise<ServiceWorkerRegistration | null> {
  const target =
    container ??
    (typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker
      : null);

  if (!target) return Promise.resolve(null);

  return target.register(COMMUNITY_SERVICE_WORKER_URL, { scope: "/" }).catch((error: unknown) => {
    console.warn("Doorbell Commons Service Worker registration failed", error);
    return null;
  });
}
